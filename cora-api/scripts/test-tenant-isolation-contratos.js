/**
 * Test — Isolamento de tenant em routes/contratos.js
 *
 * Sprint 20 (contratos) nunca tinha sido migrada para o wrapper de tenant
 * (infra/tenantAwareDb.js) introduzido na Sprint 13.8 — GET/POST/PATCH/DELETE
 * de contratos rodavam sem NENHUM filtro de tenant_id (vazamento cross-tenant
 * + IDOR via ID sequencial previsível). Este teste exercita as MESMAS funções
 * que routes/contratos.js agora usa (dbGetTenant/dbAllTenant/dbRunTenant),
 * para provar que o isolamento realmente funciona ponta a ponta.
 */
const { dbGet, dbAll, dbRun, close } = require('../database');
const { runWithTenant, dbGetTenant, dbAllTenant, dbRunTenant } = require('../infra/tenantAwareDb');

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
    console.log('\n=== TESTE — ISOLAMENTO DE TENANT EM CONTRATOS ===\n');

    const TENANT_A = 'tnt_ctriso_a_' + Date.now();
    const TENANT_B = 'tnt_ctriso_b_' + Date.now();
    const CLIENTE_A = 'cli_ctriso_a_' + Date.now();
    const CLIENTE_B = 'cli_ctriso_b_' + Date.now();
    let CONTRATO_A = null;
    let CONTRATO_B = null;

    await test('Setup: cria 2 tenants + 1 cliente em cada', async () => {
        await dbRun(`INSERT INTO tenants (id, slug, nome, plano, status) VALUES (?, ?, ?, 'pro', 'ativo')`, [TENANT_A, `ctriso-a-${Date.now()}`, 'Tenant A Contratos']);
        await dbRun(`INSERT INTO tenants (id, slug, nome, plano, status) VALUES (?, ?, ?, 'pro', 'ativo')`, [TENANT_B, `ctriso-b-${Date.now()}`, 'Tenant B Contratos']);
        await dbRun(`INSERT INTO clientes (id, nome, email, tenant_id) VALUES (?, ?, ?, ?)`, [CLIENTE_A, 'Cliente A', 'clia@teste.com', TENANT_A]);
        await dbRun(`INSERT INTO clientes (id, nome, email, tenant_id) VALUES (?, ?, ?, ?)`, [CLIENTE_B, 'Cliente B', 'clib@teste.com', TENANT_B]);
    });

    await test('POST /contratos (simulado): cria 1 contrato em cada tenant via dbRunTenant', async () => {
        CONTRATO_A = 'CTRISO-A-' + Date.now();
        CONTRATO_B = 'CTRISO-B-' + Date.now();
        await runWithTenant({ tenantId: TENANT_A, isSuperadmin: false }, async () => {
            await dbRunTenant(
                `INSERT INTO contratos (id, cliente_id, titulo, valor_mensal, tipo_contrato, status, data_inicio, data_fim)
                 VALUES (?, ?, ?, ?, ?, 'Ativo', '2026-01-01', '2026-12-31')`,
                [CONTRATO_A, CLIENTE_A, 'Contrato A', 1000, 'pmoc']
            );
        });
        await runWithTenant({ tenantId: TENANT_B, isSuperadmin: false }, async () => {
            await dbRunTenant(
                `INSERT INTO contratos (id, cliente_id, titulo, valor_mensal, tipo_contrato, status, data_inicio, data_fim)
                 VALUES (?, ?, ?, ?, ?, 'Ativo', '2026-01-01', '2026-12-31')`,
                [CONTRATO_B, CLIENTE_B, 'Contrato B', 2000, 'pmoc']
            );
        });
        // Confere que o INSERT gravou o tenant_id certo (fora de qualquer contexto, vendo tudo)
        const rowA = await dbGet(`SELECT tenant_id FROM contratos WHERE id = ?`, [CONTRATO_A]);
        const rowB = await dbGet(`SELECT tenant_id FROM contratos WHERE id = ?`, [CONTRATO_B]);
        assertEq(rowA.tenant_id, TENANT_A, 'contrato A deveria ter tenant_id = TENANT_A');
        assertEq(rowB.tenant_id, TENANT_B, 'contrato B deveria ter tenant_id = TENANT_B');
    });

    await test('GET /contratos (simulado): tenant A só vê o contrato A', async () => {
        const rows = await runWithTenant({ tenantId: TENANT_A, isSuperadmin: false }, async () => {
            return await dbAllTenant(`SELECT id FROM contratos c ORDER BY c.created_at DESC`);
        });
        const ids = rows.map(r => r.id);
        assert(ids.includes(CONTRATO_A), 'tenant A deveria ver o próprio contrato');
        assert(!ids.includes(CONTRATO_B), 'tenant A NÃO deveria ver o contrato de B (vazamento cross-tenant)');
    });

    await test('GET /contratos (simulado): tenant B só vê o contrato B', async () => {
        const rows = await runWithTenant({ tenantId: TENANT_B, isSuperadmin: false }, async () => {
            return await dbAllTenant(`SELECT id FROM contratos c ORDER BY c.created_at DESC`);
        });
        const ids = rows.map(r => r.id);
        assert(ids.includes(CONTRATO_B), 'tenant B deveria ver o próprio contrato');
        assert(!ids.includes(CONTRATO_A), 'tenant B NÃO deveria ver o contrato de A (vazamento cross-tenant)');
    });

    await test('GET /contratos/:id (simulado): tenant A NÃO acessa contrato de B por ID direto (IDOR)', async () => {
        const row = await runWithTenant({ tenantId: TENANT_A, isSuperadmin: false }, async () => {
            return await dbGetTenant(`SELECT c.* FROM contratos c WHERE c.id = ?`, [CONTRATO_B]);
        });
        assertEq(row, null, 'tenant A conseguiu ler o contrato de B pelo ID — IDOR ainda aberto');
    });

    await test('PATCH/DELETE (simulado): dbGetTenant não encontra contrato de outro tenant (gate de existência)', async () => {
        const asB = await runWithTenant({ tenantId: TENANT_B, isSuperadmin: false }, async () => {
            return await dbGetTenant(`SELECT * FROM contratos WHERE id = ?`, [CONTRATO_A]);
        });
        assertEq(asB, null, 'tenant B não deveria enxergar (e portanto não deveria editar/cancelar) o contrato de A');
    });

    await test('POST /contratos (simulado): não deixa vincular contrato a cliente de outro tenant', async () => {
        const clienteVistoPorA = await runWithTenant({ tenantId: TENANT_A, isSuperadmin: false }, async () => {
            return await dbGetTenant(`SELECT id, nome FROM clientes WHERE id = ?`, [CLIENTE_B]);
        });
        assertEq(clienteVistoPorA, null, 'tenant A não deveria conseguir referenciar o cliente de B ao criar um contrato');
    });

    // Cleanup
    await test('Cleanup: deleta dados de teste', async () => {
        await dbRun(`DELETE FROM contratos WHERE id IN (?, ?)`, [CONTRATO_A, CONTRATO_B]);
        await dbRun(`DELETE FROM clientes WHERE id IN (?, ?)`, [CLIENTE_A, CLIENTE_B]);
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
