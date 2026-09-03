/**
 * Sanity check do SQL adapter — valida transformações sem precisar do Postgres.
 */
const { adaptSqliteToPostgres, convertPlaceholders } = require('../../cora-api/db/postgres');

let passed = 0, failed = 0;
function check(name, ok, detail = '') {
    if (ok) { console.log(`  ✅ ${name}${detail ? ' — ' + detail : ''}`); passed++; }
    else    { console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); failed++; }
}

console.log('\n=== Sanity check do SQL adapter ===\n');

// 1) INSERT OR REPLACE
{
    const in_ = `INSERT OR REPLACE INTO cobrancas_recorrentes
        (contract_id, client_id, gateway_provider, valor, frequency, next_due_date, active, customer_payload, services)
        VALUES (?,?,?,?,?,?,1,?,?)`;
    const out = adaptSqliteToPostgres(in_);
    check('INSERT OR REPLACE → ON CONFLICT',
        out.includes('ON CONFLICT (id) DO UPDATE SET'),
        out.match(/ON CONFLICT.*$/m)?.[0]?.substring(0, 80) + '...');
    check('INSERT OR REPLACE mantém contract_id no UPDATE',
        out.includes('"contract_id" = EXCLUDED."contract_id"'));
    check('INSERT OR REPLACE NÃO inclui id no SET',
        !out.includes('"id" = EXCLUDED'));
}

// 2) julianday
{
    const in_ = `SELECT
        CASE
            WHEN (julianday(?) - julianday(data_vencimento)) <= 30 THEN '0-30 dias'
            WHEN (julianday(?) - julianday(data_vencimento)) <= 60 THEN '31-60 dias'
            ELSE '90+ dias'
        END as bucket
        FROM cobrancas`;
    const out = adaptSqliteToPostgres(in_);
    check('julianday → EXTRACT(EPOCH FROM ...::timestamp)',
        out.includes('EXTRACT(EPOCH FROM') && out.includes('::timestamp'),
        '::timestamp (não ::date) — necessário pra EXTRACT(EPOCH)');
    check('julianday mantém 2 argumentos',
        (out.match(/EXTRACT/g) || []).length === 2);
    // BUGFIX 17/07: juliday com placeholder `?` não pode virar `?::timestamp` (placeholder não tem tipo)
    // O cast deve ser aplicado APÓS convertPlaceholders, em `$1`
    // NOTA: este teste é só pra documentar o uso INSEGURO. O uso correto (test 2b) faz
    // convertPlaceholders ANTES de adaptSqliteToPostgres.
    check('julianday com placeholder (uso direto, sem convertPlaceholders): gera `?::timestamp`',
        out.includes('?::timestamp'),
        'Documenta que o adapter sozinho não sabe lidar com placeholders — ordem importa');
}

// 2b) REGRESSÃO: ordem correta = convertPlaceholders ANTES de adaptSqliteToPostgres
{
    const in_ = `SELECT * FROM cobrancas WHERE created_at < julianday(?) - julianday(data_vencimento)`;
    const out = adaptSqliteToPostgres(convertPlaceholders(in_));
    check('Ordem correta: $1::timestamp (não ?::timestamp, não ::date)',
        out.includes('$1::timestamp') && !out.includes('?::') && !out.includes('::date'),
        'convertPlaceholders + ::timestamp (não ::date) — necessário pra EXTRACT(EPOCH)');
}

// 3) strftime
{
    const in_ = `SELECT strftime('%Y-%m', data_vencimento) as mes FROM cobrancas`;
    const out = adaptSqliteToPostgres(in_);
    check('strftime → TO_CHAR',
        out.includes("TO_CHAR(data_vencimento, 'YYYY-MM')"),
        out);
}

// 4) datetime('now')
{
    const in1 = `AND created_at < datetime('now', '-24 hours')`;
    const out1 = adaptSqliteToPostgres(in1);
    check('datetime(now, -24 hours) → NOW() - INTERVAL',
        out1.includes("NOW() - INTERVAL '24 hours'"),
        out1);

    const in2 = `AND created_at < datetime('now', '-7 days')`;
    const out2 = adaptSqliteToPostgres(in2);
    check('datetime(now, -7 days) → NOW() - INTERVAL',
        out2.includes("NOW() - INTERVAL '7 days'"),
        out2);

    const in3 = `SELECT datetime('now')`;
    const out3 = adaptSqliteToPostgres(in3);
    check('datetime(now) → NOW()',
        out3.includes('NOW()') && !out3.includes('INTERVAL'));
}

// 4b) date('now', ...) — BUGFIX 17/07 (faltava no adapter)
{
    const in1 = `WHERE data_vencimento >= date('now', '-6 months')`;
    const out1 = adaptSqliteToPostgres(in1);
    check('date(now, -6 months) → CURRENT_DATE - INTERVAL',
        out1.includes("CURRENT_DATE - INTERVAL '6 months'"),
        out1);

    const in2 = `SELECT date('now')`;
    const out2 = adaptSqliteToPostgres(in2);
    check('date(now) → CURRENT_DATE',
        out2.includes('CURRENT_DATE') && !out2.includes('INTERVAL'));
}

// 5) Convert placeholders
{
    const sql = `INSERT INTO t (a,b,c) VALUES (?,?,?)`;
    const out = convertPlaceholders(sql);
    check('? → $1, $2, $3',
        out === `INSERT INTO t (a,b,c) VALUES ($1,$2,$3)`,
        out);
}

// 6) Caso real completo (CobrancaManager emitirCobranca idempotência)
{
    const in_ = `SELECT * FROM cobrancas WHERE contract_id = ? AND data_vencimento = ? AND status IN ('PENDING','OPEN')`;
    const out = adaptSqliteToPostgres(in_);
    const final = convertPlaceholders(out);
    check('Query complexa idempotência',
        final === `SELECT * FROM cobrancas WHERE contract_id = $1 AND data_vencimento = $2 AND status IN ('PENDING','OPEN')`);
}

console.log(`\n${'─'.repeat(50)}`);
console.log(`Total: ${passed + failed} | ✅ ${passed} | ❌ ${failed}`);

if (failed > 0) process.exit(1);