/**
 * Test — Isolamento de tenant, rodada 2
 *
 * Cobre os achados da segunda revisão do modelo híbrido:
 *   - routes/approvals.js (pending_approvals) nunca filtrava por tenant
 *   - routes/contract-templates.js (contratos_gerados) nem tinha coluna
 *     tenant_id — documentos assinados via Autentique vazavam entre empresas
 *   - ContratoManager.buscar() (usado por ContractAutomation.sendForSignature)
 *     não filtrava por tenant — IDOR ao enviar contrato de outro tenant p/ assinatura
 */
const { dbGet, dbAll, dbRun, close } = require('../database');
const { runWithTenant, dbGetTenant, dbAllTenant, dbRunTenant } = require('../infra/tenantAwareDb');
const ContratoManager = require('../ContratoManager');

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
    console.log('\n=== TESTE — ISOLAMENTO DE TENANT (RODADA 2) ===\n');

    const TENANT_A = 'tnt_r2_a_' + Date.now();
    const TENANT_B = 'tnt_r2_b_' + Date.now();
    const CLIENTE_A = 'cli_r2_a_' + Date.now();
    const CLIENTE_B = 'cli_r2_b_' + Date.now();
    let APPR_A = null, APPR_B = null;
    let CGEN_A = null, CGEN_B = null;
    let CONTRATO_A = null, CONTRATO_B = null;

    await test('Setup: cria 2 tenants + 1 cliente em cada', async () => {
        await dbRun(`INSERT INTO tenants (id, slug, nome, plano, status) VALUES (?, ?, ?, 'pro', 'ativo')`, [TENANT_A, `r2-a-${Date.now()}`, 'Tenant A R2']);
        await dbRun(`INSERT INTO tenants (id, slug, nome, plano, status) VALUES (?, ?, ?, 'pro', 'ativo')`, [TENANT_B, `r2-b-${Date.now()}`, 'Tenant B R2']);
        await dbRun(`INSERT INTO clientes (id, nome, email, tenant_id) VALUES (?, ?, ?, ?)`, [CLIENTE_A, 'Cliente A R2', 'clia-r2@teste.com', TENANT_A]);
        await dbRun(`INSERT INTO clientes (id, nome, email, tenant_id) VALUES (?, ?, ?, ?)`, [CLIENTE_B, 'Cliente B R2', 'clib-r2@teste.com', TENANT_B]);
    });

    // ── pending_approvals ──
    await test('pending_approvals: cria 1 em cada tenant via dbRunTenant', async () => {
        APPR_A = 'appr_r2_a_' + Date.now();
        APPR_B = 'appr_r2_b_' + Date.now();
        await runWithTenant({ tenantId: TENANT_A, isSuperadmin: false }, async () => {
            await dbRunTenant(
                `INSERT INTO pending_approvals (id, ticket_id, client_id, requested_by, request_value, original_value, requires_approval_reason, tier, status)
                 VALUES (?,?,?,?,?,?,?,?,'PENDING')`,
                [APPR_A, 'tkt-a', CLIENTE_A, 'usr-a', 2000, 2000, 'teste', 'superadmin']
            );
        });
        await runWithTenant({ tenantId: TENANT_B, isSuperadmin: false }, async () => {
            await dbRunTenant(
                `INSERT INTO pending_approvals (id, ticket_id, client_id, requested_by, request_value, original_value, requires_approval_reason, tier, status)
                 VALUES (?,?,?,?,?,?,?,?,'PENDING')`,
                [APPR_B, 'tkt-b', CLIENTE_B, 'usr-b', 3000, 3000, 'teste', 'superadmin']
            );
        });
        const rowA = await dbGet(`SELECT tenant_id FROM pending_approvals WHERE id = ?`, [APPR_A]);
        assertEq(rowA.tenant_id, TENANT_A, 'pendência A deveria ter tenant_id = TENANT_A');
    });

    await test('pending_approvals: tenant A não lista/vê/decide pendência de B (IDOR)', async () => {
        const listA = await runWithTenant({ tenantId: TENANT_A, isSuperadmin: false }, async () => {
            return await dbAllTenant(`SELECT id FROM pending_approvals WHERE status IN ('PENDING','ESCALATED')`);
        });
        assert(!listA.map(r => r.id).includes(APPR_B), 'tenant A não deveria listar pendência de B');

        const getAsA = await runWithTenant({ tenantId: TENANT_A, isSuperadmin: false }, async () => {
            return await dbGetTenant(`SELECT * FROM pending_approvals WHERE id = ?`, [APPR_B]);
        });
        assertEq(getAsA, null, 'tenant A não deveria conseguir ver/aprovar/rejeitar a pendência de B pelo ID');
    });

    // ── contratos_gerados (Autentique) ──
    await test('contratos_gerados: cria 1 documento gerado em cada tenant', async () => {
        CGEN_A = 'cgen_r2_a_' + Date.now();
        CGEN_B = 'cgen_r2_b_' + Date.now();
        await runWithTenant({ tenantId: TENANT_A, isSuperadmin: false }, async () => {
            await dbRunTenant(
                `INSERT INTO contratos_gerados (id, template_id, contrato_id, cliente_id, nome_documento, status, html_renderizado, signers_json, created_by)
                 VALUES (?, NULL, NULL, ?, ?, 'pendente', ?, ?, ?)`,
                [CGEN_A, CLIENTE_A, 'Doc A', '<html>A</html>', '[]', 'usr-a']
            );
        });
        await runWithTenant({ tenantId: TENANT_B, isSuperadmin: false }, async () => {
            await dbRunTenant(
                `INSERT INTO contratos_gerados (id, template_id, contrato_id, cliente_id, nome_documento, status, html_renderizado, signers_json, created_by)
                 VALUES (?, NULL, NULL, ?, ?, 'pendente', ?, ?, ?)`,
                [CGEN_B, CLIENTE_B, 'Doc B', '<html>B</html>', '[]', 'usr-b']
            );
        });
        const rowB = await dbGet(`SELECT tenant_id FROM contratos_gerados WHERE id = ?`, [CGEN_B]);
        assertEq(rowB.tenant_id, TENANT_B, 'documento B deveria ter tenant_id = TENANT_B (coluna nova, migração ok)');
    });

    await test('contratos_gerados: tenant B não lista nem acessa documento de A (PII + HTML do contrato)', async () => {
        const listB = await runWithTenant({ tenantId: TENANT_B, isSuperadmin: false }, async () => {
            return await dbAllTenant(`SELECT cg.id FROM contratos_gerados cg`);
        });
        assert(!listB.map(r => r.id).includes(CGEN_A), 'tenant B não deveria listar documento de A');

        const getAsB = await runWithTenant({ tenantId: TENANT_B, isSuperadmin: false }, async () => {
            return await dbGetTenant(`SELECT * FROM contratos_gerados WHERE id = ?`, [CGEN_A]);
        });
        assertEq(getAsB, null, 'tenant B não deveria conseguir abrir/reenviar/consultar status do documento de A');
    });

    // ── ContratoManager.buscar() (usado por sendForSignature) ──
    await test('ContratoManager.buscar(): não vaza contrato de outro tenant (usado em send-for-signature)', async () => {
        CONTRATO_A = 'CT-R2-A-' + Date.now();
        CONTRATO_B = 'CT-R2-B-' + Date.now();
        await dbRun(
            `INSERT INTO contratos (id, cliente_id, titulo, valor_mensal, tipo_contrato, status, data_inicio, data_fim, tenant_id)
             VALUES (?, ?, 'Contrato A R2', 1000, 'pmoc', 'Ativo', '2026-01-01', '2026-12-31', ?)`,
            [CONTRATO_A, CLIENTE_A, TENANT_A]
        );
        await dbRun(
            `INSERT INTO contratos (id, cliente_id, titulo, valor_mensal, tipo_contrato, status, data_inicio, data_fim, tenant_id)
             VALUES (?, ?, 'Contrato B R2', 1000, 'pmoc', 'Ativo', '2026-01-01', '2026-12-31', ?)`,
            [CONTRATO_B, CLIENTE_B, TENANT_B]
        );

        const foundByOwnTenant = await runWithTenant({ tenantId: TENANT_A, isSuperadmin: false }, async () => {
            return await ContratoManager.buscar(CONTRATO_A);
        });
        assert(foundByOwnTenant, 'tenant A deveria conseguir buscar o próprio contrato');

        const leaked = await runWithTenant({ tenantId: TENANT_A, isSuperadmin: false }, async () => {
            return await ContratoManager.buscar(CONTRATO_B);
        });
        assertEq(leaked, null, 'tenant A NÃO deveria conseguir buscar (e enviar p/ assinatura) o contrato de B');
    });

    // Cleanup
    await test('Cleanup: deleta dados de teste', async () => {
        await dbRun(`DELETE FROM pending_approvals WHERE id IN (?, ?)`, [APPR_A, APPR_B]);
        await dbRun(`DELETE FROM contratos_gerados WHERE id IN (?, ?)`, [CGEN_A, CGEN_B]);
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
