/**
 * /api/tenants — Endpoints REST de Multi-tenant (Sprint 13)
 *
 * Esta rota é ISENTA do tenantContext (gerencia tenants em si).
 * Mas exige authMiddleware (JWT) e autorização por role global (não por tenant).
 *
 * Endpoints:
 *   GET    /api/tenants                  → lista tenants (superadmin only)
 *   GET    /api/tenants/me               → tenants do user logado
 *   GET    /api/tenants/:id              → detalhe de 1 tenant
 *   POST   /api/tenants                  → cria tenant (superadmin)
 *   PATCH  /api/tenants/:id              → atualiza tenant (superadmin|owner)
 *   POST   /api/tenants/:id/suspend      → suspende (superadmin)
 *   POST   /api/tenants/:id/reactivate   → reativa (superadmin)
 *   POST   /api/tenants/:id/cancel       → cancela (superadmin)
 *   GET    /api/tenants/:id/users        → lista users do tenant
 *   POST   /api/tenants/:id/users        → adiciona user (superadmin|owner|admin)
 *   PATCH  /api/tenants/:id/users/:userId → atualiza role (owner|admin)
 *   DELETE /api/tenants/:id/users/:userId → remove user (owner|admin)
 *   POST   /api/tenants/:id/invites      → convida user por email (owner|admin)
 *   GET    /api/tenants/:id/invites      → lista convites pendentes
 *   POST   /api/tenants/accept-invite    → aceita convite (autenticado, qualquer user)
 *   GET    /api/tenants/:id/stats        → estatísticas do tenant
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');

const TenantService = require('../services/TenantService');
const { dbGet, dbRun, dbAll } = require('../database');
const { requireRole } = require('../middleware/authJWT');
const { requireTenantRole } = require('../middleware/tenantContext');

const { invalidateTenantCache } = TenantService;

// ════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════

function asyncHandler(fn) {
    return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function isSuperadmin(req) {
    return req.auditInfo?.role === 'superadmin';
}

function requireGlobalAdmin(req, res, next) {
    if (isSuperadmin(req)) return next();
    // Admin também pode ler (mas não criar/deletar)
    if (req.auditInfo?.role === 'admin' && req.method === 'GET') return next();
    return res.status(403).json({
        success: false,
        error: 'Acesso restrito a superadmin',
        code: 'SUPERADMIN_REQUIRED',
    });
}

/**
 * Para PATCH/DELETE/POST de tenants específicos: o caller precisa ser
 * superadmin OU owner/admin do tenant.
 */
async function assertCanManageTenant(req, res, next) {
    if (isSuperadmin(req)) return next();
    const tenantId = req.params.id;
    if (!tenantId) return res.status(400).json({ success: false, error: 'id obrigatório', code: 'MISSING_ID' });
    const access = await TenantService.userHasAccessTo(req.auditInfo.userId, tenantId);
    if (!access || !access.hasAccess) {
        return res.status(403).json({ success: false, error: 'Sem acesso a este tenant', code: 'TENANT_FORBIDDEN' });
    }
    if (!['owner', 'admin'].includes(access.role)) {
        return res.status(403).json({ success: false, error: 'Apenas owner/admin podem gerenciar', code: 'TENANT_ROLE_REQUIRED' });
    }
    req.tenantUserRole = access.role;
    return next();
}

// ════════════════════════════════════════════════════════════════
// LIST / DETAIL
// ════════════════════════════════════════════════════════════════

/**
 * GET /api/tenants
 * Superadmin: vê TODOS os tenants.
 * Admin: vê apenas os tenants onde é owner/admin.
 */
router.get('/', requireGlobalAdmin, asyncHandler(async (req, res) => {
    const { status, plano, search, limit, offset } = req.query;

    if (!isSuperadmin(req)) {
        // admin não-super: vê só os próprios tenants
        const tenants = await TenantService.getUserTenants(req.auditInfo.userId);
        return res.json({
            success: true,
            data: tenants,
            total: tenants.length,
        });
    }

    const result = await TenantService.listTenants({
        status, plano, search,
        limit: Math.min(parseInt(limit) || 50, 200),
        offset: parseInt(offset) || 0,
    });
    return res.json({ success: true, ...result });
}));

/**
 * GET /api/tenants/me
 * Lista tenants do user logado (sempre permitido).
 */
router.get('/me', asyncHandler(async (req, res) => {
    const userId = req.auditInfo?.userId;
    if (!userId) return res.status(401).json({ success: false, error: 'Não autenticado', code: 'NO_AUTH' });
    const tenants = await TenantService.getUserTenants(userId);
    return res.json({ success: true, data: tenants, total: tenants.length });
}));

/**
 * GET /api/tenants/:id
 */
router.get('/:id', asyncHandler(async (req, res) => {
    const tenant = await TenantService.getTenant(req.params.id);
    if (!tenant) return res.status(404).json({ success: false, error: 'Tenant não encontrado', code: 'NOT_FOUND' });
    // Acesso: superadmin, owner/admin do tenant, ou default
    if (!isSuperadmin(req) && tenant.id !== TenantService.DEFAULT_TENANT_ID) {
        const access = await TenantService.userHasAccessTo(req.auditInfo.userId, tenant.id);
        if (!access || !access.hasAccess) {
            return res.status(403).json({ success: false, error: 'Sem acesso a este tenant', code: 'TENANT_FORBIDDEN' });
        }
    }
    return res.json({ success: true, data: tenant });
}));

// ════════════════════════════════════════════════════════════════
// CREATE / UPDATE / STATUS
// ════════════════════════════════════════════════════════════════

/**
 * POST /api/tenants
 * Cria novo tenant. Apenas superadmin.
 */
router.post('/', requireRole('superadmin'), asyncHandler(async (req, res) => {
    const { slug, nome, documento, email, telefone, plano, status,
            limite_usuarios, limite_contratos, limite_armazenamento_mb, data_expiracao,
            ownerUserId } = req.body || {};

    if (!slug || !nome) {
        return res.status(400).json({ success: false, error: 'slug e nome são obrigatórios', code: 'MISSING_FIELDS' });
    }

    const tenant = await TenantService.createTenant({
        slug, nome, documento, email, telefone,
        plano, status,
        limite_usuarios, limite_contratos, limite_armazenamento_mb, data_expiracao,
        ownerUserId: ownerUserId || req.auditInfo.userId,
    });

    invalidateTenantCache();
    return res.status(201).json({ success: true, data: tenant });
}));

/**
 * PATCH /api/tenants/:id
 * Superadmin: pode editar qualquer campo.
 * Owner/admin: só pode editar dados de contato (telefone, email, nome).
 */
router.patch('/:id', assertCanManageTenant, asyncHandler(async (req, res) => {
    const input = { ...(req.body || {}) };
    if (!isSuperadmin(req)) {
        // Não-admin só pode editar telefone/email/nome
        const allowed = ['nome', 'email', 'telefone', 'documento'];
        const filtered = {};
        for (const k of allowed) {
            if (input[k] !== undefined) filtered[k] = input[k];
        }
        if (Object.keys(filtered).length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Owner/admin só pode editar nome/email/telefone/documento',
                code: 'INSUFFICIENT_FIELDS',
            });
        }
        Object.assign(input, filtered);
        // Limpa campos que owner/admin não pode mexer
        delete input.plano; delete input.status; delete input.limite_usuarios;
        delete input.limite_contratos; delete input.limite_armazenamento_mb; delete input.data_expiracao;
    }

    const tenant = await TenantService.updateTenant(req.params.id, input);
    invalidateTenantCache(tenant.id);
    return res.json({ success: true, data: tenant });
}));

/**
 * POST /api/tenants/:id/suspend
 */
router.post('/:id/suspend', requireRole('superadmin'), asyncHandler(async (req, res) => {
    const { motivo } = req.body || {};
    const tenant = await TenantService.suspendTenant(req.params.id, motivo);
    invalidateTenantCache(tenant.id);
    return res.json({ success: true, data: tenant });
}));

/**
 * POST /api/tenants/:id/reactivate
 */
router.post('/:id/reactivate', requireRole('superadmin'), asyncHandler(async (req, res) => {
    const tenant = await TenantService.reactivateTenant(req.params.id);
    invalidateTenantCache(tenant.id);
    return res.json({ success: true, data: tenant });
}));

/**
 * POST /api/tenants/:id/cancel
 * Soft delete: status='cancelado'. Não remove dados.
 */
router.post('/:id/cancel', requireRole('superadmin'), asyncHandler(async (req, res) => {
    const tenant = await TenantService.updateTenant(req.params.id, { status: 'cancelado' });
    invalidateTenantCache(tenant.id);
    return res.json({ success: true, data: tenant });
}));

// ════════════════════════════════════════════════════════════════
// USERS DO TENANT
// ════════════════════════════════════════════════════════════════

/**
 * GET /api/tenants/:id/users
 */
router.get('/:id/users', asyncHandler(async (req, res) => {
    if (!isSuperadmin(req)) {
        const access = await TenantService.userHasAccessTo(req.auditInfo.userId, req.params.id);
        if (!access || !access.hasAccess) {
            return res.status(403).json({ success: false, error: 'Sem acesso a este tenant', code: 'TENANT_FORBIDDEN' });
        }
    }
    const users = await TenantService.getTenantUsers(req.params.id);
    return res.json({ success: true, data: users, total: users.length });
}));

/**
 * POST /api/tenants/:id/users
 * Body: { userId, role }
 */
router.post('/:id/users', assertCanManageTenant, asyncHandler(async (req, res) => {
    const { userId, role } = req.body || {};
    if (!userId) return res.status(400).json({ success: false, error: 'userId obrigatório', code: 'MISSING_USER_ID' });
    // owner não pode adicionar outro owner
    let effectiveRole = role || 'user';
    if (effectiveRole === 'owner' && !isSuperadmin(req) && req.tenantUserRole !== 'owner') {
        return res.status(403).json({ success: false, error: 'Apenas superadmin ou owner pode promover a owner', code: 'OWNER_PROMOTE_FORBIDDEN' });
    }
    const result = await TenantService.addUserToTenant({
        tenantId: req.params.id,
        userId,
        role: effectiveRole,
        convidadoPor: req.auditInfo.userId,
    });
    invalidateTenantCache(req.params.id);
    return res.json({ success: true, data: result });
}));

/**
 * PATCH /api/tenants/:id/users/:userId
 * Body: { role }
 */
router.patch('/:id/users/:userId', assertCanManageTenant, asyncHandler(async (req, res) => {
    const { role } = req.body || {};
    if (!role) return res.status(400).json({ success: false, error: 'role obrigatório', code: 'MISSING_ROLE' });
    // Não-superadmin não promove a owner
    if (role === 'owner' && !isSuperadmin(req) && req.tenantUserRole !== 'owner') {
        return res.status(403).json({ success: false, error: 'Apenas superadmin ou owner pode promover a owner', code: 'OWNER_PROMOTE_FORBIDDEN' });
    }
    const result = await TenantService.updateUserRole(req.params.id, req.params.userId, role);
    invalidateTenantCache(req.params.id);
    return res.json({ success: true, data: result });
}));

/**
 * DELETE /api/tenants/:id/users/:userId
 * Owner pode remover qualquer um (exceto último owner).
 * Admin só pode remover user/viewer.
 */
router.delete('/:id/users/:userId', assertCanManageTenant, asyncHandler(async (req, res) => {
    // Admin não pode remover owner
    if (!isSuperadmin(req) && req.tenantUserRole === 'admin') {
        const target = await TenantService.userHasAccessTo(req.params.userId, req.params.id);
        if (target && target.role === 'owner') {
            return res.status(403).json({ success: false, error: 'Admin não pode remover owner', code: 'REMOVE_OWNER_FORBIDDEN' });
        }
    }
    const result = await TenantService.removeUserFromTenant(req.params.id, req.params.userId);
    invalidateTenantCache(req.params.id);
    return res.json({ success: true, data: result });
}));

// ════════════════════════════════════════════════════════════════
// CONVITES
// ════════════════════════════════════════════════════════════════

/**
 * POST /api/tenants/:id/invites
 * Body: { email, role?, ttlHours? }
 */
router.post('/:id/invites', assertCanManageTenant, asyncHandler(async (req, res) => {
    const { email, role, ttlHours } = req.body || {};
    if (!email) return res.status(400).json({ success: false, error: 'email obrigatório', code: 'MISSING_EMAIL' });
    let effectiveRole = role || 'user';
    if (effectiveRole === 'owner' && !isSuperadmin(req) && req.tenantUserRole !== 'owner') {
        return res.status(403).json({ success: false, error: 'Apenas superadmin ou owner pode convidar owner', code: 'OWNER_INVITE_FORBIDDEN' });
    }
    const invite = await TenantService.inviteUserToTenant({
        tenantId: req.params.id,
        email,
        role: effectiveRole,
        convidadoPor: req.auditInfo.userId,
        ttlHours: ttlHours || 72,
    });
    return res.status(201).json({ success: true, data: invite });
}));

/**
 * GET /api/tenants/:id/invites
 * Lista convites pendentes do tenant.
 */
router.get('/:id/invites', assertCanManageTenant, asyncHandler(async (req, res) => {
    const invites = await dbAll(
        `SELECT id, tenant_id, email, role, expira_em, aceito_em, convidado_por, created_at
         FROM tenant_invites
         WHERE tenant_id = ? AND aceito_em IS NULL
         ORDER BY created_at DESC`,
        [req.params.id]
    );
    return res.json({ success: true, data: invites, total: invites.length });
}));

/**
 * POST /api/tenants/accept-invite
 * Body: { token }
 * Aceita convite (não é por :id, é cross-tenant).
 */
router.post('/accept-invite', asyncHandler(async (req, res) => {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ success: false, error: 'token obrigatório', code: 'MISSING_TOKEN' });
    const result = await TenantService.acceptInvite({ token, userId: req.auditInfo.userId });
    return res.json({ success: true, data: result });
}));

// ════════════════════════════════════════════════════════════════
// STATS
// ════════════════════════════════════════════════════════════════

/**
 * GET /api/tenants/:id/stats
 */
router.get('/:id/stats', asyncHandler(async (req, res) => {
    if (!isSuperadmin(req)) {
        const access = await TenantService.userHasAccessTo(req.auditInfo.userId, req.params.id);
        if (!access || !access.hasAccess) {
            return res.status(403).json({ success: false, error: 'Sem acesso a este tenant', code: 'TENANT_FORBIDDEN' });
        }
    }
    const stats = await TenantService.getTenantStats(req.params.id);
    if (!stats) return res.status(404).json({ success: false, error: 'Tenant não encontrado', code: 'NOT_FOUND' });
    return res.json({ success: true, data: stats });
}));

module.exports = router;
