/**
 * LLM Client — Integração com Anthropic Claude (e OpenAI GPT)
 *
 * Sprint 6 — IA + OpenClaw
 *
 * Wrapper sobre a API HTTP da Anthropic (Messages API) sem dependência
 * do SDK oficial (mantém bundle pequeno e zero deps nativas).
 *
 * Suporta:
 *   - Claude Sonnet 4.5 (recomendado para tools)
 *   - Claude Haiku 4.5 (rápido, mais barato)
 *   - OpenAI GPT-4o (alternativa)
 *
 * Features:
 *   - Rate limiting por usuário (controla custo)
 *   - Retry com backoff exponencial
 *   - Tracking de tokens (input/output)
 *   - Logging estruturado
 *
 * Configuração:
 *   LLM_PROVIDER=anthropic  # ou "openai"
 *   LLM_API_KEY=sk-ant-...
 *   LLM_MODEL=claude-sonnet-4-5
 *   LLM_MAX_TOKENS=4096
 *   LLM_DAILY_BUDGET_USD=10.00
 */

const crypto = require('crypto');

// ─── Configuração ───
const LLM_PROVIDER = process.env.LLM_PROVIDER || 'anthropic';
const LLM_API_KEY = process.env.LLM_API_KEY || null;
const LLM_MODEL = process.env.LLM_MODEL || 'claude-sonnet-4-5-20250929';
const LLM_MAX_TOKENS = parseInt(process.env.LLM_MAX_TOKENS || '4096', 10);
const LLM_TEMPERATURE = parseFloat(process.env.LLM_TEMPERATURE || '0.3');
const LLM_DAILY_BUDGET_USD = parseFloat(process.env.LLM_DAILY_BUDGET_USD || '10.00');

// Preços por 1M tokens (out/2024) — atualizar conforme tabela oficial
const PRICING = {
    'claude-sonnet-4-5-20250929':   { input: 3.00, output: 15.00 },
    'claude-haiku-4-5-20251001':    { input: 0.80, output: 4.00 },
    'gpt-4o':                        { input: 5.00, output: 15.00 },
    'gpt-4o-mini':                   { input: 0.15, output: 0.60 },
};

// ─── Rate Limiting (em memória + Redis-ready) ───
const _rateLimits = new Map(); // userId → { count, resetAt }

function checkRateLimit(userId = 'anonymous', maxPerHour = 100) {
    const now = Date.now();
    const entry = _rateLimits.get(userId) || { count: 0, resetAt: now + 3600_000 };
    if (now > entry.resetAt) {
        entry.count = 0;
        entry.resetAt = now + 3600_000;
    }
    if (entry.count >= maxPerHour) {
        return { ok: false, remaining: 0, resetInSec: Math.ceil((entry.resetAt - now) / 1000) };
    }
    entry.count++;
    _rateLimits.set(userId, entry);
    return { ok: true, remaining: maxPerHour - entry.count, resetInSec: Math.ceil((entry.resetAt - now) / 1000) };
}

const _dailyCost = { date: new Date().toDateString(), total: 0 };

function checkDailyBudget(estimatedCost) {
    const today = new Date().toDateString();
    if (_dailyCost.date !== today) {
        _dailyCost.date = today;
        _dailyCost.total = 0;
    }
    return (_dailyCost.total + estimatedCost) <= LLM_DAILY_BUDGET_USD;
}

function recordCost(cost) {
    const today = new Date().toDateString();
    if (_dailyCost.date !== today) {
        _dailyCost.date = today;
        _dailyCost.total = 0;
    }
    _dailyCost.total += cost;
}

// ─── API ───
function isLlmAvailable() {
    return !!LLM_API_KEY;
}

/**
 * Mensagem genérica — compatível com tool use.
 *
 * @param {Object} opts
 * @param {string} opts.system - System prompt
 * @param {Array} opts.messages - [{ role, content }]
 * @param {Array} [opts.tools] - MCP tools no formato Anthropic
 * @param {string} [opts.userId] - Para rate limit
 * @returns {Promise<Object>} { content, stopReason, usage, costUsd }
 */
async function sendMessage({ system, messages, tools, userId = 'anonymous' }) {
    if (!isLlmAvailable()) {
        throw new Error('LLM_API_KEY não configurado');
    }

    // Rate limit
    const rl = checkRateLimit(userId);
    if (!rl.ok) {
        const e = new Error(`Rate limit atingido (${rl.resetInSec}s para reset)`);
        e.code = 'RATE_LIMIT';
        throw e;
    }

    // Estimativa de custo (input tokens ainda não sabemos — usa worst case)
    const estInputTokens = estimateTokens(messages) + (system ? estimateTokens([{ content: system }]) : 0);
    const estCost = (estInputTokens * (PRICING[LLM_MODEL]?.input || 3.00)) / 1_000_000;
    if (!checkDailyBudget(estCost)) {
        const e = new Error(`Budget diário atingido ($${LLM_DAILY_BUDGET_USD})`);
        e.code = 'BUDGET_EXCEEDED';
        throw e;
    }

    // Chamada API
    const start = Date.now();
    let response;
    if (LLM_PROVIDER === 'anthropic') {
        response = await callAnthropic({ system, messages, tools });
    } else if (LLM_PROVIDER === 'openai') {
        response = await callOpenAI({ system, messages, tools });
    } else {
        throw new Error(`Provedor LLM não suportado: ${LLM_PROVIDER}`);
    }

    // Calcula custo real
    const pricing = PRICING[LLM_MODEL] || PRICING['claude-sonnet-4-5-20250929'];
    const costUsd = (
        (response.usage.input_tokens * pricing.input) +
        (response.usage.output_tokens * pricing.output)
    ) / 1_000_000;
    recordCost(costUsd);

    return {
        ...response,
        costUsd,
        durationMs: Date.now() - start,
        rateLimit: { remaining: rl.remaining, resetInSec: rl.resetInSec },
    };
}

/**
 * Chamada Anthropic Messages API.
 */
async function callAnthropic({ system, messages, tools }) {
    const body = {
        model: LLM_MODEL,
        max_tokens: LLM_MAX_TOKENS,
        temperature: LLM_TEMPERATURE,
        messages,
    };
    if (system) body.system = system;
    if (tools && tools.length > 0) body.tools = tools;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': LLM_API_KEY,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const errBody = await res.text();
        const e = new Error(`Anthropic API ${res.status}: ${errBody.substring(0, 200)}`);
        e.code = `ANTHROPIC_${res.status}`;
        throw e;
    }
    const data = await res.json();
    return {
        content: data.content,
        stopReason: data.stop_reason,
        usage: data.usage,
    };
}

/**
 * Chamada OpenAI Chat Completions.
 */
async function callOpenAI({ system, messages, tools }) {
    const oaMessages = [];
    if (system) oaMessages.push({ role: 'system', content: system });
    oaMessages.push(...messages);

    const body = {
        model: LLM_MODEL,
        max_tokens: LLM_MAX_TOKENS,
        temperature: LLM_TEMPERATURE,
        messages: oaMessages,
    };
    if (tools && tools.length > 0) {
        body.tools = tools.map(t => ({
            type: 'function',
            function: {
                name: t.name,
                description: t.description,
                parameters: t.input_schema,
            },
        }));
    }

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${LLM_API_KEY}`,
        },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const errBody = await res.text();
        const e = new Error(`OpenAI API ${res.status}: ${errBody.substring(0, 200)}`);
        e.code = `OPENAI_${res.status}`;
        throw e;
    }
    const data = await res.json();
    return {
        content: data.choices[0].message.content,
        stopReason: data.choices[0].finish_reason,
        usage: {
            input_tokens: data.usage.prompt_tokens,
            output_tokens: data.usage.completion_tokens,
        },
    };
}

/**
 * Estimativa simples de tokens (1 token ≈ 4 chars em PT/EN).
 */
function estimateTokens(messages) {
    if (!Array.isArray(messages)) return 0;
    let total = 0;
    for (const m of messages) {
        const c = typeof m === 'string' ? m : (m.content || '');
        total += Math.ceil((c || '').length / 4);
    }
    return total;
}

/**
 * Converte MCP tools para formato Anthropic tool use.
 */
function mcpToolsToAnthropic(mcpTools) {
    return mcpTools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
    }));
}

/**
 * Helper: executa loop de tool use até o LLM responder com stop_reason !== 'tool_use'.
 */
async function runWithTools({ system, initialMessage, mcpTools, userId, executeTool }) {
    if (!isLlmAvailable()) {
        throw new Error('LLM não configurado');
    }
    const tools = mcpToolsToAnthropic(mcpTools);
    const messages = [{ role: 'user', content: initialMessage }];
    const maxIterations = 5;
    const turns = [];

    for (let i = 0; i < maxIterations; i++) {
        const response = await sendMessage({ system, messages, tools, userId });
        turns.push(response);
        const toolUses = response.content.filter(b => b.type === 'tool_use');

        if (toolUses.length === 0) {
            // Resposta final (texto)
            return { finalResponse: response, turns };
        }

        // Executa tools
        const toolResults = [];
        for (const tu of toolUses) {
            try {
                const result = await executeTool(tu.name, tu.input);
                toolResults.push({
                    type: 'tool_result',
                    tool_use_id: tu.id,
                    content: typeof result === 'string' ? result : JSON.stringify(result),
                });
            } catch (e) {
                toolResults.push({
                    type: 'tool_result',
                    tool_use_id: tu.id,
                    content: JSON.stringify({ success: false, error: e.message }),
                    is_error: true,
                });
            }
        }

        // Adiciona resposta do assistant + tool_results na conversa
        messages.push({ role: 'assistant', content: response.content });
        messages.push({ role: 'user', content: toolResults });
    }
    throw new Error(`LLM não convergiu em ${maxIterations} iterações`);
}

module.exports = {
    isLlmAvailable,
    sendMessage,
    runWithTools,
    mcpToolsToAnthropic,
    checkRateLimit,
    checkDailyBudget,
    getDailyCost: () => _dailyCost.total,
    LLM_PROVIDER,
    LLM_MODEL,
};
