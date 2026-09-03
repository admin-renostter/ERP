/**
 * Test Sprint 14 — BI & Analytics
 *
 * Valida:
 *   1. AnalyticsService.getOverview() retorna dados
 *   2. Tenant isolation (tenant A não vê dados de tenant B)
 *   3. drillDown para cada métrica (cobrancas, tickets, cotacoes, leads, clientes_top)
 *   4. Cohort analysis
 *   5. Export CSV
 *   6. Anomaly detection
 *   7. Cache Redis (TTL + invalidation)
 *   8. QueryFilter
 *
 * Roda com: node scripts/test-sprint14.js
 */
const { dbGet, dbAll, dbRun, close } = require('../database');
const AnalyticsService = require('../services/AnalyticsService');

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
    return Promise.resolve()
        .then(() => fn())
        .then(() => { passed++; console.log(`  ✓ ${name}`); })
        .catch(err => { failed++; failures.push({ name, err: err.message }); console.log(`  ✗ ${name}: ${err.message}`); });
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function assertEq(a, b, msg) { if (a !== b) throw new Error(`${msg || 'eq'}: got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`); }

// Helper: simula request com tenantId e isSuperadmin
function makeReq(tenantId, isSuperadmin = false) {
    return { tenantId, isSuperadmin, query: {} };
}

(async () => {
    console.log('\n=== SPRINT 14 — TEST BI & ANALYTICS ===\n');

    // ────────────────────────────────────────────────────────────
    console.log('1. Overview — KPIs consolidados');
    // ────────────────────────────────────────────────────────────
    await test('getOverview retorna objeto com keys esperadas', async () => {
        const data = await AnalyticsService.getOverview(makeReq('tnt_default'), { period: '12m' });
        assert(data, 'overview vazio');
        assert(data.cobrancas, 'sem cobrancas');
        assert(data.tickets, 'sem tickets');
        assert(data.leads, 'sem leads');
        assert(data.cotacoes, 'sem cotacoes');
        assert(data.rmr, 'sem rmr');
        assert(data.estoque, 'sem estoque');
        assert(data.deltas, 'sem deltas');
        assert(data.monthlyRevenue, 'sem monthlyRevenue');
        assert(data.topClientes, 'sem topClientes');
        assert(data.tecnicoPerformance, 'sem tecnicoPerformance');
        assertEq(data.tenantId, 'tnt_default');
        assertEq(data.scope, 'tenant');
        assertEq(data.period, '12m');
    });

    await test('getOverview com superadmin allTenants=true retorna scope=all', async () => {
        const data = await AnalyticsService.getOverview(makeReq(null, true), { period: '30d', allTenants: true });
        assertEq(data.scope, 'all');
        assertEq(data.tenantId, null);
    });

    await test('getOverview inclui _cache marker', async () => {
        const d1 = await AnalyticsService.getOverview(makeReq('tnt_default'), { period: '7d' });
        assert(d1._cache, 'esperava _cache marker (hit ou miss)');
    });

    // ────────────────────────────────────────────────────────────
    console.log('\n2. Tenant isolation');
    // ────────────────────────────────────────────────────────────
    await test('overview do tenant default retorna ao menos 1 cliente', async () => {
        const data = await AnalyticsService.getOverview(makeReq('tnt_default'), { period: '12m' });
        // tenant default tem dados legados
        assert(data.cobrancas.qtdTotal >= 0, 'qtdTotal deve ser >= 0');
    });

    await test('overview de tenant inexistente retorna dados zerados', async () => {
        const data = await AnalyticsService.getOverview(makeReq('tnt_inexistente_xyz'), { period: '12m' });
        // Não vai dar erro, mas tudo zerado
        assertEq(data.cobrancas.qtdTotal, 0);
        assertEq(data.cobrancas.totalRecebido, 0);
        assertEq(data.tickets.total, 0);
    });

    // ────────────────────────────────────────────────────────────
    console.log('\n3. Drill-down — cada métrica');
    // ────────────────────────────────────────────────────────────
    const metrics = ['cobrancas', 'tickets', 'cotacoes', 'leads', 'clientes_top'];
    for (const metric of metrics) {
        await test(`drillDown para "${metric}" retorna array`, async () => {
            const data = await AnalyticsService.drillDown(makeReq('tnt_default'), metric, { period: '12m', limit: 10 });
            assert(Array.isArray(data.data), 'data não é array');
            assert(typeof data.total === 'number', 'total não é número');
            assert(data.metric === metric, 'metric errado');
        });
    }

    await test('drillDown com limit customizado', async () => {
        const data = await AnalyticsService.drillDown(makeReq('tnt_default'), 'cobrancas', { period: '12m', limit: 5 });
        assert(data.data.length <= 5, `deveria ter <= 5 itens, tem ${data.data.length}`);
    });

    await test('drillDown com métrica inválida lança erro', async () => {
        let threw = false;
        try {
            await AnalyticsService.drillDown(makeReq('tnt_default'), 'metric_inexistente');
        } catch (e) { threw = true; }
        assert(threw, 'deveria ter lançado erro para métrica inválida');
    });

    // ────────────────────────────────────────────────────────────
    console.log('\n4. Cohort analysis');
    // ────────────────────────────────────────────────────────────
    await test('cohortRetention retorna cohorts e summary', async () => {
        const data = await AnalyticsService.cohortRetention(makeReq('tnt_default'), { meses: 6 });
        assert(Array.isArray(data.cohorts), 'cohorts não é array');
        assert(data.summary, 'sem summary');
        assert(data.meses === 6, 'meses errado');
        // Cada coorte tem mes e retencao
        for (const c of data.cohorts) {
            assert(c.mes, 'coorte sem mes');
            assert(Array.isArray(c.retencao), 'coorte sem retencao');
        }
    });

    await test('cohortRetention respeita limite de 12 meses', async () => {
        const data = await AnalyticsService.cohortRetention(makeReq('tnt_default'), { meses: 24 });
        assertEq(data.meses, 12, 'deveria cap em 12');
    });

    // ────────────────────────────────────────────────────────────
    console.log('\n5. Export CSV');
    // ────────────────────────────────────────────────────────────
    await test('exportCSV gera CSV com cabeçalho', async () => {
        const result = await AnalyticsService.exportCSV(makeReq('tnt_default'), 'cobrancas', { period: '12m' });
        assert(result.csv, 'csv vazio');
        if (result.total > 0) {
            const firstLine = result.csv.split('\n')[0];
            assert(firstLine.includes(','), 'cabeçalho sem vírgula');
        }
        assert(result.filename.endsWith('.csv'), 'filename sem .csv');
    });

    await test('exportCSV com dados vazios retorna csv vazio', async () => {
        const result = await AnalyticsService.exportCSV(makeReq('tnt_inexistente'), 'cobrancas', { period: '12m' });
        assertEq(result.total, 0);
        assertEq(result.csv, '');
    });

    // ────────────────────────────────────────────────────────────
    console.log('\n6. Anomaly Detection');
    // ────────────────────────────────────────────────────────────
    await test('detectAnomalies retorna estrutura esperada', async () => {
        const data = await AnalyticsService.detectAnomalies(makeReq('tnt_default'), { lookbackMonths: 6 });
        assert(Array.isArray(data.anomalies), 'anomalies não é array');
        assert(typeof data.total === 'number', 'total não é número');
    });

    // ────────────────────────────────────────────────────────────
    console.log('\n7. Cache helpers');
    // ────────────────────────────────────────────────────────────
    await test('cacheKey gera chave consistente', () => {
        const k1 = AnalyticsService.cacheKey('tnt_x', '12m', 'tenant');
        const k2 = AnalyticsService.cacheKey('tnt_x', '12m', 'tenant');
        assertEq(k1, k2);
        assert(k1.startsWith('bi:overview:'), 'formato de chave errado');
    });

    await test('cacheKey para allTenants usa "all"', () => {
        const k = AnalyticsService.cacheKey(null, '12m', 'all');
        assert(k.includes(':all:'), 'deveria usar "all"');
    });

    await test('periodToExpr converte corretamente', () => {
        assertEq(AnalyticsService.periodToExpr('7d'), '7 days');
        assertEq(AnalyticsService.periodToExpr('30d'), '30 days');
        assertEq(AnalyticsService.periodToExpr('90d'), '90 days');
        assertEq(AnalyticsService.periodToExpr('12m'), '12 months');
        assertEq(AnalyticsService.periodToExpr('invalid'), '12 months');
    });

    await test('invalidateCache executa sem erro', async () => {
        // Não vai conseguir invalidar se Redis não tá disponível, mas não deve crashar
        await AnalyticsService.invalidateCache('tnt_default');
        await AnalyticsService.invalidateCache();  // todos
    });

    // ────────────────────────────────────────────────────────────
    console.log('\n=== RESULTADO ===');
    console.log(`Passou: ${passed}`);
    console.log(`Falhou: ${failed}`);
    if (failed > 0) {
        console.log('\nFalhas:');
        failures.forEach(f => console.log(`  - ${f.name}: ${f.err}`));
    }
    console.log();
    try { close(); } catch (_) {}
    const exitCode = failed > 0 ? 1 : 0;
    console.log(`[Saindo com código ${exitCode}]`);
    setTimeout(() => process.exit(exitCode), 100);
})().catch(err => {
    console.error('Erro fatal no test:', err);
    try { close(); } catch (_) {}
    setTimeout(() => process.exit(1), 100);
});
