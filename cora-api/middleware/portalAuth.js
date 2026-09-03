/**
 * portalAuth — Middleware de autenticação para Portal do Cliente (Sprint 15)
 *
 * Usa JWT separado do admin (aud='renostter-portal').
 * Bloqueia acesso a qualquer rota que não seja do portal.
 *
 * Carrega em req:
 *   - req.portalUser     → objeto portal_users
 *   - req.portalCliente  → objeto clientes
 *   - req.portalSession  → objeto portal_sessions
 *
 * Tokens revogados (logout, segurança) são checados via PortalService.
 */

const jwt = require('jsonwebtoken');
const PortalService = require('../services/PortalService');

const JWT_ALG = process.env.JWT_ALGO || 'HS256';
const ACCESS_TOKEN_TTL = process.env.JWT_ACCESS_TTL || '2h';
const REFRESH_TOKEN_TTL = process.env.JWT_REFRESH_TTL || '7d';

function getJwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('[PortalAuth] JWT_SECRET não configurado em produção.');
        }
        return 'dev-only-insecure-jwt-secret-do-not-use-in-prod';
    }
    return secret;
}

function signAccessToken(payload) {
    return jwt.sign(payload, getJwtSecret(), {
        algorithm: JWT_ALG,
        expiresIn: ACCESS_TOKEN_TTL,
        issuer: 'renostter-crm',
        audience: 'renostter-portal',
    });
}

function signRefreshToken(payload) {
    return jwt.sign(payload, getJwtSecret(), {
        algorithm: JWT_ALG,
        expiresIn: REFRESH_TOKEN_TTL,
        issuer: 'renostter-crm',
        audience: 'renostter-portal-refresh',
    });
}

function verifyToken(token) {
    return jwt.verify(token, getJwtSecret(), {
        algorithms: [JWT_ALG],
        issuer: 'renostter-crm',
    });
}

function getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
}

/**
 * Middleware: extrai JWT do Authorization header, valida, popula req.
 * Retorna 401 se inválido/expirado/revogado.
 */
async function portalAuthMiddleware(req, res, next) {
    const authHeader = req.headers['authorization'] || '';
    if (!authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            error: 'Autenticação necessária. Envie Authorization: Bearer <token>.',
            code: 'NO_AUTH',
        });
    }
    const token = authHeader.slice(7).trim();

    let payload;
    try {
        payload = verifyToken(token);
    } catch (err) {
        const code = err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN';
        return res.status(401).json({ success: false, error: 'Token inválido ou expirado', code });
    }

    if (payload.aud === 'renostter-portal-refresh') {
        return res.status(401).json({
            success: false,
            error: 'Refresh token não pode ser usado como access token',
            code: 'INVALID_TOKEN_TYPE',
        });
    }

    if (payload.aud !== 'renostter-portal') {
        return res.status(401).json({
            success: false,
            error: 'Token não é do portal',
            code: 'WRONG_AUDIENCE',
        });
    }

    // Verifica se sessão foi revogada
    const revoked = await PortalService.isSessionRevoked(payload.jti);
    if (revoked) {
        return res.status(401).json({
            success: false,
            error: 'Sessão revogada. Faça login novamente.',
            code: 'SESSION_REVOKED',
        });
    }

    // Carrega dados completos do portal_user
    const { dbGet } = require('../database');
    const user = await dbGet(
        'SELECT id, cliente_id, email, nome, telefone, ativo FROM portal_users WHERE id = ?',
        [payload.portalUserId]
    );
    if (!user || user.ativo !== 1) {
        return res.status(401).json({ success: false, error: 'Conta inválida ou desativada', code: 'USER_INACTIVE' });
    }

    const cliente = await dbGet(
        'SELECT id, nome, email, telefone, cpf_cnpj, endereco, cidade, estado, cep FROM clientes WHERE id = ?',
        [user.cliente_id]
    );

    req.portalUser = user;
    req.portalCliente = cliente;
    req.portalSession = { jti: payload.jti, exp: payload.exp };
    return next();
}

/**
 * Helper para gerar ambos os tokens e criar sessão.
 */
async function generateTokensForPortal(portalUser, ip, userAgent) {
    const jti = crypto.randomBytes(16).toString('hex');
    const access = signAccessToken({
        portalUserId: portalUser.id,
        clienteId: portalUser.cliente_id,
        email: portalUser.email,
        jti,
    });
    const refresh = signRefreshToken({
        portalUserId: portalUser.id,
        jti,
    });

    const expiraEm = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); // 2h
    await PortalService.createSession(portalUser.id, jti, ip, userAgent, expiraEm);

    return { accessToken: access, refreshToken: refresh, jti };
}

const crypto = require('crypto');

module.exports = {
    signAccessToken,
    signRefreshToken,
    verifyToken,
    portalAuthMiddleware,
    generateTokensForPortal,
    ACCESS_TOKEN_TTL,
    REFRESH_TOKEN_TTL,
};
