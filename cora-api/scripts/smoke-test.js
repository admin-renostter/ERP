/**
 * Smoke Test — Valida boot do server SEM precisar de DB/rede externa
 *
 * Uso:
 *   node scripts/smoke-test.js
 *
 * O que faz:
 *   1. Carrega todos os módulos principais (sem fazer require do server.js)
 *   2. Verifica que exports esperados estão presentes
 *   3. Roda testes isolados de cada módulo
 *   4. Reporta OK / FALHA com detalhes
 *
 * Por que existe: validar o build quebrou/funcionou em CI sem subir nada.
 */

const path = require('path');
const fs = require('fs');

const root = path.resolve(__dirname, '..');
const coraApiRoot = root;

let passed = 0, failed = 0, skipped = 0;
const results = [];

function test(name, fn) {
    return Promise.resolve()
        .then(() => fn())
        .then(() => {
            passed++;
            results.push({ name, status: 'OK' });
            console.log(`  ✓ ${name}`);
        })
        .catch(e => {
            failed++;
            results.push({ name, status: 'FAIL', error: e.message });
            console.error(`  ✗ ${name}`);
            console.error(`    ${e.message}`);
        });
}

function skip(name, reason) {
    skipped++;
    results.push({ name, status: 'SKIP', reason });
    console.log(`  ⏭  ${name} (${reason})`);
}

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

function section(title) {
    console.log(`\n  [${title}]`);
}

async function main() {
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  Renostter CRM — Smoke Test');
    console.log('  Valida boot e carregamento de módulos SEM subir servidor');
    console.log('═══════════════════════════════════════════════════════════\n');

    // ─── 1. Estrutura de arquivos ───
    section('1. Estrutura de arquivos');
    const expectedFiles = [
        'server.js',
        'envValidator.js',
        'crypto.js',
        'database.js',
        'package.json',
        '.env.example',
        'middleware/authJWT.js',
        'middleware/webhookSignature.js',
        'middleware/rateLimiter.js',
        'routes/auth.js',
        'routes/health.js',
        'routes/uploads.js',
        'routes/mcp.js',
        'infra/redis.js',
        'infra/s3.js',
        'mcp/server.js',
        'mcp/tools.js',
        'mcp/audit.js',
        'llm/client.js',
        'llm/rag.js',
        'openclaw/adapter.js',
    ];
    for (const f of expectedFiles) {
        await test(`arquivo ${f}`, () => {
            assert(fs.existsSync(path.join(coraApiRoot, f)), `arquivo não encontrado: ${f}`);
        });
    }

    // ─── 2. Carregamento de módulos (lazy, sem side effects) ───
    section('2. Carregamento de módulos');
    await test('middleware/authJWT.js carrega', () => {
        const m = require('../middleware/authJWT');
        assert(typeof m.authMiddleware === 'function', 'authMiddleware não é função');
        assert(typeof m.signAccessToken === 'function', 'signAccessToken não é função');
        assert(typeof m.verifyToken === 'function', 'verifyToken não é função');
        assert(typeof m.requireRole === 'function', 'requireRole não é função');
    });
    await test('middleware/webhookSignature.js carrega', () => {
        const m = require('../middleware/webhookSignature');
        assert(typeof m.verifyWebhookSignature === 'function', 'verifyWebhookSignature não é função');
    });
    await test('middleware/rateLimiter.js carrega', () => {
        const m = require('../middleware/rateLimiter');
        assert(typeof m === 'function' || typeof m.RateLimiter === 'function', 'RateLimiter não é classe exportada');
    });

    // ─── 3. Auth + JWT (isolado) ───
    section('3. Auth (JWT)');
    process.env.JWT_SECRET = 'smoke-test-secret-32-bytes-minimum-foo-bar-baz';
    const { signAccessToken, verifyToken } = require('../middleware/authJWT');
    let token;
    await test('signAccessToken emite JWT', () => {
        token = signAccessToken({ userId: 'usr-1', role: 'admin', name: 'Smoke' });
        assert(typeof token === 'string' && token.split('.').length === 3, 'token malformado');
    });
    await test('verifyToken decodifica payload', () => {
        const p = verifyToken(token);
        assert(p.userId === 'usr-1', 'userId errado');
        assert(p.role === 'admin', 'role errado');
    });

    // ─── 4. Crypto (AES-256-GCM) ───
    section('4. Crypto');
    process.env.DB_ENCRYPTION_KEY = 'a'.repeat(40);
    const { encrypt, decrypt } = require('../crypto');
    await test('encrypt → decrypt roundtrip', () => {
        const enc = encrypt('hello world');
        const dec = decrypt(enc);
        assert(dec === 'hello world', 'roundtrip falhou');
    });

    // ─── 5. Redis (sem rede — só estrutura) ───
    section('5. Redis (estrutura)');
    await test('infra/redis.js carrega sem erro', () => {
        const m = require('../infra/redis');
        assert(typeof m.connectRedis === 'function');
        assert(typeof m.isRedisAvailable === 'function');
        assert(typeof m.getRedis === 'function');
    });

    // ─── 6. S3 ───
    section('6. S3 (estrutura)');
    await test('infra/s3.js carrega sem erro', () => {
        const m = require('../infra/s3');
        assert(typeof m.getPresignedDownloadUrl === 'function');
        assert(typeof m.getPresignedUploadUrl === 'function');
        assert(typeof m.isS3Available === 'function');
    });
    await test('S3 sem env vars → isS3Available=false', () => {
        const m = require('../infra/s3');
        // Reset module pra pegar envs fresh
        delete process.env.S3_BUCKET;
        delete process.env.S3_ACCESS_KEY;
        delete process.env.S3_SECRET_KEY;
        delete require.cache[require.resolve('../infra/s3')];
        const m2 = require('../infra/s3');
        assert(m2.isS3Available() === false, 'deveria ser false sem env');
    });

    // ─── 7. MCP ───
    section('7. MCP');
    await test('mcp/tools.js expõe 8 tools', () => {
        const { TOOLS } = require('../mcp/tools');
        assert(Array.isArray(TOOLS), 'TOOLS não é array');
        assert(TOOLS.length === 8, `esperado 8 tools, obtido ${TOOLS.length}`);
        const names = TOOLS.map(t => t.name);
        const expected = [
            'listar_faturas_cliente',
            'consultar_status_chamado',
            'abrir_chamado',
            'consultar_cliente',
            'listar_equipamentos_cliente',
            'agendar_visita_tecnica',
            'solicitar_segunda_via_boleto',
            'consultar_contrato',
        ];
        for (const e of expected) {
            assert(names.includes(e), `tool ausente: ${e}`);
        }
    });
    await test('cada tool tem name, description, inputSchema, handler', () => {
        const { TOOLS } = require('../mcp/tools');
        for (const t of TOOLS) {
            assert(t.name, 'tool sem name');
            assert(t.description && t.description.length > 30, `tool ${t.name} com description curta`);
            assert(t.inputSchema, `tool ${t.name} sem inputSchema`);
            assert(t.inputSchema.type === 'object', `tool ${t.name} inputSchema não é object`);
            assert(typeof t.handler === 'function', `tool ${t.name} sem handler`);
        }
    });
    await test('mcp/audit.js expõe funções', () => {
        const m = require('../mcp/audit');
        assert(typeof m.auditMcpInvocation === 'function');
        assert(typeof m.listRecent === 'function');
    });
    await test('openclaw/adapter.js gera YAML válido', () => {
        const m = require('../openclaw/adapter');
        const yaml = m.generateOpenClawConfigYaml('https://api.test.com');
        assert(yaml.includes('agent:'), 'YAML sem agent:');
        assert(yaml.includes('tools:'), 'YAML sem tools:');
        assert(yaml.includes('listar_faturas_cliente'), 'YAML sem tool esperada');
    });

    // ─── 8. LLM ───
    section('8. LLM (estrutura)');
    await test('llm/client.js carrega sem LLM_API_KEY', () => {
        delete process.env.LLM_API_KEY;
        delete require.cache[require.resolve('../llm/client')];
        const m = require('../llm/client');
        assert(typeof m.sendMessage === 'function');
        assert(typeof m.runWithTools === 'function');
        assert(m.isLlmAvailable() === false, 'deveria ser false sem API key');
    });
    await test('llm/rag.js expõe funções de busca', () => {
        const m = require('../llm/rag');
        assert(typeof m.search === 'function');
        assert(typeof m.embed === 'function');
        assert(typeof m.buildIndex === 'function');
    });

    // ─── 9. Routes ───
    section('9. Routes');
    await test('routes/health.js é um router Express', () => {
        const m = require('../routes/health');
        assert(typeof m === 'function', 'não é router function');
    });
    await test('routes/uploads.js é um router', () => {
        const m = require('../routes/uploads');
        assert(typeof m === 'function', 'não é router function');
    });
    await test('routes/auth.js é um router', () => {
        const m = require('../routes/auth');
        assert(typeof m === 'function', 'não é router function');
    });
    await test('routes/mcp.js é um router', () => {
        const m = require('../routes/mcp');
        assert(typeof m === 'function', 'não é router function');
    });

    // ─── 10. envValidator ───
    section('10. envValidator');
    await test('validateEnv roda sem erro em dev', () => {
        process.env.NODE_ENV = 'development';
        process.env.DB_ENCRYPTION_KEY = 'a'.repeat(40);
        process.env.JWT_SECRET = 'a'.repeat(40);
        process.env.WEBHOOK_WEBHOOK_SECRET = 'a'.repeat(40);
        process.env.CORA_CLIENT_ID = 'cid';
        process.env.CORA_CERT_PATH = '/x';
        process.env.CORA_KEY_PATH = '/y';
        process.env.CRM_FRONTEND_URL = 'http://localhost:8080';
        delete require.cache[require.resolve('../envValidator')];
        const { validateEnv } = require('../envValidator');
        const r = validateEnv();
        assert(r.isProd === false, 'deveria ser dev');
        assert(r.envOk === true, 'envOk deveria ser true em dev');
    });

    // ═══ Relatório final ═══
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log(`  Total: ${passed + failed + skipped} | ✓ ${passed} | ✗ ${failed} | ⏭  ${skipped}`);
    console.log('═══════════════════════════════════════════════════════════\n');

    if (failed > 0) {
        console.error('  ❌ Há falhas. Veja acima antes de continuar.\n');
        process.exit(1);
    } else {
        console.log('  ✅ Smoke test passou. Sistema pronto para subir.\n');
        process.exit(0);
    }
}

main().catch(e => {
    console.error('Erro fatal no smoke test:', e);
    process.exit(1);
});
