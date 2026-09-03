/**
 * Driver Postgres — substituto do SQLite
 *
 * Mantém **a mesma API** do driver SQLite (`dbRun`, `dbGet`, `dbAll`) para
 * não exigir mudanças no código de aplicação. Usa `pg.Pool` para gerenciar
 * conexões.
 *
 * Traduções automáticas (pra deixar o código de aplicação o mais portável possível):
 *   `?` (placeholder posicional) → `$1, $2, ...` (numerado)
 *   `datetime('now', '-N units')` → `NOW() - INTERVAL 'N units'`  (não conseguimos 100% — ver nota)
 *   `last_insert_rowid()` → `LASTVAL()`
 *
 * Limitações conhecidas:
 *   - `RAISE(ABORT, 'msg')` em triggers precisa ser ajustado manualmente
 *   - `julianday` e `strftime` precisam ser trocados por `EXTRACT(EPOCH FROM ...)`
 *     e `TO_CHAR()` no código de aplicação (não dá pra fazer regex seguro).
 *   - `INSERT OR REPLACE` precisa virar `ON CONFLICT DO UPDATE` no código.
 *
 * Uso:
 *   const { dbRun, dbGet, dbAll, pool, driver } = require('./db/postgres');
 *   // API idêntica ao SQLite
 */

const { Pool } = require('pg');
const path = require('path');

// Carrega .env do cora-api (silencioso se não tiver)
try {
    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (_) { /* dotenv opcional */ }

// Lazy init — só falha se alguém realmente chamar dbRun/dbGet/dbAll
let _pool = null;
function getPool() {
    if (_pool) return _pool;
    const connectionString =
        process.env.DATABASE_URL ||
        (process.env.PGHOST && `postgres://${process.env.PGUSER}:${process.env.PGPASSWORD}@${process.env.PGHOST}:${process.env.PGPORT || 5432}/${process.env.PGDATABASE}`);
    if (!connectionString) {
        throw new Error('[Postgres] DATABASE_URL não definido. Configure no .env do cora-api.');
    }
    _pool = new Pool({
        connectionString,
        ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
        max: parseInt(process.env.PG_POOL_MAX) || 10,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 10_000
    });
    _pool.on('error', (err) => {
        console.error('[Postgres] Erro inesperado no pool:', err.message);
    });
    return _pool;
}

// Proxy "pool" lazy — só tenta conectar quando alguém usar
const pool = new Proxy({}, {
    get(_, prop) { return getPool()[prop]; }
});

/**
 * Converte placeholders `?` para `$1, $2, ...` numerados.
 */
function convertPlaceholders(sql) {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
}

/**
 * Adapta SQL escrito para SQLite para o dialeto Postgres.
 * Transformações automáticas (só aplica se DB_DRIVER for postgres — o driver
 * SQLite não chama este adapter).
 *
 *   INSERT OR REPLACE INTO T (...) VALUES (...)
 *     → INSERT INTO T (...) VALUES (...) ON CONFLICT (id) DO UPDATE SET <all cols>
 *
 *   julianday(x) - julianday(y) <= N
 *     → EXTRACT(EPOCH FROM (x::date - y::date))/86400 <= N
 *
 *   strftime('%Y-%m', d)
 *     → TO_CHAR(d, 'YYYY-MM')
 *
 *   datetime('now', '-N units')
 *     → NOW() - INTERVAL 'N units'
 *
 *   RAISE(ABORT, 'msg')   (em triggers — DDL, não aqui)
 */
function adaptSqliteToPostgres(sql) {
    let out = sql;

    // 1) INSERT OR REPLACE INTO tbl (cols) VALUES (...)
    //    → INSERT INTO tbl (cols) VALUES (...) ON CONFLICT (id) DO UPDATE SET col=excluded.col, ...
    out = out.replace(
        /INSERT\s+OR\s+REPLACE\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/gi,
        (m, table, cols, vals) => {
            const colList = cols.split(',').map(c => c.trim()).filter(Boolean);
            const updateSets = colList
                .filter(c => c.toLowerCase() !== 'id')
                .map(c => `"${c}" = EXCLUDED."${c}"`)
                .join(', ');
            return `INSERT INTO ${table} (${colList.map(c => `"${c}"`).join(', ')}) VALUES (${vals.trim()})` +
                   (updateSets ? ` ON CONFLICT (id) DO UPDATE SET ${updateSets}` : ' ON CONFLICT (id) DO NOTHING');
        }
    );

    // 2) julianday(x) - julianday(y)  →  EXTRACT(EPOCH FROM (x::timestamp - y::timestamp))/86400
    // IMPORTANTE: usar ::timestamp (não ::date) porque EXTRACT(EPOCH FROM ...)
    // só aceita interval/timestamp. ::date - ::date retorna integer (dias), não interval.
    out = out.replace(/julianday\(([^)]+)\)\s*-\s*julianday\(([^)]+)\)/gi,
        (m, a, b) => `EXTRACT(EPOCH FROM (${a.trim()}::timestamp - ${b.trim()}::timestamp))/86400`);

    // 3) strftime('%Y-%m', d)  →  TO_CHAR(d, 'YYYY-MM')
    out = out.replace(/strftime\(\s*'([^']+)'\s*,\s*([^)]+)\s*\)/gi,
        (m, fmt, expr) => {
            // Mapeia formatos comuns SQLite → Postgres
            const fmtMap = {
                '%Y-%m': "'YYYY-MM'",
                '%Y-%m-%d': "'YYYY-MM-DD'",
                '%H:%M:%S': "'HH24:MI:SS'",
                '%Y-%m-%d %H:%M:%S': "'YYYY-MM-DD HH24:MI:SS'"
            };
            const pgFmt = fmtMap[fmt] || `'${fmt}'`;
            return `TO_CHAR(${expr.trim()}, ${pgFmt})`;
        });

    // 4) datetime('now', '-7 days')  →  NOW() - INTERVAL '7 days'
    //    datetime('now', '-24 hours') → NOW() - INTERVAL '24 hours'
    //    (o sinal de menos vai FORA do INTERVAL; o INTERVAL é sempre positivo)
    out = out.replace(/datetime\(\s*'now'\s*,\s*'(-)?\s*(\d+)\s+(\w+)'\s*\)/gi,
        (m, sign, num, unit) => {
            const op = sign ? '-' : '+';
            return `NOW() ${op} INTERVAL '${num} ${unit}'`;
        });

    // 5) datetime('now')  →  NOW()
    out = out.replace(/datetime\(\s*'now'\s*\)/gi, () => 'NOW()');

    // 5b) date('now', '-N units')  →  CURRENT_DATE - INTERVAL 'N units'  (era bug 17/07)
    //     date('now')               →  CURRENT_DATE
    out = out.replace(/date\(\s*'now'\s*,\s*'(-)?\s*(\d+)\s+(\w+)'\s*\)/gi,
        (m, sign, num, unit) => {
            const op = sign ? '-' : '+';
            return `CURRENT_DATE ${op} INTERVAL '${num} ${unit}'`;
        });
    out = out.replace(/date\(\s*'now'\s*\)/gi, () => 'CURRENT_DATE');

    return out;
}

/**
 * dbRun(sql, params) → Promise<{lastID, changes}>
 *   Compatível com a API do sqlite3.
 */
async function dbRun(sql, params = []) {
    // ORDEM IMPORTA: primeiro converte `?` → `$1, $2` (placeholders), DEPOIS adapta
    // sintaxe SQLite → Postgres. Se inverter, o adapter aplica `::date` em `?` que vira
    // `$1::date` (inválido — cast não funciona em placeholder).
    const text = adaptSqliteToPostgres(convertPlaceholders(sql));
    const upper = sql.trim().toUpperCase();
    // SQLite usa RETURNING implícito em algumas queries; Postgres precisa de RETURNING id
    let textWithReturning = text;
    let wantsReturning = false;
    if (upper.startsWith('INSERT') && !upper.includes('RETURNING')) {
        if (/\bid\b/i.test(sql) || /INSERT INTO \w+/i.test(sql)) {
            textWithReturning = `${text} RETURNING id`;
            wantsReturning = true;
        }
    }
    return pool.query(textWithReturning, params).then(res => ({
        lastID: wantsReturning ? res.rows[0]?.id : null,
        changes: res.rowCount || 0,
        rows: res.rows
    }));
}

async function dbGet(sql, params = []) {
    // Ver nota em dbRun sobre a ordem (convertPlaceholders ANTES de adaptSqliteToPostgres)
    const text = adaptSqliteToPostgres(convertPlaceholders(sql));
    const res = await pool.query(text, params);
    return res.rows[0];
}

async function dbAll(sql, params = []) {
    const text = adaptSqliteToPostgres(convertPlaceholders(sql));
    const res = await pool.query(text, params);
    return res.rows;
}

/**
 * Fecha o pool (usar em scripts de migração / shutdown).
 */
async function close() {
    await pool.end();
}

module.exports = {
    pool,
    dbRun,
    dbGet,
    dbAll,
    close,
    adaptSqliteToPostgres,
    convertPlaceholders,
    driver: 'postgres'
};