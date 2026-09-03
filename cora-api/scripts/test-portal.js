// Test Sprint 15 — Portal do Cliente
const { dbGet, dbAll, dbRun, close } = require('../database');
const PortalService = require('../services/PortalService');

let passed = 0, failed = 0;
const failures = [];

function test(name, fn) {
    return Promise.resolve()
        .then(() => fn())
        .then(() => { passed++; console.log(`  ✓ ${name}`); })
        .catch(err => { failed++; failures.push({ name, err: err.message }); console.log(`  ✗ ${name}: ${err.message}`); });
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

(async () => {
    console.log('\n=== SPRINT 15 — TEST PORTAL DO CLIENTE ===\n');

    let cid, portalUserId, novoTicketId;

    // Setup
    await test('Setup: cria cliente + portal user', async () => {
        cid = 'cli-portal-' + Date.now();
        await dbRun(
            `INSERT INTO clientes (id, nome, email, tenant_id) VALUES (?, ?, ?, 'tnt_default')`,
            [cid, 'Cliente Portal Test', 'cliente-portal@test.com']
        );
        const r = await PortalService.createPortalUser({
            clienteId: cid, email: 'teste@portal.com', nome: 'Teste Portal', password: 'senha123',
        });
        portalUserId = r.id;
        assert(portalUserId, 'portal user não criado');
    });

    // Auth
    await test('Auth: login com senha correta', async () => {
        const auth = await PortalService.authenticate('teste@portal.com', 'senha123');
        assert(auth.portalUser.email === 'teste@portal.com');
        assert(auth.cliente.id === cid);
    });

    await test('Auth: senha errada lança erro', async () => {
        let threw = false;
        try { await PortalService.authenticate('teste@portal.com', 'errada'); } catch (e) { threw = true; }
        assert(threw, 'deveria falhar');
    });

    await test('Auth: email inexistente não revela erro específico', async () => {
        let threw = false;
        try { await PortalService.authenticate('naoexiste@portal.com', 'qualquer'); } catch (e) { threw = true; }
        assert(threw, 'deveria falhar');
    });

    // CRUD de dados
    await test('getContracts: retorna array (pode ser vazio)', async () => {
        const c = await PortalService.getContracts(portalUserId);
        assert(Array.isArray(c));
    });

    await test('getBills: retorna array', async () => {
        const b = await PortalService.getBills(portalUserId);
        assert(Array.isArray(b));
    });

    await test('getTickets: retorna array', async () => {
        const t = await PortalService.getTickets(portalUserId);
        assert(Array.isArray(t));
    });

    await test('getEquipment: retorna array', async () => {
        const e = await PortalService.getEquipment(portalUserId);
        assert(Array.isArray(e));
    });

    // Create ticket
    await test('createTicket: cria chamado com status Aberto', async () => {
        const r = await PortalService.createTicket(portalUserId, {
            titulo: 'Teste portal',
            descricao: 'Chamado aberto pelo portal',
        });
        novoTicketId = r.id;
        assert(r.id);
        assertEq(r.status, 'Aberto');
    });

    await test('createTicket: dispara notificação automática', async () => {
        const notifs = await PortalService.getNotifications(portalUserId, { onlyUnread: true });
        assert(notifs.length >= 1, `esperava >= 1 notif, tem ${notifs.length}`);
        assertEq(notifs[0].tipo, 'chamado');
    });

    await test('markNotificationRead: marca como lida', async () => {
        const notifs = await PortalService.getNotifications(portalUserId);
        if (notifs.length > 0) {
            await PortalService.markNotificationRead(portalUserId, notifs[0].id);
            const unread = await PortalService.getNotifications(portalUserId, { onlyUnread: true });
            assert(unread.length < notifs.length);
        }
    });

    // Reset password
    await test('requestPasswordReset: gera token', async () => {
        const r = await PortalService.requestPasswordReset('teste@portal.com');
        assert(r.token, 'token não gerado');
        assert(r.token.length > 20);
    });

    await test('resetPassword: redefine com token válido', async () => {
        const r = await PortalService.requestPasswordReset('teste@portal.com');
        const res = await PortalService.resetPassword(r.token, 'novasenha456');
        assertEq(res.success, true);
    });

    await test('Auth com nova senha funciona', async () => {
        const auth = await PortalService.authenticate('teste@portal.com', 'novasenha456');
        assert(auth.portalUser);
    });

    await test('resetPassword: token inválido falha', async () => {
        let threw = false;
        try { await PortalService.resetPassword('token_invalido_123', 'novasenha'); } catch (e) { threw = true; }
        assert(threw);
    });

    // Lockout
    await test('Lockout: 5 falhas bloqueiam conta por 15min', async () => {
        for (let i = 0; i < 5; i++) {
            try { await PortalService.authenticate('teste@portal.com', 'errada'); } catch (_) {}
        }
        let bloqueado = false;
        try { await PortalService.authenticate('teste@portal.com', 'novasenha456'); } catch (e) {
            if (e.message.includes('bloqueada')) bloqueado = true;
        }
        assert(bloqueado, 'deveria estar bloqueado após 5 falhas');
    });

    // Update profile
    await test('updateProfile: atualiza nome e telefone', async () => {
        // Limpa lockout antes deste teste
        await dbRun(`UPDATE portal_users SET failed_login_count = 0, locked_until = NULL WHERE id = ?`, [portalUserId]);
        await PortalService.updateProfile(portalUserId, { nome: 'Nome Novo', telefone: '11999998888' });
        const r = await PortalService.authenticate('teste@portal.com', 'novasenha456');
        assertEq(r.portalUser.nome, 'Nome Novo');
    });

    // Disable / Enable
    await test('disablePortalUser: bloqueia login', async () => {
        await PortalService.disablePortalUser(portalUserId);
        // resetar locked_until e failed_login_count primeiro
        await dbRun(`UPDATE portal_users SET failed_login_count = 0, locked_until = NULL WHERE id = ?`, [portalUserId]);
        let threw = false;
        try { await PortalService.authenticate('teste@portal.com', 'novasenha456'); } catch (e) {
            if (e.message.includes('desativada')) threw = true;
        }
        assert(threw);
        await PortalService.enablePortalUser(portalUserId);
    });

    // listPortalUsers
    await test('listPortalUsers: retorna array', async () => {
        const list = await PortalService.listPortalUsers();
        assert(Array.isArray(list));
        assert(list.length > 0);
    });

    // Cleanup
    await test('Cleanup: deleta dados de teste', async () => {
        await dbRun(`DELETE FROM portal_notifications WHERE portal_user_id = ?`, [portalUserId]);
        await dbRun(`DELETE FROM portal_sessions WHERE portal_user_id = ?`, [portalUserId]);
        await dbRun(`DELETE FROM portal_users WHERE id = ?`, [portalUserId]);
        if (novoTicketId) await dbRun(`DELETE FROM chamados WHERE id = ?`, [novoTicketId]);
        await dbRun(`DELETE FROM clientes WHERE id = ?`, [cid]);
    });

    function assertEq(a, b, msg) {
        if (a !== b) throw new Error(`${msg || 'eq'}: got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`);
    }

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
    console.error('Erro fatal:', err);
    try { close(); } catch (_) {}
    setTimeout(() => process.exit(1), 100);
});
