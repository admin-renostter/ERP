/**
 * Test Sprint 13.8 — Tenant isolation nos managers
 *
 * Valida que queries via managers filtram automaticamente por tenant.
 */
const { dbGet, dbAll, dbRun, close } = require('../database');
const { runWithTenant, runWithoutTenant } = require('../infra/tenantAwareDb');

let passed = 0, failed = 0;
const failures = [];

function test(name, fn) {
    return Promise.resolve()
        .then(() => fn())
        .then(() => { passed++; console.log(`  ✓ ${name}`); })
        .catch(err => { failed++; failures.push({ name, err: err.message }); console.log(`  ✗ ${name}: ${err.message}`); });
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function assertEq(a, b, msg) { if (a !== b) throw new Error(`${msg || 'eq'}: got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`); }

(async () => {
    console.log('\n=== SPRINT 13.8 — TEST ISOLAMENTO MULTI-TENANT ===\n');

    // Setup: 2 tenants + dados em cada
    const TENANT_A = 'tnt_iso_a_' + Date.now();
    const TENANT_B = 'tnt_iso_b_' + Date.now();

    await test('Setup: cria 2 tenants', async () => {
        await dbRun(`INSERT INTO tenants (id, slug, nome, plano, status) VALUES (?, ?, ?, 'pro', 'ativo')`, [TENANT_A, `iso-a-${Date.now()}`, 'Tenant A Iso']);
        await dbRun(`INSERT INTO tenants (id, slug, nome, plano, status) VALUES (?, ?, ?, 'pro', 'ativo')`, [TENANT_B, `iso-b-${Date.now()}`, 'Tenant B Iso']);
    });

    await test('Setup: cria 5 clientes em cada tenant', async () => {
        for (let i = 0; i < 5; i++) {
            await dbRun(
                `INSERT INTO clientes (id, nome, email, tenant_id) VALUES (?, ?, ?, ?)`,
                [`cli-a-${i}-${Date.now()}`, `Cliente A ${i}`, `a${i}@a.com`, TENANT_A]
            );
            await dbRun(
                `INSERT INTO clientes (id, nome, email, tenant_id) VALUES (?, ?, ?, ?)`,
                [`cli-b-${i}-${Date.now()}`, `Cliente B ${i}`, `b${i}@b.com`, TENANT_B]
            );
        }
    });

    await test('Setup: cria 3 cobrancas em cada tenant', async () => {
        const now = new Date().toISOString();
        for (let i = 0; i < 3; i++) {
            await dbRun(
                `INSERT INTO cobrancas (id, contract_id, client_id, valor, data_vencimento, status, created_at, tenant_id)
                 VALUES (?, ?, ?, ?, ?, 'PAID', ?, ?)`,
                [`cob-a-${i}-${Date.now()}`, `ct-a-${i}`, `cli-a-0-${Date.now()}`, 100, now, now, TENANT_A]
            );
            await dbRun(
                `INSERT INTO cobrancas (id, contract_id, client_id, valor, data_vencimento, status, created_at, tenant_id)
                 VALUES (?, ?, ?, ?, ?, 'PAID', ?, ?)`,
                [`cob-b-${i}-${Date.now()}`, `ct-b-${i}`, `cli-b-0-${Date.now()}`, 200, now, now, TENANT_B]
            );
        }
    });

    // Testes de isolamento
    const CobrancaManager = require('../CobrancaManager');
    const { listLeads, getLeadById } = require('../LeadManager');
    const { listarCotacoes } = require('../CotacaoManager');

    await test('CobrancaManager.getKPIs: tenant A só vê 3 PAID', async () => {
        const cm = new CobrancaManager();
        const result = await runWithTenant({ tenantId: TENANT_A, isSuperadmin: false }, async () => {
            return await cm.getKPIs();
        });
        // Tenant A tem 3 PAID no total
        assertEq(result.pago.qtd, 3, `esperava 3 pagos, viu ${result.pago.qtd}`);
    });

    await test('CobrancaManager.getKPIs: tenant B só vê 3 PAID', async () => {
        const cm = new CobrancaManager();
        const result = await runWithTenant({ tenantId: TENANT_B, isSuperadmin: false }, async () => {
            return await cm.getKPIs();
        });
        // Tenant B tem 3 PAID no total
        assertEq(result.pago.qtd, 3, `esperava 3 pagos, viu ${result.pago.qtd}`);
    });

    await test('CobrancaManager.getKPIs SEM contexto: vê tudo', async () => {
        const cm = new CobrancaManager();
        // Sem runWithTenant: usa dbAll/dbGet normal, vê TUDO
        const result = await cm.getKPIs();
        // Vê ambos (A=3 + B=3 + 143 do tenant default = 149)
        assert(result.pago.qtd >= 6, `esperava >= 6, viu ${result.pago.qtd}`);
    });

    await test('CobrancaManager.getCobranca: tenant A não vê cobranca de B', async () => {
        const cm = new CobrancaManager();
        const cobrancaBId = `cob-b-0-${Date.now()}`;
        // tenta acessar cobranca do tenant B a partir de contexto do tenant A
        const result = await runWithTenant({ tenantId: TENANT_A, isSuperadmin: false }, async () => {
            return await cm.getCobranca(cobrancaBId);
        });
        assertEq(result, null, 'tenant A não deveria ver cobranca de B');
    });

    await test('listLeads: tenant A vê só leads do A', async () => {
        // Inserir um lead em cada tenant
        const leadAId = `lead-a-${Date.now()}`;
        const leadBId = `lead-b-${Date.now()}`;
        await dbRun(`INSERT INTO leads (id, nome, email, tenant_id) VALUES (?, ?, ?, ?)`, [leadAId, 'Lead A', 'la@a.com', TENANT_A]);
        await dbRun(`INSERT INTO leads (id, nome, email, tenant_id) VALUES (?, ?, ?, ?)`, [leadBId, 'Lead B', 'lb@b.com', TENANT_B]);

        const resultA = await runWithTenant({ tenantId: TENANT_A, isSuperadmin: false }, async () => {
            return await listLeads({});
        });
        const idsA = (resultA.data || resultA).map(l => l.id);
        assert(idsA.includes(leadAId), 'deveria ver lead A');
        assert(!idsA.includes(leadBId), 'NÃO deveria ver lead B');
    });

    await test('listarCotacoes: tenant B só vê cotações do B', async () => {
        // Inserir uma cotação em cada tenant
        const cotAId = `cot-a-${Date.now()}`;
        const cotBId = `cot-b-${Date.now()}`;
        await dbRun(`INSERT INTO cotacoes (id, titulo, custo_total, tenant_id) VALUES (?, ?, ?, ?)`, [cotAId, 'Cot A', 1000, TENANT_A]);
        await dbRun(`INSERT INTO cotacoes (id, titulo, custo_total, tenant_id) VALUES (?, ?, ?, ?)`, [cotBId, 'Cot B', 2000, TENANT_B]);

        const resultB = await runWithTenant({ tenantId: TENANT_B, isSuperadmin: false }, async () => {
            return await listarCotacoes({});
        });
        const idsB = (resultB.data || resultB).map(c => c.id);
        assert(idsB.includes(cotBId), 'deveria ver cot B');
        assert(!idsB.includes(cotAId), 'NÃO deveria ver cot A');
    });

    // Cleanup
    await test('Cleanup: deleta dados de teste', async () => {
        await dbRun(`DELETE FROM clientes WHERE tenant_id IN (?, ?)`, [TENANT_A, TENANT_B]);
        await dbRun(`DELETE FROM cobrancas WHERE tenant_id IN (?, ?)`, [TENANT_A, TENANT_B]);
        await dbRun(`DELETE FROM leads WHERE tenant_id IN (?, ?)`, [TENANT_A, TENANT_B]);
        await dbRun(`DELETE FROM cotacoes WHERE tenant_id IN (?, ?)`, [TENANT_A, TENANT_B]);
        await dbRun(`DELETE FROM tenants WHERE id IN (?, ?)`, [TENANT_A, TENANT_B]);
    });

    console.log('\n=== RESULTADO ===');
    console.log(`Passou: ${passed}`);
    console.log(`Falhou: ${failed}`);
    if (failed > 0) {
        console.log('\nFalhas:');
        failures.forEach(f => console.log(`  - ${f.name}: ${f.err}`));
    }
    try { close(); } catch (_) {}
    setTimeout(() => process.exit(failed > 0 ? 1 : 0), 100);
})().catch(err => {
    console.error('Erro fatal no test:', err);
    try { close(); } catch (_) {}
    setTimeout(() => process.exit(1), 100);
});
