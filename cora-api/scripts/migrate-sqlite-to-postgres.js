/**
 * migrate-sqlite-to-postgres.js  (versão melhorada — Fase 0 / migração real)
 *
 * Lê o banco SQLite local (cora-api/cora.sqlite) e importa os dados para o
 * Postgres configurado em DATABASE_URL, restrito ao escopo real do cora-api
 * (Middleware de Cobrança).
 *
 * MELHORIAS em relação à versão original:
 *   1. ESCOPO: só migra tabelas que já existem no schema Postgres alvo
 *      (schema-postgres.sql). Tabelas do SQLite que não existem no Postgres
 *      (ex.: as ~47 tabelas do renostter-crm que compartilham o mesmo
 *      arquivo .sqlite) são PULADAS em vez de criadas automaticamente —
 *      evita poluir o Postgres dedicado do ERP com tabelas fora de escopo.
 *   2. SSL explícito na conexão Postgres, no mesmo padrão usado em
 *      cora-api/db/postgres.js (desliga via PGSSLMODE=disable quando
 *      necessário, senão usa TLS com rejectUnauthorized:false).
 *   3. VERIFICAÇÃO PÓS-MIGRAÇÃO: ao final, compara a contagem de linhas de
 *      cada tabela migrada no SQLite vs. a contagem real no Postgres e
 *      reporta qualquer divergência.
 *   4. DRY_RUN=1 (variável de ambiente): mostra o que seria feito (tabelas
 *      em escopo, fora de escopo, contagens) sem gravar nada no Postgres.
 *
 * USO:
 *   node scripts/migrate-sqlite-to-postgres.js
 *   DRY_RUN=1 node scripts/migrate-sqlite-to-postgres.js   (simulação)
 */

const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const { Client } = require('pg');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const SQLITE_PATH = path.resolve(__dirname, '..', 'cora.sqlite');
const PG_URL = process.env.DATABASE_URL || process.argv[2];
const DRY_RUN = process.env.DRY_RUN === '1';

if (!PG_URL) {
    console.error('❌ DATABASE_URL não definida. Configure no .env ou passe como argumento.');
    process.exit(1);
}

if (!fs.existsSync(SQLITE_PATH)) {
    console.error(`❌ Banco SQLite não encontrado em: ${SQLITE_PATH}`);
    process.exit(1);
}

console.log('═══════════════════════════════════════════════════════════════════');
console.log('Renostter ERP (cora-api) — Migration SQLite → Postgres');
if (DRY_RUN) console.log('*** MODO DRY-RUN: nenhuma escrita será feita no Postgres ***');
console.log('═══════════════════════════════════════════════════════════════════');
console.log(`Source: ${SQLITE_PATH}`);
console.log(`Target: ${PG_URL.replace(/:[^:@]+@/, ':***@')}`);
console.log('');

// Tabelas que NÃO devem ser migradas (são internas do SQLite)
const SKIP_TABLES = new Set([
    'sqlite_sequence',
    'sqlite_stat1',
    'sqlite_stat2',
    'sqlite_stat3',
    'sqlite_stat4',
]);

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

async function pgTableExists(pg, table) {
    const r = await pg.query(`
        SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = $1
        ) as exists
    `, [table]);
    return r.rows[0].exists;
}

async function pgRowCount(pg, table) {
    const r = await pg.query(`SELECT COUNT(*) as c FROM "${table}"`);
    return parseInt(r.rows[0].c, 10);
}

async function main() {
    // Aberto em modo somente-leitura: o script nunca escreve no SQLite (só lê e
    // grava no Postgres). Isso evita SQLITE_READONLY quando o arquivo está
    // marcado como WAL mas o processo não tem permissão de escrita no diretório
    // para criar os companheiros -wal/-shm (ex.: após docker cp para um container
    // rodando como usuário não-root).
    const sqliteDb = new sqlite3.Database(SQLITE_PATH, sqlite3.OPEN_READONLY);

    // Melhoria #2: SSL explícito, mesmo padrão de cora-api/db/postgres.js
    const pg = new Client({
        connectionString: PG_URL,
        ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
    });
    await pg.connect();

    console.log('🔍 Lendo schema do SQLite...');
    const allTables = await getSqliteSchema(sqliteDb);
    console.log(`   Encontradas ${allTables.length} tabelas no SQLite (arquivo compartilhado com o renostter-crm).\n`);

    let totalRows = 0;
    let totalErrors = 0;
    const stats = [];          // tabelas migradas (em escopo)
    const outOfScope = [];     // tabelas existentes no SQLite mas fora do schema Postgres do ERP

    for (const table of allTables) {
        try {
            // Melhoria #1: só migra o que já existe no Postgres. Não cria tabelas novas.
            const exists = await pgTableExists(pg, table);
            if (!exists) {
                const rowCount = await getTableCount(sqliteDb, table);
                outOfScope.push({ table, rows: rowCount });
                console.log(`  🚫 ${table.padEnd(30)} fora do escopo do cora-api (não existe no Postgres) — pulando (${rowCount} rows no SQLite)`);
                continue;
            }

            const cols = await getTableInfo(sqliteDb, table);
            const rowCount = await getTableCount(sqliteDb, table);
            const data = await getTableData(sqliteDb, table);

            console.log(`  ✅ ${table.padEnd(30)} em escopo (${rowCount} rows no SQLite)`);

            if (data.length > 0) {
                const pgCols = await getPgColumns(pg, table);
                const pgColNames = new Set(pgCols.map(c => c.column_name));
                // Melhoria: só converte 0/1 -> boolean quando a coluna de destino no
                // Postgres É REALMENTE boolean. Antes, qualquer valor 0/1 virava
                // true/false mesmo em colunas integer/smallint (ex.: bancos_referencia),
                // e o Postgres rejeitava com "invalid input syntax for type smallint: false".
                const pgBooleanCols = new Set(pgCols.filter(c => c.data_type === 'boolean').map(c => c.column_name));
                const validCols = cols.filter(c => pgColNames.has(c.name));
                const validColNames = validCols.map(c => `"${c.name}"`).join(', ');

                if (validCols.length === 0) {
                    console.log(`     ⚠️  Nenhuma coluna compatível entre SQLite e Postgres`);
                    stats.push({ table, sqliteRows: rowCount, inserted: 0, status: 'NO_COMPATIBLE_COLUMNS' });
                    continue;
                }

                const before = await pgRowCount(pg, table);
                if (before > 0) {
                    console.log(`     ⏩ ${before} rows já existem no Postgres, pulando insert (idempotência)`);
                    totalRows += before;
                    stats.push({ table, sqliteRows: rowCount, inserted: before, status: 'ALREADY_MIGRATED' });
                    continue;
                }

                if (DRY_RUN) {
                    console.log(`     🧪 [dry-run] inseriria ${data.length} rows em "${table}"`);
                    stats.push({ table, sqliteRows: rowCount, inserted: 0, status: 'DRY_RUN' });
                    continue;
                }

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
                            if (pgBooleanCols.has(col.name) && (v === 0 || v === 1)) v = !!v;
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
                        for (let r = 0; r < batch.length; r++) {
                            const row = batch[r];
                            const rowValues = validCols.map(c => (pgBooleanCols.has(c.name) && (row[c.name] === 0 || row[c.name] === 1)) ? !!row[c.name] : row[c.name]);
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
                stats.push({ table, sqliteRows: rowCount, inserted, status: 'OK' });
            } else {
                console.log(`     (vazia)`);
                stats.push({ table, sqliteRows: 0, inserted: 0, status: 'OK' });
            }
        } catch (e) {
            totalErrors++;
            stats.push({ table, sqliteRows: 0, inserted: 0, status: 'ERROR', error: e.message });
            console.log(`  ❌ ${table}: ${e.message.substring(0, 150)}`);
        }
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log(DRY_RUN ? '🧪 Dry-run completo (nada foi escrito)' : '✅ Migration completa');
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log(`Tabelas em escopo migradas: ${stats.length}`);
    console.log(`Tabelas fora de escopo (puladas): ${outOfScope.length}`);
    console.log(`Total de rows migrados: ${totalRows}`);
    console.log(`Total de erros: ${totalErrors}`);
    console.log('');
    console.log('📋 Detalhamento (tabelas em escopo):');
    stats.forEach(s => {
        const icon = s.status === 'ERROR' ? '❌' : s.status === 'OK' ? '✅' : s.status === 'ALREADY_MIGRATED' ? '⏩' : s.status === 'DRY_RUN' ? '🧪' : '⚠️';
        console.log(`  ${icon} ${s.table.padEnd(30)} sqlite=${String(s.sqliteRows).padStart(6)}  pg_inserted=${String(s.inserted).padStart(6)}${s.error ? '  — ' + s.error.substring(0, 80) : ''}`);
    });
    if (outOfScope.length > 0) {
        console.log('');
        console.log('🚫 Tabelas do SQLite fora do escopo do cora-api (não migradas, arquivo é compartilhado com renostter-crm):');
        outOfScope.forEach(o => console.log(`     ${o.table.padEnd(30)} ${o.rows} rows`));
    }

    // Melhoria #3: verificação pós-migração — recontagem real no Postgres
    if (!DRY_RUN) {
        console.log('');
        console.log('🔎 Verificação pós-migração (contagem real no Postgres):');
        let mismatches = 0;
        for (const s of stats) {
            if (s.status === 'ERROR' || s.status === 'NO_COMPATIBLE_COLUMNS') continue;
            try {
                const pgCount = await pgRowCount(pg, s.table);
                const ok = pgCount === s.sqliteRows;
                if (!ok) mismatches++;
                console.log(`  ${ok ? '✅' : '❌'} ${s.table.padEnd(30)} sqlite=${s.sqliteRows}  postgres=${pgCount}${ok ? '' : '  <-- DIVERGÊNCIA'}`);
            } catch (e) {
                mismatches++;
                console.log(`  ❌ ${s.table.padEnd(30)} erro ao verificar: ${e.message.substring(0, 100)}`);
            }
        }
        console.log('');
        console.log(mismatches === 0
            ? '✅ Todas as contagens batem entre SQLite e Postgres.'
            : `⚠️  ${mismatches} tabela(s) com divergência de contagem — revisar acima.`);
    }

    console.log('');
    console.log('Próximos passos:');
    console.log('  1. Conferir o relatório de verificação acima.');
    console.log('  2. Confirmar DB_DRIVER=postgres no .env (já deve estar).');
    console.log('  3. Reiniciar app: docker compose restart erp-app (ou equivalente).');
    console.log('  4. Testar login/health: curl -f http://localhost:3000/health');

    sqliteDb.close();
    await pg.end();
}

main().catch(e => {
    console.error('❌ Erro fatal:', e);
    process.exit(1);
});
