const { dbRun, dbGet, dbAll, close } = require('../database');
const SecurityLogger = require('../services/SecurityLogger');

(async () => {
    const testUserId = 'usr-debug';
    await dbRun(`INSERT OR REPLACE INTO usuarios (id, nome, role) VALUES (?, 'Debug', 'admin')`, [testUserId]);
    await dbRun(`UPDATE usuarios SET failed_login_count = 0, locked_until = NULL WHERE id = ?`, [testUserId]);
    for (let i = 0; i < 5; i++) {
        process.stderr.write(`Iter ${i+1} start\n`);
        await SecurityLogger.loginFailed({ email: 'test@test.com', ip: '127.0.0.1', reason: 'attempt ' + (i+1) });
        process.stderr.write(`Iter ${i+1} done\n`);
    }
    close();
    process.exit(0);
})();
