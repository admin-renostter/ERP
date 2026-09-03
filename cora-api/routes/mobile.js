/**
 * /api/mobile — Endpoints REST para técnicos em campo (Sprint 16)
 *
 * Otimizado para apps mobile com:
 *   - sync bulk (full + incremental) — 1 chamada = tudo
 *   - upload de fotos base64
 *   - tracking de geolocalização
 *   - push tokens
 *   - updates com versionamento (offline-first)
 *
 * Auth:
 *   - Reusa JWT do admin (com role 'tecnico' ou 'admin')
 *   - Filtra automaticamente por `tecnico_id = userId` (técnico só vê seus chamados)
 *   - superadmin pode passar `?userId=...` para impersonar
 *
 * Endpoints:
 *   GET  /api/mobile/sync?since=ISO&full=true|false
 *   GET  /api/mobile/tickets (próprios chamados)
 *   GET  /api/mobile/tickets/:id
 *   PATCH /api/mobile/tickets/:id (com versionamento)
 *   GET  /api/mobile/tickets/:id/photos
 *   POST /api/mobile/tickets/:id/photos (upload base64)
 *   DELETE /api/mobile/tickets/:id/photos/:photoId
 *   POST /api/mobile/location (batch ou single)
 *   GET  /api/mobile/location (última posição)
 *   POST /api/mobile/push-token (registrar)
 *   DELETE /api/mobile/push-token (remover)
 *   GET  /api/mobile/stats (sync stats)
 */

const express = require('express');
const router = express.Router();
const MobileService = require('../services/MobileService');
const { validate, schemas } = require('../middleware/validate');
const { safePathMiddleware } = require('../middleware/pathValidator');
const { requireRole } = require('../middleware/authJWT');

function asyncHandler(fn) {
    return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
}

function getUserId(req) {
    // superadmin pode impersonar via ?userId=...
    if (req.auditInfo?.role === 'superadmin' && req.query.userId) {
        return req.query.userId;
    }
    return req.auditInfo?.userId;
}

function requireTecnicoOrAdmin(req, res, next) {
    const role = req.auditInfo?.role;
    if (['tecnico', 'admin', 'superadmin'].includes(role)) return next();
    return res.status(403).json({
        success: false,
        error: 'Acesso restrito a técnicos e admins',
        code: 'FORBIDDEN_ROLE',
    });
}

// ════════════════════════════════════════════════════════════════
// SYNC
// ════════════════════════════════════════════════════════════════

/**
 * GET /api/mobile/sync
 * Query:
 *   - since=ISO  → incremental (só updates desde a data)
 *   - full=true  → força full sync
 *
 * Resposta: { type, timestamp, data: { tickets, clientes, ... }, counts }
 */
router.get('/sync', requireTecnicoOrAdmin, asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const start = Date.now();

    let result;
    if (req.query.since && req.query.full !== 'true') {
        result = await MobileService.syncIncremental(userId, req.query.since);
    } else {
        result = await MobileService.syncFull(userId);
    }

    // Log do sync (fire-and-forget)
    await MobileService.logSync(userId, {
        device_id: req.query.deviceId,
        sync_type: result.type,
        tickets_received: result.counts.tickets || result.counts.tickets_updated || 0,
        tickets_sent: 0,
        photos_sent: 0,
        location_points_sent: 0,
        duration_ms: Date.now() - start,
        ip: getClientIp(req),
        user_agent: req.headers['user-agent'],
    });

    return res.json({ success: true, data: result });
}));

// ════════════════════════════════════════════════════════════════
// TICKETS
// ════════════════════════════════════════════════════════════════

router.get('/tickets', requireTecnicoOrAdmin, asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const { status, limit = 100 } = req.query;
    const { dbAllTenant } = require('../infra/tenantAwareDb');
    let sql = `SELECT id, cliente_id, titulo, descricao, categoria, prioridade, status,
                      data_abertura, data_conclusao, updated_at, version
               FROM chamados
               WHERE tecnico_id = ? AND deleted = 0`;
    const params = [userId];
    if (status) {
        sql += ' AND status = ?';
        params.push(status);
    }
    sql += ' ORDER BY data_abertura DESC LIMIT ?';
    params.push(Math.min(parseInt(limit) || 100, 500));
    const tickets = await dbAllTenant(sql, params);
    return res.json({ success: true, data: tickets, total: tickets.length });
}));

router.get('/tickets/:id', requireTecnicoOrAdmin, asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const { dbGetTenant } = require('../infra/tenantAwareDb');
    const ticket = await dbGetTenant(
        `SELECT * FROM chamados WHERE id = ? AND tecnico_id = ? AND deleted = 0`,
        [req.params.id, userId]
    );
    if (!ticket) return res.status(404).json({ success: false, error: 'Chamado não encontrado', code: 'NOT_FOUND' });
    return res.json({ success: true, data: ticket });
}));

/**
 * PATCH /api/mobile/tickets/:id
 * Body: { status?, observacoes?, data_conclusao?, expected_version, force? }
 *
 * - Se `expected_version` for enviado e != versão atual, retorna 409
 * - `force=true` sobrescreve sem checar versão
 */
router.patch('/tickets/:id', requireTecnicoOrAdmin, asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const body = req.body || {};
    try {
        const result = await MobileService.updateTicketMobile(userId, req.params.id, {
            status: body.status,
            observacoes: body.observacoes,
            data_conclusao: body.data_conclusao,
            expected_version: body.expected_version,
            force: body.force === true,
        });
        return res.json({ success: true, data: result });
    } catch (e) {
        if (e.code === 'VERSION_CONFLICT') {
            return res.status(409).json({
                success: false,
                error: e.message,
                code: 'VERSION_CONFLICT',
                expected_version: e.expected_version,
                current_version: e.current_version,
                current_state: e.current_state,
            });
        }
        throw e;
    }
}));

// ════════════════════════════════════════════════════════════════
// FOTOS
// ════════════════════════════════════════════════════════════════

router.get('/tickets/:id/photos', requireTecnicoOrAdmin, asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const photos = await MobileService.listPhotos(userId, req.params.id);
    return res.json({ success: true, data: photos, total: photos.length });
}));

router.post('/tickets/:id/photos', requireTecnicoOrAdmin, validate(schemas.mobilePhoto), asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const photo = req.body;
    const result = await MobileService.uploadPhoto(userId, req.params.id, photo);
    return res.status(201).json({ success: true, data: result });
}));

router.delete('/tickets/:id/photos/:photoId', requireTecnicoOrAdmin, safePathMiddleware({ from: 'params', field: 'photoId' }), asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    await MobileService.deletePhoto(userId, req.params.photoId);
    return res.json({ success: true });
}));

// ════════════════════════════════════════════════════════════════
// LOCALIZAÇÃO
// ════════════════════════════════════════════════════════════════

router.post('/location', requireTecnicoOrAdmin, asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    // SECURITY FIX V20: valida cada ponto
    const points = Array.isArray(req.body) ? req.body : (Array.isArray(req.body?.points) ? req.body.points : [req.body]);
    const validated = [];
    const errors = [];
    points.forEach((loc, i) => {
        if (!loc) return;
        const r = schemas.mobileLocation(loc);
        if (!r.valid) {
            errors.push({ index: i, errors: r.errors });
        } else {
            validated.push(loc);
        }
    });
    if (errors.length > 0) {
        return res.status(400).json({
            success: false,
            error: 'Pontos com dados inválidos',
            code: 'VALIDATION_ERROR',
            details: errors,
        });
    }
    const results = [];
    for (const loc of validated) {
        const r = await MobileService.recordLocation(userId, loc);
        results.push(r);
    }
    return res.json({ success: true, data: { count: results.length, recorded: results } });
}));

router.get('/location', requireTecnicoOrAdmin, asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    if (req.query.current === 'true') {
        const current = await MobileService.getCurrentLocation(userId);
        return res.json({ success: true, data: current });
    }
    const list = await MobileService.getRecentLocations(userId, req.query.limit);
    return res.json({ success: true, data: list, total: list.length });
}));

// ════════════════════════════════════════════════════════════════
// PUSH TOKENS
// ════════════════════════════════════════════════════════════════

router.post('/push-token', requireTecnicoOrAdmin, validate(schemas.mobilePushToken), asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const result = await MobileService.registerPushToken(userId, req.body);
    return res.status(201).json({ success: true, data: result });
}));

router.delete('/push-token', requireTecnicoOrAdmin, asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ success: false, error: 'token obrigatório' });
    const r = await MobileService.unregisterPushToken(userId, token);
    return res.json({ success: true, data: r });
}));

// ════════════════════════════════════════════════════════════════
// STATS
// ════════════════════════════════════════════════════════════════

router.get('/stats', requireTecnicoOrAdmin, asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const days = parseInt(req.query.days) || 7;
    const stats = await MobileService.getSyncStats(userId, days);
    return res.json({ success: true, data: stats, period_days: days });
}));

module.exports = router;
