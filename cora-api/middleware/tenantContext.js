/**
 * tenantContext — Middleware de Multi-tenant (Sprint 13)
 *
 * Responsabilidade:
 *   Para cada request autenticado, garante que `req.tenantId` está definido
 *   e que o usuário tem acesso ao tenant em questão. Sem tenant, request
 *   é bloqueada com 403.
 *
 * Estratégia (em ordem de precedência):
 *   1. Header `X-Tenant-Id`     — override explícito (ex: superadmin navegando)
 *   2. Query `?tenant=<id|slug>` — override via URL
 *   3. JWT `tenantId`            — tenant ativo do usuário
 *   4. Tenant default            — fallback (compatibilidade com single-tenant)
 *
 * Acesso:
 *   - Usuário comum: precisa estar em `tenant_users` para esse tenant (ativo=1)
 *   - Superadmin:  bypass (acessa qualquer tenant)
 *   - `owner|admin` em um tenant: acesso total ao tenant
 *   - `user|viewer`: pode ler, mas checagens de escrita ficam no handler
 *
 * Como usar:
 *   const { tenantContext, requireTenantRole } = require('./middleware/tenantContext');
 *   app.use(tenantContext);                                      // todas as rotas autenticadas
 *   app.post('/api/x', tenantContext, requireTenantRole('admin', 'owner'), handler);
 *
 * Rotas isentas (não exigem tenant):
 *   - /api/auth/* (login, me, etc.)
 *   - /api/tenants* (CRUD admin de tenants em si)
 *   - /health
 *   - Webhooks
 *
 * Saída do middleware:
 *   - req.tenantId  → ID do tenant ativo
 *   - req.tenant    → objeto tenant (cache em memória por request)
 *   - req.tenantRole → role do user no tenant (owner|admin|user|viewer)
 *   - req.isSuperadmin → true se superadmin
 */

const path = require('path');
const TenantService = require('../services/TenantService');
const { runWithTenant, runWithoutTenant } = require('../infra/tenantAwareDb');

const { DEFAULT_TENANT_ID, getTenant, getTenantBySlug, getUserTenants, userHasAccessTo } = TenantService;

// Rotas que NÃO exigem tenant (rotas de auth ou superadmin)
const TENANT_EXEMPT_PREFIXES = [
    '/api/auth/',
    '/api/tenants',        // /api/tenants/... — admin de tenants em si
    '/api/admin/tenants',  // alias
    '/api/portal/',        // Sprint 15: portal usa cliente_id próprio
    '/api/portal',         // cobre /api/portal sem trailing
    '/health',
    '/api/cobrancas/webhook',
    '/api/webhooks/',
    '/api/uploads/sign',
    '/api/uploads/url',
];

// Endpoints admin que operam CROSS-TENANT (superadmin only)
const CROSS_TENANT_PREFIXES = [
    '/api/admin/super/',
];

/**
 * Verifica se a rota é isenta de tenant check.
 */
function isExempt(req) {
    const p = req.path;
    return TENANT_EXEMPT_PREFIXES.some(prefix => p === prefix || p.startsWith(prefix));
}

function isCrossTenantAdmin(req) {
    const p = req.path;
    return CROSS_TENANT_PREFIXES.some(prefix => p === prefix || p.startsWith(prefix));
}

/**
 * Extrai o tenantId desejado da request, na ordem de precedência.
 * Retorna string ou null.
 */
function extractDesiredTenantId(req) {
    // 1. Header
    const headerTenant = req.headers['x-tenant-id'];
    if (headerTenant) return String(headerTenant).trim();

    // 2. Query
    const queryTenant = req.query.tenant || req.query.tenantId;
    if (queryTenant) return String(queryTenant).trim();

    // 3. Body (POST/PUT/PATCH)
    if (req.body && (req.body.tenantId || req.body.tenant_id)) {
        return String(req.body.tenantId || req.body.tenant_id).trim();
    }

    // 4. JWT (setado pelo authMiddleware)
    const audit = req.auditInfo || {};
    if (audit.tenantId) return String(audit.tenantId).trim();

    return null;
}

/**
 * Cache simples em memória: tenantId → objeto tenant
 * TTL 60s — reduz hits no DB. Não é crítico ter dados 100% fresh aqui.
 */
const _tenantCache = new Map();
const _tenantCacheTtl = 60_000;

async function getTenantCached(tenantIdOrSlug) {
    if (!tenantIdOrSlug) return null;
    const cached = _tenantCache.get(tenantIdOrSlug);
    if (cached && Date.now() - cached.ts < _tenantCacheTtl) {
        return cached.tenant;
    }
    // Tenta como ID; se falhar, tenta como slug
    let tenant = await getTenant(tenantIdOrSlug);
    if (!tenant) tenant = await getTenantBySlug(tenantIdOrSlug);
    if (tenant) _tenantCache.set(tenantIdOrSlug, { tenant, ts: Date.now() });
    return tenant;
}

function invalidateTenantCache(tenantId) {
    if (tenantId) {
        _tenantCache.delete(tenantId);
    } else {
        _tenantCache.clear();
    }
}

/**
 * Resolve qual tenant usar para este request.
 * Retorna { tenantId, tenant, source } ou null.
 */
async function resolveTenant(req) {
    const desired = extractDesiredTenantId(req);
    const userId = req.auditInfo?.userId;
    const role = req.auditInfo?.role;

    if (!userId) {
        // Sem auth, não há tenant. Rotas públicas/webhooks não chegam aqui
        // (são isentas ou o authMiddleware barra antes).
        return null;
    }

    // 1. Sem desired → usa o default OU o primeiro tenant do user
    if (!desired) {
        // Se o user tem JWT tenantId, esse é o "default" dele
        const jwtTenant = req.auditInfo.tenantId;
        if (jwtTenant) {
            const tenant = await getTenantCached(jwtTenant);
            if (tenant) return { tenantId: tenant.id, tenant, source: 'jwt' };
        }
        // Senão, primeiro tenant ativo do user
        const userTenants = await getUserTenants(userId);
        if (userTenants.length > 0) {
            const t = userTenants[0];
            const tenant = await getTenantCached(t.id);
            if (tenant) return { tenantId: tenant.id, tenant, source: 'user-default' };
        }
        // Fallback: tenant default (single-tenant legacy)
        const def = await getTenantCached(DEFAULT_TENANT_ID);
        if (def) return { tenantId: def.id, tenant: def, source: 'system-default' };
        return null;
    }

    // 2. desired fornecido — resolve (pode ser ID ou slug)
    const tenant = await getTenantCached(desired);
    if (!tenant) {
        return { tenantId: desired, tenant: null, source: 'invalid', error: 'TENANT_NOT_FOUND' };
    }

    return { tenantId: tenant.id, tenant, source: 'explicit' };
}

/**
 * Verifica permissão do user no tenant resolvido.
 * Retorna { allowed, role, reason }.
 */
async function checkPermission(req, resolved) {
    if (!resolved || !resolved.tenant) return { allowed: false, reason: 'TENANT_NOT_FOUND' };

    const userId = req.auditInfo?.userId;
    const userRole = req.auditInfo?.role;

    // Superadmin sempre tem acesso
    if (userRole === 'superadmin') {
        return { allowed: true, role: 'superadmin', reason: 'SUPERADMIN_BYPASS' };
    }

    // Tenant default — todos os users autenticados têm acesso (legado single-tenant)
    if (resolved.tenantId === DEFAULT_TENANT_ID) {
        return { allowed: true, role: 'legacy-default', reason: 'DEFAULT_TENANT_PUBLIC' };
    }

    // Para outros tenants, checa tenant_users
    const access = await userHasAccessTo(userId, resolved.tenantId);
    if (!access) {
        return { allowed: false, reason: 'NO_TENANT_MEMBERSHIP' };
    }
    if (!access.hasAccess) {
        return { allowed: false, reason: 'TENANT_MEMBERSHIP_INACTIVE' };
    }
    return { allowed: true, role: access.role, reason: 'OK' };
}

/**
 * Middleware principal.
 */
async function tenantContext(req, res, next) {
    // Se a rota é isenta, segue
    if (isExempt(req)) {
        return next();
    }

    // Se o user não está autenticado, deixa o authMiddleware cuidar
    if (!req.auditInfo?.userId) {
        return next();
    }

    try {
        // Se for endpoint cross-tenant admin, requer superadmin
        if (isCrossTenantAdmin(req)) {
            if (req.auditInfo.role !== 'superadmin') {
                return res.status(403).json({
                    success: false,
                    error: 'Acesso restrito a superadmin',
                    code: 'SUPERADMIN_REQUIRED',
                });
            }
            // superadmin pode navegar sem tenant específico
            req.tenantId = null;
            req.tenant = null;
            req.tenantRole = 'superadmin';
            req.isSuperadmin = true;
            // Cross-tenant admin: bypassa o filtro (queries não são filtradas)
            return runWithoutTenant(() => next());
        }

        const resolved = await resolveTenant(req);

        if (!resolved) {
            return res.status(403).json({
                success: false,
                error: 'Nenhum tenant disponível para este usuário',
                code: 'NO_TENANT',
            });
        }

        if (resolved.error === 'TENANT_NOT_FOUND') {
            return res.status(404).json({
                success: false,
                error: `Tenant não encontrado: ${resolved.tenantId}`,
                code: 'TENANT_NOT_FOUND',
            });
        }

        // Se for o tenant default e o user NÃO tem JWT tenantId nem header,
        // permitimos fallback (legado). Mas se ele explicitamente pediu outro
        // tenant, aí checamos permissão.
        const perm = await checkPermission(req, resolved);
        if (!perm.allowed) {
            return res.status(403).json({
                success: false,
                error: 'Sem permissão para acessar este tenant',
                code: perm.reason,
                tenantId: resolved.tenantId,
            });
        }

        req.tenantId = resolved.tenantId;
        req.tenant = resolved.tenant;
        req.tenantRole = perm.role;
        req.isSuperadmin = req.auditInfo.role === 'superadmin';
        req.tenantSource = resolved.source;

        // Adiciona um helper para query filtering
        req.tenantFilter = {
            tenantId: resolved.tenantId,
            column: 'tenant_id',
        };

        // Sprint 13.8: Wrap next() em runWithTenant para que queries subsequentes
        // (via dbGetTenant, dbAllTenant, dbRunTenant) sejam automaticamente
        // filtradas por tenant_id.
        // Superadmin pode bypassar com ?allTenants=true (apenas em rotas que aceitam)
        const bypass = req.isSuperadmin && req.query && req.query.allTenants === 'true';
        if (bypass) {
            return runWithoutTenant(() => next());
        }
        return runWithTenant(req, () => next());
    } catch (err) {
        console.error('[TenantContext] Erro:', err);
        return res.status(500).json({
            success: false,
            error: 'Erro ao resolver contexto de tenant',
            code: 'TENANT_CONTEXT_ERROR',
        });
    }
}

/**
 * Middleware de autorização por role no tenant.
 * Uso: app.post('/x', requireTenantRole('admin', 'owner'), handler)
 *
 * Superadmin sempre passa.
 * Default tenant (legado) libera user|admin|superadmin (qualquer um não-viewer).
 */
function requireTenantRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.auditInfo?.userId) {
            return res.status(401).json({ success: false, error: 'Não autenticado', code: 'NO_AUTH' });
        }
        if (!req.tenantId) {
            return res.status(400).json({ success: false, error: 'Contexto de tenant ausente', code: 'NO_TENANT_CONTEXT' });
        }
        const role = req.tenantRole;
        if (req.isSuperadmin) return next();
        if (req.tenantId === DEFAULT_TENANT_ID && req.tenantRole === 'legacy-default') {
            // Tenant default legado: libera admin e user
            if (allowedRoles.length === 0 || allowedRoles.includes('admin') || allowedRoles.includes('user')) {
                return next();
            }
        }
        if (allowedRoles.length === 0 || allowedRoles.includes(role)) {
            return next();
        }
        return res.status(403).json({
            success: false,
            error: 'Permissão insuficiente no tenant',
            code: 'TENANT_FORBIDDEN',
            requiredRoles: allowedRoles,
            currentRole: role,
        });
    };
}

module.exports = {
    tenantContext,
    requireTenantRole,
    invalidateTenantCache,
    isExempt,
    isCrossTenantAdmin,
    extractDesiredTenantId,
    resolveTenant,
    // re-exports úteis
    DEFAULT_TENANT_ID,
};
