/**
 * RENOSTTER CRM — Password Reset Worker
 * Envia e-mail com código de verificação via Resend
 * e valida o código com HMAC-SHA256 (sem KV / banco externo)
 *
 * ─── Deploy ───────────────────────────────────────────────
 * 1. npm install -g wrangler
 * 2. wrangler login
 * 3. wrangler secret put RESEND_API_KEY      ← API Key do resend.com
 * 4. wrangler secret put RESET_HMAC_SECRET   ← qualquer string aleatória longa
 * 5. wrangler deploy
 *
 * ─── Endpoints ────────────────────────────────────────────
 * POST /request  { email }
 *   → gera código, envia e-mail, retorna { ok, token, expires }
 *
 * POST /verify   { email, code, token }
 *   → valida HMAC e retorna { ok, valid }
 *
 * ─── Remetente ────────────────────────────────────────────
 * Configure um domínio no Resend (resend.com/domains) e atualize
 * FROM_EMAIL abaixo. No plano gratuito pode usar onboarding@resend.dev
 * para testes, mas recomendado configurar noreply@renostter.com
 */

const FROM_EMAIL = 'noreply@renostter.com';    // ← altere para seu domínio verificado no Resend
const FROM_NAME = 'Renostter CRM';
const CODE_EXPIRY = 15 * 60 * 1000;              // 15 minutos em ms

/* ─── CORS ─── */
const ALLOWED_ORIGINS = [
    'https://renostter.com',
    'https://www.renostter.com',
    'https://crm.renostter.com',
    'http://localhost',
    'http://127.0.0.1',
    'null',  // file:// para testes locais
];

function corsHeaders(origin) {
    const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        'Access-Control-Allow-Origin': allowed,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
    };
}

function json(data, status = 200, origin = '') {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
}

/* ─── Rate Limiting (por IP, em memória) ─── */
const rateLimitMap = new Map();

function checkRateLimit(ip, maxPerWindow = 5, windowMs = 60_000) {
    const now = Date.now();
    const entry = rateLimitMap.get(ip) || { count: 0, resetAt: now + windowMs };
    if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + windowMs; }
    entry.count++;
    rateLimitMap.set(ip, entry);
    return entry.count <= maxPerWindow;
}

/* ─── HMAC helpers ─── */
async function importKey(secret) {
    const enc = new TextEncoder();
    return crypto.subtle.importKey(
        'raw', enc.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false, ['sign', 'verify']
    );
}

async function createToken(email, code, expires, secret) {
    const payload = `${email}:${code}:${expires}`;
    const key = await importKey(secret);
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
    const b64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
    // token = base64(hmac) + '.' + expires  (so client can check expiry without calling API)
    return `${b64}.${expires}`;
}

async function verifyToken(email, code, token, secret) {
    const parts = token.split('.');
    if (parts.length < 2) return false;
    const expires = parseInt(parts[parts.length - 1]);
    if (isNaN(expires) || Date.now() > expires) return false;
    const b64Stored = parts.slice(0, -1).join('.');
    const payload = `${email}:${code}:${expires}`;
    const key = await importKey(secret);
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
    const b64Expected = btoa(String.fromCharCode(...new Uint8Array(sig)));
    return b64Stored === b64Expected;
}

/* ─── Gerar código de 6 dígitos ─── */
function generateCode() {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return String(100000 + (arr[0] % 900000));
}

/* ─── Enviar e-mail via Resend ─── */
async function sendEmail(apiKey, to, code) {
    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><style>
body{font-family:Inter,Arial,sans-serif;background:#0D1117;color:#E6EDF3;margin:0;padding:0}
.wrap{max-width:520px;margin:40px auto;padding:32px;background:#161B22;border-radius:12px;border:1px solid #30363D}
.brand{display:flex;align-items:center;gap:10px;margin-bottom:24px}
.logo{width:38px;height:38px;background:linear-gradient(135deg,#00AEEF,#FF6B00);border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:1.1rem;color:#fff}
.brand-name{font-size:1.1rem;font-weight:700;color:#E6EDF3}
h2{font-size:1.3rem;margin:0 0 8px;color:#E6EDF3}
p{color:#8B949E;font-size:0.9rem;line-height:1.6;margin:0 0 20px}
.code-box{background:#0D1117;border:1px solid #30363D;border-radius:10px;padding:24px;text-align:center;margin:24px 0}
.code{font-size:2.8rem;font-weight:800;letter-spacing:.25em;color:#00AEEF;font-family:monospace}
.expiry{font-size:0.8rem;color:#8B949E;margin-top:8px}
.footer{font-size:0.78rem;color:#484F58;margin-top:24px;padding-top:16px;border-top:1px solid #21262D}
</style></head>
<body>
<div class="wrap">
  <div class="brand">
    <img src="https://renostter.com/assets/logo.png" alt="Renostter Climatização" style="height: 48px; width: auto; display: block;">
  </div>
  <h2>Redefinição de Senha 🔑</h2>
  <p>Recebemos uma solicitação para redefinir a senha da sua conta. Use o código abaixo para continuar:</p>
  <div class="code-box">
    <div class="code">${code}</div>
    <div class="expiry">⏱ Válido por <strong>15 minutos</strong></div>
  </div>
  <p>Se você não solicitou esta redefinição, ignore este e-mail. Sua senha permanece a mesma.</p>
  <div class="footer">
    Renostter Climatização · Este é um e-mail automático, não responda.<br>
    Por segurança, nunca compartilhe este código com ninguém.
  </div>
</div>
</body>
</html>`;

    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            from: `${FROM_NAME} <${FROM_EMAIL}>`,
            to: [to],
            subject: `${code} — Código de verificação Renostter CRM`,
            html,
        }),
    });

    return res.ok;
}

/* ─── Handler principal ─── */
export default {
    async fetch(request, env) {
        const origin = request.headers.get('Origin') || '';
        const url = new URL(request.url);
        const ip = request.headers.get('CF-Connecting-IP') || '0.0.0.0';

        /* Preflight CORS */
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: corsHeaders(origin) });
        }

        if (request.method !== 'POST') {
            return json({ error: 'Method not allowed' }, 405, origin);
        }

        /* Validar secrets configurados */
        if (!env.RESEND_API_KEY || !env.RESET_HMAC_SECRET) {
            return json({ error: 'Worker secrets não configurados. Execute: wrangler secret put RESEND_API_KEY' }, 500, origin);
        }

        let body;
        try { body = await request.json(); }
        catch { return json({ error: 'JSON inválido' }, 400, origin); }

        /* ── POST /request ── */
        if (url.pathname === '/request') {
            if (!checkRateLimit(ip, 5, 60_000)) {
                return json({ error: 'Muitas tentativas. Aguarde 1 minuto.' }, 429, origin);
            }

            const email = (body.email || '').trim().toLowerCase();
            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                return json({ ok: true }); // Não revelar se e-mail existe (segurança)
            }

            const code = generateCode();
            const expires = Date.now() + CODE_EXPIRY;
            const token = await createToken(email, code, expires, env.RESET_HMAC_SECRET);

            const sent = await sendEmail(env.RESEND_API_KEY, email, code);
            if (!sent) {
                return json({ error: 'Falha ao enviar e-mail. Tente novamente.' }, 502, origin);
            }

            // Retornamos o token HMAC para o cliente armazenar
            // O código em si fica APENAS no e-mail — nunca expostos ao JS do cliente
            return json({ ok: true, token, expires }, 200, origin);
        }

        /* ── POST /verify ── */
        if (url.pathname === '/verify') {
            if (!checkRateLimit(ip, 10, 60_000)) {
                return json({ error: 'Muitas tentativas.' }, 429, origin);
            }

            const { email = '', code = '', token = '' } = body;

            if (!email || !code || !token) {
                return json({ ok: true, valid: false }, 200, origin);
            }

            const valid = await verifyToken(
                email.trim().toLowerCase(),
                code.trim(),
                token,
                env.RESET_HMAC_SECRET
            );

            return json({ ok: true, valid }, 200, origin);
        }

        return json({ error: 'Endpoint não encontrado' }, 404, origin);
    },
};
