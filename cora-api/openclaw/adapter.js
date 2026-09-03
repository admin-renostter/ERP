/**
 * OpenClaw Adapter — Converte MCP tools para o formato do clawd.bot
 *
 * Sprint 6 — IA + OpenClaw
 *
 * O OpenClaw (clawd.bot) tem seu próprio formato de declaração de tools.
 * Este adapter converte os tools do MCP server para esse formato,
 * permitindo que o OpenClaw use as APIs do ERP diretamente.
 *
 * Formato OpenClaw (clawd.bot):
 *   tools:
 *     - name: "tool_name"
 *       description: "..."
 *       parameters: { ...JSON Schema... }
 *       endpoint:
 *         method: "POST"
 *         url: "https://api.renostter.com/mcp/exec"
 *         headers: { Authorization: "Bearer ${MCP_SERVICE_TOKEN}" }
 *         body_template: { tool: "tool_name", arguments: "${args}" }
 *       response_path: "result"
 */

const { TOOLS } = require('../mcp/tools');
const axios = require('axios');

const RENOSTTER_API_URL = process.env.RENOSTTER_API_URL || 'http://localhost:3000';
const MCP_SERVICE_TOKEN = process.env.MCP_SERVICE_TOKEN || '';

/**
 * Converte tools do MCP para o formato de tools do OpenClaw.
 * Cada tool vira uma chamada HTTP ao endpoint MCP do Renostter.
 */
function toOpenClawTools(baseUrl = RENOSTTER_API_URL) {
    return TOOLS.map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
        endpoint: {
            method: 'POST',
            url: `${baseUrl}/mcp/exec`,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${MCP_SERVICE_TOKEN}`,
            },
            body_template: {
                tool: t.name,
                arguments: '{{args}}',  // OpenClaw substitui este placeholder
            },
        },
        response_path: 'result',
        // Metadados extras para o OpenClaw exibir no prompt
        metadata: {
            source: 'renostter-crm',
            version: '0.1.0',
            category: categorizeTool(t.name),
            requires_confirmation: requiresConfirmation(t.name),
        },
    }));
}

/**
 * Categoriza o tool para o OpenClaw agrupar na UI.
 */
function categorizeTool(name) {
    const map = {
        'listar_faturas_cliente':      'financeiro',
        'consultar_status_chamado':    'atendimento',
        'abrir_chamado':               'atendimento',
        'consultar_cliente':           'clientes',
        'listar_equipamentos_cliente': 'clientes',
        'agendar_visita_tecnica':      'atendimento',
        'solicitar_segunda_via_boleto':'financeiro',
        'consultar_contrato':          'contratos',
    };
    return map[name] || 'geral';
}

/**
 * Tools que exigem confirmação explícita do usuário antes de executar.
 * (Ações que mudam estado: abrir chamado, agendar, etc.)
 */
function requiresConfirmation(name) {
    const writeActions = new Set([
        'abrir_chamado',
        'agendar_visita_tecnica',
        'solicitar_segunda_via_boleto',
    ]);
    return writeActions.has(name);
}

/**
 * Endpoint que recebe as chamadas do OpenClaw e executa a tool.
 * (Backend: registra em server.js como /mcp/exec)
 */
async function executeFromOpenClaw(toolName, args, serviceToken) {
    const { handleToolCall } = require('../mcp/tools');
    const { auditMcpInvocation } = require('../mcp/audit');

    if (serviceToken !== MCP_SERVICE_TOKEN && serviceToken !== process.env.MCP_SERVICE_TOKEN) {
        const e = new Error('Service token inválido');
        e.code = 'AUTH_FAILED';
        throw e;
    }

    const startTime = Date.now();
    try {
        const result = await handleToolCall(toolName, args, {
            serviceToken: MCP_SERVICE_TOKEN,
            source: 'openclaw',
        });
        await auditMcpInvocation({
            tool: toolName,
            args,
            result: 'ok',
            durationMs: Date.now() - startTime,
            source: 'openclaw',
        });
        return { success: true, result };
    } catch (e) {
        await auditMcpInvocation({
            tool: toolName,
            args,
            result: 'error',
            error: e.message,
            durationMs: Date.now() - startTime,
            source: 'openclaw',
        });
        return { success: false, error: e.message, code: e.code };
    }
}

/**
 * Gera o YAML de configuração para colar no OpenClaw.
 * (Útil para o admin copiar/colar no `~/.config/openclaw/agents/renostter.yaml`)
 */
function generateOpenClawConfigYaml(baseUrl = 'https://api.renostter.com') {
    const tools = toOpenClawTools(baseUrl);
    return `# Renostter CRM Tools — OpenClaw configuration
# Cole este conteúdo em: ~/.config/openclaw/agents/renostter.yaml
# Docs OpenClaw: https://docs.clawd.bot/

agent:
  name: renostter-assistant
  description: "Assistente do Renostter CRM para atendimento via WhatsApp/Telegram/etc."
  system_prompt: |
    Você é o assistente virtual da Renostter, uma assistência técnica especializada em climatização (HVAC).
    Seu objetivo é ajudar clientes com:
      - Consulta de faturas e boletos
      - Abertura e acompanhamento de chamados técnicos
      - Agendamento de visitas
      - Informações sobre contratos e equipamentos
    Sempre seja educado, objetivo e em português brasileiro.
    Para ações que mudam estado (abrir chamado, agendar), sempre CONFIRME com o cliente antes.
    Se não souber a resposta, diga "Vou transferir para um atendente humano" e ofereça contato.

  llm:
    provider: anthropic
    model: claude-sonnet-4-5
    temperature: 0.3

  channels:
    - whatsapp
    - telegram
    - webchat

  tools:
${tools.map(t => `    - name: ${t.name}
      description: ${t.description.replace(/\n/g, ' ').substring(0, 200)}
      parameters: ${JSON.stringify(t.parameters).replace(/\n/g, ' ')}
      endpoint:
        method: ${t.endpoint.method}
        url: ${t.endpoint.url}
        headers:
          Authorization: "Bearer \${MCP_SERVICE_TOKEN}"
        body_template:
          tool: ${t.name}
          arguments: "{{args}}"
      requires_confirmation: ${t.metadata.requires_confirmation}`).join('\n\n')}
`;
}

module.exports = {
    toOpenClawTools,
    executeFromOpenClaw,
    generateOpenClawConfigYaml,
    categorizeTool,
    requiresConfirmation,
};
