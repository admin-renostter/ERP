/**
 * MCP Server — Model Context Protocol server para o Renostter CRM
 *
 * Sprint 6 — IA + OpenClaw
 *
 * Expõe as APIs do ERP como "tools" que LLMs (Claude, GPT) podem chamar.
 * Implementação stdio transport — funciona com Claude Desktop, OpenClaw,
 * e qualquer cliente MCP compatível.
 *
 * Tools expostas:
 *   - listar_faturas_cliente
 *   - consultar_status_chamado
 *   - abrir_chamado
 *   - consultar_cliente
 *   - listar_equipamentos_cliente
 *   - agendar_visita_tecnica
 *   - solicitar_segunda_via_boleto
 *   - consultar_contrato
 *
 * Auth: JWT service-account (lido de env MCP_SERVICE_TOKEN).
 * Cada invocação é auditada em `logs_auditoria`.
 *
 * Como rodar:
 *   node cora-api/mcp/server.js
 *
 * Como testar (stdio):
 *   echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node cora-api/mcp/server.js
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

const { TOOLS, handleToolCall } = require('./tools');
const { auditMcpInvocation } = require('./audit');

// ─── Configuração ───
const SERVICE_NAME = 'renostter-crm-mcp';
const SERVICE_VERSION = '0.1.0';
const SERVICE_TOKEN = process.env.MCP_SERVICE_TOKEN || null;

if (!SERVICE_TOKEN && process.env.NODE_ENV === 'production') {
    console.error('[MCP] MCP_SERVICE_TOKEN não configurado em produção. Abortando.');
    process.exit(1);
}

// ─── Server MCP ───
const server = new Server(
    { name: SERVICE_NAME, version: SERVICE_VERSION },
    {
        capabilities: {
            tools: {},
        },
    }
);

// ─── Handlers ───

// Listar tools disponíveis
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: TOOLS.map(t => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
        })),
    };
});

// Executar tool
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const startTime = Date.now();

    try {
        // Verifica autenticação (a partir do payload do service token)
        const auth = args?.__auth || SERVICE_TOKEN;

        const result = await handleToolCall(name, args || {}, {
            serviceToken: auth,
            source: 'mcp',
        });

        // Audit log
        await auditMcpInvocation({
            tool: name,
            args: sanitizeForAudit(args),
            result: 'ok',
            durationMs: Date.now() - startTime,
        });

        return {
            content: [
                {
                    type: 'text',
                    text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
                },
            ],
        };
    } catch (err) {
        await auditMcpInvocation({
            tool: name,
            args: sanitizeForAudit(args),
            result: 'error',
            error: err.message,
            durationMs: Date.now() - startTime,
        });

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({
                        success: false,
                        error: err.message,
                        code: err.code || 'TOOL_ERROR',
                    }, null, 2),
                },
            ],
            isError: true,
        };
    }
});

// Remove campos sensíveis antes de logar
function sanitizeForAudit(args) {
    if (!args) return null;
    const sanitized = { ...args };
    delete sanitized.__auth;       // não logar token
    delete sanitized.password;     // não logar senha
    delete sanitized.cpf;
    delete sanitized.cnpj;
    return sanitized;
}

// ─── Boot ───
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(`[MCP] ${SERVICE_NAME} v${SERVICE_VERSION} rodando em stdio`);
    console.error(`[MCP] ${TOOLS.length} tools expostos`);
}

main().catch(e => {
    console.error('[MCP] Erro fatal:', e);
    process.exit(1);
});
