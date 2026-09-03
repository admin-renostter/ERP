/**
 * AnalyticsService — BI & OLAP para o Renostter CRM (Sprint 14)
 *
 * Extrai a lógica do endpoint /api/bi/overview para um serviço testável
 * e reutilizável. Suporta:
 *   - Cache Redis (5 min TTL) por (tenantId, period, scope)
 *   - Drill-down de KPI para dados
 *   - Cohort analysis (retenção mensal)
 *   - Export CSV
 *   - Anomaly detection simples
 *
 * IMPORTANTE — Multi-tenant:
 *   - superadmin: pode passar `allTenants=true` para agregar TODOS os tenants
 *   - user normal: sempre filtra por tenant_id
 *
 * Cache:
 *   - Chave: `bi:overview:<tenantId|all>:<period>`
 *   - TTL: 300s (5 min)
 *   - Invalidação: ao chamar refreshCache() ou após write operations
 *
 * Padrão de uso:
 *   const Analytics = require('./AnalyticsService');
 *   const overview = await Analytics.getOverview(req);
 *   const drill = await Analytics.drillDown(req, 'cobrancas', { period: '30d' });
 *   const cohort = await Analytics.cohortRetention(req, { meses: 6 });
 */

const crypto = require('crypto');
const { dbGet, dbAll, dbRun } = require('../database');
const { ContratoManager } = require('../ContratoManager');
const contratoManager = new ContratoManager();

const CACHE_TTL_SEC = 300;  // 5 min

/**
 * Converte período em expressão SQL de intervalo.
 *   7d  →  '-7 days'
 *   30d →  '-30 days'
 *   90d →  '-90 days'
 *   12m →  '-12 months'
 */
function periodToExpr(period) {
    const map = { '7d': '7 days', '30d': '30 days', '90d': '90 days', '12m': '12 months' };
    return map[period] || '12 months';
}

/**
 * Helper para gerar cache key consistente.
 */
function cacheKey(tenantId, period, scope) {
    return `bi:overview:${tenantId || 'all'}:${period || '12m'}:${scope || 'tenant'}`;
}

/**
 * Lê do cache Redis (best-effort; se Redis indisponível, retorna null).
 */
async function cacheGet(key) {
    try {
        const redis = require('../infra/redis');
        if (!redis.isRedisAvailable || !redis.isRedisAvailable()) return null;
        const value = await redis.client.get(key);
        return value ? JSON.parse(value) : null;
    } catch (_) { return null; }
}

/**
 * Escreve no cache Redis (best-effort).
 */
async function cacheSet(key, value, ttl = CACHE_TTL_SEC) {
    try {
        const redis = require('../infra/redis');
        if (!redis.isRedisAvailable || !redis.isRedisAvailable()) return;
        await redis.client.setex(key, ttl, JSON.stringify(value));
    } catch (_) { /* silencioso */ }
}

/**
 * Invalida cache de BI para um tenant específico (ou todos).
 */
async function invalidateCache(tenantId = null) {
    try {
        const redis = require('../infra/redis');
        if (!redis.isRedisAvailable || !redis.isRedisAvailable()) return;
        // Remove chaves conhecidas. Em produção, usar SCAN.
        const periods = ['7d', '30d', '90d', '12m'];
        const scopes = ['tenant', 'all'];
        const tenants = tenantId ? [tenantId] : ['all'];
        for (const t of tenants) {
            for (const p of periods) {
                for (const s of scopes) {
                    await redis.client.del(cacheKey(t, p, s));
                }
            }
        }
    } catch (_) {}
}

// ════════════════════════════════════════════════════════════════
// OVERVIEW — KPIs consolidados
// ════════════════════════════════════════════════════════════════

/**
 * Retorna overview completo de BI para o tenant/period.
 * Usa cache Redis quando disponível.
 *
 * @param {Object} req - request com req.tenantId, req.isSuperadmin
 * @param {Object} opts - { period: '7d|30d|90d|12m', allTenants: boolean, noCache: boolean }
 * @returns {Object} data do overview
 */
async function getOverview(req, opts = {}) {
    const period = opts.period || req.query?.period || '12m';
    const tenantId = req.tenantId;
    const allTenants = opts.allTenants || (req.isSuperadmin && req.query?.allTenants === 'true');
    const scope = allTenants ? 'all' : 'tenant';
    const noCache = opts.noCache === true;

    const key = cacheKey(tenantId, period, scope);
    if (!noCache) {
        const cached = await cacheGet(key);
        if (cached) {
            cached._cache = 'hit';
            return cached;
        }
    }

    const sinceExpr = `date('now', '-${periodToExpr(period)}')`;
    const prevExpr = period === '12m' ? `date('now', '-24 months', '+12 months')` : `date('now', '-${periodToExpr(period)}', '-${periodToExpr(period)}')`;
    const tt = (allTenants || !tenantId) ? '' : ` AND tenant_id = '${tenantId}'`;

    const [
        cobrancasStats, cobrancasPrev,
        pmocStats,
        rmrStats,
        ticketsStats, ticketsPrev,
        cotacoesStats, cotacoesPrev,
        leadsStats, leadsPrev,
        estoqueStats,
    ] = await Promise.all([
        dbGet(`SELECT
            COUNT(*) as total,
            SUM(CASE WHEN status = 'PAID' THEN valor ELSE 0 END) as total_recebido,
            SUM(CASE WHEN status = 'OVERDUE' THEN valor ELSE 0 END) as total_vencido,
            SUM(CASE WHEN status IN ('PENDING','OPEN') THEN valor ELSE 0 END) as total_pendente,
            COUNT(CASE WHEN status = 'PAID' THEN 1 END) as qtd_pagas,
            COUNT(CASE WHEN status = 'OVERDUE' THEN 1 END) as qtd_vencidas
         FROM cobrancas WHERE created_at >= ${sinceExpr}${tt}`),
        dbGet(`SELECT SUM(CASE WHEN status = 'PAID' THEN valor ELSE 0 END) as total_recebido, COUNT(*) as total
         FROM cobrancas WHERE created_at >= ${prevExpr} AND created_at < ${sinceExpr}${tt}`),
        dbGet(`SELECT COUNT(*) as total,
            COUNT(CASE WHEN status = 'Concluida' THEN 1 END) as concluidas,
            COUNT(CASE WHEN status = 'Pendente' AND proxima_data < date('now') THEN 1 END) as vencidas,
            COUNT(CASE WHEN status = 'Pendente' THEN 1 END) as pendentes
         FROM manutencoes_preventivas WHERE 1=1${tt}`),
        contratoManager.getRMRMetrics(allTenants ? null : tenantId),
        dbGet(`SELECT COUNT(*) as total,
            COUNT(CASE WHEN status NOT IN ('Resolvido','Fechado','Cancelado') THEN 1 END) as em_aberto,
            COUNT(CASE WHEN status IN ('Resolvido','Fechado') THEN 1 END) as fechados
         FROM chamados WHERE data_abertura >= ${sinceExpr}${tt}`),
        dbGet(`SELECT COUNT(*) as total FROM chamados WHERE data_abertura >= ${prevExpr} AND data_abertura < ${sinceExpr}${tt}`),
        dbGet(`SELECT COUNT(*) as total, SUM(custo_total) as valor_total, AVG(custo_total) as ticket_medio,
            COUNT(CASE WHEN status = 'aprovada' THEN 1 END) as aprovadas,
            COUNT(CASE WHEN status = 'convertida' THEN 1 END) as convertidas,
            COUNT(CASE WHEN status = 'enviada' THEN 1 END) as enviadas,
            COUNT(CASE WHEN status = 'rascunho' THEN 1 END) as rascunhos,
            COUNT(CASE WHEN status = 'rejeitada' THEN 1 END) as rejeitadas
         FROM cotacoes WHERE created_at >= ${sinceExpr}${tt}`),
        dbGet(`SELECT COUNT(*) as total, SUM(custo_total) as valor_total
         FROM cotacoes WHERE created_at >= ${prevExpr} AND created_at < ${sinceExpr}${tt}`),
        dbGet(`SELECT COUNT(*) as total, AVG(pontuacao) as score_medio,
            COUNT(CASE WHEN status = 'novo' THEN 1 END) as novos,
            COUNT(CASE WHEN status = 'qualificado' THEN 1 END) as qualificados,
            COUNT(CASE WHEN status = 'proposta' THEN 1 END) as em_proposta,
            COUNT(CASE WHEN status = 'negociacao' THEN 1 END) as em_negociacao,
            COUNT(CASE WHEN status = 'ganho' THEN 1 END) as ganhos,
            COUNT(CASE WHEN status = 'perdido' THEN 1 END) as perdidos,
            COUNT(CASE WHEN converted_to_cliente_id IS NOT NULL THEN 1 END) as convertidos_cliente
         FROM leads WHERE created_at >= ${sinceExpr}${tt}`),
        dbGet(`SELECT COUNT(*) as total FROM leads WHERE created_at >= ${prevExpr} AND created_at < ${sinceExpr}${tt}`),
        dbGet(`SELECT COUNT(*) as total_itens,
            SUM(estoque_atual * preco_custo) as valor_estoque_custo,
            SUM(estoque_atual * preco_venda) as valor_estoque_venda,
            COUNT(CASE WHEN estoque_atual <= 5 THEN 1 END) as baixo_estoque,
            COUNT(CASE WHEN categoria = 'equipamento' THEN 1 END) as total_equipamentos,
            SUM(CASE WHEN categoria = 'equipamento' THEN estoque_atual * preco_venda ELSE 0 END) as valor_equipamentos
         FROM inventory WHERE ativo = 1${tt}`),
    ]);

    const [monthlyRevenue, ticketsTrend, cotacoesTrend, mixEquipamentos, leadsPorOrigem, topClientes, tecnicoPerformance] = await Promise.all([
        dbAll(`SELECT strftime('%Y-%m', created_at) as mes,
                SUM(CASE WHEN status = 'PAID' THEN valor ELSE 0 END) as receita,
                SUM(CASE WHEN status = 'OVERDUE' THEN valor ELSE 0 END) as vencido,
                COUNT(*) as qtd
         FROM cobrancas WHERE created_at >= ${sinceExpr}${tt}
         GROUP BY mes ORDER BY mes ASC`),
        dbAll(`SELECT strftime('%Y-%m', data_abertura) as mes, COUNT(*) as criados,
                COUNT(CASE WHEN status IN ('Resolvido','Fechado') THEN 1 END) as resolvidos
         FROM chamados WHERE data_abertura >= ${sinceExpr}${tt}
         GROUP BY mes ORDER BY mes ASC`),
        dbAll(`SELECT strftime('%Y-%m', created_at) as mes, COUNT(*) as criadas,
                SUM(custo_total) as valor,
                COUNT(CASE WHEN status IN ('aprovada','convertida') THEN 1 END) as convertidas
         FROM cotacoes WHERE created_at >= ${sinceExpr}${tt}
         GROUP BY mes ORDER BY mes ASC`),
        dbAll(`SELECT ci.sku, ci.descricao, ci.categoria,
                COUNT(*) as vezes_cotado,
                SUM(ci.quantidade) as qtd_total,
                SUM(ci.preco_total) as valor_total
         FROM cotacao_itens ci
         JOIN cotacoes c ON c.id = ci.cotacao_id
         WHERE ci.tipo = 'equipamento' AND c.created_at >= ${sinceExpr}${tt.replace("tenant_id", "c.tenant_id")}
         GROUP BY ci.sku ORDER BY vezes_cotado DESC LIMIT 10`),
        dbAll(`SELECT origem, COUNT(*) as total,
                COUNT(CASE WHEN status IN ('ganho','convertido') THEN 1 END) as convertidos
         FROM leads WHERE created_at >= ${sinceExpr}${tt}
         GROUP BY origem ORDER BY total DESC`),
        dbAll(`SELECT c.id, c.nome,
                COUNT(DISTINCT co.id) as qtd_cobrancas,
                SUM(CASE WHEN co.status = 'PAID' THEN co.valor ELSE 0 END) as receita_paga,
                SUM(CASE WHEN co.status = 'OVERDUE' THEN co.valor ELSE 0 END) as valor_vencido,
                COUNT(DISTINCT ch.id) as qtd_chamados
         FROM clientes c
         LEFT JOIN cobrancas co ON co.client_id = c.id AND co.created_at >= ${sinceExpr}
         LEFT JOIN chamados ch ON ch.cliente_id = c.id AND ch.data_abertura >= ${sinceExpr}
         ${allTenants || !tenantId ? '' : `WHERE c.tenant_id = '${tenantId}'`}
         GROUP BY c.id
         HAVING receita_paga > 0 OR qtd_chamados > 0
         ORDER BY receita_paga DESC, qtd_chamados DESC
         LIMIT 10`),
        dbAll(`SELECT u.id, u.nome,
                COUNT(ch.id) as total_chamados,
                COUNT(CASE WHEN ch.status IN ('Resolvido','Fechado') THEN 1 END) as resolvidos,
                COUNT(CASE WHEN ch.status NOT IN ('Resolvido','Fechado','Cancelado') THEN 1 END) as em_aberto
         FROM usuarios u
         LEFT JOIN chamados ch ON ch.tecnico_id = u.id AND ch.data_abertura >= ${sinceExpr}${tt}
         WHERE u.role = 'tecnico' AND u.ativo = 1
         GROUP BY u.id
         ORDER BY total_chamados DESC
         LIMIT 10`),
    ]);

    const calcDelta = (curr, prev) => {
        if (!prev || prev === 0) return curr > 0 ? 100 : 0;
        return Math.round(((curr - prev) / prev) * 100);
    };

    const data = {
        period,
        tenantId: allTenants ? null : tenantId,
        scope,
        generatedAt: new Date().toISOString(),
        cobrancas: {
            totalRecebido: cobrancasStats?.total_recebido || 0,
            totalVencido: cobrancasStats?.total_vencido || 0,
            totalPendente: cobrancasStats?.total_pendente || 0,
            qtdPagas: cobrancasStats?.qtd_pagas || 0,
            qtdVencidas: cobrancasStats?.qtd_vencidas || 0,
            qtdTotal: cobrancasStats?.total || 0,
        },
        pmoc: {
            total: pmocStats?.total || 0,
            concluidas: pmocStats?.concluidas || 0,
            vencidas: pmocStats?.vencidas || 0,
            pendentes: pmocStats?.pendentes || 0,
            taxaConformidade: pmocStats?.total > 0
                ? Math.round((pmocStats.concluidas / pmocStats.total) * 100) : 100,
        },
        rmr: rmrStats,
        tickets: {
            total: ticketsStats?.total || 0,
            emAberto: ticketsStats?.em_aberto || 0,
            fechados: ticketsStats?.fechados || 0,
            taxaResolucao: ticketsStats?.total > 0
                ? Math.round((ticketsStats.fechados / ticketsStats.total) * 100) : 0,
        },
        cotacoes: {
            total: cotacoesStats?.total || 0,
            valorTotal: cotacoesStats?.valor_total || 0,
            ticketMedio: cotacoesStats?.ticket_medio || 0,
            aprovadas: cotacoesStats?.aprovadas || 0,
            convertidas: cotacoesStats?.convertidas || 0,
            enviadas: cotacoesStats?.enviadas || 0,
            rascunhos: cotacoesStats?.rascunhos || 0,
            rejeitadas: cotacoesStats?.rejeitadas || 0,
            taxaConversao: cotacoesStats?.total > 0
                ? Math.round(((cotacoesStats.aprovadas + cotacoesStats.convertidas) / cotacoesStats.total) * 100) : 0,
        },
        leads: {
            total: leadsStats?.total || 0,
            scoreMedio: Math.round(leadsStats?.score_medio || 0),
            novos: leadsStats?.novos || 0,
            qualificados: leadsStats?.qualificados || 0,
            emProposta: leadsStats?.em_proposta || 0,
            emNegociacao: leadsStats?.em_negociacao || 0,
            ganhos: leadsStats?.ganhos || 0,
            perdidos: leadsStats?.perdidos || 0,
            convertidosCliente: leadsStats?.convertidos_cliente || 0,
            taxaConversao: leadsStats?.total > 0
                ? Math.round((leadsStats.ganhos / leadsStats.total) * 100) : 0,
        },
        estoque: {
            totalItens: estoqueStats?.total_itens || 0,
            valorCusto: estoqueStats?.valor_estoque_custo || 0,
            valorVenda: estoqueStats?.valor_estoque_venda || 0,
            baixoEstoque: estoqueStats?.baixo_estoque || 0,
            totalEquipamentos: estoqueStats?.total_equipamentos || 0,
            valorEquipamentos: estoqueStats?.valor_equipamentos || 0,
        },
        deltas: {
            receita: calcDelta(cobrancasStats?.total_recebido || 0, cobrancasPrev?.total_recebido || 0),
            chamados: calcDelta(ticketsStats?.total || 0, ticketsPrev?.total || 0),
            cotacoes: calcDelta(cotacoesStats?.total || 0, cotacoesPrev?.total || 0),
            cotacoesValor: calcDelta(cotacoesStats?.valor_total || 0, cotacoesPrev?.valor_total || 0),
            leads: calcDelta(leadsStats?.total || 0, leadsPrev?.total || 0),
        },
        topClientes: topClientes || [],
        tecnicoPerformance: tecnicoPerformance || [],
        monthlyRevenue: monthlyRevenue || [],
        ticketsTrend: ticketsTrend || [],
        cotacoesTrend: cotacoesTrend || [],
        mixEquipamentos: mixEquipamentos || [],
        leadsPorOrigem: leadsPorOrigem || [],
        _cache: 'miss',
    };

    // Cacheia (best-effort)
    await cacheSet(key, data, CACHE_TTL_SEC);

    return data;
}

// ════════════════════════════════════════════════════════════════
// DRILL-DOWN — do KPI para os dados
// ════════════════════════════════════════════════════════════════

/**
 * Drill-down: retorna os registros individuais que compõem um KPI.
 * Útil para "ver detalhes" no dashboard.
 *
 * Métricas suportadas:
 *   - 'cobrancas'  → lista de cobranças (com filtro opcional por status)
 *   - 'tickets'    → lista de chamados
 *   - 'cotacoes'   → lista de cotações
 *   - 'leads'      → lista de leads
 *   - 'clientes_top' → top clientes com receita
 *
 * @param {Object} req
 * @param {string} metric
 * @param {Object} opts - { period, status, limit, sort }
 */
async function drillDown(req, metric, opts = {}) {
    const tenantId = req.tenantId;
    const allTenants = req.isSuperadmin && opts.allTenants === true;
    const period = opts.period || '90d';
    const limit = Math.min(opts.limit || 100, 500);
    const status = opts.status || null;
    const sinceExpr = `date('now', '-${periodToExpr(period)}')`;
    const tt = (allTenants || !tenantId) ? '' : ` AND tenant_id = '${tenantId}'`;
    const statusFilter = status ? ` AND status = '${status}'` : '';

    let rows = [];
    switch (metric) {
        case 'cobrancas':
            rows = await dbAll(
                `SELECT id, contract_id, client_id, status, valor, data_vencimento, created_at
                 FROM cobrancas
                 WHERE created_at >= ${sinceExpr}${tt}${statusFilter}
                 ORDER BY created_at DESC LIMIT ?`,
                [limit]
            );
            break;
        case 'tickets':
            rows = await dbAll(
                `SELECT id, cliente_id, tecnico_id, titulo, status, prioridade, data_abertura, data_conclusao
                 FROM chamados
                 WHERE data_abertura >= ${sinceExpr}${tt}${statusFilter}
                 ORDER BY data_abertura DESC LIMIT ?`,
                [limit]
            );
            break;
        case 'cotacoes':
            rows = await dbAll(
                `SELECT id, cliente_id, lead_id, status, custo_total, titulo, created_at
                 FROM cotacoes
                 WHERE created_at >= ${sinceExpr}${tt}${statusFilter}
                 ORDER BY created_at DESC LIMIT ?`,
                [limit]
            );
            break;
        case 'leads':
            rows = await dbAll(
                `SELECT id, nome, email, telefone, origem, status, pontuacao, created_at
                 FROM leads
                 WHERE created_at >= ${sinceExpr}${tt}${statusFilter}
                 ORDER BY created_at DESC LIMIT ?`,
                [limit]
            );
            break;
        case 'clientes_top':
            rows = await dbAll(
                `SELECT c.id, c.nome, c.email, c.telefone,
                        COUNT(DISTINCT co.id) as qtd_cobrancas,
                        COALESCE(SUM(CASE WHEN co.status = 'PAID' THEN co.valor ELSE 0 END), 0) as receita_paga,
                        COALESCE(SUM(CASE WHEN co.status = 'OVERDUE' THEN co.valor ELSE 0 END), 0) as valor_vencido
                 FROM clientes c
                 LEFT JOIN cobrancas co ON co.client_id = c.id AND co.created_at >= ${sinceExpr}
                 ${allTenants || !tenantId ? '' : `WHERE c.tenant_id = '${tenantId}'`}
                 GROUP BY c.id
                 HAVING receita_paga > 0
                 ORDER BY receita_paga DESC
                 LIMIT ?`,
                [limit]
            );
            break;
        default:
            throw new Error(`Métrica desconhecida: ${metric}. Suportadas: cobrancas, tickets, cotacoes, leads, clientes_top`);
    }

    return {
        metric,
        period,
        total: rows.length,
        limit,
        tenantId: allTenants ? null : tenantId,
        data: rows,
    };
}

// ════════════════════════════════════════════════════════════════
// COHORT — retenção mensal de clientes
// ════════════════════════════════════════════════════════════════

/**
 * Análise de coorte: clientes que entraram em um mês X,
 * quantos ainda têm receita/faturamento em meses seguintes.
 *
 * Retorna:
 *   - cohorts: [{ mes_coorte, total_clientes, retencao: [mes0, mes1, mes2, ...] }]
 *   - summary: { total_cohorts, retencao_media_m1, retencao_media_m3 }
 */
async function cohortRetention(req, opts = {}) {
    const tenantId = req.tenantId;
    const allTenants = req.isSuperadmin && opts.allTenants === true;
    const meses = Math.min(opts.meses || 6, 12);
    const tt = (allTenants || !tenantId) ? '' : ` AND tenant_id = '${tenantId}'`;

    // Para cada mês nos últimos N meses, identifica clientes que ganharam
    // receita (cobrança PAID) pela primeira vez.
    const cohorts = [];

    for (let i = meses - 1; i >= 0; i--) {
        // Coorte = clientes novos neste mês (primeira cobrança PAID)
        const cohortMes = new Date();
        cohortMes.setMonth(cohortMes.getMonth() - i);
        const mesStr = cohortMes.toISOString().substring(0, 7);  // YYYY-MM
        const inicioMes = mesStr + '-01';
        const fimMes = new Date(cohortMes.getFullYear(), cohortMes.getMonth() + 1, 0).toISOString().substring(0, 10);

        // Clientes que pagaram pela 1ª vez neste mês
        const novosClientes = await dbAll(
            `SELECT DISTINCT client_id FROM cobrancas
             WHERE status = 'PAID' AND client_id IS NOT NULL
             AND tenant_id ${tenantId ? `= '${tenantId}'` : `IS NOT NULL`}
             AND client_id NOT IN (
                SELECT DISTINCT client_id FROM cobrancas
                WHERE status = 'PAID' AND client_id IS NOT NULL
                AND date(data_pagamento) < date('${inicioMes}')
             )
             AND date(data_pagamento) >= date('${inicioMes}')
             AND date(data_pagamento) <= date('${fimMes}')`,
            []
        );

        const total = novosClientes.length;
        if (total === 0) {
            cohorts.push({ mes: mesStr, total: 0, retencao: Array(i + 1).fill(null) });
            continue;
        }

        const ids = novosClientes.map(c => c.client_id).filter(Boolean);
        const retencao = [];

        for (let j = 0; j <= i; j++) {
            // Mês j após o coorte
            const targetDate = new Date(cohortMes.getFullYear(), cohortMes.getMonth() + j, 1);
            const targetStart = targetDate.toISOString().substring(0, 10);
            const targetEnd = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0).toISOString().substring(0, 10);

            // Placeholders para query IN (...)
            const placeholders = ids.map(() => '?').join(',');
            const retidos = await dbGet(
                `SELECT COUNT(DISTINCT client_id) as n FROM cobrancas
                 WHERE status = 'PAID' AND client_id IN (${placeholders})
                 AND date(data_pagamento) >= date(?)
                 AND date(data_pagamento) <= date(?)`,
                [...ids, targetStart, targetEnd]
            );
            const pct = total > 0 ? Math.round((retidos.n / total) * 100) : 0;
            retencao.push(pct);
        }

        cohorts.push({ mes: mesStr, total, retencao });
    }

    // Resumo: retenção média em M1, M3, M6
    const summary = {
        total_cohorts: cohorts.filter(c => c.total > 0).length,
    };
    const calcMedia = (idx) => {
        const valid = cohorts.filter(c => c.retencao.length > idx && c.retencao[idx] != null);
        if (valid.length === 0) return null;
        return Math.round(valid.reduce((s, c) => s + c.retencao[idx], 0) / valid.length);
    };
    summary.retencao_media_m1 = calcMedia(1);
    summary.retencao_media_m3 = calcMedia(3);
    summary.retencao_media_m6 = calcMedia(6);

    return {
        meses,
        tenantId: allTenants ? null : tenantId,
        cohorts,
        summary,
        generatedAt: new Date().toISOString(),
    };
}

// ════════════════════════════════════════════════════════════════
// EXPORT — CSV
// ════════════════════════════════════════════════════════════════

/**
 * Gera CSV de uma métrica/tabela para o período.
 * Retorna string CSV (com cabeçalho).
 */
async function exportCSV(req, metric, opts = {}) {
    const data = await drillDown(req, metric, { ...opts, limit: 10000 });
    if (!data.data || data.data.length === 0) {
        return { csv: '', filename: `${metric}_${opts.period || 'all'}.csv`, total: 0 };
    }

    // Cabeçalho = chaves do primeiro registro
    const headers = Object.keys(data.data[0]);
    const escape = (v) => {
        if (v == null) return '';
        const s = String(v).replace(/"/g, '""');
        if (s.includes(',') || s.includes('"') || s.includes('\n')) {
            return `"${s}"`;
        }
        return s;
    };

    const lines = [headers.join(',')];
    for (const row of data.data) {
        lines.push(headers.map(h => escape(row[h])).join(','));
    }

    return {
        csv: lines.join('\n'),
        filename: `renostter_${metric}_${opts.period || 'all'}_${new Date().toISOString().substring(0, 10)}.csv`,
        total: data.data.length,
    };
}

// ════════════════════════════════════════════════════════════════
// ANOMALY DETECTION — flag de padrões incomuns
// ════════════════════════════════════════════════════════════════

/**
 * Detecção de anomalias simples baseada em z-score.
 * Compara o último mês com a média e desvio padrão dos últimos N meses.
 *
 * Retorna lista de anomalias com severidade.
 */
async function detectAnomalies(req, opts = {}) {
    const tenantId = req.tenantId;
    const tt = tenantId ? ` AND tenant_id = '${tenantId}'` : '';
    const lookbackMonths = opts.lookbackMonths || 6;

    const anomalies = [];
    const metrics = [
        {
            name: 'Receita mensal',
            query: `SELECT strftime('%Y-%m', created_at) as mes,
                    COALESCE(SUM(CASE WHEN status = 'PAID' THEN valor ELSE 0 END), 0) as valor
             FROM cobrancas
             WHERE created_at >= date('now', '-${lookbackMonths} months')${tt}
             GROUP BY mes ORDER BY mes ASC`,
            label: 'revenue',
        },
        {
            name: 'Chamados criados',
            query: `SELECT strftime('%Y-%m', data_abertura) as mes, COUNT(*) as valor
             FROM chamados
             WHERE data_abertura >= date('now', '-${lookbackMonths} months')${tt}
             GROUP BY mes ORDER BY mes ASC`,
            label: 'tickets',
        },
        {
            name: 'Leads captados',
            query: `SELECT strftime('%Y-%m', created_at) as mes, COUNT(*) as valor
             FROM leads
             WHERE created_at >= date('now', '-${lookbackMonths} months')${tt}
             GROUP BY mes ORDER BY mes ASC`,
            label: 'leads',
        },
    ];

    for (const m of metrics) {
        const rows = await dbAll(m.query);
        if (rows.length < 3) continue;

        const values = rows.map(r => r.valor || 0);
        const last = values[values.length - 1];
        const previous = values.slice(0, -1);
        const mean = previous.reduce((a, b) => a + b, 0) / previous.length;
        const variance = previous.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / previous.length;
        const std = Math.sqrt(variance);
        const z = std > 0 ? (last - mean) / std : 0;

        if (Math.abs(z) > 1.5) {
            anomalies.push({
                metric: m.label,
                name: m.name,
                mes: rows[rows.length - 1].mes,
                valor_atual: last,
                media_historica: Math.round(mean * 100) / 100,
                desvio_padrao: Math.round(std * 100) / 100,
                z_score: Math.round(z * 100) / 100,
                severity: Math.abs(z) > 2.5 ? 'high' : Math.abs(z) > 2 ? 'medium' : 'low',
                direction: z > 0 ? 'up' : 'down',
            });
        }
    }

    return {
        tenantId,
        generatedAt: new Date().toISOString(),
        anomalies,
        total: anomalies.length,
    };
}

module.exports = {
    getOverview,
    drillDown,
    cohortRetention,
    exportCSV,
    detectAnomalies,
    invalidateCache,
    cacheKey,
    periodToExpr,
};
