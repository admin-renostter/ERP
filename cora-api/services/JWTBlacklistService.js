/**
 * JWT Blacklist Service — Revogação de tokens
 *
 * Sprint Security Hardening 2 — V09
 *
 * PROBLEMA RESOLVIDO:
 *   JWTs são stateless — uma vez emitidos, são válidos até o expirar.
 *   Em caso de:
 *     - Logout do usuário
 *     - Mudança de role (promover/despromover)
 *     - Suspeita de comprometimento
 *     - Reset de senha
 *   ...não havia como invalidar o token antes do TTL expirar (15min).
 *
 * SOLUÇÃO:
 *   - Cada access token JWT inclui um `jti` (JWT ID) único
 *   - Tabela `jwt_revoked` armazena tokens revogados
 *   - Middleware `checkRevokedToken` rejeita tokens na blacklist
 *   - Endpoints `/api/auth/logout` adiciona o token atual à blacklist
 *   - Limpeza automática: tokens expirados são removidos via cron diário
 *
 * PERFORMANCE:
 *   - Cache em memória (LRU 2000 chaves) reduz round-trips ao DB
 *   - Hit no cache = < 1ms; miss = query SQLite (~5ms)
 *
 * USO:
 *   const { revokeToken, isTokenRevoked, checkRevokedToken } = require('./services/JWTBlacklistService');
 *   await revokeToken(jti, userId, expiresAt, 'logout');
 *   app.use(checkRevokedToken);  // após authMiddleware
 */

const crypto = require('crypto');
const { dbRun, dbGet, dbAll } = require('../database');

// Cache LRU em memória (2000 entradas, TTL alinhado com JWT TTL)
const CACHE_MAX = 2000;
const cache = new Map(); // jti → { revoked: boolean, expiresAt, checkedAt }

function cacheGet(jti) {
    const entry = cache.get(jti);
    if (!entry) return null;
    // Auto-expire: se o token já expirou, remove do cache
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
        cache.delete(jti);
        return null;
    }
    return entry;
}

function cacheSet(jti, data) {
    // LRU eviction
    if (cache.size >= CACHE_MAX) {
        const firstKey = cache.keys().next().value;
        cache.delete(firstKey);
    }
    cache.set(jti, { ...data, checkedAt: Date.now() });
}

/**
 * Revoga um token JWT.
 * @param {string} jti       - JWT ID (claim jti)
 * @param {string} userId    - ID do usuário
 * @param {number} exp       - Timestamp de expiração (em segundos desde epoch)
 * @param {string} reason    - Motivo: 'logout' | 'password_reset' | 'role_change' | 'compromised' | 'admin_action'
 * @param {string} revokedBy - User ID de quem revogou (pode ser o próprio user)
 */
async function revokeToken(jti, userId, exp, reason = 'logout', revokedBy = null) {
    if (!jti) throw new Error('[JWTBlacklist] jti é obrigatório');
    if (!userId) throw new Error('[JWTBlacklist] userId é obrigatório');

    const expiresAt = new Date(exp * 1000).toISOString();

    // INSERT OR IGNORE — não dá erro se já estiver revogado (idempotente)
    await dbRun(
        `INSERT OR IGNORE INTO jwt_revoked (jti, user_id, expires_at, revoked_at, reason, revoked_by)
         VALUES (?, ?, ?, datetime('now'), ?, ?)`,
        [jti, userId, expiresAt, reason, revokedBy || userId]
    );

    // Atualiza cache
    cacheSet(jti, { revoked: true, expiresAt: exp * 1000 });

    return { success: true, jti, expiresAt };
}

/**
 * Verifica se um token está revogado.
 * Performance: cache primeiro, fallback no DB.
 * @param {string} jti
 * @returns {Promise<boolean>}
 */
async function isTokenRevoked(jti) {
    if (!jti) return false;

    // 1. Cache hit?
    const cached = cacheGet(jti);
    if (cached) return cached.revoked;

    // 2. DB lookup
    const row = await dbGet(
        `SELECT 1 FROM jwt_revoked WHERE jti = ? LIMIT 1`,
        [jti]
    );
    const revoked = !!row;

    // 3. Cache do resultado
    cacheSet(jti, { revoked, expiresAt: null });

    return revoked;
}

/**
 * Revoga TODOS os tokens de um usuário.
 * Usado em: password reset, role change, conta comprometida.
 * NOTA: Como JWTs não têm user_id indexável (a menos que adicionemos uma
 * claim `jtiBatch`), esta operação adiciona um "deny" global: o userId
 * entra numa lista de "force re-login".
 *
 * Implementação: criamos um marker em `jwt_revoked` com jti='USER:*'
 * que o middleware checa separadamente.
 */
async function revokeAllForUser(userId, reason = 'admin_action', revokedBy = null) {
    if (!userId) throw new Error('[JWTBlacklist] userId é obrigatório');

    const marker = `USER:${userId}`;
    // Marker expira em 30 dias (forçar re-login, mas não é eterno)
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await dbRun(
        `INSERT OR REPLACE INTO jwt_revoked (jti, user_id, expires_at, revoked_at, reason, revoked_by)
         VALUES (?, ?, ?, datetime('now'), ?, ?)`,
        [marker, userId, expiresAt, reason, revokedBy]
    );

    cacheSet(marker, { revoked: true, expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 });

    return { success: true, userId, marker, expiresAt };
}

/**
 * Verifica se há um marker de "force re-login" para o user.
 */
async function isUserRevoked(userId) {
    if (!userId) return false;
    const marker = `USER:${userId}`;
    return await isTokenRevoked(marker);
}

/**
 * Limpa tokens revogados já expirados (chamado pelo cron).
 * Roda diariamente.
 */
async function cleanupExpired() {
    const result = await dbRun(
        `DELETE FROM jwt_revoked WHERE expires_at < datetime('now')`
    );
    // Limpa cache de tokens expirados
    const now = Date.now();
    for (const [jti, entry] of cache.entries()) {
        if (entry.expiresAt && now > entry.expiresAt) cache.delete(jti);
    }
    return { deleted: result.changes || 0, cacheSize: cache.size };
}

/**
 * Lista tokens revogados (para auditoria).
 * Só admin/superadmin.
 */
async function listRevoked({ userId, limit = 50, offset = 0 } = {}) {
    const where = [];
    const params = [];
    if (userId) { where.push('user_id = ?'); params.push(userId); }
    const sql = `SELECT jti, user_id, expires_at, revoked_at, reason, revoked_by
                 FROM jwt_revoked
                 ${where.length ? 'WHERE ' + where.join(' AND') : ''}
                 ORDER BY revoked_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    return await dbAll(sql, params);
}

/**
 * Middleware Express: rejeita tokens revogados.
 * Deve ser aplicado DEPOIS do authMiddleware (que popula req.auditInfo).
 */
function checkRevokedToken(req, res, next) {
    // Se não há auditInfo, o authMiddleware já rejeitou antes
    if (!req.auditInfo?.userId) return next();

    const jti = req.auditInfo.jti;
    if (!jti) {
        // Tokens sem jti não podem ser revogados individualmente.
        // Em prod, isso não deve acontecer (signAccessToken sempre inclui jti).
        // Mas para compat, aceita e segue.
        return next();
    }

    isTokenRevoked(jti)
        .then((revoked) => {
            if (revoked) {
                return res.status(401).json({
                    success: false,
                    error: 'Token revogado. Faça login novamente.',
                    code: 'TOKEN_REVOKED',
                });
            }
            // Também checa marker de "force re-login" do user
            return isUserRevoked(req.auditInfo.userId);
        })
        .then((userRevoked) => {
            if (userRevoked === false) return next();
            return res.status(401).json({
                success: false,
                error: 'Sessão revogada por ação administrativa. Faça login novamente.',
                code: 'USER_REVOKED',
            });
        })
        .catch((err) => {
            // Em caso de erro no DB, NÃO bloqueia a request (fail-open para não
            // derrubar o sistema se o DB estiver com problema).
            console.error('[JWTBlacklist] Erro ao verificar revogação:', err.message);
            next();
        });
}

/**
 * Gera um jti único (32 chars hex).
 */
function generateJti() {
    return crypto.randomBytes(16).toString('hex');
}

module.exports = {
    revokeToken,
    isTokenRevoked,
    revokeAllForUser,
    isUserRevoked,
    cleanupExpired,
    listRevoked,
    checkRevokedToken,
    generateJti,
    _cacheSize: () => cache.size,  // para testes
    _cacheClear: () => cache.clear(),  // para testes
};
