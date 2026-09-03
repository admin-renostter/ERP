/**
 * TenantService — Lógica de Multi-tenant (Sprint 13)
 *
 * Padrão: Shared Database, Shared Schema (estilo Stripe/GitHub)
 *   - Cada tabela relevante tem `tenant_id` (FK para `tenants.id`)
 *   - Cada user pode acessar N tenants via `tenant_users`
 *   - Superadmin tem acesso a TODOS os tenants (bypass de filtro)
 *
 * Funções principais:
 *   - listTenants()             → lista todos os tenants (superadmin)
 *   - getTenant(id)             → busca um tenant
 *   - createTenant(input)       → cria novo tenant + adiciona owner
 *   - updateTenant(id, input)   → atualiza dados do tenant
 *   - suspendTenant(id, motivo) → suspende tenant (status='suspenso')
 *   - cancelTenant(id)          → cancela tenant (status='cancelado')
 *
 *   - getUserTenants(userId)    → lista tenants do usuário
 *   - userHasAccessTo(uid, tid) → checa se user tem acesso ao tenant
 *   - addUserToTenant(...)      → adiciona user ao tenant
 *   - removeUserFromTenant(...) → remove user do tenant
 *   - updateUserRole(...)       → atualiza role do user no tenant
 *   - inviteUserToTenant(...)   → cria convite
 *   - acceptInvite(token)       → aceita convite
 *
 *   - getTenantStats(id)        → contadores (users, contratos, etc.)
 *
 * IMPORTANTE — tenant default:
 *   O sistema cria automaticamente um tenant "default" (id='tnt_default').
 *   Dados legados (single-tenant) continuam funcionando porque o middleware
 *   `tenantContext` injeta `tenantId='tnt_default'` se o user não tiver
 *   registro em `tenant_users`.
 */

const crypto = require('crypto');
const { dbGet, dbAll, dbRun } = require('../database');

const DEFAULT_TENANT_ID = 'tnt_default';
const DEFAULT_TENANT_SLUG = 'default';

const VALID_ROLES = new Set(['owner', 'admin', 'user', 'viewer']);
const VALID_STATUS = new Set(['ativo', 'suspenso', 'cancelado', 'trial']);
const VALID_PLANOS = new Set(['trial', 'starter', 'pro', 'enterprise']);

function newId(prefix) {
    return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

// ════════════════════════════════════════════════════════════════
// TENANT CRUD
// ════════════════════════════════════════════════════════════════

/**
 * Lista todos os tenants (uso admin/superadmin).
 * Suporta filtros: status, plano, search.
 */
async function listTenants({ status, plano, search, limit = 100, offset = 0 } = {}) {
    const where = [];
    const params = [];

    if (status) {
        where.push('status = ?');
        params.push(status);
    }
    if (plano) {
        where.push('plano = ?');
        params.push(plano);
    }
    if (search) {
        // SECURITY FIX V07: escapar wildcards em LIKE
        const { escapeLike } = require('../infra/tenantAwareDb');
        const safe = escapeLike(String(search).toLowerCase());
        where.push("(LOWER(nome) LIKE ? ESCAPE '\\\\' OR LOWER(slug) LIKE ? ESCAPE '\\\\' OR documento LIKE ? ESCAPE '\\\\')");
        const like = `%${safe}%`;
        params.push(like, like, like);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await dbAll(
        `SELECT id, slug, nome, documento, email, telefone, plano, status,
                limite_usuarios, limite_contratos, limite_armazenamento_mb,
                data_expiracao, created_at, updated_at,
                (SELECT COUNT(*) FROM tenant_users tu WHERE tu.tenant_id = t.id AND tu.ativo = 1) AS total_usuarios
         FROM tenants t
         ${whereSql}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
    );

    const countRow = await dbGet(
        `SELECT COUNT(*) AS total FROM tenants ${whereSql}`,
        params
    );

    return { rows, total: countRow?.total || 0, limit, offset };
}

/**
 * Busca um tenant pelo ID.
 */
async function getTenant(id) {
    if (!id) return null;
    return await dbGet(
        `SELECT id, slug, nome, documento, email, telefone, plano, status,
                limite_usuarios, limite_contratos, limite_armazenamento_mb,
                data_expiracao, created_at, updated_at
         FROM tenants WHERE id = ?`,
        [id]
    );
}

/**
 * Busca um tenant pelo slug.
 */
async function getTenantBySlug(slug) {
    if (!slug) return null;
    return await dbGet(
        `SELECT id, slug, nome, documento, email, telefone, plano, status,
                limite_usuarios, limite_contratos, limite_armazenamento_mb,
                data_expiracao, created_at, updated_at
         FROM tenants WHERE slug = ?`,
        [slug]
    );
}

/**
 * Cria um novo tenant e adiciona o `ownerUserId` como owner.
 * Operacão atômica: se algo falhar, faz rollback manual (deleta tenant criado).
 */
async function createTenant({
    slug,
    nome,
    documento,
    email,
    telefone,
    plano = 'trial',
    status = 'trial',
    limite_usuarios = 5,
    limite_contratos = 50,
    limite_armazenamento_mb = 100,
    data_expiracao = null,
    ownerUserId,
}) {
    if (!slug || !nome) {
        throw new Error('slug e nome são obrigatórios');
    }
    slug = String(slug).toLowerCase().trim();
    if (!/^[a-z0-9-]{2,40}$/.test(slug)) {
        throw new Error('slug inválido (use letras minúsculas, números e hífen, 2-40 chars)');
    }
    if (!VALID_PLANOS.has(plano)) {
        throw new Error(`plano inválido: ${plano}`);
    }
    if (!VALID_STATUS.has(status)) {
        throw new Error(`status inválido: ${status}`);
    }
    if (data_expiracao && Number.isNaN(Date.parse(data_expiracao))) {
        throw new Error('data_expiracao inválida');
    }

    const existing = await getTenantBySlug(slug);
    if (existing) {
        throw new Error(`slug já em uso: ${slug}`);
    }

    const id = newId('tnt');

    try {
        await dbRun(
            `INSERT INTO tenants
             (id, slug, nome, documento, email, telefone, plano, status,
              limite_usuarios, limite_contratos, limite_armazenamento_mb, data_expiracao)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, slug, nome, documento || null, email || null, telefone || null,
             plano, status, limite_usuarios, limite_contratos, limite_armazenamento_mb,
             data_expiracao]
        );

        if (ownerUserId) {
            await addUserToTenant({ tenantId: id, userId: ownerUserId, role: 'owner' });
        }

        return await getTenant(id);
    } catch (err) {
        // Rollback manual: tenta deletar o tenant criado
        try { await dbRun('DELETE FROM tenants WHERE id = ?', [id]); } catch (_) {}
        throw err;
    }
}

/**
 * Atualiza dados de um tenant (campos opcionais).
 */
async function updateTenant(id, input) {
    const tenant = await getTenant(id);
    if (!tenant) throw new Error('tenant não encontrado');
    if (id === DEFAULT_TENANT_ID) {
        // Não permite trocar slug do default, mas outros campos são editáveis
        if (input.slug && input.slug !== DEFAULT_TENANT_SLUG) {
            throw new Error('Não é possível renomear o slug do tenant default');
        }
    }

    const allowed = [
        'nome', 'documento', 'email', 'telefone', 'plano', 'status',
        'limite_usuarios', 'limite_contratos', 'limite_armazenamento_mb', 'data_expiracao'
    ];
    const sets = [];
    const params = [];
    for (const k of allowed) {
        if (input[k] !== undefined) {
            if (k === 'plano' && !VALID_PLANOS.has(input[k])) {
                throw new Error(`plano inválido: ${input[k]}`);
            }
            if (k === 'status' && !VALID_STATUS.has(input[k])) {
                throw new Error(`status inválido: ${input[k]}`);
            }
            sets.push(`${k} = ?`);
            params.push(input[k]);
        }
    }
    if (sets.length === 0) return tenant;

    sets.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    await dbRun(`UPDATE tenants SET ${sets.join(', ')} WHERE id = ?`, params);
    return await getTenant(id);
}

/**
 * Suspende um tenant (status='suspenso'). Não permite suspender o default.
 */
async function suspendTenant(id, motivo) {
    if (id === DEFAULT_TENANT_ID) {
        throw new Error('Não é possível suspender o tenant default');
    }
    await dbRun(
        `UPDATE tenants SET status = 'suspenso', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [id]
    );
    return await getTenant(id);
}

/**
 * Reativa um tenant suspenso.
 */
async function reactivateTenant(id) {
    await dbRun(
        `UPDATE tenants SET status = 'ativo', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'suspenso'`,
        [id]
    );
    return await getTenant(id);
}

// ════════════════════════════════════════════════════════════════
// USER ↔ TENANT (N:N)
// ════════════════════════════════════════════════════════════════

/**
 * Lista tenants do usuário (com role em cada um).
 */
async function getUserTenants(userId) {
    if (!userId) return [];
    return await dbAll(
        `SELECT t.id, t.slug, t.nome, t.plano, t.status, t.data_expiracao,
                tu.role, tu.ativo AS user_ativo, tu.created_at AS associado_em
         FROM tenant_users tu
         JOIN tenants t ON t.id = tu.tenant_id
         WHERE tu.usuario_id = ?
         ORDER BY t.nome ASC`,
        [userId]
    );
}

/**
 * Lista usuários de um tenant.
 */
async function getTenantUsers(tenantId) {
    return await dbAll(
        `SELECT tu.id, tu.tenant_id, tu.usuario_id, tu.role, tu.ativo,
                tu.convidado_por, tu.convidado_em, tu.aceito_em, tu.created_at,
                u.username, u.email, u.nome, u.photo
         FROM tenant_users tu
         LEFT JOIN usuarios u ON u.id = tu.usuario_id
         WHERE tu.tenant_id = ?
         ORDER BY tu.created_at ASC`,
        [tenantId]
    );
}

/**
 * Verifica se um user tem acesso a um tenant.
 * Retorna { hasAccess, role, ativo } ou null se não tem.
 */
async function userHasAccessTo(userId, tenantId) {
    if (!userId || !tenantId) return null;
    const row = await dbGet(
        `SELECT role, ativo FROM tenant_users
         WHERE tenant_id = ? AND usuario_id = ? LIMIT 1`,
        [tenantId, userId]
    );
    if (!row) return null;
    return { hasAccess: row.ativo === 1, role: row.role, ativo: row.ativo };
}

/**
 * Adiciona um user a um tenant. Se já existir, atualiza role/ativo.
 */
async function addUserToTenant({ tenantId, userId, role = 'user', convidadoPor = null }) {
    if (!VALID_ROLES.has(role)) {
        throw new Error(`role inválida: ${role}`);
    }
    const tenant = await getTenant(tenantId);
    if (!tenant) throw new Error('tenant não encontrado');

    // Conta usuários ativos pra checar limite
    const countRow = await dbGet(
        `SELECT COUNT(*) AS n FROM tenant_users WHERE tenant_id = ? AND ativo = 1`,
        [tenantId]
    );
    if ((countRow?.n || 0) >= tenant.limite_usuarios) {
        throw new Error(`Limite de usuários atingido (${tenant.limite_usuarios})`);
    }

    const existing = await dbGet(
        `SELECT id, ativo FROM tenant_users WHERE tenant_id = ? AND usuario_id = ?`,
        [tenantId, userId]
    );

    if (existing) {
        await dbRun(
            `UPDATE tenant_users SET role = ?, ativo = 1, aceito_em = COALESCE(aceito_em, CURRENT_TIMESTAMP)
             WHERE id = ?`,
            [role, existing.id]
        );
    } else {
        const id = newId('tu');
        await dbRun(
            `INSERT INTO tenant_users
             (id, tenant_id, usuario_id, role, ativo, convidado_por, convidado_em, aceito_em)
             VALUES (?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [id, tenantId, userId, role, convidadoPor]
        );
    }

    return await userHasAccessTo(userId, tenantId);
}

/**
 * Remove um user de um tenant (soft delete: ativo=0).
 * Não permite remover o último owner.
 */
async function removeUserFromTenant(tenantId, userId) {
    const link = await userHasAccessTo(userId, tenantId);
    if (!link || !link.hasAccess) {
        throw new Error('usuário não está vinculado a este tenant');
    }
    if (link.role === 'owner') {
        const ownerCount = await dbGet(
            `SELECT COUNT(*) AS n FROM tenant_users
             WHERE tenant_id = ? AND role = 'owner' AND ativo = 1`,
            [tenantId]
        );
        if ((ownerCount?.n || 0) <= 1) {
            throw new Error('Não é possível remover o último owner do tenant');
        }
    }
    await dbRun(
        `UPDATE tenant_users SET ativo = 0 WHERE tenant_id = ? AND usuario_id = ?`,
        [tenantId, userId]
    );
    return { removed: true };
}

/**
 * Atualiza role de um user em um tenant.
 */
async function updateUserRole(tenantId, userId, newRole) {
    if (!VALID_ROLES.has(newRole)) {
        throw new Error(`role inválida: ${newRole}`);
    }
    const link = await userHasAccessTo(userId, tenantId);
    if (!link || !link.hasAccess) {
        throw new Error('usuário não está vinculado a este tenant');
    }
    if (link.role === 'owner' && newRole !== 'owner') {
        // Requer pelo menos 1 owner restante
        const ownerCount = await dbGet(
            `SELECT COUNT(*) AS n FROM tenant_users
             WHERE tenant_id = ? AND role = 'owner' AND ativo = 1`,
            [tenantId]
        );
        if ((ownerCount?.n || 0) <= 1) {
            throw new Error('Não é possível rebaixar o último owner');
        }
    }
    await dbRun(
        `UPDATE tenant_users SET role = ? WHERE tenant_id = ? AND usuario_id = ?`,
        [newRole, tenantId, userId]
    );
    return { role: newRole };
}

// ════════════════════════════════════════════════════════════════
// CONVITES
// ════════════════════════════════════════════════════════════════

/**
 * Cria um convite por email. O invitee precisa se cadastrar ou estar cadastrado
 * pra aceitar. Token tem TTL.
 */
async function inviteUserToTenant({ tenantId, email, role = 'user', convidadoPor, ttlHours = 72 }) {
    if (!VALID_ROLES.has(role)) {
        throw new Error(`role inválida: ${role}`);
    }
    const tenant = await getTenant(tenantId);
    if (!tenant) throw new Error('tenant não encontrado');

    // Não permite re-convidar email já vinculado e ativo
    const existingUser = await dbGet(
        `SELECT id FROM usuarios WHERE LOWER(email) = ?`,
        [String(email).toLowerCase()]
    );
    if (existingUser) {
        const link = await userHasAccessTo(existingUser.id, tenantId);
        if (link && link.hasAccess) {
            throw new Error('este email já está vinculado a este tenant');
        }
    }

    const id = newId('inv');
    const token = crypto.randomBytes(32).toString('hex');
    const expiraEm = new Date(Date.now() + ttlHours * 3600_000).toISOString();

    await dbRun(
        `INSERT INTO tenant_invites
         (id, tenant_id, email, role, token, expira_em, convidado_por)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, tenantId, String(email).toLowerCase(), role, token, expiraEm, convidadoPor]
    );

    return { id, token, expira_em: expiraEm, email, role, tenant: { id: tenant.id, nome: tenant.nome } };
}

/**
 * Aceita um convite. Requer userId (do usuário que está aceitando).
 */
async function acceptInvite({ token, userId }) {
    const invite = await dbGet(
        `SELECT id, tenant_id, email, role, expira_em, aceito_em
         FROM tenant_invites WHERE token = ?`,
        [token]
    );
    if (!invite) throw new Error('convite não encontrado');
    if (invite.aceito_em) throw new Error('convite já aceito');
    if (new Date(invite.expira_em) < new Date()) throw new Error('convite expirado');

    // Verifica se o email do user bate com o invite
    const user = await dbGet(`SELECT id, email FROM usuarios WHERE id = ?`, [userId]);
    if (!user) throw new Error('usuário não encontrado');
    if (String(user.email).toLowerCase() !== invite.email) {
        throw new Error('este convite não é para o seu email');
    }

    await dbRun(
        `UPDATE tenant_invites SET aceito_em = CURRENT_TIMESTAMP WHERE id = ?`,
        [invite.id]
    );

    return await addUserToTenant({
        tenantId: invite.tenant_id,
        userId,
        role: invite.role,
        convidadoPor: userId,
    });
}

// ════════════════════════════════════════════════════════════════
// ESTATÍSTICAS
// ════════════════════════════════════════════════════════════════

/**
 * Retorna contadores básicos de um tenant (users ativos, etc.).
 * Mantém aberto para Sprint 14 (BI) adicionar mais métricas.
 */
async function getTenantStats(tenantId) {
    if (!tenantId) return null;
    const tenant = await getTenant(tenantId);
    if (!tenant) return null;

    const users = await dbGet(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN ativo = 1 THEN 1 ELSE 0 END) AS ativos
         FROM tenant_users WHERE tenant_id = ?`,
        [tenantId]
    );

    return {
        tenant: {
            id: tenant.id,
            slug: tenant.slug,
            nome: tenant.nome,
            plano: tenant.plano,
            status: tenant.status,
            data_expiracao: tenant.data_expiracao,
        },
        usuarios: {
            total: users?.total || 0,
            ativos: users?.ativos || 0,
            limite: tenant.limite_usuarios,
        },
    };
}

module.exports = {
    // Constantes
    DEFAULT_TENANT_ID,
    DEFAULT_TENANT_SLUG,
    VALID_ROLES,
    VALID_STATUS,
    VALID_PLANOS,

    // Tenant CRUD
    listTenants,
    getTenant,
    getTenantBySlug,
    createTenant,
    updateTenant,
    suspendTenant,
    reactivateTenant,

    // User-Tenant
    getUserTenants,
    getTenantUsers,
    userHasAccessTo,
    addUserToTenant,
    removeUserFromTenant,
    updateUserRole,

    // Convites
    inviteUserToTenant,
    acceptInvite,

    // Stats
    getTenantStats,
};
