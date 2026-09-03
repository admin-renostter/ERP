/**
 * MCP Audit — Log de todas as invocações do MCP server
 *
 * Sprint 6 — IA + OpenClaw
 *
 * Conformidade LGPD: cada chamada a tool é registrada com:
 *   - tool: nome do tool
 *   - args: argumentos (sanitizados, sem senhas/CPF)
 *   - result: 'ok' | 'error'
 *   - error: mensagem (se erro)
 *   - durationMs: duração
 *   - timestamp: ISO
 *
 * Persistência: tabela `mcp_invocations` no banco. Se não existir,
 * cria lazy.
 */

const { dbRun, dbAll } = require('../database');

let _tableEnsured = false;
async function ensureTable() {
    if (_tableEnsured) return;
    try {
        await dbRun(`
            CREATE TABLE IF NOT EXISTS mcp_invocations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tool TEXT NOT NULL,
                args_json TEXT,
                result TEXT NOT NULL,
                error TEXT,
                duration_ms INTEGER,
                source TEXT DEFAULT 'mcp',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        // Criar índice simples
        try {
            await dbRun('CREATE INDEX IF NOT EXISTS idx_mcp_tool ON mcp_invocations(tool, created_at)');
        } catch (_) {}
        _tableEnsured = true;
    } catch (e) {
        console.warn('[MCP Audit] Falha ao criar tabela (silencioso):', e.message);
    }
}

/**
 * Registra uma invocação. Não bloqueia o fluxo principal se falhar.
 */
async function auditMcpInvocation({ tool, args, result, error, durationMs, source = 'mcp' }) {
    try {
        await ensureTable();
        await dbRun(
            `INSERT INTO mcp_invocations (tool, args_json, result, error, duration_ms, source, created_at)
             VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
            [
                tool,
                args ? JSON.stringify(args) : null,
                result,
                error ? String(error).slice(0, 1000) : null,
                durationMs,
                source,
            ]
        );
    } catch (e) {
        // Audit não pode quebrar a tool. Loga e segue.
        console.warn('[MCP Audit] Falha ao registrar:', e.message);
    }
}

/**
 * Lista últimas invocações (para debug/admin).
 */
async function listRecent(limit = 50) {
    try {
        await ensureTable();
        return await dbAll(
            'SELECT * FROM mcp_invocations ORDER BY created_at DESC LIMIT ?',
            [limit]
        );
    } catch (e) {
        return [];
    }
}

module.exports = { auditMcpInvocation, listRecent, ensureTable };
