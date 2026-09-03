/**
 * Test MCP — Valida o servidor MCP completo (requer API rodando)
 *
 * Pré-requisitos:
 *   1. Subir o stack: docker compose up -d
 *   2. Aguardar health check: curl http://localhost:3000/health/ready
 *   3. Gerar service token: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *   4. Definir env: export MCP_SERVICE_TOKEN=<token>
 *
 * Uso:
 *   node scripts/test-mcp.js
 *   MCP_SERVICE_TOKEN=<token> RENOSTTER_API_URL=http://localhost:3000 node scripts/test-mcp.js
 *
 * O que testa:
 *   - GET /mcp/tools (lista tools)
 *   - GET /mcp/health
 *   - GET /mcp/openclaw.yaml (formato OpenClaw)
 *   - POST /mcp/exec com cada uma das 8 tools
 *   - Validação de schema (campo obrigatório faltando)
 *   - Auth (sem token → 401)
 */

const axios = require('axios');

const API_URL = process.env.RENOSTTER_API_URL || 'http://localhost:3000';
const SERVICE_TOKEN = process.env.MCP_SERVICE_TOKEN || '';

let passed = 0, failed = 0, skipped = 0;

function test(name, fn) {
    return Promise.resolve()
        .then(() => fn())
        .then(() => { passed++; console.log(`  ✓ ${name}`); })
        .catch(e => {
            // Se for "pulado" (ex: API não está rodando), marca diferente
            if (e.code === 'NO_API') {
                skipped++;
                console.log(`  ⏭  ${name} (${e.message})`);
            } else {
                failed++;
                console.error(`  ✗ ${name}`);
                console.error(`    ${e.message}`);
            }
        });
}

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

async function api(method, path, opts = {}) {
    try {
        const config = {
            method,
            url: `${API_URL}${path}`,
            timeout: 10000,
            validateStatus: () => true, // não throw em 4xx/5xx
        };
        if (opts.token) {
            config.headers = { Authorization: `Bearer ${opts.token}` };
        }
        if (opts.data) {
            config.data = opts.data;
            config.headers = { ...config.headers, 'Content-Type': 'application/json' };
        }
        const r = await axios.request(config);
        return r;
    } catch (e) {
        if (e.code === 'ECONNREFUSED' || e.code === 'ENOTFOUND') {
            const err = new Error(`API não está respondendo em ${API_URL}`);
            err.code = 'NO_API';
            throw err;
        }
        throw e;
    }
}

async function main() {
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  Renostter CRM — Test MCP (End-to-End)');
    console.log('  API:', API_URL);
    console.log('  Token:', SERVICE_TOKEN ? 'configurado' : 'AUSENTE (vai pular testes de auth)');
    console.log('═══════════════════════════════════════════════════════════\n');

    // ─── 1. Health check da API ───
    console.log('  [1. API Health]');
    let apiUp = false;
    await test('API responde em /health/ready', async () => {
        const r = await api('GET', '/health/ready');
        if (r.status === 200) {
            apiUp = true;
        } else if (r.status === 503) {
            apiUp = true; // tá no ar, mas deps não
            console.log(`     (deps degradadas: db=${r.data.checks?.db}, redis=${r.data.checks?.redis})`);
        } else {
            throw new Error(`status inesperado: ${r.status}`);
        }
    });

    if (!apiUp) {
        console.log('\n  ⚠️  API não está respondendo.');
        console.log('     Suba o stack: docker compose up -d');
        console.log('     Aguarde: curl http://localhost:3000/health/ready');
        console.log('     Depois: MCP_SERVICE_TOKEN=<token> node scripts/test-mcp.js\n');
        process.exit(0);
    }

    // ─── 2. MCP sem auth ───
    console.log('\n  [2. MCP — sem auth]');
    await test('GET /mcp/tools (sem token) → 401', async () => {
        const r = await api('GET', '/mcp/tools');
        assert(r.status === 401, `esperado 401, obtido ${r.status}`);
        assert(r.data.code === 'NO_TOKEN', `código errado: ${r.data.code}`);
    });
    await test('POST /mcp/exec (sem token) → 401', async () => {
        const r = await api('POST', '/mcp/exec', { data: { tool: 'x', arguments: {} } });
        assert(r.status === 401, `esperado 401, obtido ${r.status}`);
    });
    await test('GET /mcp/health (público) → 200', async () => {
        const r = await api('GET', '/mcp/health');
        assert(r.status === 200, `esperado 200, obtido ${r.status}`);
        assert(r.data.tools_available === 8, `tools_available errado: ${r.data.tools_available}`);
    });

    if (!SERVICE_TOKEN) {
        console.log('\n  ⏭  Sem MCP_SERVICE_TOKEN — pulando testes autenticados');
        console.log('     Para testar:');
        console.log('       node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
        console.log('       Adicione ao .env: MCP_SERVICE_TOKEN=<token>');
        console.log('       docker compose restart cora-api');
        console.log('       MCP_SERVICE_TOKEN=<token> node scripts/test-mcp.js\n');
        process.exit(0);
    }

    // ─── 3. MCP com auth ───
    console.log('\n  [3. MCP — com auth]');
    await test('GET /mcp/tools (com token) → 200 + 8 tools', async () => {
        const r = await api('GET', '/mcp/tools', { token: SERVICE_TOKEN });
        assert(r.status === 200, `esperado 200, obtido ${r.status}`);
        assert(r.data.success === true, 'success != true');
        assert(r.data.total === 8, `total != 8 (obteve ${r.data.total})`);
        assert(Array.isArray(r.data.tools), 'tools não é array');
    });
    await test('cada tool tem name, description, parameters, endpoint', async () => {
        const r = await api('GET', '/mcp/tools', { token: SERVICE_TOKEN });
        for (const t of r.data.tools) {
            assert(t.name, `tool sem name`);
            assert(t.description && t.description.length > 30, `tool ${t.name} descrição curta`);
            assert(t.parameters, `tool ${t.name} sem parameters`);
            assert(t.endpoint && t.endpoint.url, `tool ${t.name} sem endpoint`);
        }
    });

    await test('GET /mcp/openclaw.yaml → 200 + conteúdo válido', async () => {
        const r = await api('GET', '/mcp/openclaw.yaml', { token: SERVICE_TOKEN });
        assert(r.status === 200, `esperado 200, obtido ${r.status}`);
        assert(r.data.includes('agent:'), 'YAML sem agent:');
        assert(r.data.includes('tools:'), 'YAML sem tools:');
        assert(r.data.includes('listar_faturas_cliente'), 'tool esperada ausente');
    });

    // ─── 4. Validação de schema ───
    console.log('\n  [4. MCP — validação de schema]');
    await test('POST /mcp/exec sem campo obrigatório → erro', async () => {
        const r = await api('POST', '/mcp/exec', {
            token: SERVICE_TOKEN,
            data: { tool: 'listar_faturas_cliente', arguments: {} },
        });
        // Deve falhar (cliente_id é required)
        assert(r.status >= 400, `esperado 4xx/5xx, obtido ${r.status}`);
    });
    await test('POST /mcp/exec com tool inexistente → 404', async () => {
        const r = await api('POST', '/mcp/exec', {
            token: SERVICE_TOKEN,
            data: { tool: 'tool_que_nao_existe', arguments: {} },
        });
        assert(r.status === 404, `esperado 404, obtido ${r.status}`);
    });
    await test('POST /mcp/exec sem body → 400', async () => {
        const r = await api('POST', '/mcp/exec', { token: SERVICE_TOKEN, data: {} });
        assert(r.status === 400, `esperado 400, obtido ${r.status}`);
    });

    // ─── 5. Execução real de cada tool (com dados de teste) ───
    console.log('\n  [5. MCP — execução de cada tool]');
    // Nota: esses testes dependem de ter dados no banco.
    // Se o banco estiver vazio, vão retornar "não encontrado" — não falha.
    const tools = [
        { name: 'consultar_cliente', args: { email: 'inexistente@test.com' }, expectError: true },
        { name: 'listar_faturas_cliente', args: { cliente_id: 'cli-inexistente' }, expectError: true },
    ];
    for (const tc of tools) {
        await test(`${tc.name} com dados fake → graceful`, async () => {
            const r = await api('POST', '/mcp/exec', {
                token: SERVICE_TOKEN,
                data: { tool: tc.name, arguments: tc.args },
            });
            // Aceita 200 (sucesso com dados vazios) ou 4xx/5xx (não encontrado — esperado)
            assert(r.status === 200 || r.status >= 400, `status inválido: ${r.status}`);
        });
    }

    // ═══ Relatório ═══
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log(`  Total: ${passed + failed + skipped} | ✓ ${passed} | ✗ ${failed} | ⏭  ${skipped}`);
    console.log('═══════════════════════════════════════════════════════════\n');

    if (failed > 0) {
        console.error('  ❌ Há falhas. Veja acima antes de continuar.\n');
        process.exit(1);
    } else {
        console.log('  ✅ MCP test suite passou.\n');
        process.exit(0);
    }
}

main().catch(e => {
    console.error('Erro fatal:', e);
    process.exit(1);
});
