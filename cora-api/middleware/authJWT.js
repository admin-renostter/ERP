/**
 * Auth JWT Middleware — Substitui a autenticação por headers manipuláveis
 *
 * Sprint 0 — Segurança Crítica
 *
 * PROBLEMA RESOLVIDO:
 *   Antes, a autenticação lia `x-user-id` e `x-user-role` dos headers HTTP,
 *   que são totalmente manipuláveis pelo cliente (DevTools). Qualquer
 *   visitante podia setar `x-user-role: admin` e acessar endpoints críticos.
 *
 * SOLUÇÃO:
 *   - Login emite um JWT (assinado com HS256 ou HS512, depende de JWT_ALGO)
 *   - Cliente envia o JWT em `Authorization: Bearer <token>`
 *   - Este middleware valida o token e popula `req.auditInfo` com
 *     userId/role/Name extraídos DO PAYLOAD (não dos headers)
 *   - Em modo `AUTH_MODE=dual` (transição), aceita JWT OU headers legados
 *   - Em modo `AUTH_MODE=legacy` (dev only), aceita só headers
 *   - Em modo `AUTH_MODE=jwt` (default em prod), aceita SÓ JWT
 *
 * Uso:
 *   const { authMiddleware, requireRole } = require('./middleware/authJWT');
 *   app.use('/api', authMiddleware);          // protege tudo abaixo
 *   app.delete('/api/x/:id', requireRole('admin'), handler);
 *
 * Endpoints públicos (sem auth):
 *   - /health
 *   - /api/auth/login
 *   - /api/auth/refresh
 *   - /api/cobrancas/webhook  (verificação separada via webhookSignature)
 *   - /api/webhooks/cora      (verificação separada via webhookSignature)
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// SECURITY HARDENING 2 — V09: prefixo do jti para distinguir tokens de outros sistemas
// no unlikely caso de colisão de IDs (não esperado, mas defensivo)
const JTI_PREFIX = 'ren-';

// SECURITY FIX V08/V19: whitelist hardcoded de algoritmos
// Nunca aceitar 'none' ou outros algoritmos fracos
const ALLOWED_JWT_ALGS = ['HS256', 'HS384', 'HS512'];
const JWT_ALG = ALLOWED_JWT_ALGS.includes(process.env.JWT_ALGO)
    ? process.env.JWT_ALGO
    : 'HS256';
if (process.env.JWT_ALGO && !ALLOWED_JWT_ALGS.includes(process.env.JWT_ALGO)) {
    console.warn(`[Auth] JWT_ALGO="${process.env.JWT_ALGO}" não está na whitelist. Usando HS256.`);
}

// SECURITY FIX V17: TTL reduzido para 15min (era 2h)
const ACCESS_TOKEN_TTL = process.env.JWT_ACCESS_TTL || '15m';
const REFRESH_TOKEN_TTL = process.env.JWT_REFRESH_TTL || '7d';

// Rotas que NÃO exigem JWT (públicas)
const PUBLIC_PATHS = new Set([
    '/health',
    '/health/live',
    '/health/ready',
    '/api/auth/login',
    '/api/auth/refresh',
    // UI estática (auth é feita via Authorization header no fetch)
    '/crm',
    '/crm/',
]);

// Rotas com verificação de auth customizada (webhook, etc.)
const CUSTOM_AUTH_PATHS = [
    '/api/cobrancas/webhook',
    '/api/webhooks/cora',
    '/api/cora/webhook/receber',
    '/api/webhooks/autentique',  // Sprint 21: Autentique webhook (valida HMAC)
    '/api/portal',  // Sprint 15: portal tem sua própria auth
];

function getAuthMode() {
    return process.env.AUTH_MODE || (process.env.NODE_ENV === 'production' ? 'jwt' : 'legacy');
}

function getJwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error(
                '[Auth] JWT_SECRET não configurado em produção. ' +
                'Defina a env var (≥ 32 bytes) e reinicie. Veja SECURITY.md.'
            );
        }
        console.warn('[Auth] JWT_SECRET ausente em dev — usando chave fraca. NÃO USE EM PRODUÇÃO.');
        return 'dev-only-insecure-jwt-secret-do-not-use-in-prod';
    }
    return secret;
}

/**
 * SECURITY HARDENING 3 — V11: JWT key rotation.
 *
 * Suporta múltiplas secrets durante o período de rotação:
 *   - JWT_SECRET         → secret ATUAL (usado para SIGN)
 *   - JWT_SECRET_PREVIOUS → secret ANTERIOR (usado para VERIFY, em janela de tolerância)
 *
 * Durante a rotação:
 *   1. Operator adiciona JWT_SECRET_PREVIOUS=<secret-antigo> no .env
 *   2. Operator rotaciona JWT_SECRET=<novo-secret>
 *   3. Reinicia a API. Tokens antigos (assinados com a secret antiga)
 *      continuam válidos por até JWT_ROTATION_GRACE_MIN (default 60min).
 *   4. Operator remove JWT_SECRET_PREVIOUS após a janela.
 *
 * Comportamento:
 *   - sign() sempre usa a secret ATUAL
 *   - verify() tenta com a secret ATUAL; se falhar, tenta com a secret ANTERIOR
 *   - Se ambas falharem, retorna 401
 *
 * USO:
 *   # 1. Setar secret antiga como "previous" + gerar nova
 *   export JWT_SECRET="<nova-secret>"
 *   export JWT_SECRET_PREVIOUS="<secret-antiga>"
 *   # 2. Reiniciar API
 *   # 3. Após 60min (ou quando tráfego velho sumir):
 *   unset JWT_SECRET_PREVIOUS
 *   # 4. Reiniciar API novamente
 */
function getJwtSecrets() {
    const current = getJwtSecret();
    const previous = process.env.JWT_SECRET_PREVIOUS || null;
    if (previous) {
        if (process.env.NODE_ENV === 'production') {
            console.log('[Auth] JWT key rotation ATIVA — tolerância para secret anterior: JWT_SECRET_PREVIOUS definido');
        }
    }
    return { current, previous };
}

/**
 * Emite um access token JWT
 * @param {Object} payload - { userId, role, name, clientId, tenantId }
 * @returns {string} token
 * SECURITY HARDENING 2 — V09: inclui jti (JWT ID) automaticamente via jwtid
 *   para permitir revogação individual (logout, password reset, etc).
 */
function signAccessToken(payload) {
    const jti = JTI_PREFIX + crypto.randomBytes(16).toString('hex');
    return jwt.sign(payload, getJwtSecret(), {
        algorithm: JWT_ALG,
        expiresIn: ACCESS_TOKEN_TTL,
        issuer: 'renostter-crm',
        audience: 'renostter-api',
        jwtid: jti,
    });
}

/**
 * Helper: converte TTL string ('15m', '7d', '2h') em segundos
 * Útil para calcular expiresAt ao revogar.
 */
function parseTTL(ttl) {
    const m = String(ttl).match(/^(\d+)([smhd])$/);
    if (!m) return 900;
    const n = parseInt(m[1], 10);
    const unit = m[2];
    const mult = { s: 1, m: 60, h: 3600, d: 86400 }[unit];
    return n * mult;
}

/**
 * Emite um refresh token JWT (TTL maior, sem dados sensíveis)
 * @param {Object} payload - { userId, tokenVersion }
 * @returns {string} token
 */
function signRefreshToken(payload) {
    return jwt.sign(payload, getJwtSecret(), {
        algorithm: JWT_ALG,
        expiresIn: REFRESH_TOKEN_TTL,
        issuer: 'renostter-crm',
        audience: 'renostter-refresh',
    });
}

/**
 * Verifica e decodifica um JWT
 * SECURITY HARDENING 3 — V11: tenta secret ATUAL primeiro, depois ANTERIOR
 * (durante janela de rotação). Tokens que falham em ambos → inválido.
 *
 * @param {string} token
 * @returns {Object} payload decodificado
 */
function verifyToken(token) {
    const { current, previous } = getJwtSecrets();
    const verifyOpts = {
        algorithms: ALLOWED_JWT_ALGS,
        issuer: 'renostter-crm',
    };
    // Tenta com a secret atual
    try {
        return jwt.verify(token, current, verifyOpts);
    } catch (errCurrent) {
        // Se não tem previous OU o erro é de algoritmo/issuer (não de assinatura),
        // não tenta o previous
        if (!previous) throw errCurrent;
        if (errCurrent.name === 'JsonWebTokenError' && !errCurrent.message.includes('signature')) {
            // Erro de formato/algoritmo/issuer, não de signature — não adianta tentar outra secret
            throw errCurrent;
        }
        if (errCurrent.name === 'NotBeforeError') {
            // Token ainda não é válido (nbf) — não adianta tentar outra secret
            throw errCurrent;
        }
        // Tenta com a secret anterior (rotação)
        try {
            return jwt.verify(token, previous, verifyOpts);
        } catch (errPrev) {
            // Nenhuma das duas funcionou — mantém o erro original
            throw errCurrent;
        }
    }
}

/**
 * Extrai o user info do payload do token e popula req.auditInfo.
 * Mantém compat com req.auditInfo.ip para os middlewares existentes.
 *
 * Sprint 13: inclui tenantId (multi-tenant).
 * Sprint Security Hardening 2 (V09): inclui jti para revogação.
 */
function populateAuditInfoFromToken(req, payload) {
    req.auditInfo = {
        ...(req.auditInfo || {}),
        userId: payload.userId || payload.sub,
        role: payload.role,
        userName: payload.name || '',
        clientId: payload.clientId || null,
        tenantId: payload.tenantId || null,   // Sprint 13
        jti: payload.jti || null,             // V09: para blacklist
        authSource: 'jwt',
    };
}

/**
 * Lê user info dos headers legados (modo compat).
 * NUNCA confiar em prod — só em dev.
 */
function readLegacyHeaders(req) {
    const userId = req.headers['x-user-id'];
    const role = req.headers['x-user-role'];
    if (!userId || !role) return null;
    return {
        userId: String(userId),
        role: String(role),
        userName: String(req.headers['x-user-name'] || ''),
        clientId: req.headers['x-user-client-id'] ? String(req.headers['x-user-client-id']) : null,
        tenantId: req.headers['x-user-tenant-id'] ? String(req.headers['x-user-tenant-id']) : null,  // Sprint 13
        authSource: 'legacy-headers',
    };
}

/**
 * Middleware principal: aplica-se a TODAS as rotas (exceto as públicas).
 * Lê o JWT do header Authorization, valida, e popula req.auditInfo.
 */
function authMiddleware(req, res, next) {
    // 1. Rotas públicas passam direto
    if (PUBLIC_PATHS.has(req.path)) {
        return next();
    }

    // 2. Rotas com auth customizada (webhook, etc.) passam — elas têm
    //    sua própria verificação (HMAC). Mas sempre exigem IP para log.
    if (CUSTOM_AUTH_PATHS.some(p => req.path === p || req.path.startsWith(p + '/'))) {
        req.auditInfo = req.auditInfo || {};
        req.auditInfo.ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        return next();
    }

    const authMode = getAuthMode();

    // 3. Tenta JWT primeiro (se modo != 'legacy')
    const authHeader = req.headers['authorization'] || '';
    if (authHeader.startsWith('Bearer ') && authMode !== 'legacy') {
        const token = authHeader.slice(7).trim();
        try {
            const payload = verifyToken(token);
            // Garante que é access token (não refresh)
            if (payload.aud === 'renostter-refresh') {
                return res.status(401).json({
                    success: false,
                    error: 'Refresh token não pode ser usado como access token',
                    code: 'INVALID_TOKEN_TYPE',
                });
            }
            populateAuditInfoFromToken(req, payload);
            return next();
        } catch (err) {
            const code = err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN';
            if (authMode === 'jwt') {
                // Em prod, rejeitamos sem fallback
                return res.status(401).json({
                    success: false,
                    error: 'Token inválido ou expirado',
                    code,
                });
            }
            // Em modo dual, cai pro fallback abaixo
            console.warn(`[Auth] JWT inválido (${code}); tentando fallback legacy headers (modo dual).`);
        }
    }

    // 4. Fallback: headers legados (dev only, ou modo dual)
    if (authMode === 'legacy' || authMode === 'dual') {
        const legacy = readLegacyHeaders(req);
        if (legacy) {
            if (authMode === 'legacy' && process.env.NODE_ENV === 'production') {
                console.error('[Auth] LEGACY auth em produção — isso é uma falha de segurança.');
                return res.status(500).json({ success: false, error: 'Auth mode misconfigured' });
            }
            req.auditInfo = {
                ...(req.auditInfo || {}),
                ...legacy,
            };
            return next();
        }
    }

    // 5. Nenhum token válido
    return res.status(401).json({
        success: false,
        error: 'Autenticação necessária. Envie Authorization: Bearer <token> ou x-user-id/x-user-role (dev only).',
        code: 'NO_AUTH',
    });
}

/**
 * Middleware de autorização por role.
 * Uso: app.delete('/x/:id', requireRole('admin', 'superadmin'), handler)
 */
function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.auditInfo?.userId) {
            return res.status(401).json({ success: false, error: 'Não autenticado', code: 'NO_AUTH' });
        }
        const role = req.auditInfo.role;
        // superadmin sempre passa
        if (role === 'superadmin') return next();
        if (allowedRoles.length === 0 || allowedRoles.includes(role)) {
            return next();
        }
        return res.status(403).json({
            success: false,
            error: 'Acesso negado: permissão insuficiente.',
            code: 'FORBIDDEN',
            requiredRoles: allowedRoles,
            currentRole: role,
        });
    };
}

module.exports = {
    authMiddleware,
    requireRole,
    signAccessToken,
    signRefreshToken,
    verifyToken,
    getAuthMode,
    getJwtSecrets,
    parseTTL,
    JTI_PREFIX,
    ACCESS_TOKEN_TTL,
    REFRESH_TOKEN_TTL,
};
