/**
 * Security Headers Middleware — V23 + V24
 *
 * Sprint Security Hardening 3
 *
 * V23: CSP nonce-based (substitui 'unsafe-inline' em produção)
 *   - Cada request recebe um nonce único
 *   - HTML servido inclui <script nonce="..."> e o CSP libera apenas esse nonce
 *   - Inline scripts SEM nonce são bloqueados
 *
 * V24: Security Headers extras (não cobertos por Helmet defaults)
 *   - Permissions-Policy: desabilita APIs sensíveis (geolocation, camera, etc) por padrão
 *   - X-Permitted-Cross-Domain-Policies: NONE (impede Flash/Acrobat cross-domain)
 *   - X-DNS-Prefetch-Control: off
 *   - X-Download-Options: noopen (IE legacy)
 *   - Clear-Site-Data: "cache", "cookies", "storage" (em /api/auth/logout)
 *
 * USO:
 *   app.use(cspNonce());
 *   app.use(extraSecurityHeaders());
 *   app.post('/api/auth/logout', clearSiteData(), handler);
 */

const crypto = require('crypto');

/**
 * V23: Gera nonce por request para CSP strict
 * O nonce fica em res.locals.cspNonce — templates/scripts podem usar.
 */
function cspNonce() {
    return (req, res, next) => {
        // Gera nonce base64url (16 bytes = ~22 chars)
        const nonce = crypto.randomBytes(16).toString('base64');
        res.locals.cspNonce = nonce;
        // Adiciona nonce ao header CSP (override do helmet)
        const origSetHeader = res.setHeader.bind(res);
        res.setHeader = function (name, value) {
            if (name.toLowerCase() === 'content-security-policy' && process.env.NODE_ENV === 'production') {
                // Adiciona 'nonce-<value>' a script-src
                value = String(value).replace(
                    /script-src([^;]*)/,
                    (match, rest) => `script-src${rest} 'nonce-${nonce}'`
                );
            }
            return origSetHeader(name, value);
        };
        next();
    };
}

/**
 * V24: Headers de segurança extras
 */
function extraSecurityHeaders() {
    return (req, res, next) => {
        // Permissions-Policy: desabilita APIs que não usamos (defense in depth)
        res.setHeader('Permissions-Policy',
            'geolocation=(), camera=(), microphone=(), payment=(), usb=(), ' +
            'magnetometer=(), gyroscope=(), accelerometer=(), ambient-light-sensor=()'
        );
        // Bloqueia cross-domain policies legados (Flash, Acrobat, Silverlight)
        res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
        // Desabilita DNS prefetch (pode vazar info de navegação)
        res.setHeader('X-DNS-Prefetch-Control', 'off');
        // IE legacy: força download em vez de abrir in-page
        res.setHeader('X-Download-Options', 'noopen');
        // Limita tempo de retenção de referrer em cross-origin
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        // Cross-Origin policies (defesa contra side-channel attacks)
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
        res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
        next();
    };
}

/**
 * V24: Clear-Site-Data (LGPD/GDPR) - limpa cookies, cache, storage no logout
 * Header Clear-Site-Data: "cache", "cookies", "storage", "executionContexts"
 */
function clearSiteData(types = ['cache', 'cookies', 'storage']) {
    return (req, res, next) => {
        res.setHeader('Clear-Site-Data', JSON.stringify(types));
        next();
    };
}

module.exports = {
    cspNonce,
    extraSecurityHeaders,
    clearSiteData,
};
