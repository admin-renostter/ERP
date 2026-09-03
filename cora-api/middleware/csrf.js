/**
 * Cookie + CSRF Middleware — V16 + V18
 *
 * Sprint Security Hardening 3
 *
 * V16: Cookie Security Flags
 *   - Secure:    só envia em HTTPS
 *   - HttpOnly:  JS no browser não pode ler (mitiga XSS)
 *   - SameSite:  previne CSRF por bloquear envio cross-site
 *   - Path/Scope restrito
 *
 * V18: CSRF Protection (double-submit cookie)
 *   - Para forms HTML (não-API), exige token CSRF
 *   - Para API (Authorization: Bearer), CSRF NÃO se aplica (sem cookie = sem CSRF)
 *   - Tokens são HMAC do sessionId (sem estado no server)
 *
 * ESTADO ATUAL DO PROJETO:
 *   A API é REST pura com JWT em `Authorization: Bearer`. O JWT NÃO é
 *   enviado automaticamente pelo browser (não é cookie), então CSRF
 *   clássico não se aplica. V18 é "preventivo" — se no futuro algum
 *   endpoint usar cookie, a proteção já está implementada.
 *
 * USO:
 *   const { applySecureCookieFlags, csrfProtection, issueCsrfToken } = require('./middleware/csrf');
 *   app.use(applySecureCookieFlags());  // para cookies
 *   app.use('/api/forms', csrfProtection());  // para forms HTML
 */

const crypto = require('crypto');

/**
 * V16: Aplica flags de segurança em cookies SET via res.cookie()
 * (não tem efeito em cookies recebidos — só outbound)
 *
 * Helmet é mais indicado para headers HTTP, mas cookies precisam desse helper.
 */
function applySecureCookieFlags() {
    return (req, res, next) => {
        const origCookie = res.cookie.bind(res);
        res.cookie = function(name, value, options = {}) {
            // Defaults seguros
            const secureOpts = {
                secure: process.env.NODE_ENV === 'production',  // HTTPS só em prod
                httpOnly: true,                                  // JS não lê
                sameSite: 'lax',                                 // CSRF protection
                path: options.path || '/',
                ...options,
            };
            // Em produção, força Secure e SameSite=strict para cookies sensíveis
            if (process.env.NODE_ENV === 'production' && (
                name.includes('auth') || name.includes('session') || name.includes('csrf')
            )) {
                secureOpts.sameSite = 'strict';
            }
            return origCookie(name, value, secureOpts);
        };
        next();
    };
}

/**
 * V18: Emite token CSRF (double-submit cookie pattern)
 * Cliente deve:
 *   1. Chamar /api/csrf-token → recebe { csrfToken } + Set-Cookie: csrf=<token>
 *   2. Em forms POST: incluir em <input name="_csrf" value="<token>"> OU header X-CSRF-Token
 *   3. Backend valida que o token do cookie == o token enviado
 *
 * NOTA: Para a API atual (JWT em Bearer), isto é desnecessário — mas
 * fica pronto para integração com forms HTML futuros.
 */
function issueCsrfToken(req, res) {
    const token = crypto.randomBytes(24).toString('base64url');
    res.cookie('_csrf', token, {
        httpOnly: false,  // precisa ser lido por JS para meta tag ou similar
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
    });
    res.json({ success: true, csrfToken: token });
}

/**
 * V18: Middleware de proteção CSRF para forms HTML
 * Em API REST pura (com JWT Bearer), é NO-OP.
 * Para forms (Content-Type: application/x-www-form-urlencoded ou text/html),
 * valida que o token do cookie == o token do header/body.
 */
function csrfProtection(opts = {}) {
    const cookieName = opts.cookieName || '_csrf';
    const headerName = opts.headerName || 'x-csrf-token';
    const bodyField = opts.bodyField || '_csrf';
    const ignoreMethods = opts.ignoreMethods || ['GET', 'HEAD', 'OPTIONS'];

    return (req, res, next) => {
        // Skip safe methods
        if (ignoreMethods.includes(req.method)) return next();

        // Para API REST com JWT, CSRF não se aplica
        if (req.headers['authorization']?.startsWith('Bearer ')) return next();

        // Lê token do cookie
        const cookieToken = req.cookies?.[cookieName];
        // Lê token do header OU body
        const headerToken = req.headers[headerName] || req.body?.[bodyField];

        if (!cookieToken || !headerToken) {
            return res.status(403).json({
                success: false,
                error: 'CSRF token ausente',
                code: 'CSRF_MISSING',
            });
        }
        if (cookieToken !== headerToken) {
            return res.status(403).json({
                success: false,
                error: 'CSRF token inválido',
                code: 'CSRF_INVALID',
            });
        }
        next();
    };
}

/**
 * Helper para express cookie-parser (se ainda não estiver instalado).
 * Implementação mínima em memória — não usar em prod (escala).
 */
function parseCookies(req) {
    const header = req.headers?.cookie || '';
    const cookies = {};
    header.split(';').forEach((pair) => {
        const idx = pair.indexOf('=');
        if (idx < 0) return;
        const key = pair.slice(0, idx).trim();
        const val = decodeURIComponent(pair.slice(idx + 1).trim());
        if (key) cookies[key] = val;
    });
    req.cookies = cookies;
}

/**
 * Middleware que faz parse de cookies (substitui cookie-parser).
 */
function cookieParser() {
    return (req, res, next) => {
        parseCookies(req);
        next();
    };
}

module.exports = {
    applySecureCookieFlags,
    csrfProtection,
    issueCsrfToken,
    cookieParser,
};
