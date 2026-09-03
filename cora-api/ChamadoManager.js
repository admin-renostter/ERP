/**
 * ChamadoManager — Gerenciamento de Chamados + Regras de Garantia
 *
 * Escopo:
 * - CRUD de chamados técnicos (climatização)
 * - Cálculo e gestão de garantia (90 dias padrão, configurável)
 * - Reabertura assistida dentro do prazo de garantia
 * - Log de auditoria de todas as ações de garantia
 * - Alertas de proximidade de vencimento de garantia
 * - Notificações por e-mail e internas
 */

const crypto = require('crypto');
const { dbRun, dbGet, dbAll } = require('./database');
// Sprint 13.8: wrappers tenant-aware
const { dbAllTenant, dbGetTenant, dbRunTenant } = require('./infra/tenantAwareDb');

const STATUS = {
    ABERTO: 'Aberto',
    EM_ANDAMENTO: 'Em Andamento',
    AGUARDANDO_PECA: 'Aguardando Peça',
    RESOLVIDO: 'Resolvido',
    FECHADO: 'Fechado',
    CANCELADO: 'Cancelado',
    REABERTO: 'Reaberto',
    EM_GARANTIA: 'Em Garantia'
};

const MOTIVOS_REABERTURA = [
    'Reincidência',
    'Erro Técnico',
    'Peça Defeituosa',
    'Insatisfação',
    'Outro'
];

const CATEGORIAS = [
    'Manutenção Corretiva',
    'Manutenção Preventiva',
    'Instalação',
    'Desinstalação',
    'Vistoria',
    'Orçamento',
    'Suporte Técnico'
];

const PRIORIDADES = ['Baixa', 'Média', 'Alta', 'Crítica'];

class ChamadoManager {
    // ═══════════════════════════════════════
    // 1. Configurações de Garantia
    // ═══════════════════════════════════════

    async getConfig(nome) {
        const row = await dbGetTenant(
            'SELECT valor FROM configuracoes_garantia WHERE nome = ?', [nome]
        );
        return row ? row.valor : null;
    }

    async getAllConfigs() {
        const rows = await dbAllTenant('SELECT nome, valor, descricao FROM configuracoes_garantia');
        const configs = {};
        for (const r of rows) configs[r.nome] = r.valor;
        return configs;
    }

    async updateConfig(nome, valor) {
        await dbRun(
            `INSERT INTO configuracoes_garantia (nome, valor) VALUES (?, ?)
             ON CONFLICT(nome) DO UPDATE SET valor = excluded.valor, updated_at = CURRENT_TIMESTAMP`,
            [nome, valor]
        );
        return { success: true };
    }

    // ═══════════════════════════════════════
    // 2. Cálculo de Garantia
    // ═══════════════════════════════════════

    calcularGarantia(dataConclusao, diasGarantia = 90) {
        if (!dataConclusao) return { emGarantia: false, diasRestantes: 0, dataFim: null };
        const dataFim = new Date(dataConclusao);
        dataFim.setDate(dataFim.getDate() + parseInt(diasGarantia));
        const agora = new Date();
        const diffMs = dataFim - agora;
        const diasRestantes = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        return {
            dataFim: dataFim.toISOString(),
            diasRestantes,
            emGarantia: diffMs >= 0
        };
    }

    async calcularGarantiaDoChamado(chamado) {
        const dias = chamado.dias_garantia || parseInt(await this.getConfig('dias_padrao_garantia') || '90');
        return this.calcularGarantia(chamado.data_conclusao, dias);
    }

    // ═══════════════════════════════════════
    // 3. CRUD de Chamados
    // ═══════════════════════════════════════

    async criarChamado({ clienteId, tecnicoId, titulo, descricao, categoria, prioridade }) {
        const id = 'ch_' + crypto.randomUUID().split('-')[0];
        await dbRun(
            `INSERT INTO chamados (id, cliente_id, tecnico_id, titulo, descricao, categoria, prioridade, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, clienteId, tecnicoId, titulo, descricao || '', categoria || 'Manutenção Corretiva', prioridade || 'Média', STATUS.ABERTO]
        );
        await this._logGarantia(id, null, 'Criação', `Chamado criado — categoria: ${categoria}`);
        return this.buscarChamado(id);
    }

    async buscarChamado(id) {
        // Sprint 13.8: filtra por tenant
        const c = await dbGetTenant('SELECT * FROM chamados WHERE id = ?', [id]);
        if (!c) return null;
        const garantia = await this.calcularGarantiaDoChamado(c);
        return { ...c, garantia };
    }

    async listarChamados({ clienteId, tecnicoId, status, page = 0, size = 50 } = {}) {
        let sql = 'SELECT c.*, g.diasRestantes, g.emGarantia FROM chamados c';
        const joins = [];
        const params = [];

        if (clienteId) { joins.push('cliente_id = ?'); params.push(clienteId); }
        if (tecnicoId) { joins.push('tecnico_id = ?'); params.push(tecnicoId); }
        if (status) { joins.push('c.status = ?'); params.push(status); }

        const where = joins.length ? ' WHERE ' + joins.join(' AND ') : '';
        const limit = Math.min(parseInt(size) || 50, 200);
        const offset = parseInt(page) * limit;

        // Subquery para garantia (left join)
        sql = `SELECT c.*,
            CASE WHEN c.data_conclusao IS NOT NULL AND c.data_garantia_fim IS NOT NULL
                 THEN CAST(julianday(c.data_garantia_fim) - julianday('now') AS INTEGER)
                 ELSE NULL END as diasRestantes,
            CASE WHEN c.data_conclusao IS NOT NULL AND c.data_garantia_fim IS NOT NULL
                 THEN (julianday(c.data_garantia_fim) >= julianday('now'))
                 ELSE 0 END as emGarantia
            FROM chamados c${where}
            ORDER BY c.data_abertura DESC LIMIT ? OFFSET ?`;
        // Sprint 13.8: filtra por tenant
        return await dbAllTenant(sql, [...params, limit, offset]);
    }

    async atualizarChamado(id, campos) {
        const allowed = ['titulo', 'descricao', 'categoria', 'prioridade', 'status', 'tecnico_id', 'data_conclusao', 'observacoes_garantia'];
        const sets = [];
        const params = [];
        for (const [k, v] of Object.entries(campos)) {
            if (allowed.includes(k)) {
                sets.push(`${k} = ?`);
                params.push(v);
            }
        }
        if (!sets.length) throw new Error('Nenhum campo válido para atualizar');
        params.push(id);
        await dbRun(`UPDATE chamados SET ${sets.join(', ')} WHERE id = ?`, params);
        return this.buscarChamado(id);
    }

    // ═══════════════════════════════════════
    // 4. Ciclo de Vida (Fechar / Resolver)
    // ═══════════════════════════════════════

    async resolverChamado(id, usuarioId, observacoes = '') {
        const chamado = await this.buscarChamado(id);
        if (!chamado) throw new Error('Chamado não encontrado');
        if (chamado.status === STATUS.FECHADO) throw new Error('Chamado já está fechado');

        const diasPadrao = parseInt(await this.getConfig('dias_padrao_garantia') || '90');
        const dataConclusao = new Date().toISOString();
        const dataGarantiaFim = new Date();
        dataGarantiaFim.setDate(dataGarantiaFim.getDate() + diasPadrao);

        await dbRun(
            `UPDATE chamados SET status = ?, data_conclusao = ?, data_garantia_fim = ?,
             dias_garantia = ?, observacoes_garantia = ? WHERE id = ?`,
            [STATUS.RESOLVIDO, dataConclusao, dataGarantiaFim.toISOString(), diasPadrao, observacoes, id]
        );

        await this._logGarantia(id, usuarioId, 'Resolução',
            `Chamado resolvido — garantia até ${dataGarantiaFim.toLocaleDateString('pt-BR')} (${diasPadrao} dias)`);

        return this.buscarChamado(id);
    }

    async fecharChamado(id, usuarioId) {
        const chamado = await this.buscarChamado(id);
        if (!chamado) throw new Error('Chamado não encontrado');
        if (chamado.status !== STATUS.RESOLVIDO) throw new Error('Chamado precisa estar resolvido antes de fechar');
        await dbRun('UPDATE chamados SET status = ? WHERE id = ?', [STATUS.FECHADO, id]);
        await this._logGarantia(id, usuarioId, 'Fechamento', 'Chamado fechado — garantia em vigor');
        return this.buscarChamado(id);
    }

    async cancelarChamado(id, usuarioId, motivo = '') {
        await dbRun('UPDATE chamados SET status = ? WHERE id = ?', [STATUS.CANCELADO, id]);
        await this._logGarantia(id, usuarioId, 'Cancelamento', motivo || 'Chamado cancelado');
        return this.buscarChamado(id);
    }

    // ═══════════════════════════════════════
    // 5. Reabertura em Garantia (core feature)
    // ═══════════════════════════════════════

    async podeReabrir(chamado) {
        const configs = await this.getAllConfigs();
        const maxReaberturas = parseInt(configs['max_reaberturas_garantia'] || '3');
        const permiteAposGarantia = configs['permite_reabertura_apos_garantia'] === 'true';

        // Se é uma reabertura (tem chamado_original_id), verificar o contador no ORIGINAL
        // para evitar contar de novo na cópia recém-criada
        let contador = chamado.qtd_reaberturas || 0;
        if (chamado.chamado_original_id) {
            const original = await dbGetTenant(
                'SELECT qtd_reaberturas, data_garantia_fim FROM chamados WHERE id = ?',
                [chamado.chamado_original_id]
            );
            if (original) {
                contador = original.qtd_reaberturas || 0;
                // Garantia do original se aplica
                chamado.data_garantia_fim = original.data_garantia_fim;
            }
        }

        if (contador > maxReaberturas - 1) {
            return { allowed: false, reason: `Limite de ${maxReaberturas} reaberturas atingido (${contador} usada(s))` };
        }
        if (!chamado.data_garantia_fim) {
            return { allowed: false, reason: 'Chamado sem data de garantia definida' };
        }

        const agora = new Date();
        const fimGarantia = new Date(chamado.data_garantia_fim);
        const emGarantia = agora <= fimGarantia;

        if (!emGarantia && !permiteAposGarantia) {
            return { allowed: false, reason: 'Período de garantia expirado' };
        }

        return { allowed: true, emGarantia };
    }

    async reabrirChamado(id, { motivo, usuarioId, usuarioNome, descricaoProblema }) {
        const chamado = await this.buscarChamado(id);
        if (!chamado) throw new Error('Chamado não encontrado');
        // Pode reabrir qualquer chamado que ainda esteja dentro do limite de reaberturas
        // (Fechado, Reaberto, Resolvido — todos são elegíveis enquanto a garantia é válida)

        const validacao = await this.podeReabrir(chamado);
        if (!validacao.allowed) {
            throw new Error(validacao.reason);
        }

        const novoId = 'ch_' + crypto.randomUUID().split('-')[0];
        const statusReabertura = await this.getConfig('status_reabertura') || STATUS.REABERTO;

        // Insere novo chamado como reabertura
        await dbRun(
            `INSERT INTO chamados
               (id, cliente_id, tecnico_id, titulo, descricao, categoria, prioridade, status,
                data_abertura, data_conclusao, data_garantia_fim, dias_garantia,
                motivo_reabertura, chamado_original_id, qtd_reaberturas, observacoes_garantia)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                novoId,
                chamado.cliente_id,
                null, // sem técnico atribuído na reabertura
                `[REABERTURA] ${chamado.titulo}`,
                descricaoProblema || `Reaberto por: ${motivo}`,
                chamado.categoria,
                chamado.prioridade,
                statusReabertura,
                new Date().toISOString(),
                null,
                chamado.data_garantia_fim, // mantém a garantia original
                chamado.dias_garantia,
                motivo,
                id, // referência ao original
                (chamado.qtd_reaberturas || 0) + 1,
                `Reaberto em ${new Date().toLocaleString('pt-BR')} — motivo: ${motivo}`
            ]
        );

        // Atualiza contador no original
        await dbRun(
            'UPDATE chamados SET qtd_reaberturas = qtd_reaberturas + 1, status = ? WHERE id = ?',
            [STATUS.REABERTO, id]
        );

        // Log
        const detalhes = JSON.stringify({
            novoId,
            motivo,
            descricaoProblema,
            garantiaOriginal: chamado.data_garantia_fim,
            diasRestantes: Math.ceil((new Date(chamado.data_garantia_fim) - new Date()) / 86400000)
        });
        await this._logGarantia(id, usuarioId, 'Reabertura', motivo, detalhes);

        return this.buscarChamado(novoId);
    }

    // ═══════════════════════════════════════
    // 6. Dashboard / KPIs de Garantia
    // ═══════════════════════════════════════

    async getGarantiaKPIs() {
        const [
            total,
            emGarantia,
            vencendo,
            reabertos,
            limiteAtingido
        ] = await Promise.all([
            dbGet('SELECT COUNT(*) as c FROM chamados WHERE status IN (?, ?, ?)',
                [STATUS.FECHADO, STATUS.RESOLVIDO, STATUS.REABERTO]),
            dbGet(`SELECT COUNT(*) as c FROM chamados
                WHERE data_garantia_fim IS NOT NULL
                AND julianday(data_garantia_fim) >= julianday('now')
                AND status IN (?, ?, ?)`,
                [STATUS.FECHADO, STATUS.RESOLVIDO, STATUS.REABERTO]),
            dbGet(`SELECT COUNT(*) as c FROM chamados
                WHERE data_garantia_fim IS NOT NULL
                AND julianday(data_garantia_fim) >= julianday('now')
                AND julianday(data_garantia_fim) <= julianday('now', '+7 days')
                AND status = ?`,
                [STATUS.FECHADO]),
            dbGet('SELECT COUNT(*) as c FROM chamados WHERE status = ?', [STATUS.REABERTO]),
            dbGet(`SELECT COUNT(*) as c FROM chamados
                WHERE qtd_reaberturas >= ? AND status IN (?, ?)`,
                [parseInt(await this.getConfig('max_reaberturas_garantia') || '3'), STATUS.FECHADO, STATUS.REABERTO])
        ]);

        // Reaberturas por motivo
        const motivos = await dbAllTenant(
            `SELECT motivo_reabertura as motivo, COUNT(*) as total
             FROM chamados WHERE motivo_reabertura IS NOT NULL GROUP BY motivo_reabertura`
        );

        return {
            totalFechados: total?.c || 0,
            emGarantia: emGarantia?.c || 0,
            vencendo7dias: vencendo?.c || 0,
            reabertos: reabertos?.c || 0,
            limiteAtingido: limiteAtingido?.c || 0,
            porMotivo: motivos
        };
    }

    // ═══════════════════════════════════════
    // 7. Alertas de Garantia
    // ═══════════════════════════════════════

    async getGarantiasProximasVencimento() {
        const diasAlerta = parseInt(await this.getConfig('dias_alerta_reabertura') || '7');
        const rows = await dbAllTenant(
            `SELECT c.*, cl.nome as cliente_nome, cl.email as cliente_email
             FROM chamados c
             LEFT JOIN clientes cl ON c.cliente_id = cl.id
             WHERE c.data_garantia_fim IS NOT NULL
               AND julianday(c.data_garantia_fim) >= julianday('now')
               AND julianday(c.data_garantia_fim) <= julianday('now', '+${diasAlerta} days')
               AND c.status IN (?, ?)
             ORDER BY c.data_garantia_fim ASC`,
            [STATUS.FECHADO, STATUS.RESOLVIDO]
        );
        return rows.map(c => {
            const g = this.calcularGarantia(c.data_conclusao, c.dias_garantia);
            return { ...c, ...g };
        });
    }

    async getGarantiasVencidas() {
        return await dbAllTenant(
            `SELECT c.*, cl.nome as cliente_nome, cl.email as cliente_email
             FROM chamados c
             LEFT JOIN clientes cl ON c.cliente_id = cl.id
             WHERE c.data_garantia_fim IS NOT NULL
               AND julianday(c.data_garantia_fim) < julianday('now')
               AND c.status IN (?, ?)
             ORDER BY c.data_garantia_fim DESC`,
            [STATUS.FECHADO, STATUS.RESOLVIDO]
        );
    }

    // ═══════════════════════════════════════
    // 8. Histórico / Logs de Garantia
    // ═══════════════════════════════════════

    async getLogsGarantia(chamadoId) {
        return await dbAllTenant(
            'SELECT * FROM logs_garantia WHERE chamado_id = ? ORDER BY data_acao DESC',
            [chamadoId]
        );
    }

    async getReaberturas(chamadoOriginalId) {
        return await dbAllTenant(
            'SELECT * FROM chamados WHERE chamado_original_id = ? ORDER BY data_abertura DESC',
            [chamadoOriginalId]
        );
    }

    // ═══════════════════════════════════════
    // 9. Estender Garantia (admin)
    // ═══════════════════════════════════════

    async estenderGarantia(id, { novoDias, justificativa, usuarioId }) {
        const chamado = await this.buscarChamado(id);
        if (!chamado) throw new Error('Chamado não encontrado');

        const dias = parseInt(novoDias);
        if (isNaN(dias) || dias < 1) throw new Error('Quantidade de dias inválida');

        const dataFim = new Date(chamado.data_conclusao || new Date());
        dataFim.setDate(dataFim.getDate() + dias);

        await dbRun(
            'UPDATE chamados SET dias_garantia = ?, data_garantia_fim = ? WHERE id = ?',
            [dias, dataFim.toISOString(), id]
        );

        await this._logGarantia(id, usuarioId, 'Extensão de Garantia',
            `Garantia estendida para ${dias} dias — até ${dataFim.toLocaleDateString('pt-BR')} — Justificativa: ${justificativa}`);

        return this.buscarChamado(id);
    }

    // ═══════════════════════════════════════
    // Privado: Logger de garantia
    // ═══════════════════════════════════════

    async _logGarantia(chamadoId, usuarioId, acao, motivo, detalhes = null) {
        try {
            await dbRun(
                `INSERT INTO logs_garantia (chamado_id, usuario_id, usuario_nome, acao, motivo, detalhes)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [chamadoId, usuarioId || 'system', '', acao, motivo, detalhes]
            );
        } catch (e) {
            console.warn('[ChamadoManager] Falha ao registrar log de garantia:', e.message);
        }
    }
}

module.exports = { ChamadoManager, STATUS, MOTIVOS_REABERTURA, CATEGORIAS, PRIORIDADES };
