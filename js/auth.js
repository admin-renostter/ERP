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

const auth = {
    SESSION_KEY: 'rcrm_session',

    login(email, password) {
        const users = db.get('users');
        const user = users.find(u => u.email === email && u.password === password);
        if (!user) return null;
        if (user.deactivated) return null; // blocked account
        const session = {
            userId: user.id,
            role: user.role,
            name: user.name,
            photo: user.photo || null,
            clientId: user.clientId || null,
            isSuperAdmin: user.role === 'superadmin'
        };
        sessionStorage.setItem(this.SESSION_KEY, JSON.stringify(session));
        return user;
    },

    logout() {
        sessionStorage.removeItem(this.SESSION_KEY);
        window.location.href = rootPath() + 'index.html';
    },

    current() {
        const s = sessionStorage.getItem(this.SESSION_KEY);
        return s ? JSON.parse(s) : null;
    },

    protect(allowedRoles) {
        const session = this.current();
        if (!session) { window.location.href = rootPath() + 'index.html'; return null; }
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
