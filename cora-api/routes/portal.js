/**
 * /api/portal — Endpoints REST do Portal do Cliente (Sprint 15)
 *
 * Autenticação separada (JWT aud='renostter-portal') via middleware `portalAuth`.
 *
 * Endpoints públicos:
 *   POST /api/portal/auth/login     → email + senha → JWT
 *   POST /api/portal/auth/forgot    → gera token de reset
 *   POST /api/portal/auth/reset     → reseta senha com token
 *
 * Endpoints autenticados (requer Bearer token):
 *   POST /api/portal/auth/logout
 *   POST /api/portal/auth/refresh
 *   GET  /api/portal/me
 *   GET  /api/portal/contracts
 *   GET  /api/portal/contracts/:id
 *   GET  /api/portal/bills
 *   GET  /api/portal/bills/:id
 *   GET  /api/portal/tickets
 *   GET  /api/portal/tickets/:id
 *   POST /api/portal/tickets
 *   GET  /api/portal/equipment
 *   GET  /api/portal/notifications
 *   POST /api/portal/notifications/:id/read
 *   PUT  /api/portal/profile
 *
 * Endpoints admin (criar/gerenciar portal users):
 *   POST /api/portal/admin/users    → cria portal_user para um cliente
 *   GET  /api/portal/admin/users    → lista
 *   PATCH /api/portal/admin/users/:id/disable
 *   PATCH /api/portal/admin/users/:id/enable
 */

const express = require('express');
const router = express.Router();

const PortalService = require('../services/PortalService');
const LGPDService = require('../services/LGPDService');
const { portalAuthMiddleware, generateTokensForPortal, verifyToken, signAccessToken } = require('../middleware/portalAuth');
const { requireRole } = require('../middleware/authJWT');
const { validate, schemas } = require('../middleware/validate');
const { dbGet } = require('../database');

function getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
}

function asyncHandler(fn) {
    return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// ════════════════════════════════════════════════════════════════
// AUTH (público)
// ════════════════════════════════════════════════════════════════

router.post('/auth/login', validate(schemas.portalLogin), asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    try {
        const { portalUser, cliente } = await PortalService.authenticate(email, password, getClientIp(req));
        const tokens = await generateTokensForPortal(portalUser, getClientIp(req), req.headers['user-agent']);
        return res.json({
            success: true,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            expiresIn: '15m',  // SECURITY FIX V17: alinhado com TTL do token
            portalUser: {
                id: portalUser.id,
                email: portalUser.email,
                nome: portalUser.nome,
                telefone: portalUser.telefone,
            },
            cliente: cliente ? {
                id: cliente.id,
                nome: cliente.nome,
                email: cliente.email,
                telefone: cliente.telefone,
            } : null,
        });
    } catch (e) {
        return res.status(401).json({ success: false, error: e.message, code: 'AUTH_FAILED' });
    }
}));

router.post('/auth/forgot', validate(schemas.portalForgot), asyncHandler(async (req, res) => {
    const { email } = req.body;
    const result = await PortalService.requestPasswordReset(email);
    return res.json({ success: true, message: result.message });
}));

router.post('/auth/reset', validate(schemas.portalReset), asyncHandler(async (req, res) => {
    const { token, newPassword } = req.body;
    try {
        const r = await PortalService.resetPassword(token, newPassword);
        return res.json({ success: true, message: r.message });
    } catch (e) {
        return res.status(400).json({ success: false, error: e.message, code: 'RESET_FAILED' });
    }
}));

// ════════════════════════════════════════════════════════════════
// AUTH (autenticado)
// ════════════════════════════════════════════════════════════════

router.post('/auth/logout', portalAuthMiddleware, asyncHandler(async (req, res) => {
    await PortalService.revokeSession(req.portalSession.jti);
    return res.json({ success: true, message: 'Logout realizado' });
}));

router.post('/auth/refresh', asyncHandler(async (req, res) => {
    const { refreshToken } = req.body || {};
    if (!refreshToken) {
        return res.status(400).json({ success: false, error: 'refreshToken obrigatório' });
    }
    let payload;
    try {
        payload = verifyToken(refreshToken);
    } catch (e) {
        return res.status(401).json({ success: false, error: 'Refresh token inválido', code: 'INVALID_REFRESH' });
    }
    if (payload.aud !== 'renostter-portal-refresh') {
        return res.status(401).json({ success: false, error: 'Token não é refresh', code: 'INVALID_REFRESH_TYPE' });
    }
    // Revoga o refresh usado
    await PortalService.revokeSession(payload.jti);
    // Cria novo access token
    const newJti = require('crypto').randomBytes(16).toString('hex');
    const newAccess = signAccessToken({
        portalUserId: payload.portalUserId,
        jti: newJti,
    });
    await PortalService.createSession(payload.portalUserId, newJti, getClientIp(req), req.headers['user-agent'],
        new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString());
    return res.json({ success: true, accessToken: newAccess, expiresIn: '2h' });
}));

router.get('/me', portalAuthMiddleware, asyncHandler(async (req, res) => {
    return res.json({
        success: true,
        portalUser: {
            id: req.portalUser.id,
            email: req.portalUser.email,
            nome: req.portalUser.nome,
            telefone: req.portalUser.telefone,
        },
        cliente: req.portalCliente,
    });
}));

// ════════════════════════════════════════════════════════════════
// CONTRATOS
// ════════════════════════════════════════════════════════════════

router.get('/contracts', portalAuthMiddleware, asyncHandler(async (req, res) => {
    const contracts = await PortalService.getContracts(req.portalUser.id);
    return res.json({ success: true, data: contracts, total: contracts.length });
}));

router.get('/contracts/:id', portalAuthMiddleware, asyncHandler(async (req, res) => {
    const contracts = await PortalService.getContracts(req.portalUser.id);
    const found = contracts.find(c => c.id === req.params.id);
    if (!found) {
        return res.status(404).json({ success: false, error: 'Contrato não encontrado', code: 'NOT_FOUND' });
    }
    return res.json({ success: true, data: found });
}));

// ════════════════════════════════════════════════════════════════
// COBRANÇAS
// ════════════════════════════════════════════════════════════════

router.get('/bills', portalAuthMiddleware, asyncHandler(async (req, res) => {
    const bills = await PortalService.getBills(req.portalUser.id, {
        status: req.query.status,
        limit: req.query.limit || 50,
    });
    return res.json({ success: true, data: bills, total: bills.length });
}));

router.get('/bills/:id', portalAuthMiddleware, asyncHandler(async (req, res) => {
    const bills = await PortalService.getBills(req.portalUser.id, { limit: 200 });
    const found = bills.find(b => b.id === req.params.id);
    if (!found) {
        return res.status(404).json({ success: false, error: 'Cobrança não encontrada', code: 'NOT_FOUND' });
    }
    return res.json({ success: true, data: found });
}));

// ════════════════════════════════════════════════════════════════
// CHAMADOS
// ════════════════════════════════════════════════════════════════

router.get('/tickets', portalAuthMiddleware, asyncHandler(async (req, res) => {
    const tickets = await PortalService.getTickets(req.portalUser.id, {
        status: req.query.status,
        limit: req.query.limit || 50,
    });
    return res.json({ success: true, data: tickets, total: tickets.length });
}));

router.get('/tickets/:id', portalAuthMiddleware, asyncHandler(async (req, res) => {
    const tickets = await PortalService.getTickets(req.portalUser.id, { limit: 200 });
    const found = tickets.find(t => t.id === req.params.id);
    if (!found) {
        return res.status(404).json({ success: false, error: 'Chamado não encontrado', code: 'NOT_FOUND' });
    }
    return res.json({ success: true, data: found });
}));

router.post('/tickets', portalAuthMiddleware, validate(schemas.portalTicket), asyncHandler(async (req, res) => {
    const { titulo, descricao, categoria, prioridade, equipamento_id } = req.body;
    const result = await PortalService.createTicket(req.portalUser.id, {
        titulo, descricao, categoria, prioridade, equipamento_id,
    });
    return res.status(201).json({ success: true, data: result });
}));

// ════════════════════════════════════════════════════════════════
// EQUIPAMENTOS
// ════════════════════════════════════════════════════════════════

router.get('/equipment', portalAuthMiddleware, asyncHandler(async (req, res) => {
    const equipment = await PortalService.getEquipment(req.portalUser.id);
    return res.json({ success: true, data: equipment, total: equipment.length });
}));

// ════════════════════════════════════════════════════════════════
// NOTIFICAÇÕES
// ════════════════════════════════════════════════════════════════

router.get('/notifications', portalAuthMiddleware, asyncHandler(async (req, res) => {
    const notifs = await PortalService.getNotifications(req.portalUser.id, {
        limit: req.query.limit || 20,
        onlyUnread: req.query.unread === 'true',
    });
    return res.json({ success: true, data: notifs, total: notifs.length });
}));

router.post('/notifications/:id/read', portalAuthMiddleware, asyncHandler(async (req, res) => {
    await PortalService.markNotificationRead(req.portalUser.id, req.params.id);
    return res.json({ success: true });
}));

// ════════════════════════════════════════════════════════════════
// PROFILE
// ════════════════════════════════════════════════════════════════

router.put('/profile', portalAuthMiddleware, validate(schemas.portalProfile), asyncHandler(async (req, res) => {
    await PortalService.updateProfile(req.portalUser.id, req.body || {});
    return res.json({ success: true });
}));

// ════════════════════════════════════════════════════════════════
// ADMIN (criar/gerenciar portal users) — requer role admin+
// ════════════════════════════════════════════════════════════════

router.post('/admin/users', requireRole('admin', 'superadmin'), asyncHandler(async (req, res) => {
    const { clienteId, email, nome, telefone, password } = req.body || {};
    const result = await PortalService.createPortalUser({ clienteId, email, nome, telefone, password });
    return res.status(201).json({ success: true, data: result });
}));

router.get('/admin/users', requireRole('admin', 'superadmin'), asyncHandler(async (req, res) => {
    const users = await PortalService.listPortalUsers(req.tenantId);
    return res.json({ success: true, data: users, total: users.length });
}));

router.patch('/admin/users/:id/disable', requireRole('admin', 'superadmin'), asyncHandler(async (req, res) => {
    await PortalService.disablePortalUser(req.params.id);
    return res.json({ success: true });
}));

router.patch('/admin/users/:id/enable', requireRole('admin', 'superadmin'), asyncHandler(async (req, res) => {
    await PortalService.enablePortalUser(req.params.id);
    return res.json({ success: true });
}));

// ════════════════════════════════════════════════════════════════
// LGPD — Direitos do Titular
// ════════════════════════════════════════════════════════════════

/**
 * GET /api/portal/lgpd/me
 * Retorna todos os dados pessoais do cliente logado (direito de acesso — LGPD art. 18, I)
 */
router.get('/lgpd/me', portalAuthMiddleware, asyncHandler(async (req, res) => {
    await LGPDService.auditAccess({
        userId: req.portalUser.id,
        userRole: 'portal',
        clienteId: req.portalUser.cliente_id,
        acao: 'export',
        entidade: 'cliente',
        entidadeId: req.portalUser.cliente_id,
        ip: getClientIp(req),
        userAgent: req.headers['user-agent'],
        motivo: 'Titular solicitou acesso aos seus dados (LGPD art. 18, I)',
    });
    const data = await LGPDService.exportClienteData(req.portalUser.cliente_id);
    return res.json({ success: true, data });
}));

/**
 * GET /api/portal/lgpd/download
 * Download em arquivo JSON (portabilidade — LGPD art. 18, V)
 */
router.get('/lgpd/download', portalAuthMiddleware, asyncHandler(async (req, res) => {
    await LGPDService.auditAccess({
        userId: req.portalUser.id,
        userRole: 'portal',
        clienteId: req.portalUser.cliente_id,
        acao: 'download',
        entidade: 'cliente',
        entidadeId: req.portalUser.cliente_id,
        ip: getClientIp(req),
        userAgent: req.headers['user-agent'],
        motivo: 'Titular baixou seus dados (LGPD art. 18, V)',
    });
    const data = await LGPDService.exportClienteData(req.portalUser.cliente_id);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="meus_dados_${data.titular.id}.json"`);
    return res.send(JSON.stringify(data, null, 2));
}));

/**
 * POST /api/portal/lgpd/dsar
 * Titular abre um DSAR (acesso, portabilidade, correção, exclusão, oposição)
 */
router.post('/lgpd/dsar', portalAuthMiddleware, validate(schemas.lgpdDSAR), asyncHandler(async (req, res) => {
    const { tipo, descricao } = req.body;
    const result = await LGPDService.createDSAR({
        clienteId: req.portalUser.cliente_id,
        tipo,
        descricao,
        ip: getClientIp(req),
    });
    return res.status(201).json({ success: true, data: result });
}));

/**
 * GET /api/portal/lgpd/dsar
 * Lista os DSARs do titular logado.
 */
router.get('/lgpd/dsar', portalAuthMiddleware, asyncHandler(async (req, res) => {
    const dsars = await LGPDService.listDSARs({
        clienteId: req.portalUser.cliente_id,
    });
    return res.json({ success: true, data: dsars, total: dsars.length });
}));

/**
 * GET /api/portal/lgpd/consents
 * Lista consentimentos do titular.
 */
router.get('/lgpd/consents', portalAuthMiddleware, asyncHandler(async (req, res) => {
    const consents = await LGPDService.getConsents(req.portalUser.cliente_id);
    return res.json({ success: true, data: consents });
}));

/**
 * POST /api/portal/lgpd/consents
 * Registra ou atualiza consentimento.
 * Body: { tipo, aceito }
 */
router.post('/lgpd/consents', portalAuthMiddleware, validate(schemas.lgpdConsent), asyncHandler(async (req, res) => {
    const { tipo, aceito } = req.body;
    const result = await LGPDService.recordConsent({
        clienteId: req.portalUser.cliente_id,
        tipo,
        aceito,
        ip: getClientIp(req),
        userAgent: req.headers['user-agent'],
        metodoColeta: 'portal',
    });
    return res.json({ success: true, data: result });
}));

module.exports = router;
