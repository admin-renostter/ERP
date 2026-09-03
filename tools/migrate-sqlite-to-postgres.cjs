/**
 * Migração de dados: SQLite → Postgres
 *
 * Uso:
 *   1. Crie o projeto no Supabase, rode schema-postgres.sql no SQL Editor
 *   2. Copie a DATABASE_URL para o .env do cora-api
 *   3. node tools/migrate-sqlite-to-postgres.cjs
 *
 * O que faz:
 *   - Lê cada tabela do SQLite (cora.sqlite)
 *   - Insere no Postgres em batches
 *   - Mantém IDs originais (TEXT PRIMARY KEY)
 *   - Loga progresso e valida contagens
 *
 * Idempotente? NÃO. Rodar 2x duplica dados. Se precisar rerodar, limpe o Postgres antes.
 */

const path = require('path');
const fs = require('fs');

// Carrega .env do cora-api
require('dotenv').config({ path: path.join(__dirname, '..', 'cora-api', '.env') });

const sqlite3 = require(path.join(__dirname, '..', 'cora-api', 'node_modules', 'sqlite3')).verbose();
const { Pool } = require(path.join(__dirname, '..', 'cora-api', 'node_modules', 'pg'));

const SQLITE_PATH = path.join(__dirname, '..', 'cora-api', 'cora.sqlite');
const PG_URL = process.env.DATABASE_URL;

if (!PG_URL) {
    console.error('❌ DATABASE_URL não definido. Configure no .env do cora-api.');
    process.exit(1);
}
if (!fs.existsSync(SQLITE_PATH)) {
    console.error(`❌ SQLite não encontrado em ${SQLITE_PATH}`);
    process.exit(1);
}

const sqlite = new sqlite3.Database(SQLITE_PATH);
// SSL config: respeita PGSSLMODE=disable (dev local), caso contrário usa SSL flexível (Supabase, Neon)
const sslConfig = process.env.PGSSLMODE === 'disable'
    ? false
    : { rejectUnauthorized: false };
const pool = new Pool({ connectionString: PG_URL, ssl: sslConfig });

// Mapeamento tabela → colunas (ordem importa!)
// Adicione/ajuste conforme o schema evolui
const TABLES = [
    { name: 'bancos_referencia',  idCol: 'id', type: 'simple' },
    { name: 'bancos_cadastrados', idCol: 'id', type: 'simple' },
    { name: 'cobrancas',          idCol: 'id', type: 'simple' },
    { name: 'faturas',            idCol: 'id', type: 'simple' },
    { name: 'itens_fatura',       idCol: 'id', type: 'simple' },
    { name: 'cobrancas_recorrentes', idCol: 'id', type: 'simple' },
    { name: 'webhooks_recebidos', idCol: 'id', type: 'simple' },
    { name: 'logs_integracao_cora', idCol: 'id', type: 'simple' },
    { name: 'tokens_integracao',  idCol: 'id', type: 'simple' },
    { name: 'logs_auditoria',     idCol: 'id', type: 'simple' },
    { name: 'configuracoes_integracao', idCol: 'id', type: 'simple' },
    { name: 'cora_logs',          idCol: 'id', type: 'simple' },
    { name: 'logs_notificacoes',  idCol: 'id', type: 'simple' },
    { name: 'pending_approvals',  idCol: 'id', type: 'simple' }
];

// Colunas que são JSON em SQLite (TEXT) e devem virar JSONB no Postgres
const JSON_COLUMNS = {
    webhooks_recebidos: ['raw_payload'],
    logs_integracao_cora: ['payload', 'response'],
    cora_logs: ['payload', 'response'],
    logs_auditoria: ['detalhes_json', 'detalhes_json_full'],
    logs_notificacoes: ['provider_response'],
    cobrancas_recorrentes: ['customer_payload', 'services'],
    bancos_cadastrados: []  // client_secret_encrypted é TEXT puro
};

function sqliteGetAll(sql, params = []) {
    return new Promise((res, rej) => sqlite.all(sql, params, (e, rows) => e ? rej(e) : res(rows)));
}
function pgQuery(text, params = []) {
    return pool.query(text, params);
}

function convertRow(tableName, row) {
    if (!row) return row;
    const jsonCols = JSON_COLUMNS[tableName] || [];
    for (const col of jsonCols) {
        if (row[col] && typeof row[col] === 'string') {
            // Valida que é JSON, mas MANTE COMO STRING — o driver `pg` se confunde
            // quando recebe object puro (manda OID errado). Mantendo como string
            // + cast `::jsonb` no INSERT, o Postgres parseia corretamente.
            try {
                JSON.parse(row[col]); // valida
            } catch {
                // mantém como string se não for JSON válido
            }
        }
    }
    return row;
}

async function getColumnNames(tableName) {
    const rows = await sqliteGetAll(`PRAGMA table_info(${tableName})`);
    return rows.map(r => r.name);
}

async function migrateTable({ name, idCol, type }) {
    console.log(`\n→ Migrando ${name}...`);
    const cols = await getColumnNames(name);
    if (cols.length === 0) {
        console.log(`   ⚠️ Tabela vazia ou inexistente, pulando.`);
        return { inserted: 0, skipped: 0 };
    }
    const rows = await sqliteGetAll(`SELECT * FROM ${name}`);
    if (rows.length === 0) {
        console.log(`   (sem dados)`);
        return { inserted: 0, skipped: 0 };
    }

    let inserted = 0, skipped = 0;

    for (const rawRow of rows) {
        const row = convertRow(name, rawRow);
        // Adiciona cast ::jsonb nas colunas JSON (sem isso, driver `pg` manda OID errado)
        const jsonCols = JSON_COLUMNS[name] || [];
        const placeholders = cols.map((c, i) => jsonCols.includes(c) ? `$${i + 1}::jsonb` : `$${i + 1}`).join(',');
        const colNames = cols.map(c => `"${c}"`).join(',');
        const values = cols.map(c => row[c]);

        try {
            await pgQuery(
                `INSERT INTO ${name} (${colNames}) VALUES (${placeholders})
                 ON CONFLICT (${idCol}) DO NOTHING`,
                values
            );
            inserted++;
        } catch (err) {
            skipped++;
            if (skipped < 3) {
                console.log(`   ⚠️ Pulou ${name}.${row[idCol]}: ${err.message.substring(0, 100)}`);
            }
        }
    }

    console.log(`   ✅ ${inserted} inseridos, ${skipped} pulados (de ${rows.length} total)`);
    return { inserted, skipped };
}

async function main() {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║   Migração SQLite → Postgres (Supabase)                   ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
    console.log(`SQLite: ${SQLITE_PATH}`);
    console.log(`Postgres: ${PG_URL.replace(/:[^:@]+@/, ':***@')}`); // esconde senha

    try {
        // Testa conexão
        await pgQuery('SELECT 1');
        console.log('\n✅ Conexão Postgres OK');
    } catch (e) {
        console.error(`\n❌ Falha ao conectar no Postgres: ${e.message}`);
        process.exit(1);
    }

    const startTime = Date.now();
    let totalInserted = 0, totalSkipped = 0;

    for (const t of TABLES) {
        try {
            const { inserted, skipped } = await migrateTable(t);
            totalInserted += inserted;
            totalSkipped += skipped;
        } catch (e) {
            console.error(`   ❌ Erro em ${t.name}: ${e.message}`);
        }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`Total: ${totalInserted} inseridos, ${totalSkipped} pulados, em ${elapsed}s`);

    // Atualiza sequences (SERIAL) para o maior ID existente
    console.log('\n→ Atualizando sequences (SERIAL)...');
    const seqTables = ['bancos_referencia','bancos_cadastrados','itens_fatura','cobrancas_recorrentes',
        'webhooks_recebidos','logs_integracao_cora','tokens_integracao','logs_auditoria',
        'configuracoes_integracao','cora_logs','logs_notificacoes'];
    for (const t of seqTables) {
        try {
            const r = await pgQuery(`SELECT COALESCE(MAX(id), 0) as max_id FROM ${t}`);
            const maxId = r.rows[0].max_id;
            if (maxId > 0) {
                await pgQuery(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), $1, true)`, [maxId]);
                console.log(`   ${t}: sequence → ${maxId}`);
            }
        } catch (e) {
            console.log(`   ⚠️ ${t}: ${e.message.substring(0, 80)}`);
        }
    }

    console.log('\n✅ Migração concluída!');
    console.log('\nPróximos passos:');
    console.log('  1. No .env do cora-api: DB_DRIVER=postgres');
    console.log('  2. Reinicie o backend');
    console.log('  3. Rode os smoke tests para validar');

    await pool.end();
    sqlite.close();
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });