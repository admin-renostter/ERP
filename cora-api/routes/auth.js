/**
 * Auth Routes — Login, Refresh, Me, Logout
 *
 * Sprint 0 — Segurança Crítica
 *
 * Substitui a autenticação baseada em headers manipuláveis por JWT real.
 * - POST /api/auth/login    → emite access + refresh tokens
 * - POST /api/auth/refresh  → renova access token usando refresh token
 * - GET  /api/auth/me       → dados do usuário autenticado (do JWT)
 * - POST /api/auth/logout   → (cliente descarta tokens; server loga auditoria)
 *
 * IMPORTANTE — sobre usuários e senhas:
 *
 *   Hoje, os usuários vivem em DUAS fontes:
 *     1. localStorage do browser (seed em js/storage.js) — usado pelo frontend
 *     2. Tabela `usuarios` no SQLite (backend) — tem username, password (plain)
 *
 *   A Sprint 1 vai migrar para bcrypt e unificar. Por ora (Sprint 0), a
 *   rota /api/auth/login faz o seguinte:
 *     - Lê o usuário do banco SQLite (mais confiável que o localStorage)
 *     - Se a senha armazenada parece bcrypt ($2a$/$2b$/$2y$ prefix), usa bcrypt
 *     - Se for plain text, usa comparação direta (legado)
 *     - Emite JWT com userId/role/name do banco
 *
 *   A migração de senhas para bcrypt acontece na Sprint 1.6.
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();

const { dbGet, dbRun } = require('../database');
const {
    signAccessToken,
    signRefreshToken,
    verifyToken,
    parseTTL,
} = require('../middleware/authJWT');
const { validate, schemas } = require('../middleware/validate');
const JWTBlacklist = require('../services/JWTBlacklistService');

const TenantService = require('../services/TenantService');
const { getUserTenants, userHasAccessTo } = TenantService;

const BCRYPT_PREFIX_RE = /^\$2[aby]\$\d{2}\$.{53}$/;
const FAILED_LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 min
const FAILED_LOGIN_MAX = 5;                    // 5 tentativas

// Rate-limit em memória por IP. Sprint 3 vai migrar pra Redis/KV.
const _failedAttempts = new Map();

function checkFailedAttempts(ip) {
    const now = Date.now();
    const entry = _failedAttempts.get(ip);
    if (!entry) return { ok: true, remaining: FAILED_LOGIN_MAX };
    if (now - entry.firstAt > FAILED_LOGIN_WINDOW_MS) {
        _failedAttempts.delete(ip);
        return { ok: true, remaining: FAILED_LOGIN_MAX };
    }
    const remaining = FAILED_LOGIN_MAX - entry.count;
    return { ok: remaining > 0, remaining: Math.max(0, remaining) };
}

function recordFailedAttempt(ip) {
    const now = Date.now();
    const entry = _failedAttempts.get(ip) || { count: 0, firstAt: now };
    if (now - entry.firstAt > FAILED_LOGIN_WINDOW_MS) {
        entry.count = 0;
        entry.firstAt = now;
    }
    entry.count++;
    _failedAttempts.set(ip, entry);
}

function clearFailedAttempts(ip) {
    _failedAttempts.delete(ip);
}

function isBcryptHash(s) {
    return typeof s === 'string' && BCRYPT_PREFIX_RE.test(s);
}

async function verifyPassword(plain, stored) {
    if (isBcryptHash(stored)) {
        return await bcrypt.compare(plain, stored);
    }
    // Senha plain text (legado). Sprint 1 vai forçar migração.
    return plain === stored;
}

/**
 * POST /api/auth/login
 * Body: { email OR username, password, totp? }
 * Returns: { accessToken, refreshToken, user, expiresIn }
 */
router.post('/login', validate(schemas.authLogin), async (req, res) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const { email, username, password, totp } = req.body;
    const identifier = (email || username || '').trim().toLowerCase();

    if (!identifier || !password) {
        return res.status(400).json({
            success: false,
            error: 'Informe email/username e senha',
            code: 'MISSING_CREDENTIALS',
        });
    }

    // Rate-limit
    const rl = checkFailedAttempts(ip);
    if (!rl.ok) {
        return res.status(429).json({
            success: false,
            error: 'Muitas tentativas. Tente novamente em 15 minutos.',
            code: 'TOO_MANY_ATTEMPTS',
            retryAfterSec: Math.ceil(FAILED_LOGIN_WINDOW_MS / 1000),
        });
    }

    try {
        // Tenta achar o usuário (email ou username)
        const user = await dbGet(
            `SELECT id, username, email, name, role, password, client_id, photo, ativo
             FROM usuarios
             WHERE LOWER(email) = ? OR LOWER(username) = ?
             LIMIT 1`,
            [identifier, identifier]
        );

        if (!user || user.ativo === 0 || user.ativo === false) {
            recordFailedAttempt(ip);
            return res.status(401).json({
                success: false,
                error: 'Credenciais inválidas',
                code: 'INVALID_CREDENTIALS',
            });
        }

        const passwordOk = await verifyPassword(password, user.password);
        if (!passwordOk) {
            recordFailedAttempt(ip);
            return res.status(401).json({
                success: false,
                error: 'Credenciais inválidas',
                code: 'INVALID_CREDENTIALS',
            });
        }

        // 2FA — Sprint 1 vai implementar TOTP real. Por ora, aceita se o campo
        // for nulo (legado) OU se bater com código válido do user.twofa_secret.
        // Para evitar quebrar dev, deixamos passar se o usuário não tem
        // twofa_secret configurado.
        // (Sprint 1.7 vai tornar TOTP obrigatório para admin/superadmin)
        if (user.twofa_secret && totp) {
            const speakeasy = require('speakeasy');
            const ok = speakeasy.totp.verify({
                secret: user.twofa_secret,
                encoding: 'base32',
                token: totp,
                window: 1,
            });
            if (!ok) {
                recordFailedAttempt(ip);
                return res.status(401).json({
                    success: false,
                    error: 'Código 2FA inválido',
                    code: 'INVALID_2FA',
                });
            }
        }

        // Sucesso — limpa tentativas
        clearFailedAttempts(ip);

        // Sprint 13: resolve o tenant ativo do usuário.
        // Ordem: (1) primeiro tenant ativo; (2) tenant default.
        let tenantId = TenantService.DEFAULT_TENANT_ID;
        let tenantRole = 'legacy-default';
        try {
            const userTenants = await getUserTenants(user.id);
            if (userTenants && userTenants.length > 0) {
                tenantId = userTenants[0].id;
                tenantRole = userTenants[0].role;
            }
        } catch (e) {
            console.warn('[Auth] Falha ao resolver tenant do user; usando default:', e.message);
        }

        const payload = {
            userId: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            name: user.name,
            clientId: user.client_id || null,
            tenantId,             // Sprint 13
            tenantRole,           // Sprint 13
        };

        const accessToken = signAccessToken(payload);
        const refreshToken = signRefreshToken({
            userId: user.id,
            tokenVersion: user.token_version || 0,
        });

        // Log de auditoria (não bloqueia resposta se falhar)
        try {
            await dbRun(
                `INSERT INTO logs_auditoria
                 (entidade, entidade_id, acao, usuario_id, usuario_nome, ip, detalhes, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
                ['auth', user.id, 'LOGIN', user.id, user.name, ip, JSON.stringify({ method: 'jwt', tenantId })]
            );
        } catch (e) {
            console.warn('[Auth] Falha ao logar auditoria de login:', e.message);
        }

        return res.json({
            success: true,
            accessToken,
            refreshToken,
            tokenType: 'Bearer',
            expiresIn: process.env.JWT_ACCESS_TTL || '2h',
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                name: user.name,
                role: user.role,
                clientId: user.client_id,
                photo: user.photo || null,
                tenantId,           // Sprint 13
                tenantRole,         // Sprint 13
            },
        });
    } catch (err) {
        console.error('[Auth] Erro no login:', err);
        return res.status(500).json({
            success: false,
            error: 'Erro interno ao autenticar',
            code: 'AUTH_INTERNAL_ERROR',
        });
    }
});

/**
 * POST /api/auth/refresh
 * Body: { refreshToken }
 * Returns: { accessToken, expiresIn }
 */
router.post('/refresh', validate(schemas.authRefresh), async (req, res) => {
    const { refreshToken } = req.body;

    let payload;
    try {
        payload = jwtVerifyRefresh(refreshToken);
    } catch (err) {
        const code = err.name === 'TokenExpiredError' ? 'REFRESH_EXPIRED' : 'INVALID_REFRESH';
        return res.status(401).json({ success: false, error: 'Refresh token inválido', code });
    }

    if (payload.aud !== 'renostter-refresh') {
        return res.status(401).json({ success: false, error: 'Token não é um refresh token', code: 'INVALID_REFRESH_TYPE' });
    }

    try {
        const user = await dbGet(
            'SELECT id, username, email, name, role, client_id, token_version, ativo FROM usuarios WHERE id = ?',
            [payload.userId]
        );
        if (!user || user.ativo === 0 || user.ativo === false) {
            return res.status(401).json({ success: false, error: 'Usuário inativo ou removido', code: 'USER_INACTIVE' });
        }
        if ((user.token_version || 0) !== (payload.tokenVersion || 0)) {
            return res.status(401).json({ success: false, error: 'Token version mismatch (rotacionado)', code: 'TOKEN_VERSION' });
        }

        // Sprint 13: re-resolve tenant atual (pode ter mudado desde o login)
        let tenantId = TenantService.DEFAULT_TENANT_ID;
        let tenantRole = 'legacy-default';
        try {
            const userTenants = await getUserTenants(user.id);
            if (userTenants && userTenants.length > 0) {
                tenantId = userTenants[0].id;
                tenantRole = userTenants[0].role;
            }
        } catch (_) {}

        const newAccess = signAccessToken({
            userId: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            name: user.name,
            clientId: user.client_id || null,
            tenantId,
            tenantRole,
        });

        return res.json({
            success: true,
            accessToken: newAccess,
            tokenType: 'Bearer',
            expiresIn: process.env.JWT_ACCESS_TTL || '2h',
        });
    } catch (err) {
        console.error('[Auth] Erro no refresh:', err);
        return res.status(500).json({ success: false, error: 'Erro interno no refresh', code: 'REFRESH_INTERNAL_ERROR' });
    }
});

/**
 * GET /api/auth/me
 * Header: Authorization: Bearer <accessToken>
 * Returns: dados do usuário do JWT
 */
router.get('/me', async (req, res) => {
    if (!req.auditInfo?.userId) {
        return res.status(401).json({ success: false, error: 'Não autenticado', code: 'NO_AUTH' });
    }

    // Sprint 13: lista todos os tenants do user (para o seletor do UI)
    let tenants = [];
    try {
        tenants = await getUserTenants(req.auditInfo.userId);
    } catch (_) {}

    return res.json({
        success: true,
        user: {
            id: req.auditInfo.userId,
            name: req.auditInfo.userName,
            role: req.auditInfo.role,
            clientId: req.auditInfo.clientId || null,
            tenantId: req.auditInfo.tenantId || null,         // Sprint 13
            tenantRole: req.auditInfo.tenantRole || null,     // Sprint 13
        },
        tenants,                                              // Sprint 13
        authSource: req.auditInfo.authSource || 'unknown',
    });
});

/**
 * POST /api/auth/logout
 * SECURITY HARDENING 2 — V09: agora revoga o JWT atual (blacklist).
 *   - Adiciona o jti à tabela jwt_revoked
 *   - O middleware checkRevokedToken rejeitará requests futuras com este token
 *   - Logout de "fato" (não apenas auditoria como antes)
 *
 * Header: Authorization: Bearer <accessToken>
 * Returns: { success: true, message }
 */
router.post('/logout', async (req, res) => {
    const userId = req.auditInfo?.userId;
    const jti = req.auditInfo?.jti;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    try {
        // 1. Adiciona o token à blacklist (revoga imediatamente)
        if (jti && userId) {
            const expiresAt = Math.floor(Date.now() / 1000) + parseTTL(process.env.JWT_ACCESS_TTL || '15m');
            await JWTBlacklist.revokeToken(jti, userId, expiresAt, 'logout', userId);
        }

        // 2. Log de auditoria
        if (userId) {
            await dbRun(
                `INSERT INTO logs_auditoria
                 (entidade, entidade_id, acao, usuario_id, ip, detalhes, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
                ['auth', userId, 'LOGOUT', userId, ip, JSON.stringify({ method: 'jwt', jti: jti ? jti.substring(0, 8) + '...' : null })]
            );
        }
    } catch (e) {
        console.warn('[Auth] Falha no logout:', e.message);
        // Não bloqueia — logout é idempotente
    }

    return res.json({
        success: true,
        message: 'Logout realizado. Token revogado.',
    });
});

/**
 * POST /api/auth/logout-all
 * Revoga TODOS os tokens do usuário (força re-login em todos os devices).
 * SECURITY HARDENING 2 — V09
 *
 * Útil em caso de:
 *   - Senha alterada
 *   - Atividade suspeita
 *   - Comprometimento de credenciais
 *
 * Returns: { success: true, expiresAt }
 */
router.post('/logout-all', async (req, res) => {
    const userId = req.auditInfo?.userId;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    if (!userId) {
        return res.status(401).json({ success: false, error: 'Não autenticado', code: 'NO_AUTH' });
    }

    try {
        const result = await JWTBlacklist.revokeAllForUser(userId, 'admin_action', userId);
        // Também incrementa token_version para invalidar refresh tokens
        await dbRun(
            `UPDATE usuarios SET token_version = COALESCE(token_version, 0) + 1 WHERE id = ?`,
            [userId]
        );
        // Log de auditoria
        await dbRun(
            `INSERT INTO logs_auditoria
             (entidade, entidade_id, acao, usuario_id, ip, detalhes, created_at)
             VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
            ['auth', userId, 'LOGOUT_ALL', userId, ip, JSON.stringify({ method: 'jwt' })]
        );
        return res.json({
            success: true,
            message: 'Todas as sessões foram revogadas. Faça login novamente.',
            expiresAt: result.expiresAt,
        });
    } catch (e) {
        console.error('[Auth] Erro em logout-all:', e);
        return res.status(500).json({ success: false, error: 'Erro ao revogar sessões', code: 'LOGOUT_ALL_ERROR' });
    }
});

/**
 * GET /api/auth/revoked
 * Lista tokens revogados do usuário atual (auditoria).
 * SECURITY HARDENING 2 — V09
 */
router.get('/revoked', async (req, res) => {
    const userId = req.auditInfo?.userId;
    if (!userId) {
        return res.status(401).json({ success: false, error: 'Não autenticado', code: 'NO_AUTH' });
    }
    try {
        const revoked = await JWTBlacklist.listRevoked({ userId, limit: 20 });
        return res.json({ success: true, data: revoked, total: revoked.length });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * POST /api/auth/switch-tenant
 * Body: { tenantId }  → emite novo access token para o tenant escolhido
 *
 * Sprint 13: permite ao user alternar entre os tenants que ele participa.
 * Valida que o user tem acesso ao tenant antes de emitir o token.
 */
router.post('/switch-tenant', async (req, res) => {
    const userId = req.auditInfo?.userId;
    const { tenantId } = req.body || {};
    if (!userId) {
        return res.status(401).json({ success: false, error: 'Não autenticado', code: 'NO_AUTH' });
    }
    if (!tenantId) {
        return res.status(400).json({ success: false, error: 'tenantId obrigatório', code: 'MISSING_TENANT' });
    }

    try {
        const access = await userHasAccessTo(userId, tenantId);
        const isSuperadmin = req.auditInfo.role === 'superadmin';
        const isDefault = tenantId === TenantService.DEFAULT_TENANT_ID;

        if (!isSuperadmin && !isDefault && (!access || !access.hasAccess)) {
            return res.status(403).json({
                success: false,
                error: 'Sem acesso a este tenant',
                code: 'TENANT_FORBIDDEN',
            });
        }

        const user = await dbGet(
            'SELECT id, username, email, name, role, client_id FROM usuarios WHERE id = ?',
            [userId]
        );
        if (!user) {
            return res.status(401).json({ success: false, error: 'Usuário não encontrado', code: 'USER_NOT_FOUND' });
        }

        const tenantRole = isSuperadmin ? 'superadmin'
                          : isDefault ? 'legacy-default'
                          : access.role;

        const newAccess = signAccessToken({
            userId: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            name: user.name,
            clientId: user.client_id || null,
            tenantId,
            tenantRole,
        });

        return res.json({
            success: true,
            accessToken: newAccess,
            tokenType: 'Bearer',
            expiresIn: process.env.JWT_ACCESS_TTL || '2h',
            tenantId,
            tenantRole,
        });
    } catch (err) {
        console.error('[Auth] Erro no switch-tenant:', err);
        return res.status(500).json({ success: false, error: 'Erro ao trocar de tenant', code: 'SWITCH_TENANT_ERROR' });
    }
});

/**
 * Helper local: verifica refresh token (mesmo secret, aud diferente).
 */
function jwtVerifyRefresh(token) {
    return verifyToken(token);
}

module.exports = router;
