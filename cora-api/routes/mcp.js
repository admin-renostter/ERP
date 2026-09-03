/**
 * MCP HTTP Endpoint — recebe chamadas do OpenClaw
 *
 * Sprint 6 — IA + OpenClaw
 *
 * POST /mcp/exec
 * Headers: Authorization: Bearer <MCP_SERVICE_TOKEN>
 * Body: { tool: "nome", arguments: { ... } }
 * Returns: { success, result | error, code, durationMs }
 */

const express = require('express');
const router = express.Router();
const { executeFromOpenClaw, toOpenClawTools, generateOpenClawConfigYaml } = require('../openclaw/adapter');
const { TOOLS } = require('../mcp/tools');

// ─── Auth helper ───
function authenticateServiceToken(req, res, next) {
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : (req.query.token || null);
    if (!token) {
        return res.status(401).json({ success: false, error: 'Token obrigatório', code: 'NO_TOKEN' });
    }
    req.serviceToken = token;
    next();
}

/**
 * POST /mcp/exec
 * Body: { tool, arguments }
 */
router.post('/exec', authenticateServiceToken, async (req, res) => {
    const { tool, arguments: args } = req.body || {};
    if (!tool) {
        return res.status(400).json({ success: false, error: 'tool obrigatório', code: 'MISSING_TOOL' });
    }
    if (!TOOLS.find(t => t.name === tool)) {
        return res.status(404).json({ success: false, error: `Tool não encontrada: ${tool}`, code: 'TOOL_NOT_FOUND' });
    }

    const start = Date.now();
    try {
        const result = await executeFromOpenClaw(tool, args || {}, req.serviceToken);
        res.json({
            ...result,
            durationMs: Date.now() - start,
        });
    } catch (e) {
        res.status(500).json({
            success: false,
            error: e.message,
            code: e.code || 'EXEC_ERROR',
            durationMs: Date.now() - start,
        });
    }
});

/**
 * GET /mcp/tools — lista tools disponíveis (formato OpenClaw-ready)
 */
router.get('/tools', (req, res) => {
    const baseUrl = process.env.RENOSTTER_API_URL || `${req.protocol}://${req.get('host')}`;
    const tools = toOpenClawTools(baseUrl);
    res.json({
        success: true,
        provider: 'renostter-crm',
        version: '0.1.0',
        total: tools.length,
        tools,
    });
});

/**
 * GET /mcp/openclaw.yaml — gera config OpenClaw para o admin copiar
 */
router.get('/openclaw.yaml', (req, res) => {
    const baseUrl = process.env.RENOSTTER_API_URL || `${req.protocol}://${req.get('host')}`;
    const yaml = generateOpenClawConfigYaml(baseUrl);
    res.type('text/yaml').send(yaml);
});

/**
 * GET /mcp/health
 */
router.get('/health', (req, res) => {
    res.json({
        success: true,
        mcp_server: 'renostter-crm',
        version: '0.1.0',
        tools_available: TOOLS.length,
        uptime_s: Math.floor(process.uptime()),
    });
});

module.exports = router;
