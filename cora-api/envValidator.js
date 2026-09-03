/**
 * Env Validation — Fail-fast no boot se variáveis críticas faltarem
 *
 * Sprint 0 — Segurança Crítica
 *
 * Princípio: a aplicação NUNCA DEVE SUBIR EM PRODUÇÃO se:
 *   1. Faltar variáveis de ambiente obrigatórias
 *   2. DB_ENCRYPTION_KEY tiver um valor default conhecido (commitado no repo)
 *   3. JWT_SECRET não estiver configurado (precisa estar)
 *   4. WEBHOOK_WEBHOOK_SECRET não estiver configurado (precisa estar)
 *
 * Em desenvolvimento (NODE_ENV !== 'production'):
 *   - Apenas avisa (warning). Não bloqueia o boot.
 *
 * Variáveis obrigatórias em produção:
 *   - DB_ENCRYPTION_KEY         (32+ chars hex; NUNCA o default do código)
 *   - JWT_SECRET                (HMAC SHA-256/512; mínimo 32 bytes)
 *   - WEBHOOK_WEBHOOK_SECRET    (assinatura HMAC dos webhooks Cora)
 *   - CORA_CLIENT_ID            (identificador do app Cora)
 *   - CORA_CERT_PATH            (caminho do certificado mTLS)
 *   - CORA_KEY_PATH             (caminho da chave privada mTLS)
 *   - NODE_ENV=production       (sinaliza modo prod)
 */

const REQUIRED_IN_PROD = [
    'DB_ENCRYPTION_KEY',
    'JWT_SECRET',
    'WEBHOOK_WEBHOOK_SECRET',
    'CORA_CLIENT_ID',
    'CORA_CERT_PATH',
    'CORA_KEY_PATH',
];

// Valores que JAMAIS devem ser aceitos em produção. Qualquer um desses na env
// = credencial não rotacionada = boot bloqueado.
const KNOWN_INSECURE_VALUES = {
    DB_ENCRYPTION_KEY: [
        'renostter_super_secret_key_32bytes!',
        'change_me',
        'change_me_please',
        'default',
        'default-key',
        'default-public-key',
        'secret',
        '12345678901234567890123456789012',
    ],
    JWT_SECRET: [
        'change_me',
        'secret',
        'jwt_secret',
        'my-secret',
        'your-secret-key',
        'default',
        'dev-only-insecure-jwt-secret-do-not-use-in-prod',
    ],
    WEBHOOK_WEBHOOK_SECRET: [
        'change_me',
        'webhook_secret',
        'secret',
        'default',
    ],
    CORA_CLIENT_ID: [
        'change_me',
        'test',
        'demo',
    ],
};

// SECURITY HARDENING 3 — V22: secrets manager integration
// Em prod, valida que secrets NÃO estão vazios e têm entropia mínima.
// Suporta referências a cofre via prefixo `vault://path/to/secret` ou `ssm://name`.
// (Implementação completa de fetch remoto é opcional — em prod, o ideal é
//  usar Doppler/AWS SSM/Vault sidecar que injeta as envs no boot do container.)
const SECRET_REF_PATTERNS = [
    /^vault:\/\//i,        // HashiCorp Vault
    /^ssm:\/\//i,          // AWS SSM Parameter Store
    /^doppler:\/\//i,      // Doppler
    /^aws-secrets:\/\//i,  // AWS Secrets Manager
    /^gcp-secret:\/\//i,   // GCP Secret Manager
];

function isSecretReference(value) {
    if (typeof value !== 'string') return false;
    return SECRET_REF_PATTERNS.some((re) => re.test(value));
}

const STRONG_KEY_LENGTH = 32;
const MIN_JWT_SECRET_LENGTH = 32;
const VALID_DB_DRIVERS = ['sqlite', 'postgres'];

function validateEnv() {
    const isProd = process.env.NODE_ENV === 'production';
    const missing = [];
    const warnings = [];

    // ─── 1. Variáveis obrigatórias em produção ───
    if (isProd) {
        for (const key of REQUIRED_IN_PROD) {
            const v = process.env[key];
            if (!v || String(v).trim() === '') {
                missing.push(key);
                continue;
            }

            // SECURITY HARDENING 3 — V22: aceitar referências a cofre em prod
            // (vault://, ssm://, doppler://) — ideal para deploy em cloud
            if (isSecretReference(v)) {
                // TODO Sprint 20: implementar fetch do cofre e substituir
                warnings.push(`${key} usa referência a cofre externo (${v.split('://')[0]}://). Configure o sidecar para resolver antes do boot.`);
                continue;
            }

            // ─── 2. Detectar valores default/placeholder conhecidos ───
            const insecure = KNOWN_INSECURE_VALUES[key] || [];
            if (insecure.includes(String(v).trim())) {
                missing.push(`${key} (valor default/placeholder detectado em produção — ROTACIONE IMEDIATAMENTE)`);
            }
        }
    }

    // ─── 3. Validação de comprimento da DB_ENCRYPTION_KEY ───
    const encKey = process.env.DB_ENCRYPTION_KEY;
    if (encKey) {
        // Buffer.from(key, 'utf8').slice(0, 32) — mede em BYTES, não chars
        const encKeyBytes = Buffer.byteLength(encKey, 'utf8');
        if (encKeyBytes < STRONG_KEY_LENGTH) {
            if (isProd) {
                missing.push(`DB_ENCRYPTION_KEY muito curta: ${encKeyBytes} bytes (mínimo ${STRONG_KEY_LENGTH} bytes)`);
            } else {
                warnings.push(`DB_ENCRYPTION_KEY tem ${encKeyBytes} bytes; recomendado ≥ ${STRONG_KEY_LENGTH}.`);
            }
        }
    }

    // ─── 4. Validação de comprimento do JWT_SECRET ───
    const jwtSecret = process.env.JWT_SECRET;
    if (jwtSecret && Buffer.byteLength(jwtSecret, 'utf8') < MIN_JWT_SECRET_LENGTH) {
        if (isProd) {
            missing.push(`JWT_SECRET muito curto: ${Buffer.byteLength(jwtSecret, 'utf8')} bytes (mínimo ${MIN_JWT_SECRET_LENGTH})`);
        } else {
            warnings.push(`JWT_SECRET tem ${Buffer.byteLength(jwtSecret, 'utf8')} bytes; recomendado ≥ ${MIN_JWT_SECRET_LENGTH}.`);
        }
    }

    // ─── 5. CORS: pelo menos uma origin deve estar configurada em prod ───
    if (isProd && !process.env.CRM_FRONTEND_URL) {
        missing.push('CRM_FRONTEND_URL (origens CORS permitidas em produção)');
    } else if (process.env.CRM_FRONTEND_URL === '*') {
        if (isProd) {
            missing.push('CRM_FRONTEND_URL não pode ser "*" em produção (allowlist obrigatória)');
        } else {
            warnings.push('CRM_FRONTEND_URL="*" — CORS totalmente permissivo (OK só em dev).');
        }
    }

    // ─── 6. DB_DRIVER ───
    let dbDriver = (process.env.DB_DRIVER || 'sqlite').toLowerCase();
    if (!VALID_DB_DRIVERS.includes(dbDriver)) {
        if (isProd) {
            missing.push(`DB_DRIVER inválido: "${process.env.DB_DRIVER}" (válidos: ${VALID_DB_DRIVERS.join(', ')})`);
        } else {
            warnings.push(`DB_DRIVER inválido: "${process.env.DB_DRIVER}" — usando 'sqlite' como fallback.`);
            process.env.DB_DRIVER = 'sqlite';
            dbDriver = 'sqlite';
        }
    }

    if (dbDriver === 'postgres') {
        const hasUrl = !!process.env.DATABASE_URL;
        const hasParts = !!(process.env.PGHOST && process.env.PGUSER && process.env.PGPASSWORD && process.env.PGDATABASE);
        if (!hasUrl && !hasParts) {
            missing.push('DATABASE_URL (obrigatório quando DB_DRIVER=postgres — ou PGHOST/PGUSER/PGPASSWORD/PGDATABASE)');
        }
        if (hasUrl && !/^postgres(ql)?:\/\//.test(process.env.DATABASE_URL)) {
            missing.push('DATABASE_URL malformado — esperado: postgres://USER:PASS@HOST:PORT/DBNAME');
        }
        if (isProd && !process.env.PGSSLMODE) {
            warnings.push('DB_DRIVER=postgres em produção sem PGSSLMODE definido.');
        }
    }

    // ─── 7. ALLOW_MOCK em produção ───
    if (isProd && process.env.ALLOW_MOCK === 'true') {
        missing.push('ALLOW_MOCK=true em produção — gateways financeiros em modo mock são PROIBIDOS em prod');
    }

    // ─── 8. WEBHOOK_SIGNATURE_BYPASS em produção ───
    if (isProd && process.env.WEBHOOK_SIGNATURE_BYPASS === 'true') {
        missing.push('WEBHOOK_SIGNATURE_BYPASS=true em produção — verificação de assinatura de webhook é OBRIGATÓRIA em prod');
    }

    // ─── 9. AUTH_MODE=legacy em produção (V10) ───
    // Modo legacy permite setar role via headers — vetor crítico de privilege escalation.
    // Em prod, SÓ 'jwt' é aceito.
    if (isProd && (process.env.AUTH_MODE === 'legacy' || process.env.AUTH_MODE === 'dual')) {
        missing.push(`AUTH_MODE="${process.env.AUTH_MODE}" em produção — apenas 'jwt' é aceito. Remova AUTH_MODE ou use AUTH_MODE=jwt`);
    }
    if (process.env.AUTH_MODE === 'legacy' && !isProd) {
        warnings.push('AUTH_MODE=legacy em desenvolvimento — headers manipuláveis (x-user-role) podem escalar privilégio. Use só em testes locais.');
    }

    // ════════════════════════════════════════
    // FAIL-FAST
    // ════════════════════════════════════════
    if (missing.length > 0) {
        console.error('\n╔════════════════════════════════════════════════════════════════╗');
        console.error('║  ✗ ERRO FATAL — Variáveis de ambiente obrigatórias ausentes  ║');
        console.error('╚════════════════════════════════════════════════════════════════╝');
        for (const m of missing) {
            console.error(`   • ${m}`);
        }
        console.error('\nServidor NÃO será iniciado. Configure as variáveis e tente novamente.');
        console.error('Documentação: SECURITY.md (seção "Procedimento de rotação de credenciais")\n');
        process.exit(1);
    }

    if (warnings.length > 0) {
        console.warn('\n⚠️  Avisos de configuração:');
        for (const w of warnings) {
            console.warn(`   • ${w}`);
        }
        console.warn('');
    }

    return {
        isProd,
        dbDriver,
        corsOrigin: process.env.CRM_FRONTEND_URL || '*',
        envOk: missing.length === 0,
        // Expor flags úteis para o resto do código
        authMode: process.env.AUTH_MODE || (isProd ? 'jwt' : 'legacy'),
        allowMock: process.env.ALLOW_MOCK === 'true' || !isProd,
        webhookBypass: process.env.WEBHOOK_SIGNATURE_BYPASS === 'true' && !isProd,
    };
}

module.exports = { validateEnv, isSecretReference, KNOWN_INSECURE_VALUES };
