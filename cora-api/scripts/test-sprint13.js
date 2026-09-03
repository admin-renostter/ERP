/**
 * Test Sprint 13 — Multi-tenant (SaaS)
 *
 * Valida:
 *   1. TenantService: CRUD, user-tenant, convites
 *   2. tenantContext middleware: resolução de tenant
 *   3. QueryFilter: buildWhere / stampTenant
 *   4. Isolamento: user A no tenant X não vê dados do tenant Y
 *   5. Superadmin bypass
 *   6. Default tenant (legado single-tenant)
 *
 * Roda com: node scripts/test-sprint13.js
 */
const { dbGet, dbRun, dbAll, close } = require('../database');
const TenantService = require('../services/TenantService');
const QF = require('../services/QueryFilter');

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
function assertEq(a, b, msg) { if (a !== b) throw new Error(`${msg || 'eq failed'}: got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`); }

(async () => {
    console.log('\n=== SPRINT 13 — TEST MULTI-TENANT ===\n');

    // Variáveis compartilhadas entre testes
    let tenantA, tenantB, userA, userB;
    const RUN_ID = Date.now();
    const USER_A_EMAIL = `usera-${RUN_ID}@test.com`;
    const USER_B_EMAIL = `userb-${RUN_ID}@test.com`;

    // ────────────────────────────────────────────────────────────
    console.log('1. TenantService — CRUD básico');
    // ────────────────────────────────────────────────────────────
    await test('criar tenant A', async () => {
        tenantA = await TenantService.createTenant({
            slug: `test-a-${RUN_ID}`,
            nome: 'Tenant A Teste',
            documento: '11.111.111/0001-11',
            email: 'a@test.com',
            plano: 'pro',
        });
        assert(tenantA.id, 'tenantA sem id');
        assertEq(tenantA.slug, `test-a-${RUN_ID}`);
    });

    await test('criar tenant B', async () => {
        tenantB = await TenantService.createTenant({
            slug: `test-b-${RUN_ID}`,
            nome: 'Tenant B Teste',
            documento: '22.222.222/0001-22',
            email: 'b@test.com',
            plano: 'starter',
        });
        assert(tenantB.id, 'tenantB sem id');
    });

    await test('rejeitar slug duplicado', async () => {
        let threw = false;
        try {
            await TenantService.createTenant({ slug: tenantA.slug, nome: 'dup' });
        } catch (e) { threw = true; }
        assert(threw, 'deveria ter lançado erro para slug duplicado');
    });

    await test('rejeitar slug inválido', async () => {
        let threw = false;
        try {
            await TenantService.createTenant({ slug: 'AB C!@#', nome: 'invalid' });
        } catch (e) { threw = true; }
        assert(threw, 'deveria ter lançado erro para slug inválido');
    });

    await test('buscar por ID', async () => {
        const t = await TenantService.getTenant(tenantA.id);
        assertEq(t.id, tenantA.id);
        assertEq(t.nome, 'Tenant A Teste');
    });

    await test('buscar por slug', async () => {
        const t = await TenantService.getTenantBySlug(tenantA.slug);
        assertEq(t.id, tenantA.id);
    });

    await test('atualizar tenant', async () => {
        const updated = await TenantService.updateTenant(tenantA.id, { telefone: '11999998888' });
        assertEq(updated.telefone, '11999998888');
    });

    // ────────────────────────────────────────────────────────────
    console.log('\n2. TenantService — User-Tenant');
    // ────────────────────────────────────────────────────────────
    await test('criar usuário de teste A', async () => {
        const r = await dbRun(
            `INSERT INTO usuarios (id, username, email, nome, password, role, ativo)
             VALUES (?, ?, ?, ?, ?, ?, 1)`,
            [`test-user-a-${RUN_ID}`, `user_a_${RUN_ID}`, USER_A_EMAIL, 'User A', 'test', 'user']
        );
        const u = await dbGet(`SELECT id FROM usuarios WHERE email = ?`, [USER_A_EMAIL]);
        userA = u.id;
        assert(userA, 'userA não criado');
    });

    await test('criar usuário de teste B', async () => {
        await dbRun(
            `INSERT INTO usuarios (id, username, email, nome, password, role, ativo)
             VALUES (?, ?, ?, ?, ?, ?, 1)`,
            [`test-user-b-${RUN_ID}`, `user_b_${RUN_ID}`, USER_B_EMAIL, 'User B', 'test', 'user']
        );
        const u = await dbGet(`SELECT id FROM usuarios WHERE email = ?`, [USER_B_EMAIL]);
        userB = u.id;
        assert(userB, 'userB não criado');
    });

    await test('adicionar userA ao tenantA como owner', async () => {
        const r = await TenantService.addUserToTenant({
            tenantId: tenantA.id,
            userId: userA,
            role: 'owner',
            convidadoPor: userA,
        });
        assert(r.hasAccess, 'userA não tem acesso');
        assertEq(r.role, 'owner');
    });

    await test('adicionar userB ao tenantB como owner', async () => {
        const r = await TenantService.addUserToTenant({
            tenantId: tenantB.id,
            userId: userB,
            role: 'owner',
            convidadoPor: userB,
        });
        assert(r.hasAccess);
    });

    await test('userA NÃO tem acesso ao tenantB', async () => {
        const r = await TenantService.userHasAccessTo(userA, tenantB.id);
        assertEq(r, null, 'userA não deveria ter acesso a tenantB');
    });

    await test('userB NÃO tem acesso ao tenantA', async () => {
        const r = await TenantService.userHasAccessTo(userB, tenantA.id);
        assertEq(r, null);
    });

    await test('userA vê apenas tenantA em getUserTenants', async () => {
        const list = await TenantService.getUserTenants(userA);
        assertEq(list.length, 1);
        assertEq(list[0].id, tenantA.id);
    });

    await test('getTenantUsers retorna members do tenantA', async () => {
        const list = await TenantService.getTenantUsers(tenantA.id);
        const ids = list.map(u => u.usuario_id);
        assert(ids.includes(userA), 'userA deveria estar em tenantA');
        assert(!ids.includes(userB), 'userB NÃO deveria estar em tenantA');
    });

    await test('atualizar role de userA para admin (precisa 2º owner)', async () => {
        // Adiciona userB também ao tenantA como owner
        await TenantService.addUserToTenant({
            tenantId: tenantA.id, userId: userB, role: 'owner', convidadoPor: userA,
        });
        // Agora pode rebaixar userA
        const r = await TenantService.updateUserRole(tenantA.id, userA, 'admin');
        assertEq(r.role, 'admin');
    });

    await test('rejeitar rebaixar último owner', async () => {
        // Re-promove userA a owner e remove userB do tenantA
        await TenantService.updateUserRole(tenantA.id, userA, 'owner');
        await TenantService.removeUserFromTenant(tenantA.id, userB);
        // Agora userA é o único owner. Tentar rebaixar deve falhar.
        let threw = false;
        try {
            await TenantService.updateUserRole(tenantA.id, userA, 'user');
        } catch (e) { threw = true; }
        assert(threw, 'deveria bloquear rebaixamento do último owner');
    });

    // ────────────────────────────────────────────────────────────
    console.log('\n3. TenantService — Convites');
    // ────────────────────────────────────────────────────────────
    await test('criar convite', async () => {
        const invite = await TenantService.inviteUserToTenant({
            tenantId: tenantA.id,
            email: 'novo@test.com',
            role: 'user',
            convidadoPor: userA,
            ttlHours: 24,
        });
        assert(invite.token, 'token não gerado');
        assert(invite.expira_em, 'expira_em não definido');
    });

    await test('rejeitar re-convite para email já vinculado', async () => {
        let threw = false;
        try {
            await TenantService.inviteUserToTenant({
                tenantId: tenantA.id,
                email: USER_A_EMAIL,
                role: 'user',
                convidadoPor: userA,
            });
        } catch (e) { threw = true; }
        assert(threw, 'deveria bloquear invite para user já vinculado');
    });

    // ────────────────────────────────────────────────────────────
    console.log('\n4. QueryFilter — Helpers');
    // ────────────────────────────────────────────────────────────
    await test('buildWhere com tenant', () => {
        const r = QF.buildWhere({ tenantId: 'tnt_xyz' });
        assertEq(r.sql, ' AND tenant_id = ?');
        assertEq(r.params[0], 'tnt_xyz');
    });

    await test('buildWhere com bypass true', () => {
        const r = QF.buildWhere({ tenantId: 'tnt_xyz' }, { bypass: true });
        assertEq(r.sql, '');
        assertEq(r.params.length, 0);
    });

    await test('buildWhere com default (legado)', () => {
        const r = QF.buildWhere({}, { bypass: 'default' });
        assertEq(r.params[0], 'tnt_default');
    });

    await test('buildWhere com alias', () => {
        const r = QF.buildWhere({ tenantId: 'tnt_xyz' }, { alias: 'c' });
        assertEq(r.sql, ' AND c.tenant_id = ?');
    });

    await test('stampTenant injeta tenant_id', () => {
        const r = QF.stampTenant({ tenantId: 'tnt_abc' }, { nome: 'João' });
        assertEq(r.tenant_id, 'tnt_abc');
        assertEq(r.nome, 'João');
    });

    await test('stampTenant falha sem tenantId', () => {
        let threw = false;
        try {
            QF.stampTenant({}, { nome: 'X' });
        } catch (e) { threw = true; }
        assert(threw, 'deveria falhar sem tenantId');
    });

    // ────────────────────────────────────────────────────────────
    console.log('\n5. Isolamento Multi-tenant — dados reais');
    // ────────────────────────────────────────────────────────────
    let clienteA, clienteB;

    await test('criar cliente no tenantA', async () => {
        const id = `cli-mt-a-${Date.now()}`;
        await dbRun(
            `INSERT INTO clientes (id, nome, email, tenant_id) VALUES (?, ?, ?, ?)`,
            [id, 'Cliente A', 'a@mt.com', tenantA.id]
        );
        clienteA = id;
    });

    await test('criar cliente no tenantB', async () => {
        const id = `cli-mt-b-${Date.now()}`;
        await dbRun(
            `INSERT INTO clientes (id, nome, email, tenant_id) VALUES (?, ?, ?, ?)`,
            [id, 'Cliente B', 'b@mt.com', tenantB.id]
        );
        clienteB = id;
    });

    await test('userA vê apenas cliente do tenantA (com QueryFilter)', async () => {
        const req = { tenantId: tenantA.id };
        const where = QF.buildWhere(req);
        const clientes = await dbAll(
            `SELECT id, nome, tenant_id FROM clientes WHERE 1=1 ${where.sql}`,
            where.params
        );
        // Deve ver o clienteA E o clienteB? NÃO! Deve ver APENAS clienteA.
        const ids = clientes.map(c => c.id);
        assert(ids.includes(clienteA), 'deveria ver clienteA');
        assert(!ids.includes(clienteB), 'NÃO deveria ver clienteB');
    });

    await test('userB vê apenas cliente do tenantB (com QueryFilter)', async () => {
        const req = { tenantId: tenantB.id };
        const where = QF.buildWhere(req);
        const clientes = await dbAll(
            `SELECT id, nome, tenant_id FROM clientes WHERE 1=1 ${where.sql}`,
            where.params
        );
        const ids = clientes.map(c => c.id);
        assert(!ids.includes(clienteA), 'userB NÃO deveria ver clienteA');
        assert(ids.includes(clienteB), 'deveria ver clienteB');
    });

    await test('superadmin com bypass: true vê TODOS os clientes', async () => {
        const req = { isSuperadmin: true, tenantId: null };
        const where = QF.buildWhere(req, { bypass: true });
        const clientes = await dbAll(
            `SELECT id FROM clientes WHERE 1=1 ${where.sql} AND id IN (?, ?)`,
            [...where.params, clienteA, clienteB]
        );
        assertEq(clientes.length, 2);
    });

    // ────────────────────────────────────────────────────────────
    console.log('\n6. Default Tenant — Legado');
    // ────────────────────────────────────────────────────────────
    await test('tenant "tnt_default" existe', async () => {
        const t = await TenantService.getTenant('tnt_default');
        assert(t, 'tnt_default não existe');
        assertEq(t.slug, 'default');
    });

    await test('dados legados estão com tenant_id = tnt_default', async () => {
        const r = await dbGet(
            `SELECT COUNT(*) AS n FROM clientes WHERE tenant_id = 'tnt_default'`
        );
        // Já deve ter pelo menos 1 (do seed)
        assert(r.n > 0, 'esperava dados legados com tenant default');
    });

    // ────────────────────────────────────────────────────────────
    console.log('\n7. TenantStats');
    // ────────────────────────────────────────────────────────────
    await test('getTenantStats retorna contadores', async () => {
        const s = await TenantService.getTenantStats(tenantA.id);
        assert(s, 'stats nulo');
        assert(s.tenant.id);
        assert(s.usuarios.total >= 1);
        assert(s.usuarios.limite > 0);
    });

    // ────────────────────────────────────────────────────────────
    console.log('\n8. Cleanup');
    // ────────────────────────────────────────────────────────────
    await test('deletar clientes de teste', async () => {
        await dbRun(`DELETE FROM clientes WHERE id IN (?, ?)`, [clienteA, clienteB]);
    });

    await test('desvincular userA do tenantA (precisa 2º owner)', async () => {
        // Re-adiciona userB ao tenantA
        await TenantService.addUserToTenant({
            tenantId: tenantA.id, userId: userB, role: 'owner', convidadoPor: userA,
        });
        // Re-baixa userA para admin
        await TenantService.updateUserRole(tenantA.id, userA, 'admin');
        // Agora pode remover userA
        const r = await TenantService.removeUserFromTenant(tenantA.id, userA);
        assert(r.removed);
    });

    await test('verificar que userA foi desvinculado', async () => {
        const r = await TenantService.userHasAccessTo(userA, tenantA.id);
        assert(!r || !r.hasAccess, 'userA não foi desvinculado');
    });

    await test('cancelar tenantA', async () => {
        await TenantService.updateTenant(tenantA.id, { status: 'cancelado' });
        const t = await TenantService.getTenant(tenantA.id);
        assertEq(t.status, 'cancelado');
    });

    await test('cancelar tenantB', async () => {
        await TenantService.updateTenant(tenantB.id, { status: 'cancelado' });
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
    // Espera um tick para SQLite fechar antes de exit
    setTimeout(() => process.exit(exitCode), 100);
})().catch(err => {
    console.error('Erro fatal no test:', err);
    try { close(); } catch (_) {}
    setTimeout(() => process.exit(1), 100);
});
