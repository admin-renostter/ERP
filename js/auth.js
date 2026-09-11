/**
 * RENOSTTER CRM — Auth & Route Protection
 */

/* Helper to resolve root path regardless of nesting depth
 * Works correctly with file:// on Windows and served URLs.
 * CRM structure: root level (index.html, forgot-password.html)
 *               or one level deep (admin/*, tech/*, client/*)
 */
function rootPath() {
    const path = window.location.pathname.replace(/\\/g, '/');
    const filename = path.split('/').pop() || '';
    // Files that live at CRM root
    const rootFiles = ['index.html', 'forgot-password.html', '404.html', ''];
    return rootFiles.includes(filename) ? './' : '../';
}

/* Redirect helpers */
function redirectToDashboard(role) {
    const base = rootPath();
    if (role === 'superadmin' || role === 'admin') window.location.href = base + 'admin/dashboard.html';
    else if (role === 'tecnico') window.location.href = base + 'tech/dashboard.html';
    else window.location.href = base + 'client/dashboard.html';
}

/**
 * Converte TTL tipo '15m' / '2h' / '7d' em milissegundos.
 * Usado para calcular quando o access token expira (client-side, só para UX
 * de redirect — quem realmente barra token expirado/inválido é o backend).
 */
function parseTTLToMs(ttl) {
    const m = String(ttl || '').match(/^(\d+)([smhd])$/);
    if (!m) return 15 * 60 * 1000; // default: 15min
    const n = parseInt(m[1], 10);
    const mult = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2]];
    return n * mult;
}

const auth = {
    SESSION_KEY: 'rcrm_session',

    /**
     * Login REAL contra o backend (POST /api/auth/login) — bcrypt, rate-limit
     * e (quando configurado) TOTP já são verificados no servidor.
     *
     * SUBSTITUI a versão anterior, que comparava email/senha em texto puro
     * contra um array salvo no localStorage do próprio navegador — qualquer
     * pessoa conseguia "logar" sem senha real só escrevendo no DevTools.
     * (Correção aplicada em 11/09 — ver plano de ativação, achado de segurança.)
     *
     * @returns {Promise<Object>} a sessão criada
     * @throws {Error} com .code igual ao `code` retornado pela API em caso de falha
     */
    async login(email, password, totp = null) {
        let res, data;
        try {
            res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, totp: totp || undefined }),
            });
            data = await res.json();
        } catch (e) {
            const err = new Error('Não foi possível contatar o servidor. Verifique sua conexão.');
            err.code = 'NETWORK_ERROR';
            throw err;
        }
        if (!res.ok || !data.success) {
            const err = new Error(data.error || 'E-mail ou senha incorretos.');
            err.code = data.code || 'LOGIN_FAILED';
            throw err;
        }

        const session = {
            userId: data.user.id,
            role: data.user.role,
            name: data.user.name,
            email: data.user.email,
            photo: data.user.photo || null,
            clientId: data.user.clientId || null,
            tenantId: data.user.tenantId || null,
            isSuperAdmin: data.user.role === 'superadmin',
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
            expiresAt: Date.now() + parseTTLToMs(data.expiresIn),
        };
        sessionStorage.setItem(this.SESSION_KEY, JSON.stringify(session));
        return session;
    },

    /** Header pronto para autenticar chamadas reais à API com o token da sessão. */
    authHeader() {
        const s = this.current();
        return s?.accessToken ? { 'Authorization': 'Bearer ' + s.accessToken } : {};
    },

    async logout() {
        const session = this.current();
        if (session?.accessToken) {
            // Revoga o token no servidor (best-effort — não bloqueia o logout local)
            try {
                await fetch('/api/auth/logout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...this.authHeader() },
                });
            } catch (_) { /* ignora falha de rede no logout */ }
        }
        sessionStorage.removeItem(this.SESSION_KEY);
        window.location.href = rootPath() + 'index.html';
    },

    current() {
        const s = sessionStorage.getItem(this.SESSION_KEY);
        return s ? JSON.parse(s) : null;
    },

    protect(allowedRoles) {
        const session = this.current();
        // SECURITY FIX (11/09): exige um accessToken de verdade — não basta mais
        // gravar um objeto qualquer em sessionStorage para "estar logado".
        // Isso só protege a navegação/UX: quem de fato barra dado real é o
        // backend (authJWT.js), que rejeita qualquer token que não seja um
        // JWT válido assinado pelo servidor.
        if (!session || !session.accessToken) {
            window.location.href = rootPath() + 'index.html';
            return null;
        }
        if (session.expiresAt && Date.now() > session.expiresAt) {
            sessionStorage.removeItem(this.SESSION_KEY);
            window.location.href = rootPath() + 'index.html';
            return null;
        }
        // superadmin has access everywhere that admin has access
        const effectiveRole = session.role === 'superadmin' ? 'admin' : session.role;
        if (allowedRoles && !allowedRoles.includes(session.role) && !allowedRoles.includes(effectiveRole)) {
            window.location.href = rootPath() + 'index.html';
            return null;
        }
        return session;
    },

    isAdmin() { const s = this.current(); return ['admin', 'superadmin'].includes(s?.role); },
    isSuperAdmin() { const s = this.current(); return s?.role === 'superadmin'; },
    isTecnico() { const s = this.current(); return s?.role === 'tecnico'; },
    isCliente() { const s = this.current(); return s?.role === 'cliente'; },
    isStaff() { const s = this.current(); return ['admin', 'tecnico', 'superadmin'].includes(s?.role); },
};

/* ─── 2FA ─── */
const twoFA = {
    generate() {
        const code = String(Math.floor(100000 + Math.random() * 900000));
        sessionStorage.setItem('rcrm_2fa_code', code);
        sessionStorage.setItem('rcrm_2fa_ts', Date.now().toString());
        return code;
    },
    verify(input) {
        const code = sessionStorage.getItem('rcrm_2fa_code');
        const ts = parseInt(sessionStorage.getItem('rcrm_2fa_ts') || '0');
        const valid = code === input.trim() && (Date.now() - ts) < 300_000; // 5 min
        if (valid) {
            sessionStorage.removeItem('rcrm_2fa_code');
            sessionStorage.removeItem('rcrm_2fa_ts');
        }
        return valid;
    },
};

/* ─── Password Reset System ─── */
const passwordReset = {
    STORE_KEY: 'rcrm_pwd_reset',

    /**
     * Request a password reset code for an email.
     * Returns the code (in production this would be emailed).
     * Returns false if no user found (silently — security).
     */
    request(email) {
        const user = db.get('users').find(u => u.email === email);
        if (!user) return false;
        const code = String(Math.floor(100000 + Math.random() * 900000));
        const expires = Date.now() + 15 * 60_000; // 15 minutes
        const resets = JSON.parse(localStorage.getItem(this.STORE_KEY) || '{}');
        resets[email] = { code, expires, userId: user.id };
        localStorage.setItem(this.STORE_KEY, JSON.stringify(resets));
        return code;
    },

    /** Verify that the code is correct and not expired */
    verify(email, code) {
        const resets = JSON.parse(localStorage.getItem(this.STORE_KEY) || '{}');
        const entry = resets[email];
        if (!entry) return false;
        if (Date.now() > entry.expires) {
            delete resets[email];
            localStorage.setItem(this.STORE_KEY, JSON.stringify(resets));
            return false;
        }
        return entry.code === code.trim();
    },

    /** Change the password after successful code verification */
    changePassword(email, code, newPassword) {
        if (!this.verify(email, code)) return false;
        const users = db.get('users');
        const idx = users.findIndex(u => u.email === email);
        if (idx === -1) return false;
        users[idx].password = newPassword;
        users[idx].updatedAt = new Date().toISOString();
        db.set('users', users);
        // Invalidate reset token
        const resets = JSON.parse(localStorage.getItem(this.STORE_KEY) || '{}');
        delete resets[email];
        localStorage.setItem(this.STORE_KEY, JSON.stringify(resets));
        return true;
    },
};
