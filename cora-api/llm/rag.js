/**
 * RAG — Retrieval-Augmented Generation sobre Base de Conhecimento
 *
 * Sprint 6 — IA + OpenClaw
 *
 * Como funciona:
 *   1. Base de conhecimento (knowledge_base no DB) é indexada com embeddings
 *   2. Quando o usuário faz uma pergunta, busca os K artigos mais similares
 *   3. Injeta o contexto no prompt do LLM
 *   4. LLM responde com base no contexto + conhecimento geral
 *
 * Embeddings:
 *   - Usa a API de embeddings da Anthropic (voyage-3) ou OpenAI (text-embedding-3-small)
 *   - Cache de embeddings em memória (reindexa ao iniciar)
 *   - Fallback: busca por keywords (sem embedding) se LLM não disponível
 *
 * NOTA: Como o Claude não tem API pública de embeddings, usa OpenAI
 * voyage-3 ou text-embedding-3-small por padrão. Para self-hosted, é
 * possível usar sentence-transformers via subprocess.
 */

const crypto = require('crypto');

// Cache de embeddings (reindexa sob demanda)
let _index = null; // { entries: [{ id, title, content, embedding }], builtAt }

const EMBEDDING_PROVIDER = process.env.EMBEDDING_PROVIDER || 'openai';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
const EMBEDDING_API_KEY = process.env.EMBEDDING_API_KEY || process.env.LLM_API_KEY;
const RAG_TOP_K = parseInt(process.env.RAG_TOP_K || '4', 10);
const RAG_MIN_SIMILARITY = parseFloat(process.env.RAG_MIN_SIMILARITY || '0.65', 10);

/**
 * Gera embedding de um texto via API.
 */
async function embed(text) {
    if (!EMBEDDING_API_KEY) {
        throw new Error('EMBEDDING_API_KEY não configurado');
    }
    const input = text.slice(0, 8000); // limita para 8k chars

    if (EMBEDDING_PROVIDER === 'openai') {
        const res = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${EMBEDDING_API_KEY}`,
            },
            body: JSON.stringify({ model: EMBEDDING_MODEL, input }),
        });
        if (!res.ok) {
            throw new Error(`OpenAI Embeddings ${res.status}: ${await res.text()}`);
        }
        const data = await res.json();
        return data.data[0].embedding;
    }

    // Fallback: hash-based pseudo-embedding (apenas para dev/testes)
    return hashEmbedding(input);
}

/**
 * Embedding determinístico baseado em hash (apenas para dev sem API key).
 * NÃO é embedding semântico de verdade — só serve para testes.
 */
function hashEmbedding(text) {
    const dim = 256;
    const vec = new Array(dim).fill(0);
    for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i);
        vec[c % dim] += 1;
    }
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
    return vec.map(v => v / norm);
}

/**
 * Cosseno entre dois vetores.
 */
function cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

/**
 * Constrói o índice a partir do banco de conhecimento.
 * Carrega de `knowledge_base` (tabela existente do frontend).
 */
async function buildIndex(dbAllFn) {
    try {
        const rows = await dbAllFn('SELECT id, title, content, category, tags FROM knowledge_base WHERE ativo = 1 OR ativo IS NULL');
        const entries = [];
        for (const row of rows) {
            try {
                const text = `${row.title}\n\n${row.content}`;
                const embedding = await embed(text);
                entries.push({
                    id: row.id,
                    title: row.title,
                    content: row.content,
                    category: row.category,
                    tags: row.tags,
                    embedding,
                });
            } catch (e) {
                console.warn(`[RAG] Falha ao indexar "${row.title}":`, e.message);
            }
        }
        _index = { entries, builtAt: new Date() };
        console.log(`[RAG] Índice construído: ${entries.length} entradas`);
        return _index;
    } catch (e) {
        console.error('[RAG] Erro ao construir índice:', e.message);
        _index = { entries: [], builtAt: new Date() };
        return _index;
    }
}

/**
 * Busca os K artigos mais similares à query.
 */
async function search(query, options = {}) {
    const topK = options.topK || RAG_TOP_K;
    const minSimilarity = options.minSimilarity || RAG_MIN_SIMILARITY;

    if (!_index) {
        // Lazy: constrói sob demanda
        const { dbAll } = require('../database');
        await buildIndex(dbAll);
    }
    if (!_index || _index.entries.length === 0) {
        return [];
    }

    let queryEmbedding;
    try {
        queryEmbedding = await embed(query);
    } catch (e) {
        // Fallback: keyword search simples
        return keywordSearch(query, topK);
    }

    const scored = _index.entries.map(e => ({
        ...e,
        score: cosineSimilarity(queryEmbedding, e.embedding),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.filter(s => s.score >= minSimilarity).slice(0, topK);
}

/**
 * Fallback: busca por keywords (substring match).
 */
function keywordSearch(query, topK) {
    const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    if (terms.length === 0) return [];
    const scored = _index.entries.map(e => {
        const text = `${e.title} ${e.content}`.toLowerCase();
        let score = 0;
        for (const term of terms) {
            if (text.includes(term)) score += 1;
        }
        return { ...e, score: score / terms.length };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.filter(s => s.score > 0).slice(0, topK);
}

/**
 * Formata resultados para injeção no prompt.
 */
function formatContext(results) {
    if (!results || results.length === 0) return '';
    const lines = results.map((r, i) =>
        `[${i + 1}] ${r.title}\n${r.content}\n(relevância: ${(r.score * 100).toFixed(0)}%)`
    );
    return `Base de conhecimento relevante:\n\n${lines.join('\n\n---\n\n')}`;
}

/**
 * Força reindex (chamar quando artigos são criados/editados).
 */
function invalidate() {
    _index = null;
}

/**
 * Helper: pergunta ao LLM com contexto RAG.
 */
async function askWithContext({ question, systemPrompt, llmSendMessage, userId }) {
    const results = await search(question);
    const context = formatContext(results);

    const augmentedSystem = context
        ? `${systemPrompt || 'Você é o assistente do Renostter CRM.'}\n\nUse APENAS as informações da base de conhecimento abaixo para responder. Se a informação não estiver lá, diga que não sabe.\n\n${context}`
        : systemPrompt || 'Você é o assistente do Renostter CRM. Responda de forma concisa em PT-BR.';

    return await llmSendMessage({
        system: augmentedSystem,
        messages: [{ role: 'user', content: question }],
        userId,
    });
}

module.exports = {
    embed,
    buildIndex,
    search,
    formatContext,
    invalidate,
    askWithContext,
    cosineSimilarity,
    RAG_TOP_K,
    RAG_MIN_SIMILARITY,
};
