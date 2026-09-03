/**
 * ContratoManager — Gestão de Contratos Recorrentes + RMR Analytics
 *
 * Escopo Phase 2:
 * - CRUD completo de contratos
 * - Cálculo de MRR / ARR / NRR
 * - Churn e expansão de receita
 * - Renovação automática (cron)
 * - Alertas de vencimento
 * - Relatórios de contratos
 */

const crypto = require('crypto');
const { dbRun, dbGet, dbAll } = require('./database');

const TIPOS_CONTRATO = {
    basico:      { label: 'Básico',       slaResposta: 48, slaResolucao: 120 },
    empresarial: { label: 'Empresarial',  slaResposta: 24, slaResolucao: 72  },
    premium:    { label: 'Premium',      slaResposta: 8,  slaResolucao: 24  },
    pmoc:       { label: 'PMOC',         slaResposta: 24, slaResolucao: 48  },
    emergencial: { label: 'Emergencial', slaResposta: 2,  slaResolucao: 8   },
};

const FREQUENCIAS = ['monthly', 'quarterly', 'semiannual', 'annual'];

class ContratoManager {

    // ═══════════════════════════════════════
    // 1. CRUD
    // ═══════════════════════════════════════

    async criar(dados) {
        const id = 'ct_' + crypto.randomUUID().split('-')[0];
        const {
            clienteId, titulo, valorMensal, valorAnual, frequenciaCobranca = 'monthly',
            tipoContrato = 'empresarial', renovacaoAutomatica = false,
            qtdEquipamentosInclusos = 0, percentualDesconto = 0,
            slaRespostaHoras, slaResolucaoHoras,
            dataInicio, dataFim, createdBy, observacoes
        } = dados;

        const tipoDefault = TIPOS_CONTRATO[tipoContrato] || TIPOS_CONTRATO.empresarial;

        await dbRun(
            `INSERT INTO contratos
               (id, cliente_id, titulo, valor_mensal, valor_anual, frequencia_cobranca,
                tipo_contrato, renovacao_automatica, qtd_equipamentos_inclusos,
                percentual_desconto, sla_resposta_horas, sla_resolucao_horas,
                data_inicio, data_fim, created_by, observacoes, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, clienteId || null, titulo || '', valorMensal || null,
             valorAnual || null, frequenciaCobranca,
             tipoContrato, renovacaoAutomatica ? 1 : 0,
             qtdEquipamentosInclusos || 0, percentualDesconto || 0,
             slaRespostaHoras ?? tipoDefault.slaResposta,
             slaResolucaoHoras ?? tipoDefault.slaResolucao,
             dataInicio || null, dataFim || null,
             createdBy || null, observacoes || '', 'Ativo']
        );

        return this.buscar(id);
    }

    async buscar(id) {
        const c = await dbGet(
            `SELECT ct.*, c.nome as cliente_nome, c.email as cliente_email
             FROM contratos ct
             LEFT JOIN clientes c ON ct.cliente_id = c.id
             WHERE ct.id = ?`,
            [id]
        );
        if (!c) return null;
        c.renovacao_automatica = !!c.renovacao_automatica;
        c.tipo_label = TIPOS_CONTRATO[c.tipo_contrato]?.label || c.tipo_contrato;
        c.tem_conta_corrente = !!(c.cliente_id);
        // Contrato atual se vencimento nos próximos 90 dias
        if (c.data_fim) {
            const diasRestantes = Math.ceil((new Date(c.data_fim) - new Date()) / 86400000);
            c.dias_restantes = diasRestantes;
            c.vencendo_em_30d = diasRestantes > 0 && diasRestantes <= 30;
            c.vencendo_em_60d = diasRestantes > 0 && diasRestantes <= 60;
        }
        return c;
    }

    async listar({ clienteId, status, tipo, page = 0, size = 50 } = {}) {
        const params = [], wheres = [];
        if (clienteId) { wheres.push('ct.cliente_id = ?'); params.push(clienteId); }
        if (status) { wheres.push('ct.status = ?'); params.push(status); }
        if (tipo) { wheres.push('ct.tipo_contrato = ?'); params.push(tipo); }
        const where = wheres.length ? ' WHERE ' + wheres.join(' AND ') : '';
        const limit = Math.min(parseInt(size) || 50, 200);
        const offset = parseInt(page) * limit;

        const rows = await dbAll(
            `SELECT ct.*, c.nome as cliente_nome
             FROM contratos ct
             LEFT JOIN clientes c ON ct.cliente_id = c.id
             ${where}
             ORDER BY ct.created_at DESC LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );

        for (const c of rows) {
            c.renovacao_automatica = !!c.renovacao_automatica;
            c.tipo_label = TIPOS_CONTRATO[c.tipo_contrato]?.label || c.tipo_contrato;
            if (c.data_fim) {
                const dias = Math.ceil((new Date(c.data_fim) - new Date()) / 86400000);
                c.dias_restantes = dias;
                c.vencendo_breve = dias > 0 && dias <= 60;
            }
        }

        return { data: rows, page: parseInt(page), size: limit };
    }

    async atualizar(id, campos) {
        const allowed = [
            'titulo', 'valor_mensal', 'valor_anual', 'frequencia_cobranca', 'tipo_contrato',
            'renovacao_automatica', 'qtd_equipamentos_inclusos', 'percentual_desconto',
            'sla_resposta_horas', 'sla_resolucao_horas',
            'status', 'data_inicio', 'data_fim', 'observacoes', 'cliente_id'
        ];
        const sets = [], params = [];
        for (const [k, v] of Object.entries(campos)) {
            if (allowed.includes(k)) {
                if (k === 'renovacao_automatica') { sets.push(`${k} = ?`); params.push(v ? 1 : 0); }
                else { sets.push(`${k} = ?`); params.push(v); }
            }
        }
        if (!sets.length) throw new Error('Nenhum campo válido');
        params.push(id);
        await dbRun(`UPDATE contratos SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, params);
        return this.buscar(id);
    }

    async excluir(id) {
        await dbRun('UPDATE contratos SET status = ? WHERE id = ?', ['Cancelado', id]);
        return { success: true };
    }

    async ativar(id) {
        await dbRun('UPDATE contratos SET status = ? WHERE id = ?', ['Ativo', id]);
        return { success: true };
    }

    // ═══════════════════════════════════════
    // 2. RMR Analytics
    // ═══════════════════════════════════════

    async getRMRMetrics(tenantId = null) {
        // Sprint 14.1: filtra por tenant_id se fornecido
        const tt = tenantId ? ` AND tenant_id = '${tenantId}'` : '';
        const [total, ativos, cancelados, vencem30, vencem60] = await Promise.all([
            dbGet(`SELECT COUNT(*) as c, COALESCE(SUM(valor_mensal),0) as valor FROM contratos WHERE 1=1${tt}`),
            dbGet(`SELECT COUNT(*) as c, COALESCE(SUM(valor_mensal),0) as valor FROM contratos WHERE status = 'Ativo'${tt}`),
            dbGet(`SELECT COUNT(*) as c, COALESCE(SUM(valor_mensal),0) as valor FROM contratos WHERE status = 'Cancelado'${tt}`),
            dbGet(`SELECT COUNT(*) as c FROM contratos
                   WHERE status = 'Ativo' AND data_fim IS NOT NULL
                   AND date(data_fim) <= date('now', '+30 days')${tt}`),
            dbGet(`SELECT COUNT(*) as c FROM contratos
                   WHERE status = 'Ativo' AND data_fim IS NOT NULL
                   AND date(data_fim) <= date('now', '+60 days')${tt}`),
        ]);

        const mrr = ativos?.valor || 0;
        const arr = mrr * 12;

        // Receita perdida (contratos cancelados no mês)
        const churnedMes = await dbGet(
            `SELECT COALESCE(SUM(valor_mensal),0) as valor FROM contratos
             WHERE status = 'Cancelado'
             AND updated_at >= date('now', 'start of month')${tt}`
        );

        // Receita nova no mês
        const novoMes = await dbGet(
            `SELECT COALESCE(SUM(valor_mensal),0) as valor FROM contratos
             WHERE created_at >= date('now', 'start of month')${tt}`
        );

        // Expansão: contratos atualizados com valor maior este mês
        const expansao = await dbGet(
            `SELECT COALESCE(SUM(valor_mensal),0) as valor FROM contratos
             WHERE updated_at >= date('now', 'start of month')
             AND status = 'Ativo'${tt}`
        );

        return {
            mrr: Math.round(mrr * 100) / 100,
            arr: Math.round(arr * 100) / 100,
            totalContratos: total?.c || 0,
            contratosAtivos: ativos?.c || 0,
            contratosCancelados: cancelados?.c || 0,
            vencemEm30Dias: vencem30?.c || 0,
            vencemEm60Dias: vencem60?.c || 0,
            churnedMes: Math.round((churnedMes?.valor || 0) * 100) / 100,
            novoMes: Math.round((novoMes?.valor || 0) * 100) / 100,
            expansao: Math.round((expansao?.valor || 0) * 100) / 100,
            nrr: arr > 0 ? Math.round(((mrr + (expansao?.valor || 0)) / mrr) * 100 * 100) / 100 : 100,
            churnRate: mrr > 0 ? Math.round((churnedMes?.valor / mrr) * 10000) / 100 : 0,
        };
    }

    async getRMRPorPlano(tenantId = null) {
        // Sprint 14.1: filtra por tenant_id
        const tt = tenantId ? ` AND tenant_id = '${tenantId}'` : '';
        return dbAll(
            `SELECT tipo_contrato, COUNT(*) as quantidade,
                    COALESCE(SUM(valor_mensal),0) as mrr,
                    COALESCE(AVG(valor_mensal),0) as ticket_medio
             FROM contratos WHERE status = 'Ativo' AND valor_mensal > 0${tt}
             GROUP BY tipo_contrato ORDER BY mrr DESC`
        );
    }

    async getReceitaHistorico(meses = 12) {
        return dbAll(
            `SELECT strftime('%Y-%m', created_at) as mes,
                    COUNT(*) as novos_contratos,
                    COALESCE(SUM(valor_mensal),0) as mrr_novo
             FROM contratos
             WHERE created_at >= date('now', '-${meses} months')
             GROUP BY mes ORDER BY mes ASC`
        );
    }

    async getContratosVencendo() {
        return dbAll(
            `SELECT ct.*, c.nome as cliente_nome, c.email as cliente_email
             FROM contratos ct
             LEFT JOIN clientes c ON ct.cliente_id = c.id
             WHERE ct.status = 'Ativo'
               AND ct.data_fim IS NOT NULL
               AND date(ct.data_fim) <= date('now', '+60 days')
             ORDER BY ct.data_fim ASC`
        );
    }

    // ═══════════════════════════════════════
    // 3. Alertas e Renovação
    // ═══════════════════════════════════════

    async getAlertaVencimento(clienteId) {
        return dbAll(
            `SELECT ct.*, c.nome as cliente_nome, c.email as cliente_email
             FROM contratos ct
             LEFT JOIN clientes c ON ct.cliente_id = c.id
             WHERE ct.status = 'Ativo'
               AND ct.data_fim IS NOT NULL
               AND date(ct.data_fim) BETWEEN date('now') AND date('now', '+30 days')
             ORDER BY ct.data_fim ASC`
        );
    }

    async getAlertaRenovacao() {
        return dbAll(
            `SELECT ct.*, c.nome as cliente_nome
             FROM contratos ct
             LEFT JOIN clientes c ON ct.cliente_id = c.id
             WHERE ct.status = 'Ativo'
               AND ct.renovacao_automatica = 0
               AND ct.data_fim IS NOT NULL
               AND date(ct.data_fim) BETWEEN date('now') AND date('now', '+60 days')
             ORDER BY ct.data_fim ASC`
        );
    }

    /**
     * Executar renovação automática de contratos vencidos
     * Chamar via cron nightly
     */
    async executarRenovacoesAutomaticas() {
        const vencidos = await dbAll(
            `SELECT * FROM contratos
             WHERE status = 'Ativo'
               AND renovacao_automatica = 1
               AND data_fim IS NOT NULL
               AND date(data_fim) < date('now')`
        );

        const results = [];
        for (const c of vencidos) {
            const novaDataFim = new Date(c.data_fim);
            // Renova por mais 1 ano
            novaDataFim.setFullYear(novaDataFim.getFullYear() + 1);
            await dbRun(
                `UPDATE contratos SET data_fim = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [novaDataFim.toISOString().split('T')[0], c.id]
            );
            results.push({ id: c.id, cliente: c.cliente_id, novaDataFim: novaDataFim.toISOString() });
        }
        return results;
    }

    // ═══════════════════════════════════════
    // 4. Contratos por Cliente
    // ═══════════════════════════════════════

    async getContratosPorCliente(clienteId) {
        const rows = await dbAll(
            `SELECT ct.* FROM contratos ct
             WHERE ct.cliente_id = ?
             ORDER BY ct.created_at DESC`,
            [clienteId]
        );
        for (const c of rows) {
            c.renovacao_automatica = !!c.renovacao_automatica;
            c.tipo_label = TIPOS_CONTRATO[c.tipo_contrato]?.label || c.tipo_contrato;
        }
        return rows;
    }

    // ═══════════════════════════════════════
    // 5. Relatório de Contratos
    // ═══════════════════════════════════════

    async gerarRelatorio() {
        const [ativos, cancelados, vencendo, rmr] = await Promise.all([
            this.listar({ status: 'Ativo', size: 500 }),
            this.listar({ status: 'Cancelado', size: 500 }),
            this.getContratosVencendo(),
            this.getRMRMetrics(),
        ]);

        return {
            data: new Date().toISOString(),
            rmr,
            totalAtivos: ativos.data.length,
            totalCancelados: cancelados.data.length,
            vencendo60d: vencendo.length,
            contratos: ativos.data.slice(0, 20),
        };
    }
}

module.exports = { ContratoManager, TIPOS_CONTRATO, FREQUENCIAS };
