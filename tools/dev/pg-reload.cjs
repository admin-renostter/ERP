// Tenta reloadar pg_hba.conf via pg_ctl reload
const { execFileSync } = require('child_process');
const PG_CTL = 'C:\\Program Files\\PostgreSQL\\17\\bin\\pg_ctl.exe';

console.log('Tentando pg_ctl reload...');
try {
    const out = execFileSync(PG_CTL, [
        'reload',
        '-D', 'C:\\Program Files\\PostgreSQL\\17\\data'
    ], { encoding: 'utf8' });
    console.log('✅ Reload OK:', out);
} catch (e) {
    console.log('❌ Falha:', e.message);
    console.log('Stderr:', e.stderr?.toString());
}
