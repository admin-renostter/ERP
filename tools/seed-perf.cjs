/**
 * Seed de teste — popula o SQLite com ~200 cobranças, 50 clientes
 * para o perf-audit ter dados realistas.
 */
const path = require('path');
const sqlite3 = require(path.join(__dirname, '..', 'cora-api', 'node_modules', 'sqlite3')).verbose();
const DB_PATH = path.join(__dirname, '..', 'cora-api', 'cora.sqlite');

const db = new sqlite3.Database(DB_PATH);

function run(sql, params = []) {
    return new Promise((res, rej) => {
        db.run(sql, params, function (err) { if (err) rej(err); else res(this); });
    });
}
function all(sql, params = []) {
    return new Promise((res, rej) => {
        db.all(sql, params, (err, rows) => { if (err) rej(err); else res(rows); });
    });
}
function get(sql, params = []) {
    return new Promise((res, rej) => {
        db.get(sql, params, (err, row) => { if (err) rej(err); else res(row); });
    });
}

async function seed() {
    console.log('Limpando dados de teste anteriores...');
    await run("DELETE FROM cobrancas WHERE contract_id LIKE 'PERF-%'");
    await run("DELETE FROM faturas WHERE chamado_id LIKE 'PERF-%'");
    await run("DELETE FROM pending_approvals WHERE ticket_id LIKE 'PERF-%'");

    // Cobranças
    console.log('Criando 1000 cobranças fake...');
    const statuses = ['PENDING', 'PENDING', 'PENDING', 'OPEN', 'PAID', 'OVERDUE', 'CANCELLED'];
    const providers = ['cora', 'cora', 'cora', 'itau'];

    const startTime = Date.now();
    const stmt = db.prepare(`INSERT INTO cobrancas
        (id, contract_id, client_id, gateway_provider, valor, data_vencimento, status)
        VALUES (?,?,?,?,?,?,?)`);
    for (let i = 0; i < 1000; i++) {
        const id = `cob_perf${i.toString().padStart(4, '0')}`;
        const status = statuses[i % statuses.length];
        const provider = providers[i % providers.length];
        const value = 100 + Math.floor(Math.random() * 5000);
        const daysOffset = Math.floor(Math.random() * 60) - 30;
        const dueDate = new Date(Date.now() + daysOffset * 86400000).toISOString().split('T')[0];
        const clientId = `cli${(i % 50).toString().padStart(3, '0')}`;
        stmt.run(`cob_${id}`, `PERF-${id}`, clientId, provider, value, dueDate, status);
    }
    stmt.finalize();
    console.log(`  ✅ 200 cobranças em ${Date.now() - startTime}ms`);

    // Pendências de aprovação
    console.log('Criando 30 pendências de aprovação...');
    const tiers = ['admin', 'superadmin', 'compliance'];
    for (let i = 0; i < 30; i++) {
        const id = `appr_perf${i.toString().padStart(3, '0')}`;
        const tier = tiers[i % tiers.length];
        const value = tier === 'admin' ? 500 : (tier === 'superadmin' ? 3000 : 8000);
        await run(
            `INSERT OR IGNORE INTO pending_approvals
             (id, ticket_id, client_id, requested_by, request_value, original_value,
              requires_approval_reason, tier, status)
             VALUES (?,?,?,?,?,?,?,?,?)`,
            [id, `PERF-ticket-${i}`, `cli${i % 50}`, 'u1', value, value, 'perf-test', tier, 'PENDING']
        );
    }
    console.log('  ✅ 30 pendências');

    const stats = await get("SELECT COUNT(*) as c FROM cobrancas");
    console.log(`\nTotal cobrancas no banco: ${stats.c}`);
}

seed().then(() => { db.close(); console.log('\n[OK] Seed completo'); })
    .catch(e => { console.error(e); db.close(); process.exit(1); });