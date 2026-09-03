/**
 * migrate-sqlite-to-postgres.js
 *
 * Sprint 22 — Fase 0: Migration do banco SQLite atual para Postgres
 *
 * Lê o banco SQLite local (cora-api/cora.sqlite) e importa
 * todos os dados para o Postgres configurado em DATABASE_URL.
 *
 * USO:
 *   1. Subir o Postgres: docker compose up -d postgres
 *   2. Aguardar inicialização
 *   3. Rodar este script: node cora-api/scripts/migrate-sqlite-to-postgres.js
 *
 * MAPEAMENTO DE TIPOS:
 *   INTEGER PRIMARY KEY (autoincrement) → SERIAL ou BIGSERIAL
 *   TEXT → TEXT
 *   INTEGER → INTEGER ou BIGINT
 *   REAL → DOUBLE PRECISION
 *   DATETIME → TIMESTAMP
 *   BLOB → BYTEA
 *   BOOLEAN → BOOLEAN
 */

const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const { Client } = require('pg');
const dotenv = require('dotenv');

// Carrega .env do projeto
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const SQLITE_PATH = path.resolve(__dirname, '..', 'cora.sqlite');
const PG_URL = process.env.DATABASE_URL || process.argv[2];

if (!PG_URL) {
    console.error('❌ DATABASE_URL não definida. Configure no .env ou passe como argumento.');
    console.error('   Ex: node migrate-sqlite-to-postgres.js "postgresql://user:pass@localhost:5432/db"');
    process.exit(1);
}

if (!fs.existsSync(SQLITE_PATH)) {
    console.error(`❌ Banco SQLite não encontrado em: ${SQLITE_PATH}`);
    process.exit(1);
}

console.log('═══════════════════════════════════════════════════════════════════');
console.log('Renostter CRM — Migration SQLite → Postgres');
console.log('═══════════════════════════════════════════════════════════════════');
console.log(`Source: ${SQLITE_PATH}`);
console.log(`Target: ${PG_URL.replace(/:[^:@]+@/, ':***@')}`);  // esconde senha
console.log('');

// Tabelas que NÃO devem ser migradas (são internas do SQLite)
const SKIP_TABLES = new Set([
    'sqlite_sequence',  // autoincrement metadata
    'sqlite_stat1',     // ANALYZE stats
    'sqlite_stat2',
    'sqlite_stat3',
    'sqlite_stat4',
]);

// Mapeamento de tipo SQLite → Postgres
function mapType(sqliteType, columnName, isPrimaryKey) {
    const t = (sqliteType || '').toUpperCase();
    if (isPrimaryKey && t === 'INTEGER') return 'BIGSERIAL PRIMARY KEY';
    if (t.includes('INT')) return 'BIGINT';
    if (t.includes('CHAR') || t.includes('TEXT') || t.includes('CLOB')) return 'TEXT';
    if (t.includes('REAL') || t.includes('FLOA') || t.includes('DOUB')) return 'DOUBLE PRECISION';
    if (t.includes('BLOB')) return 'BYTEA';
    if (t.includes('BOOL')) return 'BOOLEAN';
    if (t.includes('DATE') || t.includes('TIME')) return 'TIMESTAMP';
    if (t === '' || t === 'NUMERIC' || t === 'DECIMAL') return 'NUMERIC';
    return 'TEXT';  // fallback
}

async function getSqliteSchema(db) {
    return new Promise((resolve, reject) => {
        db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name", (err, rows) => {
            if (err) return reject(err);
            resolve(rows.map(r => r.name).filter(n => !SKIP_TABLES.has(n)));
        });
    });
}

function getTableInfo(db, table) {
    return new Promise((resolve, reject) => {
        db.all(`PRAGMA table_info(${table})`, (err, cols) => {
            if (err) return reject(err);
            resolve(cols);
        });
    });
}

function getTableCount(db, table) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT COUNT(*) as c FROM ${table}`, (err, row) => {
            if (err) return reject(err);
            resolve(row.c);
        });
    });
}

function getTableData(db, table) {
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM ${table}`, (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });
}

async function getPgColumns(pg, table) {
    const r = await pg.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
    `, [table]);
    return r.rows;
}

async function main() {
    const sqliteDb = new sqlite3.Database(SQLITE_PATH);
    const pg = new Client({ connectionString: PG_URL });
    await pg.connect();

    console.log('🔍 Lendo schema do SQLite...');
    const tables = await getSqliteSchema(sqliteDb);
    console.log(`   Encontradas ${tables.length} tabelas.\n`);

    let totalRows = 0;
    let totalErrors = 0;
    const stats = [];

    for (const table of tables) {
        try {
            const cols = await getTableInfo(sqliteDb, table);
            const rowCount = await getTableCount(sqliteDb, table);
            const data = await getTableData(sqliteDb, table);

            // Verifica se a tabela já existe no Postgres
            const pgExists = await pg.query(`
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = $1
                ) as exists
            `, [table]);

            if (pgExists.rows[0].exists) {
                console.log(`  ⏩ ${table} (já existe, pulando criação)`);
            } else {
                // Cria tabela
                const colDefs = cols.map((c, i) => {
                    const isPK = c.pk > 0;
                    const type = mapType(c.type, c.name, isPK);
                    let def = `"${c.name}" ${type}`;
                    if (c.notnull && !isPK) def += ' NOT NULL';
                    if (c.dflt_value !== null) {
                        const v = String(c.dflt_value).trim();
                        // Não inclui DEFAULT para SERIAL/BIGSERIAL
                        if (!type.includes('SERIAL')) {
                            // trata aspas/aspas duplas
                            if (/^-?\d+(\.\d+)?$/.test(v)) def += ` DEFAULT ${v}`;
                            else if (v === 'CURRENT_TIMESTAMP') def += ' DEFAULT CURRENT_TIMESTAMP';
                            else if (v === 'NULL') {}  // skip
                            else def += ` DEFAULT ${v.replace(/^'|'$/g, "'")}`;
                        }
                    }
                    if (isPK && c.pk === 1) def += ' PRIMARY KEY';
                    return def;
                });

                const createSQL = `CREATE TABLE "${table}" (\n  ${colDefs.join(',\n  ')}\n)`;

                await pg.query(createSQL);
                console.log(`  ✅ ${table} (criada, ${cols.length} colunas)`);
            }

            // Insere dados em batch
            if (data.length > 0) {
                const colNames = cols.map(c => `"${c.name}"`).join(', ');

                // Pega apenas colunas que existem no Postgres
                const pgCols = await getPgColumns(pg, table);
                const pgColNames = new Set(pgCols.map(c => c.column_name));
                const validCols = cols.filter(c => pgColNames.has(c.name));
                const validColNames = validCols.map(c => `"${c.name}"`).join(', ');

                if (validCols.length === 0) {
                    console.log(`     ⚠️  Nenhuma coluna compatível`);
                    continue;
                }

                // Trunca tabela se tiver dados (idempotência)
                const before = await pg.query(`SELECT COUNT(*) as c FROM "${table}"`);
                if (parseInt(before.rows[0].c) > 0) {
                    console.log(`     ⏩ ${before.rows[0].c} rows já existem, pulando insert`);
                    totalRows += before.rows[0].c;
                    continue;
                }

                // Batch insert (100 rows por vez)
                const BATCH_SIZE = 100;
                let inserted = 0;
                for (let i = 0; i < data.length; i += BATCH_SIZE) {
                    const batch = data.slice(i, i + BATCH_SIZE);
                    const values = [];
                    const placeholders = [];

                    for (let r = 0; r < batch.length; r++) {
                        const row = batch[r];
                        const rowPlaceholders = validCols.map((_, c) => `$${r * validCols.length + c + 1}`).join(', ');
                        placeholders.push(`(${rowPlaceholders})`);
                        for (const col of validCols) {
                            let v = row[col.name];
                            // converte tipos boolean (SQLite usa 0/1)
                            if (v === 0 || v === 1) v = !!v;
                            // converte JSON strings (SQLite armazena como TEXT)
                            if (typeof v === 'string' && (col.name.endsWith('_json') || col.name === 'variables_json')) {
                                try { v = JSON.parse(v); } catch { /* keep as string */ }
                            }
                            values.push(v);
                        }
                    }

                    const sql = `INSERT INTO "${table}" (${validColNames}) VALUES ${placeholders.join(', ')} ON CONFLICT DO NOTHING`;
                    try {
                        await pg.query(sql, values);
                        inserted += batch.length;
                    } catch (e) {
                        // Fallback row-by-row
                        for (let r = 0; r < batch.length; r++) {
                            const row = batch[r];
                            const rowValues = validCols.map(c => row[c.name] === 0 || row[c.name] === 1 ? !!row[c.name] : row[c.name]);
                            const rowPlaceholders = validCols.map((_, c) => `$${c + 1}`).join(', ');
                            try {
                                await pg.query(`INSERT INTO "${table}" (${validColNames}) VALUES (${rowPlaceholders}) ON CONFLICT DO NOTHING`, rowValues);
                                inserted++;
                            } catch (rowErr) {
                                totalErrors++;
                                console.log(`     ❌ Erro em ${table}[${r}]: ${rowErr.message.substring(0, 100)}`);
                            }
                        }
                    }
                }

                console.log(`     📊 ${inserted}/${rowCount} rows migrados${inserted < rowCount ? ` (${rowCount - inserted} erros)` : ''}`);
                totalRows += inserted;
            } else {
                console.log(`     (vazia)`);
            }

            stats.push({ table, rows: data.length, status: 'OK' });
        } catch (e) {
            totalErrors++;
            stats.push({ table, rows: 0, status: 'ERROR', error: e.message });
            console.log(`  ❌ ${table}: ${e.message.substring(0, 150)}`);
        }
    }

    sqliteDb.close();
    await pg.end();

    console.log('');
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('✅ Migration completa');
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log(`Total de tabelas: ${stats.length}`);
    console.log(`Total de rows:    ${totalRows}`);
    console.log(`Total de erros:   ${totalErrors}`);
    console.log('');
    console.log('📋 Detalhamento por tabela:');
    stats.forEach(s => {
        const status = s.status === 'OK' ? '✅' : '❌';
        console.log(`  ${status} ${s.table.padEnd(35)} ${String(s.rows).padStart(6)} rows${s.error ? ' — ' + s.error.substring(0, 80) : ''}`);
    });
    console.log('');
    console.log('Próximos passos:');
    console.log('  1. Validar contagens: SELECT COUNT(*) FROM <tabela>;');
    console.log('  2. Atualizar .env: DB_DRIVER=postgres');
    console.log('  3. Reiniciar app: docker compose restart app');
    console.log('  4. Testar login: curl -X POST http://localhost:3000/api/auth/login -d \'{"email":"demo@renostter.com","password":"senha123"}\' -H "Content-Type: application/json"');
}

main().catch(e => {
    console.error('❌ Erro fatal:', e);
    process.exit(1);
});
