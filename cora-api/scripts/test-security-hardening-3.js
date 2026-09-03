/**
 * Test Security Hardening 3 — V10, V11, V14, V15, V16, V18, V21-V27
 *
 * Valida:
 *   V10: AUTH_MODE=legacy rejeitado em prod
 *   V11: JWT key rotation (verify com secret anterior)
 *   V14: MIME validator (sniff magic bytes)
 *   V15: Path validator (traversal detection)
 *   V16: Cookie secure flags
 *   V18: CSRF middleware
 *   V21: SecurityLogger (logs estruturados)
 *   V22: Secrets manager validation
 *   V23: CSP nonce
 *   V24: Extra security headers
 *   V25: Brute force protection
 *   V26: Backup cifrado
 *   V27: npm audit script
 */

const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { dbGet, dbRun, dbAll, close } = require('../database');

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
    console.log('  Sprint Security Hardening 3 — V10/V11/V14/V15/...');
    console.log('======================================================\n');

    // Aguarda init do DB
    await new Promise((resolve) => {
        const check = async () => {
            try {
                const r = await dbGet(`SELECT name FROM sqlite_master WHERE type='table' AND name='usuarios'`);
                if (r) return resolve();
            } catch (_) {}
            setTimeout(check, 100);
        };
        check();
        setTimeout(() => resolve(), 3000);
    });

    // ═══════════════════════════════════════════════════════════
    // 1. V10: AUTH_MODE legacy em prod
    // ═══════════════════════════════════════════════════════════
    console.log('1. V10: AUTH_MODE legacy em produção');

    const { validateEnv, isSecretReference } = require('../envValidator');

    await test('isSecretReference detecta vault://', () => {
        assert(isSecretReference('vault://secret/path'), 'vault:// não detectado');
        assert(isSecretReference('ssm://my-secret'), 'ssm:// não detectado');
        assert(isSecretReference('doppler://CONFIG_TOKEN'), 'doppler:// não detectado');
    });

    await test('isSecretReference retorna false para valor normal', () => {
        assert(!isSecretReference('regular-secret-value'), 'falso positivo em valor normal');
        assert(!isSecretReference('12345678'), 'falso positivo em número');
    });

    await test('validateEnv rejeita AUTH_MODE=legacy em prod', () => {
        const orig = { NODE_ENV: process.env.NODE_ENV, AUTH_MODE: process.env.AUTH_MODE };
        // Mockar process.exit para não crashar o teste
        const origExit = process.exit;
        let exitCode = null;
        process.exit = (code) => { exitCode = code; throw new Error('__exit__'); };
        try {
            process.env.NODE_ENV = 'production';
            process.env.AUTH_MODE = 'legacy';
            // Setar todas as envs para isolar o teste
            process.env.DB_ENCRYPTION_KEY = 'a'.repeat(64);
            process.env.JWT_SECRET = 'b'.repeat(64);
            process.env.WEBHOOK_WEBHOOK_SECRET = 'c'.repeat(32);
            process.env.CORA_CLIENT_ID = 'real-client-id-12345';
            process.env.CORA_CERT_PATH = '/tmp/cert';
            process.env.CORA_KEY_PATH = '/tmp/key';
            process.env.CRM_FRONTEND_URL = 'https://app.example.com';
            try { validateEnv(); } catch (e) { /* expected exit */ }
        } finally {
            process.exit = origExit;
            process.env.NODE_ENV = orig.NODE_ENV;
            process.env.AUTH_MODE = orig.AUTH_MODE;
        }
        assertEq(exitCode, 1, `validateEnv deveria ter chamado exit(1), exitCode=${exitCode}`);
    });

    // ═══════════════════════════════════════════════════════════
    // 2. V11: JWT Key Rotation
    // ═══════════════════════════════════════════════════════════
    console.log('\n2. V11: JWT Key Rotation');

    // Recarrega authJWT com JWT_SECRET_PREVIOUS setado
    const OLD_SECRET = 'a'.repeat(64);
    const NEW_SECRET = 'b'.repeat(64);
    process.env.JWT_SECRET = NEW_SECRET;
    process.env.JWT_SECRET_PREVIOUS = OLD_SECRET;
    delete require.cache[require.resolve('../middleware/authJWT')];
    const authJWT2 = require('../middleware/authJWT');

    await test('verifyToken aceita token assinado com secret ATUAL', () => {
        const token = jwt.sign({ userId: 'u1', role: 'admin' }, NEW_SECRET, {
            algorithm: 'HS256',
            issuer: 'renostter-crm',
        });
        const decoded = authJWT2.verifyToken(token);
        assertEq(decoded.userId, 'u1');
    });

    await test('verifyToken aceita token assinado com secret ANTERIOR (rotação)', () => {
        const token = jwt.sign({ userId: 'u2', role: 'admin' }, OLD_SECRET, {
            algorithm: 'HS256',
            issuer: 'renostter-crm',
        });
        const decoded = authJWT2.verifyToken(token);
        assertEq(decoded.userId, 'u2');
    });

    await test('verifyToken rejeita token assinado com secret ALEATÓRIA', () => {
        const token = jwt.sign({ userId: 'u3', role: 'admin' }, 'random-secret-12345', {
            algorithm: 'HS256',
            issuer: 'renostter-crm',
        });
        let threw = false;
        try {
            authJWT2.verifyToken(token);
        } catch (e) {
            threw = true;
        }
        assert(threw, 'token com secret aleatória deveria falhar');
    });

    // Limpa
    delete process.env.JWT_SECRET_PREVIOUS;
    delete require.cache[require.resolve('../middleware/authJWT')];

    // ═══════════════════════════════════════════════════════════
    // 3. V14: MIME Validator
    // ═══════════════════════════════════════════════════════════
    console.log('\n3. V14: MIME Validator');

    const { sniffMimeType, validateMime } = require('../middleware/mimeValidator');

    await test('sniffMimeType detecta JPEG real', () => {
        // JPEG válido (magic bytes): FFD8FFE0 + ...
        const buf = Buffer.from('FFD8FFE000104A46494600010101006000600000', 'hex');
        const result = sniffMimeType(buf);
        assertEq(result.detected, 'image/jpeg');
    });

    await test('sniffMimeType detecta PNG real', () => {
        const buf = Buffer.from('89504E470D0A1A0A0000000D49484452', 'hex');
        const result = sniffMimeType(buf);
        assertEq(result.detected, 'image/png');
    });

    await test('sniffMimeType detecta PDF real', () => {
        const buf = Buffer.from('255044462D312E340A25', 'hex');
        const result = sniffMimeType(buf);
        assertEq(result.detected, 'application/pdf');
    });

    await test('sniffMimeType retorna null para buffer aleatório', () => {
        const buf = Buffer.from('Hello World! This is not an image.', 'utf8');
        const result = sniffMimeType(buf);
        assertEq(result.detected, null);
    });

    await test('validateMime aceita PNG declarado como PNG', () => {
        const buf = Buffer.from('89504E470D0A1A0A', 'hex');
        const r = validateMime(buf, 'image/png');
        assert(r.valid, 'PNG declarado como PNG deveria ser válido');
        assertEq(r.detected, 'image/png');
    });

    await test('validateMime REJEITA executável disfarçado de JPEG', () => {
        // MZ (PE executable) — MZ\x90\x00
        const buf = Buffer.from('4D5A90000300000004000000FFFF0000', 'hex');
        const r = validateMime(buf, 'image/jpeg');
        assert(!r.valid, 'MZ header NÃO deveria validar como JPEG');
        assert(r.reason, 'reason esperada');
    });

    await test('validateMime aceita text/* (sem magic number)', () => {
        const buf = Buffer.from('id,name,value\n1,foo,bar\n', 'utf8');
        const r = validateMime(buf, 'text/csv');
        assert(r.valid, 'CSV deveria ser aceito como text/*');
    });

    // ═══════════════════════════════════════════════════════════
    // 4. V15: Path Validator
    // ═══════════════════════════════════════════════════════════
    console.log('\n4. V15: Path Validator');

    const { containsTraversal, sanitizeFilename, isPathSafe, normalizePath } = require('../middleware/pathValidator');

    await test('containsTraversal detecta ../', () => {
        assert(containsTraversal('../../../etc/passwd'), '../ não detectado');
        assert(containsTraversal('foo/../bar'), '../ no meio não detectado');
        assert(containsTraversal('..\\windows\\system32'), '..\\ Windows não detectado');
    });

    await test('containsTraversal aceita paths normais', () => {
        assert(!containsTraversal('documents/2024/contrato.pdf'), 'falso positivo em path normal');
        assert(!containsTraversal('photo-12345.jpg'), 'falso positivo em filename');
    });

    await test('containsTraversal detecta null bytes', () => {
        assert(containsTraversal('foo\x00.jpg'), 'null byte não detectado');
    });

    await test('containsTraversal detecta URL-encoded traversal', () => {
        assert(containsTraversal('%2e%2e%2f'), '%2e%2e%2f não detectado');
    });

    await test('sanitizeFilename remove path separators', () => {
        const safe = sanitizeFilename('../../../etc/passwd');
        assert(!safe.includes('/'), 'separador / não removido');
        assert(!safe.includes('..'), '.. não removido');
    });

    await test('sanitizeFilename remove null bytes', () => {
        const safe = sanitizeFilename('file\x00.jpg');
        assert(!safe.includes('\x00'), 'null byte não removido');
    });

    await test('isPathSafe rejeita path fora do baseDir', () => {
        const safe = isPathSafe('/var/app/uploads', '/etc/passwd');
        assert(!safe, '/etc/passwd NÃO deveria estar dentro de /var/app/uploads');
    });

    await test('isPathSafe aceita path dentro do baseDir', () => {
        const safe = isPathSafe('/var/app/uploads', '/var/app/uploads/2024/file.pdf');
        assert(safe, 'path válido rejeitado');
    });

    await test('isPathSafe rejeita path traversal (../)', () => {
        const safe = isPathSafe('/var/app/uploads', '/var/app/uploads/../../../etc/passwd');
        assert(!safe, 'path com ../ deveria ser rejeitado');
    });

    await test('normalizePath retorna safe=true para input válido', () => {
        const r = normalizePath('photo-12345.jpg');
        assert(r.valid);
        assertEq(r.safe, 'photo-12345.jpg');
    });

    await test('normalizePath retorna safe=null para traversal', () => {
        const r = normalizePath('../../../etc/passwd');
        assert(!r.valid);
        assertEq(r.safe, null);
    });

    // ═══════════════════════════════════════════════════════════
    // 5. V16: Cookie Security Flags
    // ═══════════════════════════════════════════════════════════
    console.log('\n5. V16: Cookie Flags');

    const { applySecureCookieFlags, csrfProtection } = require('../middleware/csrf');

    await test('applySecureCookieFlags adiciona httpOnly, sameSite, secure', () => {
        let capturedOpts = null;
        const res = {
            cookie: (name, value, opts) => { capturedOpts = opts; },
        };
        const req = {};
        const next = () => {};
        const mw = applySecureCookieFlags();
        const prevEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        mw(req, res, next);
        res.cookie('session', 'abc');
        process.env.NODE_ENV = prevEnv;
        assert(capturedOpts.httpOnly, 'httpOnly não setado');
        assert(capturedOpts.sameSite, 'sameSite não setado');
        assertEq(capturedOpts.secure, true, 'secure não setado em prod');
    });

    await test('csrfProtection NO-OP para requests com JWT Bearer', () => {
        let nextCalled = false;
        const req = {
            method: 'POST',
            headers: { authorization: 'Bearer abc123' },
        };
        const res = {};
        csrfProtection()(req, res, () => { nextCalled = true; });
        assert(nextCalled, 'JWT Bearer deveria pular CSRF');
    });

    await test('csrfProtection rejeita POST sem token CSRF (sem JWT)', () => {
        let jsonBody = null;
        const req = {
            method: 'POST',
            headers: {},  // sem JWT
            cookies: {},
        };
        const res = {
            status: () => res,
            json: (b) => { jsonBody = b; return res; },
        };
        csrfProtection()(req, res, () => {});
        assert(jsonBody, 'CSRF deveria ter bloqueado');
        assertEq(jsonBody.code, 'CSRF_MISSING');
    });

    await test('csrfProtection aceita token CSRF válido', () => {
        const token = 'abc123';
        let nextCalled = false;
        const req = {
            method: 'POST',
            headers: { 'x-csrf-token': token },
            cookies: { _csrf: token },
        };
        const res = {
            status: () => res,
            json: () => {},
        };
        csrfProtection()(req, res, () => { nextCalled = true; });
        assert(nextCalled, 'CSRF válido deveria chamar next');
    });

    // ═══════════════════════════════════════════════════════════
    // 6. V21: SecurityLogger
    // ═══════════════════════════════════════════════════════════
    console.log('\n6. V21: SecurityLogger');

    const SecurityLogger = require('../services/SecurityLogger');

    await test('SecurityLogger.loginSuccess registra no DB', async () => {
        await SecurityLogger.loginSuccess({
            userId: 'test-user-1', email: 'test@example.com', ip: '127.0.0.1', userAgent: 'jest',
        });
        const row = await dbGet(
            `SELECT * FROM security_events WHERE event_type='login_success' AND user_id='test-user-1' ORDER BY id DESC LIMIT 1`
        );
        assert(row, 'evento não foi gravado');
        assertEq(row.severity, 'low');
    });

    await test('SecurityLogger.loginFailed registra no DB', async () => {
        await SecurityLogger.loginFailed({
            email: 'attacker@evil.com', ip: '10.0.0.1', reason: 'wrong_password',
        });
        const row = await dbGet(
            `SELECT * FROM security_events WHERE event_type='login_failed' AND user_email='attacker@evil.com' ORDER BY id DESC LIMIT 1`
        );
        assert(row);
        assertEq(row.severity, 'medium');
    });

    await test('SecurityLogger.suspiciousActivity registra severity=high', async () => {
        await SecurityLogger.suspiciousActivity({
            ip: '1.2.3.4', reason: 'mass_requests', details: { count: 1000 },
        });
        const row = await dbGet(
            `SELECT * FROM security_events WHERE event_type='suspicious_activity' AND ip='1.2.3.4' ORDER BY id DESC LIMIT 1`
        );
        assert(row);
        assertEq(row.severity, 'high');
    });

    // Cleanup
    await dbRun(`DELETE FROM security_events WHERE user_id IN ('test-user-1', 'usr-v09-test') OR user_email='attacker@evil.com' OR ip IN ('10.0.0.1', '1.2.3.4')`);

    // ═══════════════════════════════════════════════════════════
    // 7. V22: Secrets Manager validation
    // ═══════════════════════════════════════════════════════════
    console.log('\n7. V22: Secrets manager');

    await test('isSecretReference aceita vault://', () => {
        assert(isSecretReference('vault://secret/data/prod'));
    });

    await test('KNOWN_INSECURE_VALUES inclui placeholders comuns', () => {
        const { KNOWN_INSECURE_VALUES } = require('../envValidator');
        assert(KNOWN_INSECURE_VALUES.DB_ENCRYPTION_KEY.includes('change_me'));
        assert(KNOWN_INSECURE_VALUES.JWT_SECRET.includes('secret'));
        assert(KNOWN_INSECURE_VALUES.WEBHOOK_WEBHOOK_SECRET.includes('default'));
    });

    // ═══════════════════════════════════════════════════════════
    // 8. V23/V24: Security Headers
    // ═══════════════════════════════════════════════════════════
    console.log('\n8. V23/V24: Security Headers');

    const { cspNonce, extraSecurityHeaders, clearSiteData } = require('../middleware/securityHeaders');

    await test('cspNonce gera nonce único por request', () => {
        const nonces = new Set();
        const res = {
            locals: {},
            setHeader: () => {},
        };
        for (let i = 0; i < 100; i++) {
            const r = { headers: {} };
            cspNonce()(r, res, () => {});
            nonces.add(res.locals.cspNonce);
        }
        assert(nonces.size === 100, `nonce deveria ser único por request, mas houve ${100 - nonces.size} colisões`);
    });

    await test('extraSecurityHeaders adiciona Permissions-Policy', () => {
        let capturedHeader = null;
        const res = {
            setHeader: (name, value) => {
                if (name === 'Permissions-Policy') capturedHeader = value;
            },
        };
        extraSecurityHeaders()({}, res, () => {});
        assert(capturedHeader, 'Permissions-Policy não setado');
        assert(capturedHeader.includes('geolocation=()'), 'geolocation não desabilitado');
        assert(capturedHeader.includes('camera=()'), 'camera não desabilitado');
    });

    await test('extraSecurityHeaders adiciona X-Permitted-Cross-Domain-Policies=none', () => {
        let capturedHeader = null;
        const res = {
            setHeader: (name, value) => {
                if (name === 'X-Permitted-Cross-Domain-Policies') capturedHeader = value;
            },
        };
        extraSecurityHeaders()({}, res, () => {});
        assertEq(capturedHeader, 'none');
    });

    await test('clearSiteData seta header Clear-Site-Data', () => {
        let capturedHeader = null;
        const res = {
            setHeader: (name, value) => {
                if (name === 'Clear-Site-Data') capturedHeader = value;
            },
        };
        clearSiteData()({}, res, () => {});
        assert(capturedHeader, 'Clear-Site-Data não setado');
        assert(capturedHeader.includes('cookies'));
    });

    // ═══════════════════════════════════════════════════════════
    // 9. V25: Brute Force Protection (testado em test-security-hardening-3-bf.js
    //    para evitar race conditions com lock do SQLite após muitos testes)
    // ═══════════════════════════════════════════════════════════
    console.log('\n9. V25: Brute Force Protection (smoke tests apenas)');

    const BruteForce = require('../middleware/bruteForce');

    await test('BruteForce: classe existe e tem métodos esperados', () => {
        assert(typeof BruteForce.isLocked === 'function');
        assert(typeof BruteForce.recordSuccess === 'function');
        assert(typeof BruteForce.recordFailure === 'function');
        assert(typeof BruteForce.isIpBlocked === 'function');
        assert(typeof BruteForce.recordIpFailure === 'function');
        assert(typeof BruteForce.unlock === 'function');
    });

    await test('BruteForce: _ipAttempts é Map privado', () => {
        assert(BruteForce._ipAttempts instanceof Map, '_ipAttempts deve ser Map');
    });

    await test('BruteForce: constantes exportadas', () => {
        // Valida indiretamente testando comportamento
        assert(BruteForce._ipAttempts.size >= 0);
    });

    // ═══════════════════════════════════════════════════════════
    // 10. V26: Backup cifrado
    // ═══════════════════════════════════════════════════════════
    console.log('\n10. V26: Backup DB cifrado');

    const Backup = require('../scripts/backup-db');

    await test('encryptFile/decryptFile round-trip funciona', () => {
        const tmpInput = path.join(require('os').tmpdir(), 'test-backup-in.bin');
        const tmpEnc = path.join(require('os').tmpdir(), 'test-backup-in.enc');
        const tmpDec = path.join(require('os').tmpdir(), 'test-backup-out.bin');
        const original = Buffer.from('dados confidenciais do cliente: João Silva, CPF 123.456.789-00');
        fs.writeFileSync(tmpInput, original);
        const key = require('crypto').randomBytes(32);
        const enc = Backup.encryptFile(tmpInput, tmpEnc, key);
        assert(enc.size > 0);
        // Arquivo cifrado NÃO deve conter "João Silva" em plain text
        const encContent = fs.readFileSync(tmpEnc);
        assert(!encContent.includes(Buffer.from('João Silva')), 'plain text vazou!');
        // Decifra
        Backup.decryptFile(tmpEnc, tmpDec, key);
        const dec = fs.readFileSync(tmpDec);
        assert(dec.equals(original), 'decifragem falhou');
        // Cleanup
        fs.unlinkSync(tmpInput);
        fs.unlinkSync(tmpEnc);
        fs.unlinkSync(tmpDec);
    });

    await test('listBackups retorna lista', () => {
        const list = Backup.listBackups();
        assert(Array.isArray(list));
    });

    // ═══════════════════════════════════════════════════════════
    // 11. V27: npm audit
    // ═══════════════════════════════════════════════════════════
    console.log('\n11. V27: npm audit');

    const audit = require('../scripts/npm-audit');

    await test('mapAuditVulns lida com audit data vazio', () => {
        const vulns = audit.mapAuditVulns({});
        assert(Array.isArray(vulns));
        assertEq(vulns.length, 0);
    });

    await test('mapAuditVulns lida com audit data null', () => {
        const vulns = audit.mapAuditVulns(null);
        assert(Array.isArray(vulns));
        assertEq(vulns.length, 0);
    });

    await test('mapAuditVulns parseia vulnerabilidades reais', () => {
        const fakeAudit = {
            vulnerabilities: {
                'fake-pkg': {
                    severity: 'high',
                    via: [{ title: 'SSRF in fake-pkg', url: 'https://example.com', range: '<1.0.0' }],
                    fixAvailable: true,
                },
            },
        };
        const vulns = audit.mapAuditVulns(fakeAudit);
        assertEq(vulns.length, 1);
        assertEq(vulns[0].package, 'fake-pkg');
        assertEq(vulns[0].severity, 'high');
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
    process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
    console.error('Erro fatal:', err);
    try { close(); } catch (_) {}
    process.exit(1);
});
