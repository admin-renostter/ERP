/**
 * Sanity check do envValidator — cobre os 4 cenários críticos
 * do driver Postgres. Roda em subprocessos com env controlado
 * (não toca nas variáveis reais do .env).
 *
 * Uso: node tools/dev/test-env-validator.cjs
 */
const { spawnSync } = require('child_process');
const path = require('path');

const NODE = process.execPath;
const ROOT = path.resolve(__dirname, '..', '..');
const ENTRY = path.join(ROOT, 'cora-api', 'envValidator.js');

let passed = 0, failed = 0;
function check(name, ok, detail = '') {
    if (ok) { console.log(`  ✅ ${name}${detail ? ' — ' + detail : ''}`); passed++; }
    else    { console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); failed++; }
}

// Helper: roda o validator em subprocesso com env controlado.
//   envPatch  = objeto com variáveis a setar/sobrescrever
//   exitCode  = exit code esperado (0=ok, 1=falha fatal)
//   expectIn  = regex que DEVE aparecer no stdout/stderr combinado
//   expectNotIn = regex que NÃO deve aparecer
function runValidator(envPatch, { exitCode, expectIn, expectNotIn }) {
    const env = { ...process.env, ...envPatch, NODE_ENV: envPatch.NODE_ENV || 'development' };
    // Garante que não há DB_DRIVER/DATABASE_URL herdado do .env (passamos explicitamente)
    if (!('DB_DRIVER' in envPatch)) delete env.DB_DRIVER;
    if (!('DATABASE_URL' in envPatch)) delete env.DATABASE_URL;

    // Carrega o módulo, executa validateEnv(), captura o retorno e exit code
    const script = `
        process.exit = ((orig) => (code) => { orig(code || 0); })(process.exit);
        const v = require(${JSON.stringify(ENTRY)});
        try {
            const r = v.validateEnv();
            console.log('__RESULT__' + JSON.stringify(r));
            process.exit(0);
        } catch (e) {
            console.error('__ERROR__' + e.message);
            process.exit(1);
        }
    `;
    const r = spawnSync(NODE, ['-e', script], { env, encoding: 'utf8' });
    return { stdout: r.stdout || '', stderr: r.stderr || '', status: r.status };
}

console.log('\n=== Sanity check do envValidator (DB driver) ===\n');

// 1) Default (sem DB_DRIVER) → deve aceitar como sqlite
{
    const r = runValidator({}, { exitCode: 0 });
    const ok = r.stdout.includes('"dbDriver":"sqlite"') && r.status === 0;
    check('Default (sem DB_DRIVER) → aceita como sqlite', ok, `status=${r.status}`);
}

// 2) DB_DRIVER=sqlite explícito → ok
{
    const r = runValidator({ DB_DRIVER: 'sqlite' }, { exitCode: 0 });
    const ok = r.stdout.includes('"dbDriver":"sqlite"') && r.status === 0;
    check('DB_DRIVER=sqlite explícito → ok', ok, `status=${r.status}`);
}

// 3) DB_DRIVER=postgres SEM DATABASE_URL → deve falhar (missing)
{
    const r = runValidator({ DB_DRIVER: 'postgres' }, { exitCode: 0 });
    const ok = r.stderr.includes('DATABASE_URL') && r.status === 1;
    check('DB_DRIVER=postgres sem DATABASE_URL → fail', ok, `status=${r.status}`);
}

// 4) DB_DRIVER=postgres COM DATABASE_URL válida → ok
{
    const r = runValidator({
        DB_DRIVER: 'postgres',
        DATABASE_URL: 'postgres://user:pass@host:5432/db'
    }, { exitCode: 0 });
    const ok = r.stdout.includes('"dbDriver":"postgres"') && r.status === 0;
    check('DB_DRIVER=postgres + DATABASE_URL válida → ok', ok, `status=${r.status}`);
}

// 5) DATABASE_URL malformado → deve falhar
{
    const r = runValidator({
        DB_DRIVER: 'postgres',
        DATABASE_URL: 'http://errado'
    }, { exitCode: 0 });
    const ok = r.stderr.includes('malformado') && r.status === 1;
    check('DATABASE_URL malformado → fail', ok, `status=${r.status}`);
}

// 6) DB_DRIVER inválido em dev → warning + fallback sqlite
{
    const r = runValidator({ DB_DRIVER: 'oracle' }, { exitCode: 0 });
    const ok = r.stdout.includes('"dbDriver":"sqlite"') && r.status === 0 && r.stderr.includes('inválido');
    check('DB_DRIVER inválido (dev) → fallback sqlite + warning', ok, `status=${r.status}`);
}

// 7) Postgres via partes (PGHOST/PGUSER/etc) sem DATABASE_URL → ok
{
    const r = runValidator({
        DB_DRIVER: 'postgres',
        PGHOST: 'localhost',
        PGUSER: 'postgres',
        PGPASSWORD: 'x',
        PGDATABASE: 'renostter'
    }, { exitCode: 0 });
    const ok = r.stdout.includes('"dbDriver":"postgres"') && r.status === 0;
    check('DB_DRIVER=postgres via partes (PGHOST/PGUSER/...) → ok', ok, `status=${r.status}`);
}

console.log(`\n${'─'.repeat(50)}`);
console.log(`Total: ${passed + failed} | ✅ ${passed} | ❌ ${failed}`);

if (failed > 0) process.exit(1);
