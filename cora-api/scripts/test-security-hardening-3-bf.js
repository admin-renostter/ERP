/**
 * Test Security Hardening 3 — V25 (Brute Force) — separado do test principal
 *
 * Roda isoladamente porque envolve múltiplas escritas sequenciais no DB
 * que em suíte completa podem causar contenção de lock.
 */

const { dbRun, dbGet, close } = require('../database');
const BruteForce = require('../middleware/bruteForce');

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
    console.log('  V25 — Brute Force Protection (isolado)');
    console.log('======================================================\n');

    // Aguarda init
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

    await test('BruteForce.recordSuccess reseta contador', async () => {
        const testUserId = 'usr-bruteforce-test-iso';
        await dbRun(
            `INSERT OR REPLACE INTO usuarios (id, nome, role) VALUES (?, 'BF Test', 'admin')`,
            [testUserId]
        );
        await dbRun(`UPDATE usuarios SET failed_login_count = 3 WHERE id = ?`, [testUserId]);
        await BruteForce.recordSuccess(testUserId, { ip: '127.0.0.1' });
        const user = await dbGet(`SELECT failed_login_count, locked_until FROM usuarios WHERE id = ?`, [testUserId]);
        assertEq(user.failed_login_count, 0);
        assertEq(user.locked_until, null);
    });

    await test('BruteForce.recordFailure 5 vezes bloqueia conta', async () => {
        const testUserId = 'usr-bruteforce-block-iso';
        await dbRun(
            `INSERT OR REPLACE INTO usuarios (id, nome, role) VALUES (?, 'BF Block', 'admin')`,
            [testUserId]
        );
        await dbRun(`UPDATE usuarios SET failed_login_count = 0, locked_until = NULL WHERE id = ?`, [testUserId]);
        for (let i = 0; i < 5; i++) {
            await BruteForce.recordFailure(testUserId, { ip: '127.0.0.1', email: 'test@test.com' });
        }
        const user = await dbGet(`SELECT failed_login_count, locked_until FROM usuarios WHERE id = ?`, [testUserId]);
        assert(user.locked_until, 'conta deveria estar bloqueada após 5 falhas');
        assert(user.failed_login_count >= 5, `contador deveria ser >=5, é ${user.failed_login_count}`);
    });

    await test('BruteForce.isLocked detecta bloqueio ativo', async () => {
        const testUserId = 'usr-bruteforce-block-iso';
        const r = await BruteForce.isLocked(testUserId);
        assert(r.locked, 'conta deveria estar bloqueada');
        assert(r.remainingMinutes > 0, 'remainingMinutes deveria ser > 0');
    });

    await test('BruteForce.isIpBlocked bloqueia após muitas falhas', async () => {
        BruteForce._ipAttempts.clear();
        const ip = '192.168.99.99';
        for (let i = 0; i < 20; i++) {
            await BruteForce.recordIpFailure(ip);
        }
        const blocked = await BruteForce.isIpBlocked(ip);
        assert(blocked, 'IP deveria estar bloqueado após 20 falhas');
    });

    // Cleanup
    await dbRun(`DELETE FROM usuarios WHERE id IN ('usr-bruteforce-test-iso', 'usr-bruteforce-block-iso')`);
    await dbRun(`DELETE FROM security_events WHERE user_id IN ('usr-bruteforce-test-iso', 'usr-bruteforce-block-iso')`);

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
