/**
 * Setup do Postgres local pra dev/test
 * - Lê pg_hba.conf, troca 'scram-sha-256' por 'trust' em conexões locais
 * - Reinicia o serviço
 * - Cria database 'renostter'
 * - Cria user 'renostter' com password 'dev' (não recomendado em prod)
 */
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PG_PATH = 'C:\\Program Files\\PostgreSQL\\17';
const HBA_FILE = path.join(PG_PATH, 'data', 'pg_hba.conf');
const PSQL = path.join(PG_PATH, 'bin', 'psql.exe');
const PG_CTL = path.join(PG_PATH, 'bin', 'pg_ctl.exe');

function run(cmd, args, opts = {}) {
    return execFileSync(cmd, args, { encoding: 'utf8', ...opts });
}

console.log('1. Backup do pg_hba.conf...');
fs.copyFileSync(HBA_FILE, HBA_FILE + '.bak');
console.log('   ✅ Backup em pg_hba.conf.bak');

console.log('\n2. Trocando scram-sha-256 → trust nas conexões locais (127.0.0.1 e ::1)...');
let hba = fs.readFileSync(HBA_FILE, 'utf8');
const before = hba;
hba = hba.replace(/(host\s+all\s+all\s+127\.0\.0\.1\/32\s+)scram-sha-256/g, '$1trust');
hba = hba.replace(/(host\s+all\s+all\s+::1\/128\s+)scram-sha-256/g, '$1trust');
hba = hba.replace(/(local\s+all\s+all\s+)scram-sha-256/g, '$1trust');
fs.writeFileSync(HBA_FILE, hba);
const changed = (before !== hba);
console.log(`   ${changed ? '✅' : '⚠️ '} Arquivo ${changed ? 'modificado' : 'já estava em trust'}`);

console.log('\n3. Reiniciando serviço postgresql-x64-17...');
try {
    run('powershell', ['-Command', 'Restart-Service postgresql-x64-17 -Force']);
    console.log('   ✅ Serviço reiniciado');
} catch (e) {
    console.log(`   ❌ Falha: ${e.message}`);
    process.exit(1);
}

// Espera o serviço subir
console.log('\n4. Aguardando porta 5432...');
for (let i = 0; i < 20; i++) {
    try {
        const out = run('powershell', ['-Command', 'Get-NetTCPConnection -LocalPort 5432 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1']);
        if (out.includes('5432')) {
            console.log(`   ✅ Porta 5432 escutando (após ${i*500}ms)`);
            break;
        }
    } catch (_) {}
    if (i === 19) {
        console.log('   ❌ Timeout aguardando porta');
        process.exit(1);
    }
    spawnSync('powershell', ['-Command', 'Start-Sleep -Milliseconds 500']);
}

console.log('\n5. Conectando como postgres (sem senha agora)...');
try {
    const out = run(PSQL, ['-U', 'postgres', '-h', 'localhost', '-d', 'postgres', '-c', 'SELECT version();']);
    console.log('   ✅ Conectou:');
    console.log('   ' + out.split('\n')[0]);
} catch (e) {
    console.log(`   ❌ Falha: ${e.message}`);
    process.exit(1);
}

console.log('\n6. Criando database renostter (se não existe)...');
try {
    run(PSQL, ['-U', 'postgres', '-h', 'localhost', '-d', 'postgres', '-c', 'CREATE DATABASE renostter;']);
    console.log('   ✅ Database criado');
} catch (e) {
    if (e.message.includes('already exists')) {
        console.log('   ⚠️  Database já existia (OK)');
    } else {
        console.log(`   ❌ Falha: ${e.message}`);
        process.exit(1);
    }
}

console.log('\n7. Testando conexão no database renostter...');
try {
    const out = run(PSQL, ['-U', 'postgres', '-h', 'localhost', '-d', 'renostter', '-c', 'SELECT current_database(), current_user;']);
    console.log('   ✅ Conectou:');
    out.split('\n').filter(Boolean).forEach(l => console.log('   ' + l));
} catch (e) {
    console.log(`   ❌ Falha: ${e.message}`);
    process.exit(1);
}

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('✅ Setup completo!');
console.log('   DATABASE_URL=postgres://postgres@localhost:5432/renostter');
console.log('   (sem senha porque está em modo trust local)');
console.log('═══════════════════════════════════════════════════════════════');
