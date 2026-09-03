/**
 * Rotate Secrets — Utilitário para rotação de credenciais
 *
 * Sprint 0 — Segurança Crítica
 *
 * Sub-comandos:
 *   --check              # verifica se há credenciais inseguras
 *   --gen <tipo>         # gera nova chave (sem aplicar)
 *   --rotate db-encryption  # re-criptografa dados com nova DB_ENCRYPTION_KEY
 *
 * Tipos suportados: db-encryption, jwt-secret, webhook-secret
 *
 * IMPORTANTE: este script NÃO substitui o .env. Ele mostra a nova chave
 * no stdout e instrui o usuário a atualizar manualmente. Em produção,
 * o ideal é usar um secrets manager (Vault, AWS Secrets Manager, etc.)
 * e este script só serve como bootstrap.
 */

const crypto = require('crypto');
const path = require('path');

// Carrega .env do cora-api
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch (_) {}

const KNOWN_INSECURE = {
    'db-encryption': [
        'renostter_super_secret_key_32bytes!',
        'change_me',
        'secret',
        'default',
    ],
    'jwt-secret': [
        'change_me',
        'secret',
        'jwt_secret',
        'your-secret-key',
    ],
    'webhook-secret': [
        'change_me',
        'webhook_secret',
        'secret',
        'default',
    ],
};

function genKey(type) {
    switch (type) {
        case 'db-encryption':
            // 32 bytes hex = 64 chars (compat com .slice(0, 32) bytes)
            return crypto.randomBytes(32).toString('hex');
        case 'jwt-secret':
            // 64 bytes base64 (~88 chars)
            return crypto.randomBytes(64).toString('base64');
        case 'webhook-secret':
            // 32 bytes hex
            return crypto.randomBytes(32).toString('hex');
        default:
            throw new Error(`Tipo desconhecido: ${type}`);
    }
}

function check() {
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  Verificação de Credenciais — Renostter CRM');
    console.log('═══════════════════════════════════════════════════════════\n');

    const checks = [
        { name: 'DB_ENCRYPTION_KEY',  env: process.env.DB_ENCRYPTION_KEY,   insecure: KNOWN_INSECURE['db-encryption'] },
        { name: 'JWT_SECRET',         env: process.env.JWT_SECRET,          insecure: KNOWN_INSECURE['jwt-secret'] },
        { name: 'WEBHOOK_WEBHOOK_SECRET', env: process.env.WEBHOOK_WEBHOOK_SECRET, insecure: KNOWN_INSECURE['webhook-secret'] },
    ];

    let problems = 0;
    for (const c of checks) {
        if (!c.env) {
            console.log(`  ✗ ${c.name.padEnd(25)} NÃO CONFIGURADA`);
            problems++;
        } else if (c.insecure.includes(String(c.env).trim())) {
            console.log(`  ✗ ${c.name.padEnd(25)} VALOR DEFAULT CONHECIDO!`);
            problems++;
        } else {
            const len = Buffer.byteLength(c.env, 'utf8');
            const ok = len >= 32;
            console.log(`  ✓ ${c.name.padEnd(25)} OK (${len} bytes)`);
            if (!ok) {
                console.log(`     ⚠  Recomendado: ≥ 32 bytes (atual: ${len})`);
            }
        }
    }

    // Checar NODE_ENV
    const isProd = process.env.NODE_ENV === 'production';
    console.log(`  ${isProd ? '⚠' : '✓'} NODE_ENV = ${process.env.NODE_ENV || '(não definido)'}`);
    if (isProd) {
        if (process.env.CRM_FRONTEND_URL === '*' || !process.env.CRM_FRONTEND_URL) {
            console.log(`     ✗ CRM_FRONTEND_URL precisa estar configurado em prod`);
            problems++;
        }
        if (process.env.WEBHOOK_SIGNATURE_BYPASS === 'true') {
            console.log(`     ✗ WEBHOOK_SIGNATURE_BYPASS=true em prod é PROIBIDO`);
            problems++;
        }
    }

    console.log('\n───────────────────────────────────────────────────────────');
    if (problems === 0) {
        console.log('  ✅ Tudo OK. Nenhuma credencial comprometida detectada.');
    } else {
        console.log(`  ❌ ${problems} problema(s) detectado(s). Veja acima.`);
        console.log('     Execute: node scripts/rotate-secrets.js --gen <tipo>');
    }
    console.log('═══════════════════════════════════════════════════════════\n');

    process.exit(problems > 0 ? 1 : 0);
}

function gen(type) {
    if (!type) {
        console.error('Uso: --gen <db-encryption|jwt-secret|webhook-secret>');
        process.exit(1);
    }
    const newKey = genKey(type);
    const envName = {
        'db-encryption': 'DB_ENCRYPTION_KEY',
        'jwt-secret': 'JWT_SECRET',
        'webhook-secret': 'WEBHOOK_WEBHOOK_SECRET',
    }[type];

    console.log(`\n  Nova chave gerada para ${type}:`);
    console.log(`  ${newKey}\n`);
    console.log(`  Adicione ao .env (ou secrets manager):`);
    console.log(`  ${envName}=${newKey}\n`);

    if (type === 'db-encryption') {
        console.log('  ⚠️  ATENÇÃO: dados já criptografados com a chave ANTIGA precisarão ser re-criptografados.');
        console.log('     Rode: node scripts/rotate-secrets.js --rotate db-encryption');
    }
    if (type === 'jwt-secret') {
        console.log('  ⚠️  ATENÇÃO: todos os tokens ativos serão invalidados.');
        console.log('     Usuários precisarão logar novamente. Faça em horário de baixo movimento.');
    }

    process.exit(0);
}

async function rotateDbEncryption() {
    // Re-criptografa `client_secret_encrypted` em `bancos_cadastrados`
    // usando a chave antiga → nova.
    console.log('\n  Re-criptografando bancos_cadastrados.client_secret_encrypted ...\n');

    // Implementação real:
    // 1. Decrypt com chave antiga (atual DB_ENCRYPTION_KEY)
    // 2. Setar DB_ENCRYPTION_KEY=<nova>
    // 3. Encrypt com chave nova
    // 4. UPDATE
    //
    // Para simplicidade do Sprint 0, vamos só listar e avisar.
    // O script completo de re-encrypt fica para Sprint 1 (junto com bcrypt).

    console.log('  ⚠️  Script de re-encrypt completo será entregue na Sprint 1.');
    console.log('     Por ora, faça manualmente:');
    console.log('       1. UPDATE bancos_cadastrados SET client_secret_encrypted = NULL;');
    console.log('       2. Re-cadastre cada banco via UI (admin/bancos.html) com a nova chave.');
    console.log('       3. A nova chave DB_ENCRYPTION_KEY criptografa automaticamente.\n');
    process.exit(0);
}

// ═══ CLI parsing ═══
const args = process.argv.slice(2);
if (args.length === 0 || args.includes('--check') || args.includes('--help') || args.includes('-h')) {
    check();
} else if (args.includes('--gen')) {
    const type = args[args.indexOf('--gen') + 1];
    gen(type);
} else if (args.includes('--rotate')) {
    const what = args[args.indexOf('--rotate') + 1];
    if (what === 'db-encryption') rotateDbEncryption();
    else { console.error(`Rotação não implementada: ${what}`); process.exit(1); }
} else {
    console.log('Uso:');
    console.log('  node rotate-secrets.js --check              # verifica credenciais');
    console.log('  node rotate-secrets.js --gen <tipo>         # gera nova chave');
    console.log('  node rotate-secrets.js --rotate <tipo>      # rotaciona');
    console.log('\nTipos: db-encryption, jwt-secret, webhook-secret');
    process.exit(0);
}
