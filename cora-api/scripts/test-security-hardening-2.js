/**
 * Test Security Hardening 2 — V02, V09, V12
 *
 * Valida:
 *   V02: requireRole aplicado em rotas admin (server.js + routes/*.js)
 *   V09: JWT blacklist (revogação de tokens)
 *   V12: handleError() sanitiza mensagens antes de retornar ao cliente
 *
 * Uso:  node scripts/test-security-hardening-2.js
 */

const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { dbGet, dbRun, dbAll, close } = require('../database');
const { signAccessToken, verifyToken, JTI_PREFIX } = require('../middleware/authJWT');
const JWTBlacklist = require('../services/JWTBlacklistService');
const { handleError, sanitizeMessage, inferStatus, inferCode } = require('../middleware/errorHandler');

let passed = 0, failed = 0;
const failures = [];

function test(name, fn) {
    return Promise.resolve()
        .then(() => fn())
        .then(() => { passed++; console.log(`  ✓ ${name}`); })
        .catch((err) => {
            failed++;
            failures.push({ name, err: err.message || String(err) });
            console.log(`  ✗ ${name}: ${err.message || err}`);
        });
}

function assert(cond, msg) {
    if (!cond) throw new Error(msg || 'assertion failed');
}

function assertEq(a, b, msg) {
    if (a !== b) throw new Error((msg || '') + ` — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

(async () => {
    console.log('======================================================');
    console.log('  Sprint Security Hardening 2 — V02/V09/V12');
    console.log('======================================================\n');

    // ═══════════════════════════════════════════════════════════
    // 1. V12: handleError + sanitization
    // ═══════════════════════════════════════════════════════════
    console.log('1. V12: handleError + sanitizeMessage');

    await test('sanitizeMessage: remove path Unix', () => {
        const s = sanitizeMessage('Error opening /var/www/renostter/cora-api/services/LeadManager.js:42');
        assert(!s.includes('/var/www/renostter'), 'path Unix não foi removido');
        assert(s.includes('[REDACTED:path]'), 'substituição por [REDACTED:path] esperada');
    });

    await test('sanitizeMessage: remove path Windows', () => {
        const s = sanitizeMessage('Error at C:\\Users\\admin\\app\\file.js:10');
        assert(!s.includes('C:\\Users\\admin'), 'path Windows não foi removido');
        assert(s.includes('[REDACTED:path]'), 'substituição por [REDACTED:path] esperada');
    });

    await test('sanitizeMessage: remove SQL inline', () => {
        const s = sanitizeMessage('SQLITE_ERROR: no such column: foo (SELECT * FROM leads WHERE id=1)');
        assert(s.includes('[REDACTED:sql]'), 'SQL não foi sanitizado');
        assert(!s.includes('SELECT * FROM leads'), 'SQL visível no output');
    });

    await test('sanitizeMessage: remove IPs internos', () => {
        const s127 = sanitizeMessage('ECONNREFUSED 127.0.0.1:5432');
        assert(s127.includes('[REDACTED:ip]'), 'localhost não foi removido');
        const s10 = sanitizeMessage('connect 10.0.0.5 failed');
        assert(s10.includes('[REDACTED:ip]'), 'IP privado não foi removido');
    });

    await test('sanitizeMessage: remove JWT tokens', () => {
        const s = sanitizeMessage('Invalid token: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.abc');
        assert(s.includes('[REDACTED:token]'), 'JWT não foi removido');
        assert(!s.includes('eyJhbGciOiJIUzI1NiJ9'), 'JWT visível');
    });

    await test('sanitizeMessage: remove credentials em URL', () => {
        const s = sanitizeMessage('Failed: client_secret=mySuperSecret123&other=ok');
        assert(s.includes('[REDACTED:credential]'), 'credential não foi removida');
        assert(!s.includes('mySuperSecret123'), 'secret visível');
    });

    await test('inferStatus: SQLITE_CONSTRAINT → 409', () => {
        const e = new Error('UNIQUE constraint failed');
        e.code = 'SQLITE_CONSTRAINT';
        assertEq(inferStatus(e), 409);
    });

    await test('inferStatus: ECONNREFUSED → 502', () => {
        const e = new Error('connect ECONNREFUSED');
        e.code = 'ECONNREFUSED';
        assertEq(inferStatus(e), 502);
    });

    await test('inferStatus: VALIDATION_ERROR → 400', () => {
        const e = new Error('invalid');
        e.code = 'VALIDATION_ERROR';
        assertEq(inferStatus(e), 400);
    });

    await test('inferStatus: genérico → 500', () => {
        const e = new Error('something');
        assertEq(inferStatus(e), 500);
    });

    await test('handleError: retorna mensagem pública + correlationId', () => {
        const captured = { statusCode: null, body: null };
        const res = {
            status: (s) => { captured.statusCode = s; return res; },
            json: (b) => { captured.body = b; return res; },
        };
        const err = new Error('boom');
        handleError(res, err, { context: 'TEST' });
        assertEq(captured.statusCode, 500);
        assert(captured.body.success === false, 'success false');
        assert(captured.body.error, 'error presente');
        assert(captured.body.correlationId, 'correlationId presente');
        assert(!captured.body.error.includes('boom'), 'mensagem original NÃO deve vazar');
    });

    await test('handleError: passa details seguros do erro (4xx)', () => {
        const captured = { statusCode: null, body: null };
        const res = {
            status: (s) => { captured.statusCode = s; return res; },
            json: (b) => { captured.body = b; return res; },
        };
        const err = new Error('User-friendly validation message');
        err.status = 400;
        err.code = 'VALIDATION_ERROR';
        err.errors = [{ field: 'email', message: 'invalid email' }];
        handleError(res, err, { context: 'TEST' });
        assertEq(captured.statusCode, 400);
        assert(captured.body.details, 'details presente para 4xx');
        assert(Array.isArray(captured.body.details), 'details é array');
        assertEq(captured.body.details[0].field, 'email');
    });

    await test('handleError: NÃO vaza stack para o cliente', () => {
        const captured = { body: null };
        const res = {
            status: () => res,
            json: (b) => { captured.body = b; return res; },
        };
        const err = new Error('database error');
        err.stack = 'Error: database error\n    at LeadManager (/var/www/renostter/LeadManager.js:42:5)';
        handleError(res, err, { context: 'TEST' });
        const json = JSON.stringify(captured.body);
        assert(!json.includes('LeadManager'), 'stack visível no JSON');
        assert(!json.includes('/var/www/renostter'), 'path no JSON');
    });

    // ═══════════════════════════════════════════════════════════
    // 2. V09: JWT Blacklist
    // ═══════════════════════════════════════════════════════════
    console.log('\n2. V09: JWT Blacklist');

    // Aguarda inicialização assíncrona do DB (CREATE TABLE roda em callback)
    await new Promise((resolve) => {
        const check = async () => {
            try {
                const row = await dbGet(`SELECT name FROM sqlite_master WHERE type='table' AND name='jwt_revoked'`);
                if (row) return resolve();
            } catch (_) { /* ainda não inicializou */ }
            setTimeout(check, 100);
        };
        check();
        // Timeout máximo 3s
        setTimeout(() => resolve(), 3000);
    });

    await test('Tabela jwt_revoked existe', async () => {
        const row = await dbGet(
            `SELECT name FROM sqlite_master WHERE type='table' AND name='jwt_revoked'`
        );
        assert(row, 'tabela jwt_revoked não existe');
    });

    await test('signAccessToken inclui jti (V09)', () => {
        const token = signAccessToken({ userId: 'u-test', role: 'admin' });
        const decoded = jwt.decode(token, { complete: true });
        assert(decoded.payload.jti, 'jti não está no payload');
        assert(decoded.payload.jti.startsWith(JTI_PREFIX), `jti deveria começar com ${JTI_PREFIX}`);
    });

    let testJti = null;
    let testUserId = 'usr-v09-test';

    await test('revokeToken adiciona à blacklist', async () => {
        const token = signAccessToken({ userId: testUserId, role: 'admin' });
        const decoded = jwt.decode(token);
        testJti = decoded.jti;
        const futureExp = Math.floor(Date.now() / 1000) + 900; // 15 min
        const result = await JWTBlacklist.revokeToken(testJti, testUserId, futureExp, 'logout', testUserId);
        assert(result.success, 'revokeToken retornou success=false');
    });

    await test('isTokenRevoked: retorna true para token revogado', async () => {
        const revoked = await JWTBlacklist.isTokenRevoked(testJti);
        assert(revoked, 'token revogado deveria retornar true');
    });

    await test('isTokenRevoked: retorna false para token não-revogado', async () => {
        const token = signAccessToken({ userId: 'outro-user', role: 'admin' });
        const decoded = jwt.decode(token);
        const revoked = await JWTBlacklist.isTokenRevoked(decoded.jti);
        assert(!revoked, 'token não-revogado deveria retornar false');
    });

    await test('revokeToken é idempotente (não duplica)', async () => {
        const token = signAccessToken({ userId: testUserId, role: 'admin' });
        const decoded = jwt.decode(token);
        const futureExp = Math.floor(Date.now() / 1000) + 900;
        // Revoga 2 vezes
        await JWTBlacklist.revokeToken(decoded.jti, testUserId, futureExp, 'logout', testUserId);
        await JWTBlacklist.revokeToken(decoded.jti, testUserId, futureExp, 'logout', testUserId);
        // Conta entradas
        const rows = await dbAll(`SELECT COUNT(*) as n FROM jwt_revoked WHERE jti = ?`, [decoded.jti]);
        assertEq(rows[0].n, 1, `esperava 1 entrada, encontrou ${rows[0].n}`);
    });

    await test('revokeAllForUser cria marker USER:*', async () => {
        const userId = 'usr-force-relogin-test';
        const result = await JWTBlacklist.revokeAllForUser(userId, 'admin_action', userId);
        assert(result.success, 'revokeAllForUser falhou');
        const isRevoked = await JWTBlacklist.isUserRevoked(userId);
        assert(isRevoked, 'isUserRevoked deveria ser true após revokeAllForUser');
        // Cleanup
        await dbRun(`DELETE FROM jwt_revoked WHERE jti = ?`, [`USER:${userId}`]);
    });

    await test('checkRevokedToken middleware bloqueia token revogado', () => {
        let nextCalled = false;
        const res = {
            status: () => res,
            json: (b) => {
                assertEq(b.code, 'TOKEN_REVOKED', 'código esperado: TOKEN_REVOKED');
                assert(b.error.includes('revogado'), 'mensagem deveria mencionar revogação');
            },
        };
        const req = { auditInfo: { userId: testUserId, jti: testJti } };
        // isTokenRevoked é async — vamos verificar com promise
        return new Promise((resolve, reject) => {
            const origJson = res.json;
            res.json = (b) => {
                origJson(b);
                resolve();
            };
            JWTBlacklist.checkRevokedToken(req, res, () => {
                nextCalled = true;
                reject(new Error('middleware NÃO deveria chamar next() para token revogado'));
            });
            // Se next foi chamado, falhamos
            setTimeout(() => {
                if (nextCalled) reject(new Error('next foi chamado'));
                else resolve();
            }, 100);
        });
    });

    await test('checkRevokedToken middleware permite token não-revogado', () => {
        const token = signAccessToken({ userId: 'u-clean', role: 'admin' });
        const decoded = jwt.decode(token);
        return new Promise((resolve, reject) => {
            const req = { auditInfo: { userId: 'u-clean', jti: decoded.jti } };
            const res = {
                status: () => res,
                json: () => reject(new Error('json NÃO deveria ser chamado')),
            };
            JWTBlacklist.checkRevokedToken(req, res, () => {
                resolve(); // next foi chamado → OK
            });
        });
    });

    await test('checkRevokedToken: USER:* marker bloqueia novos requests', async () => {
        const userId = 'usr-marker-test';
        await JWTBlacklist.revokeAllForUser(userId, 'compromised', 'admin');
        const token = signAccessToken({ userId, role: 'admin' });
        const decoded = jwt.decode(token);
        return new Promise((resolve, reject) => {
            const req = { auditInfo: { userId, jti: decoded.jti } };
            const res = {
                status: () => res,
                json: (b) => {
                    assertEq(b.code, 'USER_REVOKED', 'código esperado: USER_REVOKED');
                    resolve();
                },
            };
            JWTBlacklist.checkRevokedToken(req, res, () => {
                reject(new Error('next NÃO deveria ser chamado para USER_REVOKED'));
            });
        });
    });

    await test('cleanupExpired remove tokens já expirados', async () => {
        const expiredJti = 'ren-expired-test-12345';
        await dbRun(
            `INSERT INTO jwt_revoked (jti, user_id, expires_at, reason) VALUES (?, ?, datetime('now', '-1 hour'), 'test')`,
            [expiredJti, 'usr-cleanup-test']
        );
        const result = await JWTBlacklist.cleanupExpired();
        assert(result.deleted >= 1, `esperava deleted >= 1, obteve ${result.deleted}`);
    });

    // ═══════════════════════════════════════════════════════════
    // 3. V02: requireRole aplicado em rotas
    // ═══════════════════════════════════════════════════════════
    console.log('\n3. V02: requireRole em rotas admin');

    await test('server.js: rotas financeiras têm requireRole', () => {
        const content = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
        // Procura rotas que retornam dados financeiros
        const patterns = [
            /app\.(get|post|patch|delete)\s*\(\s*['"`]\/api\/faturas[^'"`]*['"`][^)]*?\)/g,
            /app\.(get|post|patch|delete)\s*\(\s*['"`]\/api\/cobrancas\/:id[^'"`]*['"`][^)]*?\)/g,
            /app\.(get|post|patch|delete)\s*\(\s*['"`]\/api\/bancos\/cadastrados[^'"`]*['"`][^)]*?\)/g,
        ];
        const issues = [];
        for (const pat of patterns) {
            const matches = content.match(pat) || [];
            for (const m of matches) {
                if (!m.includes('requireRole') && !m.includes('verifyWebhookSignature') && !m.includes('portalAuth')) {
                    issues.push(m);
                }
            }
        }
        assert(issues.length === 0, `${issues.length} rota(s) financeira(s) sem requireRole: ${issues.join(' | ')}`);
    });

    await test('server.js: POST /api/chamados tem requireRole', () => {
        const content = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
        const match = content.match(/app\.post\s*\(\s*['"`]\/api\/chamados['"`][^)]*?\)/);
        assert(match, 'rota POST /api/chamados não encontrada');
        assert(match[0].includes('requireRole'), 'POST /api/chamados sem requireRole');
    });

    await test('server.js: POST /api/leads tem requireRole', () => {
        const content = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
        const match = content.match(/app\.post\s*\(\s*['"`]\/api\/leads['"`][^)]*?\)/);
        assert(match, 'rota POST /api/leads não encontrada');
        assert(match[0].includes('requireRole'), 'POST /api/leads sem requireRole');
    });

    await test('server.js: DELETE /api/cobrancas/:id tem requireRole', () => {
        const content = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
        const match = content.match(/app\.delete\s*\(\s*['"`]\/api\/cobrancas\/:id['"`][^)]*?\)/);
        assert(match, 'rota DELETE /api/cobrancas/:id não encontrada');
        assert(match[0].includes('requireRole'), 'DELETE /api/cobrancas/:id sem requireRole');
    });

    await test('server.js: DELETE /api/bancos/cadastrados/:id tem requireRole', () => {
        const content = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
        const match = content.match(/app\.delete\s*\(\s*['"`]\/api\/bancos\/cadastrados\/:id['"`][^)]*?\)/);
        assert(match, 'rota DELETE /api/bancos/cadastrados/:id não encontrada');
        assert(match[0].includes('requireRole'), 'DELETE /api/bancos/cadastrados/:id sem requireRole');
    });

    await test('server.js: GET /api/faturas tem requireRole', () => {
        const content = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
        const match = content.match(/app\.get\s*\(\s*['"`]\/api\/faturas['"`][^)]*?\)/);
        assert(match, 'rota GET /api/faturas não encontrada');
        assert(match[0].includes('requireRole'), 'GET /api/faturas sem requireRole');
    });

    await test('server.js: GET /api/cora/balance tem requireRole', () => {
        const content = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
        const match = content.match(/app\.get\s*\(\s*['"`]\/api\/cora\/balance['"`][^)]*?\)/);
        assert(match, 'rota GET /api/cora/balance não encontrada');
        assert(match[0].includes('requireRole'), 'GET /api/cora/balance sem requireRole');
    });

    await test('server.js: checkRevokedToken middleware está aplicado', () => {
        const content = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
        assert(content.includes('JWTBlacklist.checkRevokedToken'), 'checkRevokedToken não foi integrado no server.js');
    });

    await test('auth.js: rota /logout usa revokeToken', () => {
        const content = fs.readFileSync(path.join(__dirname, '..', 'routes', 'auth.js'), 'utf8');
        assert(content.includes('JWTBlacklist.revokeToken'), 'JWTBlacklist.revokeToken não está em auth.js');
        assert(content.includes("/logout'") || content.includes('/logout"'), '/logout não encontrado');
    });

    await test('auth.js: rota /logout-all existe', () => {
        const content = fs.readFileSync(path.join(__dirname, '..', 'routes', 'auth.js'), 'utf8');
        assert(content.includes('/logout-all') || content.includes('logout-all'), '/logout-all não encontrado');
    });

    await test('routes/contracts-automation.js: GET /templates tem requireRole', () => {
        const content = fs.readFileSync(path.join(__dirname, '..', 'routes', 'contracts-automation.js'), 'utf8');
        const match = content.match(/router\.get\s*\(\s*['"`]\/templates['"`][^)]*?\)/);
        assert(match, 'rota GET /templates não encontrada');
        assert(match[0].includes('requireRole'), 'GET /templates sem requireRole');
    });

    await test('routes/uploads.js: GET /url/* tem requireRole', () => {
        const content = fs.readFileSync(path.join(__dirname, '..', 'routes', 'uploads.js'), 'utf8');
        const match = content.match(/router\.get\s*\(\s*\/\^\\?\\?\/\^?\\\?\/\?url/g);
        // regex literal — pegar primeiros 200 chars do router.get
        const idx = content.indexOf('router.get(/^');
        assert(idx > 0, 'rota /url/* não encontrada');
        const after = content.substring(idx, idx + 300);
        assert(after.includes('requireRole'), 'GET /url/* sem requireRole');
    });

    // ═══════════════════════════════════════════════════════════
    // 4. Limpeza
    // ═══════════════════════════════════════════════════════════
    console.log('\n4. Cleanup');
    await test('Remove tokens de teste do DB', async () => {
        const r1 = await dbRun(`DELETE FROM jwt_revoked WHERE user_id = ?`, [testUserId]);
        const r2 = await dbRun(`DELETE FROM jwt_revoked WHERE jti = ?`, [testJti]);
        assert(r1.changes + r2.changes >= 0, 'cleanup não rodou');
    });

    // ═══════════════════════════════════════════════════════════
    // RESULTADO
    // ═══════════════════════════════════════════════════════════
    console.log('\n=== RESULTADO ===');
    console.log(`Passou: ${passed}`);
    console.log(`Falhou: ${failed}`);
    if (failed > 0) {
        console.log('\nFalhas:');
        failures.forEach(f => console.log(`  - ${f.name}: ${f.err}`));
    }
    try { close(); } catch (_) {}
    setTimeout(() => process.exit(failed > 0 ? 1 : 0), 100);
})().catch((err) => {
    console.error('Erro fatal:', err);
    try { close(); } catch (_) {}
    setTimeout(() => process.exit(1), 100);
});
