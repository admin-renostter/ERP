// Diff de schema SQLite vs Postgres
const { execFileSync } = require('child_process');
const sqlite3 = require('C:/Users/joaop/OneDrive/Documentos/ANTGRAVITY/renostter-crm/cora-api/node_modules/sqlite3').verbose();
const { Pool } = require('C:/Users/joaop/OneDrive/Documentos/ANTGRAVITY/renostter-crm/cora-api/node_modules/pg');

const TABLES_TO_CHECK = [
    'bancos_referencia', 'bancos_cadastrados', 'cobrancas', 'cobrancas_recorrentes',
    'webhooks_recebidos', 'logs_integracao_cora', 'tokens_integracao',
    'logs_auditoria', 'configuracoes_integracao', 'cora_logs', 'logs_notificacoes',
    'pending_approvals', 'faturas', 'itens_fatura'
];

async function getSqliteSchema(table) {
    return new Promise((res, rej) => {
        const db = new sqlite3.Database('C:/Users/joaop/OneDrive/Documentos/ANTGRAVITY/renostter-crm/cora-api/cora.sqlite');
        db.all(`PRAGMA table_info(${table})`, (err, cols) => {
            db.close();
            if (err) return rej(err);
            res(cols.map(c => ({ name: c.name, type: c.type, notnull: c.notnull, pk: c.pk })));
        });
    });
}

async function getPgSchema(pool, table) {
    const r = await pool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema='public' AND table_name=$1
        ORDER BY ordinal_position
    `, [table]);
    return r.rows.map(c => ({ name: c.column_name, type: c.data_type, notnull: c.is_nullable === 'NO' }));
}

(async () => {
    const pool = new Pool({ connectionString: 'postgres://postgres@localhost:5432/renostter', ssl: false });
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(' Schema diff: SQLite (cora.sqlite) vs Postgres (renostter)');
    console.log('═══════════════════════════════════════════════════════════════\n');

    for (const table of TABLES_TO_CHECK) {
        let sqliteCols, pgCols;
        try {
            sqliteCols = await getSqliteSchema(table);
        } catch (e) {
            console.log(`❌ ${table}: não existe no SQLite`);
            continue;
        }
        try {
            pgCols = await getPgSchema(pool, table);
        } catch (e) {
            console.log(`❌ ${table}: não existe no Postgres`);
            continue;
        }

        const sqliteNames = new Set(sqliteCols.map(c => c.name));
        const pgNames = new Set(pgCols.map(c => c.name));

        const onlyInSqlite = sqliteCols.filter(c => !pgNames.has(c.name));
        const onlyInPg = pgCols.filter(c => !sqliteNames.has(c.name));

        if (onlyInSqlite.length === 0 && onlyInPg.length === 0) {
            console.log(`✅ ${table}: ${sqliteCols.length} colunas — idênticas`);
        } else {
            console.log(`\n⚠️  ${table} (sqlite: ${sqliteCols.length}, pg: ${pgCols.length}):`);
            if (onlyInSqlite.length > 0) {
                console.log(`   ❌ Faltam no Postgres (${onlyInSqlite.length}):`);
                onlyInSqlite.forEach(c => console.log(`      - ${c.name} (${c.type})`));
            }
            if (onlyInPg.length > 0) {
                console.log(`   ➕ Extras no Postgres (${onlyInPg.length}):`);
                onlyInPg.forEach(c => console.log(`      + ${c.name} (${c.type})`));
            }
        }
    }

    await pool.end();
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
