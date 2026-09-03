/**
 * /api/bi — Endpoints REST de BI (Sprint 14)
 *
 * Endpoints:
 *   GET  /api/bi/overview?period=12m&allTenants=true  → KPIs consolidados (cached)
 *   GET  /api/bi/drill/:metric?period=30d&status=X    → drill-down de uma métrica
 *   GET  /api/bi/cohort?meses=6                        → análise de coorte (retenção)
 *   GET  /api/bi/export/:metric?period=90d             → export CSV
 *   GET  /api/bi/anomalies                             → anomalias estatísticas
 *   POST /api/bi/cache/refresh                         → invalida cache
 *
 * Permissões:
 *   - Todos os endpoints requerem auth (qualquer user autenticado)
 *   - `allTenants=true` só funciona para superadmin
 */

const express = require('express');
const router = express.Router();

const AnalyticsService = require('../services/AnalyticsService');
const { requireRole } = require('../middleware/authJWT');

function asyncHandler(fn) {
    return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// ════════════════════════════════════════════════════════════════
// OVERVIEW
// ════════════════════════════════════════════════════════════════

/**
 * GET /api/bi/overview
 * Query: ?period=7d|30d|90d|12m (default 12m)
 *        ?allTenants=true (apenas superadmin)
 *        ?noCache=true (força refresh)
 */
router.get('/overview', requireRole('admin', 'superadmin', 'financeiro', 'tecnico'), asyncHandler(async (req, res) => {
    const data = await AnalyticsService.getOverview(req, {
        period: req.query.period,
        allTenants: req.query.allTenants === 'true',
        noCache: req.query.noCache === 'true',
    });
    res.json({ success: true, data });
}));

// ════════════════════════════════════════════════════════════════
// DRILL-DOWN
// ════════════════════════════════════════════════════════════════

/**
 * GET /api/bi/drill/:metric
 * Métricas: cobrancas, tickets, cotacoes, leads, clientes_top
 */
router.get('/drill/:metric', requireRole('admin', 'superadmin', 'financeiro', 'tecnico'), asyncHandler(async (req, res) => {
    const data = await AnalyticsService.drillDown(req, req.params.metric, {
        period: req.query.period || '90d',
        status: req.query.status,
        limit: parseInt(req.query.limit) || 100,
        allTenants: req.query.allTenants === 'true',
    });
    res.json({ success: true, data });
}));

// ════════════════════════════════════════════════════════════════
// COHORT
// ════════════════════════════════════════════════════════════════

/**
 * GET /api/bi/cohort
 * Query: ?meses=6 (max 12)
 */
router.get('/cohort', requireRole('admin', 'superadmin', 'financeiro'), asyncHandler(async (req, res) => {
    const data = await AnalyticsService.cohortRetention(req, {
        meses: parseInt(req.query.meses) || 6,
        allTenants: req.query.allTenants === 'true',
    });
    res.json({ success: true, data });
}));

// ════════════════════════════════════════════════════════════════
// EXPORT CSV
// ════════════════════════════════════════════════════════════════

/**
 * GET /api/bi/export/:metric
 * Retorna CSV com Content-Disposition: attachment
 */
router.get('/export/:metric', requireRole('admin', 'superadmin', 'financeiro'), asyncHandler(async (req, res) => {
    const result = await AnalyticsService.exportCSV(req, req.params.metric, {
        period: req.query.period || '12m',
        status: req.query.status,
        allTenants: req.query.allTenants === 'true',
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.csv);
}));

// ════════════════════════════════════════════════════════════════
// ANOMALY DETECTION
// ════════════════════════════════════════════════════════════════

/**
 * GET /api/bi/anomalies
 * Retorna lista de anomalias detectadas via z-score.
 */
router.get('/anomalies', requireRole('admin', 'superadmin', 'financeiro'), asyncHandler(async (req, res) => {
    const data = await AnalyticsService.detectAnomalies(req, {
        lookbackMonths: parseInt(req.query.lookbackMonths) || 6,
    });
    res.json({ success: true, data });
}));

// ════════════════════════════════════════════════════════════════
// CACHE MANAGEMENT
// ════════════════════════════════════════════════════════════════

/**
 * POST /api/bi/cache/refresh
 * Invalida o cache de BI. Admin ou superadmin.
 */
router.post('/cache/refresh', requireRole('admin', 'superadmin'), asyncHandler(async (req, res) => {
    const tenantId = req.tenantId;  // superadmin pode passar null para limpar tudo
    const allTenants = req.isSuperadmin && req.body?.allTenants === true;
    await AnalyticsService.invalidateCache(allTenants ? null : tenantId);
    res.json({ success: true, message: 'Cache de BI invalidado', tenantId: allTenants ? 'ALL' : tenantId });
}));

module.exports = router;
