// Reproduz test-security-hardening-3 em miniatura
const { dbRun, dbGet, close } = require('../database');
const BruteForce = require('../middleware/bruteForce');
const SecurityLogger = require('../services/SecurityLogger');

(async () => {
    process.stderr.write('Init: starting\n');
    // Cria usuário
    await dbRun(`INSERT OR REPLACE INTO usuarios (id, nome, role) VALUES (?, 'Test', 'admin')`, ['usr-bf-block']);
    await dbRun(`UPDATE usuarios SET failed_login_count = 0, locked_until = NULL WHERE id = ?`, ['usr-bf-block']);
    process.stderr.write('Init: done\n');

    // V21: SecurityLogger tests
    await SecurityLogger.loginSuccess({ userId: 'test-user-1', email: 'test@example.com', ip: '127.0.0.1', userAgent: 'jest' });
    process.stderr.write('V21: loginSuccess done\n');
    await SecurityLogger.loginFailed({ email: 'attacker@evil.com', ip: '10.0.0.1', reason: 'wrong_password' });
    process.stderr.write('V21: loginFailed done\n');
    await SecurityLogger.suspiciousActivity({ ip: '1.2.3.4', reason: 'mass_requests', details: { count: 1000 } });
    process.stderr.write('V21: suspiciousActivity done\n');

    // V25: BruteForce
    await BruteForce.recordSuccess('usr-bruteforce-test', { ip: '127.0.0.1' });
    process.stderr.write('V25: recordSuccess done\n');

    // 5 falhas
    for (let i = 0; i < 5; i++) {
        process.stderr.write(`V25: recordFailure ${i+1} start\n`);
        const r = await BruteForce.recordFailure('usr-bruteforce-block', { ip: '127.0.0.1', email: 'test@test.com' });
        process.stderr.write(`V25: recordFailure ${i+1} done: ${JSON.stringify(r)}\n`);
    }
    process.stderr.write('All done\n');
    close();
    process.exit(0);
})();
