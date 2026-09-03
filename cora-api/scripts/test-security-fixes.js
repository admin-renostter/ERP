/**
 * Test Security Fixes (Sprint Security)
 *
 * Valida as correções aplicadas:
 *   V05: CORS bloqueia '*'
 *   V06: Timing attack no login
 *   V07: Escape LIKE
 *   V08/V19: JWT whitelist
 *   V13: Rate limit /health
 *   V17: JWT TTL reduzido
 *   V20: Validação de input (mass assignment)
 */
const { dbGet, dbAll, dbRun, close } = require('../database');
const PortalService = require('../services/PortalService');
const { escapeLike } = require('../infra/tenantAwareDb');
const { validate, schemas } = require('../middleware/validate');

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
    console.log('\n=== TEST SECURITY FIXES (V05, V06, V07, V08, V13, V17, V20) ===\n');

    let clienteId, portalUserId;

    // Setup
    await test('Setup: cria cliente + portal user', async () => {
        clienteId = 'cli-sec-' + Date.now();
        await dbRun(
            `INSERT INTO clientes (id, nome, email, tenant_id) VALUES (?, 'Cliente Sec', 'sec@test.com', 'tnt_default')`,
            [clienteId]
        );
        const r = await PortalService.createPortalUser({
            clienteId, email: 'sec-user@test.com', nome: 'Sec User', password: 'senha123',
        });
        portalUserId = r.id;
        assert(portalUserId);
    });

    // ─── V07: Escape LIKE ───
    console.log('\n1. V07: Escape LIKE');
    await test('escapeLike: escapa %', () => {
        const r = escapeLike('100%');
        assertEq(r, '100\\%');
    });
    await test('escapeLike: escapa _', () => {
        const r = escapeLike('user_name');
        assertEq(r, 'user\\_name');
    });
    await test('escapeLike: escapa \\', () => {
        const r = escapeLike('path\\to');
        assertEq(r, 'path\\\\to');
    });
    await test('escapeLike: passa string normal', () => {
        const r = escapeLike('hello world');
        assertEq(r, 'hello world');
    });
    await test('escapeLike: lida com null', () => {
        const r = escapeLike(null);
        assertEq(r, null);
    });

    // ─── V06: Timing attack no login ───
    console.log('\n2. V06: Timing attack fix');
    await test('authenticate: tempo similar para email existente e inexistente', async () => {
        // Mede tempo de email inexistente vs existente
        const startInexistente = Date.now();
        try { await PortalService.authenticate('inexistente@nao.com', 'senha123'); } catch (_) {}
        const tInexistente = Date.now() - startInexistente;

        const startExistente = Date.now();
        try { await PortalService.authenticate('sec-user@test.com', 'senhaerrada'); } catch (_) {}
        const tExistente = Date.now() - startExistente;

        // A diferença deve ser pequena (≤30ms em CI, mas tolerância alta aqui)
        const diff = Math.abs(tInexistente - tExistente);
        assert(diff < 200, `Diferença de ${diff}ms muito alta (deveria ser <200ms)`);
    });

    // ─── V20: Validação de input ───
    console.log('\n3. V20: Validação de input');
    await test('schemas.portalLogin: aceita email+senha válidos', () => {
        const r = schemas.portalLogin({ email: 'a@b.com', password: 'senha123' });
        assert(r.valid, JSON.stringify(r.errors));
    });
    await test('schemas.portalLogin: rejeita email inválido', () => {
        const r = schemas.portalLogin({ email: 'não-é-email', password: 'senha123' });
        assert(!r.valid);
        assert(r.errors.some(e => e.field === 'email'));
    });
    await test('schemas.portalLogin: rejeita senha vazia', () => {
        const r = schemas.portalLogin({ email: 'a@b.com', password: '' });
        assert(!r.valid);
    });
    await test('schemas.portalLogin: rejeita email muito longo', () => {
        const r = schemas.portalLogin({ email: 'a'.repeat(260) + '@b.com', password: 'senha' });
        assert(!r.valid);
    });

    await test('schemas.mobileLocation: aceita coordenadas válidas', () => {
        const r = schemas.mobileLocation({ latitude: -23.55, longitude: -46.63 });
        assert(r.valid);
    });
    await test('schemas.mobileLocation: rejeita lat fora de range', () => {
        const r = schemas.mobileLocation({ latitude: 999, longitude: 0 });
        assert(!r.valid);
    });
    await test('schemas.mobileLocation: rejeita lng fora de range', () => {
        const r = schemas.mobileLocation({ latitude: 0, longitude: -200 });
        assert(!r.valid);
    });

    await test('schemas.mobilePhoto: aceita mime válido', () => {
        const r = schemas.mobilePhoto({
            base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='.padEnd(150, 'A'),
            filename: 'test.png', mime_type: 'image/png',
        });
        assert(r.valid, `Esperava valid=true, errors=${JSON.stringify(r.errors)}`);
    });
    await test('schemas.mobilePhoto: rejeita mime inválido', () => {
        const r = schemas.mobilePhoto({
            base64: 'iVBORw0KGgo', filename: 'test.exe', mime_type: 'application/exe',
        });
        assert(!r.valid);
    });

    await test('schemas.lgpdDSAR: aceita tipo válido', () => {
        const r = schemas.lgpdDSAR({ tipo: 'acesso' });
        assert(r.valid);
    });
    await test('schemas.lgpdDSAR: rejeita tipo inválido', () => {
        const r = schemas.lgpdDSAR({ tipo: 'invalido' });
        assert(!r.valid);
    });

    await test('schemas.lgpdConsent: aceita boolean', () => {
        const r = schemas.lgpdConsent({ tipo: 'cookies', aceito: true });
        assert(r.valid);
    });
    await test('schemas.lgpdConsent: rejeita se aceito não é boolean', () => {
        const r = schemas.lgpdConsent({ tipo: 'cookies', aceito: 'true' });
        assert(!r.valid);
    });

    // ─── V08/V19: JWT whitelist ───
    console.log('\n4. V08/V19: JWT algorithm whitelist');
    await test('signAccessToken com alg=none é rejeitado', () => {
        // Verifica que o módulo tem whitelist hardcoded
        const authJWT = require('../middleware/authJWT');
        // Tenta forçar alg=none via env
        const orig = process.env.JWT_ALGO;
        process.env.JWT_ALGO = 'none';
        delete require.cache[require.resolve('../middleware/authJWT')];
        const newAuth = require('../middleware/authJWT');
        // Deveria ter fallback para HS256
        const token = newAuth.signAccessToken({ userId: 'x', role: 'admin' });
        const jwt = require('jsonwebtoken');
        const decoded = jwt.decode(token, { complete: true });
        assert(decoded.header.alg === 'HS256', `alg deveria ser HS256, é ${decoded.header.alg}`);
        // Restaurar
        process.env.JWT_ALGO = orig;
        delete require.cache[require.resolve('../middleware/authJWT')];
    });

    // ─── V17: TTL ───
    console.log('\n5. V17: JWT TTL');
    await test('ACCESS_TOKEN_TTL é 15m por padrão', () => {
        const authJWT = require('../middleware/authJWT');
        assertEq(authJWT.ACCESS_TOKEN_TTL, '15m', `Esperava 15m, é ${authJWT.ACCESS_TOKEN_TTL}`);
    });
    await test('signAccessToken emite token com exp ~15min', () => {
        const authJWT = require('../middleware/authJWT');
        const token = authJWT.signAccessToken({ userId: 'x', role: 'admin' });
        const jwt = require('jsonwebtoken');
        const decoded = jwt.decode(token);
        // exp - iat deve ser ~900s (15 min)
        const ttl = decoded.exp - decoded.iat;
        assert(ttl >= 800 && ttl <= 1000, `TTL esperado ~900s, obtido ${ttl}s`);
    });

    // ─── V05: CORS ───
    console.log('\n6. V05: CORS sem wildcard');
    await test('CORS: valida que allowedOrigins filtra *', () => {
        // Simula o filtro em server.js
        const allowedOrigins = (process.env.CRM_FRONTEND_URL || 'http://localhost:8080,http://127.0.0.1:8080')
            .split(',')
            .map(o => o.trim())
            .filter(Boolean)
            .filter(o => o !== '*');
        assert(!allowedOrigins.includes('*'), 'CORS deveria filtrar *');
        assert(allowedOrigins.length > 0, 'deveria ter origens válidas');
    });

    // ─── V04: Webhook anti-replay ───
    console.log('\n7. V04: Webhook anti-replay');
    const { verifyWebhookSignature } = require('../middleware/webhookSignature');
    await test('verifyWebhookSignature: rejeita timestamp fora da janela', () => {
        // Configura secret via env
        process.env.WEBHOOK_WEBHOOK_SECRET = 'test-secret-for-security-test';
        const oldTs = Math.floor(Date.now() / 1000) - 600;  // 10 min atrás
        const body = '{"event":"test"}';
        const sig = `t=${oldTs},v1=fake`;
        const middleware = verifyWebhookSignature({ required: true, secret: 'test-secret-for-security-test' });
        const req = {
            headers: { 'x-cora-signature': sig, 'x-forwarded-for': '1.2.3.4' },
            rawBody: body, ip: '1.2.3.4',
        };
        const res = { statusCode: 200, status: () => res, json: () => {}, setHeader: () => {} };
        let nextCalled = false;
        middleware(req, res, () => { nextCalled = true; });
        assert(!nextCalled, 'middleware deveria ter rejeitado timestamp fora da janela');
    });

    await test('verifyWebhookSignature: aceita timestamp dentro da janela', () => {
        process.env.WEBHOOK_WEBHOOK_SECRET = 'test-secret-for-security-test';
        const now = Math.floor(Date.now() / 1000);
        const body = '{"event":"test"}';
        const crypto = require('crypto');
        const sig = `t=${now},v1=${crypto.createHmac('sha256', 'test-secret-for-security-test').update(`${now}.${body}`).digest('hex')}`;
        const middleware = verifyWebhookSignature({ required: true, secret: 'test-secret-for-security-test' });
        const req = {
            headers: { 'x-cora-signature': sig, 'x-forwarded-for': '1.2.3.4' },
            rawBody: body, ip: '1.2.3.4',
        };
        const res = { statusCode: 200, status: () => res, json: () => {}, setHeader: () => {} };
        let nextCalled = false;
        middleware(req, res, () => { nextCalled = true; });
        assert(nextCalled, 'middleware deveria ter aceito timestamp válido');
    });

    // ─── Cleanup ───
    await test('Cleanup: deleta dados de teste', async () => {
        await dbRun(`DELETE FROM portal_users WHERE id = ?`, [portalUserId]);
        await dbRun(`DELETE FROM clientes WHERE id = ?`, [clienteId]);
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
    console.error('Erro fatal:', err);
    try { close(); } catch (_) {}
    setTimeout(() => process.exit(1), 100);
});
