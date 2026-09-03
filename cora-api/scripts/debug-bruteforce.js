const { dbRun, dbGet, close } = require('../database');
const BruteForce = require('../middleware/bruteForce');

(async () => {
    const testUserId = 'usr-bruteforce-block';
    await dbRun(`INSERT OR REPLACE INTO usuarios (id, nome, role) VALUES (?, 'BF Block', 'admin')`, [testUserId]);
    await dbRun(`UPDATE usuarios SET failed_login_count = 0, locked_until = NULL WHERE id = ?`, [testUserId]);
    console.log('Before failures');
    for (let i = 0; i < 5; i++) {
        const r = await BruteForce.recordFailure(testUserId, { ip: '127.0.0.1', email: 'test@test.com' });
        console.log(`Attempt ${i+1}:`, r);
    }
    const user = await dbGet(`SELECT failed_login_count, locked_until FROM usuarios WHERE id = ?`, [testUserId]);
    console.log('Final user state:', user);
    close();
    setTimeout(() => process.exit(0), 100);
})().catch(e => { console.error('Erro:', e); process.exit(1); });
