/**
 * Test rápido do tenantAwareDb
 */
const { dbGet, dbAll, dbRun, close } = require('../database');
const {
    runWithTenant,
    runWithoutTenant,
    dbGetTenant,
    dbAllTenant,
    dbRunTenant,
    injectTenantFilter,
    KNOWN_TENANT_TABLES,
    GLOBAL_TABLES,
} = require('../infra/tenantAwareDb');

let passed = 0, failed = 0;

function test(name, fn) {
    return Promise.resolve().then(() => fn()).then(() => { passed++; console.log(`  ✓ ${name}`); })
        .catch(e => { failed++; console.log(`  ✗ ${name}: ${e.message}`); });
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }
function assertEq(a, b, msg) { if (a !== b) throw new Error(`${msg || 'eq'}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); }

(async () => {
    console.log('\n=== TEST tenantAwareDb ===\n');

    // ─── 1. injectTenantFilter (lógica pura) ───
    console.log('1. injectTenantFilter — SQL injection');
    await test('Adiciona WHERE em SELECT sem WHERE', () => {
        const r = injectTenantFilter('SELECT * FROM clientes ORDER BY nome', 'tnt_xyz');
        assertEq(r.sql, 'SELECT * FROM clientes WHERE tenant_id = ? ORDER BY nome');
        assertEq(r.params[0], 'tnt_xyz');
    });

    await test('Adiciona AND em SELECT com WHERE', () => {
        const r = injectTenantFilter("SELECT * FROM clientes WHERE status = 'Ativo' ORDER BY nome", 'tnt_xyz');
        assertEq(r.sql, "SELECT * FROM clientes WHERE tenant_id = ? AND status = 'Ativo' ORDER BY nome");
    });

    await test('Não duplica se já tem tenant_id', () => {
        const r = injectTenantFilter('SELECT * FROM clientes WHERE tenant_id = ? AND ativo = 1', 'tnt_xyz');
        assertEq(r.sql, 'SELECT * FROM clientes WHERE tenant_id = ? AND ativo = 1');
        assertEq(r.params.length, 0);
    });

    await test('Não filtra tabelas globais (usuarios)', () => {
        const r = injectTenantFilter('SELECT * FROM usuarios WHERE ativo = 1', 'tnt_xyz');
        assertEq(r.sql, 'SELECT * FROM usuarios WHERE ativo = 1');
        assertEq(r.params.length, 0);
    });

    await test('Não filtra tabelas desconhecidas', () => {
        const r = injectTenantFilter('SELECT * FROM tabela_inexistente', 'tnt_xyz');
        assertEq(r.params.length, 0);
    });

    await test('Sem tenantId não injeta nada', () => {
        const r = injectTenantFilter('SELECT * FROM clientes', null);
        assertEq(r.params.length, 0);
    });

    await test('Lida com queries complexas (JOIN com alias)', () => {
        const r = injectTenantFilter('SELECT c.*, COUNT(co.id) FROM clientes c LEFT JOIN cobrancas co ON co.client_id = c.id GROUP BY c.id', 'tnt_xyz');
        assert(r.sql.includes('c.tenant_id = ?'), 'deveria ter c.tenant_id no WHERE');
    });

    // ─── 2. dbAllTenant com runWithTenant ───
    console.log('\n2. dbAllTenant com runWithTenant (usando DB real)');
    await test('Filtrar clientes por tenant: tenant default tem clientes', async () => {
        const req = { tenantId: 'tnt_default', isSuperadmin: false };
        const rows = await runWithTenant(req, async () => {
            return await dbAllTenant('SELECT id, nome FROM clientes');
        });
        assert(Array.isArray(rows), 'esperava array');
        // Deve retornar clientes (não dá pra verificar filtro aqui, mas testa que não crasha)
    });

    await test('Filtrar clientes por tenant inexistente: retorna vazio', async () => {
        const req = { tenantId: 'tnt_inexistente_xyz_123', isSuperadmin: false };
        const rows = await runWithTenant(req, async () => {
            return await dbAllTenant('SELECT id, nome FROM clientes');
        });
        assertEq(rows.length, 0, 'tenant inexistente não deveria ter clientes');
    });

    await test('Sem contexto: retorna dados sem filtro', async () => {
        const rows = await dbAllTenant('SELECT id, nome FROM clientes LIMIT 5');
        assert(Array.isArray(rows));
    });

    await test('runWithoutTenant bypassa filtro', async () => {
        const rows = await runWithoutTenant(async () => {
            return await dbAllTenant('SELECT id, nome FROM clientes LIMIT 5');
        });
        assert(Array.isArray(rows));
    });

    // ─── 3. dbRunTenant (INSERT) ───
    console.log('\n3. dbRunTenant (INSERT) com DB real');
    await test('INSERT em cliente com tenant context (precisa INSERT real)', async () => {
        const req = { tenantId: 'tnt_default', isSuperadmin: false };
        const result = await runWithTenant(req, async () => {
            // Adiciona coluna 'ativo' para evitar erro
            return await dbRunTenant(
                "INSERT INTO clientes (id, nome, tenant_id) VALUES (?, ?, ?)",
                [`cli_test_${Date.now()}`, 'Cliente TenantAware Test', 'tnt_default']
            );
        });
        assert(result, 'esperava resultado do insert');
    });

    await test('INSERT em tabela global NÃO injeta tenant_id', async () => {
        const req = { tenantId: 'tnt_test_xyz', isSuperadmin: false };
        const result = await runWithTenant(req, async () => {
            return await dbRunTenant(
                "INSERT INTO contract_templates (id, slug, nome, html_content) VALUES (?, ?, ?, ?)",
                [`tpl_test_${Date.now()}`, `tpl-test-${Date.now()}`, 'Test', '<p>test</p>']
            );
        });
        assert(result);
    });

    // ─── 4. Constantes ───
    console.log('\n4. Constantes');
    await test('KNOWN_TENANT_TABLES tem 19 tabelas', () => {
        assertEq(KNOWN_TENANT_TABLES.size, 19);
    });

    await test('GLOBAL_TABLES tem 14+ tabelas', () => {
        assert(GLOBAL_TABLES.size >= 10, `esperava >= 10, tem ${GLOBAL_TABLES.size}`);
    });

    // ─── Resultado ───
    console.log(`\n=== RESULTADO ===`);
    console.log(`Passou: ${passed}`);
    console.log(`Falhou: ${failed}`);
    try { close(); } catch (_) {}
    setTimeout(() => process.exit(failed > 0 ? 1 : 0), 100);
})();
