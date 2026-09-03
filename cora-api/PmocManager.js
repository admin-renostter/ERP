/**
 * PmocManager — Plano de Manutenção, Operação e Controle
 * ABNT NBR 16020 — obrigatório para equipamentos ≥ 75.000 BTU/h
 *
 * Escopo:
 * - CRUD de equipamentos de climatização por cliente
 * - Agenda de manutenções preventivas (trimestral, semestral, anual)
 * - Geração automática de próxima manutenção ao cadastrar equipamento
 * - Execução de checklist PMOC com foto e assinatura
 * - Relatório PMOC em PDF para compliance
 * - Alertas de vencimento
 */

const crypto = require('crypto');
const { dbRun, dbGet, dbAll } = require('./database');
// Sprint 13.8: wrappers tenant-aware
const { dbAllTenant, dbGetTenant, dbRunTenant } = require('./infra/tenantAwareDb');

const FREQUENCIAS = {
    Trimestral: 90,
    Semestral: 180,
    Anual: 365
};

const TIPOS_MANUTENCAO = ['Trimestral', 'Semestral', 'Anual'];

class PmocManager {
    // ═══════════════════════════════════════
    // 1. Configurações
    // ═══════════════════════════════════════

    async getConfig(nome) {
        const row = await dbGetTenant('SELECT valor FROM configuracoes_pmoc WHERE nome = ?', [nome]);
        return row ? row.valor : null;
    }

    async getAllConfigs() {
        const rows = await dbAllTenant('SELECT nome, valor, descricao FROM configuracoes_pmoc');
        const cfg = {};
        for (const r of rows) cfg[r.nome] = r.valor;
        return cfg;
    }

    async updateConfig(nome, valor) {
        await dbRun(
            `INSERT INTO configuracoes_pmoc (nome, valor) VALUES (?, ?)
             ON CONFLICT(nome) DO UPDATE SET valor = excluded.valor, updated_at = CURRENT_TIMESTAMP`,
            [nome, valor]
        );
        return { success: true };
    }

    // ═══════════════════════════════════════
    // 2. Equipamentos
    // ═══════════════════════════════════════

    async criarEquipamento({ clienteId, contractId, localInstalacao, marca, modelo, numeroSerie, potenciaBtu, potenciaKw, tipoEquipamento, refrigerante, regimeServico, dataInstalacao, observacoes }) {
        const id = 'eq_' + crypto.randomUUID().split('-')[0];
        await dbRun(
            `INSERT INTO equipamentos
               (id, cliente_id, contract_id, local_instalacao, marca, modelo, numero_serie,
                potencia_btu, potencia_kw, tipo_equipamento, refrigerante, regime_servico,
                data_instalacao, observacoes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, clienteId, contractId || null, localInstalacao || '', marca || '', modelo || '',
             numeroSerie || '', potenciaBtu || null, potenciaKw || null, tipoEquipamento || 'Split',
             refrigerante || '', regimeServico || 'HVAC', dataInstalacao || null, observacoes || '']
        );

        // Se potência ≥ 75k BTU, criar agenda PMOC automaticamente
        if (potenciaBtu && potenciaBtu >= 75000) {
            await this._gerarAgendaPMOC(id, potenciaBtu, dataInstalacao);
        }

        return this.buscarEquipamento(id);
    }

    async buscarEquipamento(id) {
        const eq = await dbGetTenant('SELECT * FROM equipamentos WHERE id = ?', [id]);
        if (!eq) return null;
        eq.precisa_pmoc = eq.potencia_btu >= 75000;
        const manut = await dbAllTenant(
            'SELECT * FROM manutencoes_preventivas WHERE equipamento_id = ? ORDER BY proxima_data ASC',
            [id]
        );
        eq.agenda_pmoc = manut;
        return eq;
    }

    async listarEquipamentos({ clienteId, contractId, status, page = 0, size = 50 } = {}) {
        const params = [];
        const wheres = [];
        if (clienteId) { wheres.push('e.cliente_id = ?'); params.push(clienteId); }
        if (contractId) { wheres.push('e.contract_id = ?'); params.push(contractId); }
        if (status) { wheres.push('e.status_equipamento = ?'); params.push(status); }
        const where = wheres.length ? ' WHERE ' + wheres.join(' AND ') : '';
        const limit = Math.min(parseInt(size) || 50, 200);
        const offset = parseInt(page) * limit;

        const rows = await dbAllTenant(
            `SELECT e.*, c.nome as cliente_nome,
                CASE WHEN e.potencia_btu >= 75000 THEN 1 ELSE 0 END as precisa_pmoc,
                (SELECT COUNT(*) FROM manutencoes_preventivas m WHERE m.equipamento_id = e.id AND m.status = 'Pendente') as manut_pendentes,
                (SELECT MIN(m.proxima_data) FROM manutencoes_preventivas m WHERE m.equipamento_id = e.id) as proxima_manut
             FROM equipamentos e
             LEFT JOIN clientes c ON e.cliente_id = c.id
             ${where}
             ORDER BY e.created_at DESC LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );
        return { data: rows, page: parseInt(page), size: limit };
    }

    async atualizarEquipamento(id, campos) {
        const allowed = ['local_instalacao', 'marca', 'modelo', 'numero_serie',
            'potencia_btu', 'potencia_kw', 'tipo_equipamento', 'refrigerante',
            'regime_servico', 'data_instalacao', 'status_equipamento', 'observacoes', 'contract_id'];
        const sets = [];
        const params = [];
        for (const [k, v] of Object.entries(campos)) {
            if (allowed.includes(k)) { sets.push(`${k} = ?`); params.push(v); }
        }
        if (!sets.length) throw new Error('Nenhum campo válido');
        params.push(id);
        await dbRun(`UPDATE equipamentos SET ${sets.join(', ')} WHERE id = ?`, params);
        return this.buscarEquipamento(id);
    }

    async excluirEquipamento(id) {
        await dbRun('DELETE FROM equipamentos WHERE id = ?', [id]);
        return { success: true };
    }

    // ═══════════════════════════════════════
    // 3. Agenda PMOC (criação automática)
    // ═══════════════════════════════════════

    async _gerarAgendaPMOC(equipamentoId, potenciaBtu, dataInicio) {
        const cfg = await this.getAllConfigs();
        const instalacao = dataInicio ? new Date(dataInicio) : new Date();

        for (const [tipo, dias] of Object.entries(FREQUENCIAS)) {
            const proxima = new Date(instalacao);
            proxima.setDate(proxima.getDate() + dias);
            // Se a data já passou, calcula a próxima ocorrência futura
            while (proxima <= new Date()) {
                proxima.setDate(proxima.getDate() + dias);
            }

            await dbRun(
                `INSERT INTO manutencoes_preventivas
                   (id, equipamento_id, tipo_manutencao, frequencia, proxima_data, status)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                ['mp_' + crypto.randomUUID().split('-')[0], equipamentoId, tipo, String(dias),
                 proxima.toISOString(), 'Pendente']
            );
        }
    }

    // ═══════════════════════════════════════
    // 4. Manutenções Preventivas
    // ═══════════════════════════════════════

    async listarManutencoes({ equipamentoId, status, tecnicoId, dataInicio, dataFim, page = 0, size = 50 } = {}) {
        const params = [];
        const wheres = [];
        if (equipamentoId) { wheres.push('m.equipamento_id = ?'); params.push(equipamentoId); }
        if (status) { wheres.push('m.status = ?'); params.push(status); }
        if (tecnicoId) { wheres.push('m.tecnico_responsavel = ?'); params.push(tecnicoId); }
        if (dataInicio) { wheres.push('m.proxima_data >= ?'); params.push(dataInicio); }
        if (dataFim) { wheres.push('m.proxima_data <= ?'); params.push(dataFim); }
        const where = wheres.length ? ' WHERE ' + wheres.join(' AND ') : '';
        const limit = Math.min(parseInt(size) || 50, 200);
        const offset = parseInt(page) * limit;

        const rows = await dbAllTenant(
            `SELECT m.*, e.marca, e.modelo, e.local_instalacao, e.potencia_btu,
                    e.cliente_id, c.nome as cliente_nome
             FROM manutencoes_preventivas m
             JOIN equipamentos e ON m.equipamento_id = e.id
             LEFT JOIN clientes c ON e.cliente_id = c.id
             ${where}
             ORDER BY m.proxima_data ASC LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );
        return { data: rows, page: parseInt(page), size: limit };
    }

    async buscarManutencao(id) {
        const m = await dbGetTenant(
            `SELECT m.*, e.marca, e.modelo, e.local_instalacao, e.potencia_btu, e.refrigerante,
                    e.numero_serie, e.cliente_id, c.nome as cliente_nome
             FROM manutencoes_preventivas m
             JOIN equipamentos e ON m.equipamento_id = e.id
             LEFT JOIN clientes c ON e.cliente_id = c.id
             WHERE m.id = ?`, [id]
        );
        if (!m) return null;
        // Checklist
        const itens = await dbAllTenant(
            `SELECT i.*, r.id as registro_id, r.resultado, r.observacao, r.foto_base64,
                    r.executado_por, r.executado_em
             FROM checklist_pmoc i
             LEFT JOIN checklist_registros r ON r.item_id = i.id AND r.manutencao_id = ?
             WHERE i.tipo_manutencao = ? AND i.ativo = 1
             ORDER BY i.item_ordem`,
            [id, m.tipo_manutencao]
        );
        m.itens = itens;
        return m;
    }

    async executarManutencao(id, { itens, tecnicoId, observacoesGerais, custoMaoObra, custoPecas }) {
        const manut = await this.buscarManutencao(id);
        if (!manut) throw new Error('Manutenção não encontrada');

        const now = new Date().toISOString();

        for (const item of itens) {
            await dbRun(
                `INSERT INTO checklist_registros
                   (id, manutencao_id, item_id, resultado, observacao, foto_base64, executado_por, executado_em)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                ['cr_' + crypto.randomUUID().split('-')[0], id, item.itemId, item.resultado || '',
                 item.observacao || '', item.fotoBase64 || null, tecnicoId || '', now]
            );
        }

        // Calcula próxima ocorrência
        const dias = parseInt(manut.frequencia) || 90;
        const proxima = new Date();
        proxima.setDate(proxima.getDate() + dias);

        await dbRun(
            `UPDATE manutencoes_preventivas
               SET status = 'Concluida',
                   ultima_data = ?,
                   proxima_data = ?,
                   tecnico_responsavel = ?,
                   observacoes = ?,
                   custo_mao_obra = ?,
                   custo_pecas = ?,
                   updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [now, proxima.toISOString(), tecnicoId || '', observacoesGerais || '',
             custoMaoObra || null, custoPecas || null, id]
        );

        return this.buscarManutencao(id);
    }

    async reagendarManutencao(id, novaData) {
        await dbRun(
            'UPDATE manutencoes_preventivas SET proxima_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [novaData, id]
        );
        return { success: true };
    }

    // ═══════════════════════════════════════
    // 5. Checklist
    // ═══════════════════════════════════════

    async getChecklist(tipoManutencao) {
        return await dbAllTenant(
            'SELECT * FROM checklist_pmoc WHERE tipo_manutencao = ? AND ativo = 1 ORDER BY item_ordem',
            [tipoManutencao]
        );
    }

    async adicionarItemChecklist({ tipoManutencao, descricao, categoria, obrigatorio }) {
        const max = await dbGetTenant(
            'SELECT MAX(item_ordem) as m FROM checklist_pmoc WHERE tipo_manutencao = ?',
            [tipoManutencao]
        );
        const ordem = (max?.m || 0) + 1;
        const id = await dbRun(
            `INSERT INTO checklist_pmoc (tipo_manutencao, item_ordem, item_descricao, item_categoria, obrigatorio)
             VALUES (?, ?, ?, ?, ?)`,
            [tipoManutencao, ordem, descricao, categoria || '', obrigatorio ? 1 : 0]
        );
        return { id, success: true };
    }

    // ═══════════════════════════════════════
    // 6. Dashboard / KPIs PMOC
    // ═══════════════════════════════════════

    async getPmocKPIs() {
        const cfg = await this.getAllConfigs();
        const diasAlerta = parseInt(cfg['dias_alerta_vencimento'] || '30');

        const [
            totalEquip,
            precisaPmoc,
            manutMes,
            pendentes,
            vencidas,
            emDia,
            upcoming
        ] = await Promise.all([
            dbGet('SELECT COUNT(*) as c FROM equipamentos'),
            dbGet('SELECT COUNT(*) as c FROM equipamentos WHERE potencia_btu >= 75000'),
            dbGet(`SELECT COUNT(*) as c FROM manutencoes_preventivas
                   WHERE strftime('%Y-%m', proxima_data) = strftime('%Y-%m', 'now')`),
            dbGet('SELECT COUNT(*) as c FROM manutencoes_preventivas WHERE status = ?', ['Pendente']),
            dbGet(`SELECT COUNT(*) as c FROM manutencoes_preventivas
                   WHERE status = 'Pendente' AND proxima_data < date('now')`),
            dbGet(`SELECT COUNT(*) as c FROM manutencoes_preventivas
                   WHERE status = 'Concluida'
                   AND strftime('%Y', ultima_data) = strftime('%Y', 'now')`),
            dbGet(`SELECT COUNT(*) as c FROM manutencoes_preventivas
                   WHERE status = 'Pendente'
                   AND proxima_data >= date('now')
                   AND proxima_data <= date('now', '+${diasAlerta} days')`),
        ]);

        return {
            totalEquipamentos: totalEquip?.c || 0,
            precisaPmoc: precisaPmoc?.c || 0,
            manutNoMes: manutMes?.c || 0,
            pendentes: pendentes?.c || 0,
            vencidas: vencidas?.c || 0,
            emDia: emDia?.c || 0,
            upcoming: upcoming?.c || 0,
            diasAlerta
        };
    }

    async getPendentesProximoVencimento() {
        const dias = parseInt(await this.getConfig('dias_alerta_vencimento') || '30');
        return await dbAllTenant(
            `SELECT m.*, e.marca, e.modelo, e.local_instalacao, e.potencia_btu,
                    e.cliente_id, c.nome as cliente_nome
             FROM manutencoes_preventivas m
             JOIN equipamentos e ON m.equipamento_id = e.id
             LEFT JOIN clientes c ON e.cliente_id = c.id
             WHERE m.status = 'Pendente'
               AND m.proxima_data >= date('now')
               AND m.proxima_data <= date('now', '+${dias} days')
             ORDER BY m.proxima_data ASC`
        );
    }

    async getVencidas() {
        return await dbAllTenant(
            `SELECT m.*, e.marca, e.modelo, e.local_instalacao, e.potencia_btu,
                    e.cliente_id, c.nome as cliente_nome
             FROM manutencoes_preventivas m
             JOIN equipamentos e ON m.equipamento_id = e.id
             LEFT JOIN clientes c ON e.cliente_id = c.id
             WHERE m.status = 'Pendente' AND m.proxima_data < date('now')
             ORDER BY m.proxima_data ASC`
        );
    }

    // ═══════════════════════════════════════
    // 7. Relatório PMOC (dados estruturados para PDF)
    // ═══════════════════════════════════════

    async gerarRelatorioPMOC(clienteId) {
        const cfg = await this.getAllConfigs();
        const equipamentos = await dbAllTenant(
            `SELECT e.*, c.nome as cliente_nome
             FROM equipamentos e
             JOIN clientes c ON e.cliente_id = c.id
             WHERE e.cliente_id = ? AND e.potencia_btu >= 75000
             ORDER BY e.local_instalacao`,
            [clienteId]
        );

        const historico = [];
        for (const eq of equipamentos) {
            const manuts = await dbAllTenant(
                `SELECT m.*, r.*
                 FROM manutencoes_preventivas m
                 LEFT JOIN checklist_registros r ON r.manutencao_id = m.id
                 WHERE m.equipamento_id = ?
                 ORDER BY m.ultima_data DESC LIMIT 5`,
                [eq.id]
            );
            historico.push({ equipamento: eq, manutencoes: manuts });
        }

        return {
            cliente: equipamentos[0]?.cliente_nome || '',
            clienteId,
            dataEmissao: new Date().toISOString(),
            responsavelTecnico: cfg['nome_responsavel_tecnico'] || '',
            crea: cfg['crea_responsavel'] || '',
            equipamentos: historico,
            referenciaLegal: 'ABNT NBR 16020'
        };
    }
}

module.exports = { PmocManager, FREQUENCIAS, TIPOS_MANUTENCAO };
