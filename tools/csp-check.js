// tools/csp-check.js — abre cada pagina no Chromium com a CSP de producao e confere:
// violacoes de CSP, handlers data-on-* resolvidos, erros ao clicar e chamadas /api sem token.
// Uso: ls paginas | node tools/csp-check.js <raiz-do-frontend> <rotulo> [--csp] [--click]
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(process.argv[2]);
const LABEL = process.argv[3];
const WITH_CSP = process.argv.includes('--csp');
const CLICK = process.argv.includes('--click');

// CSP de producao reconstruida de cora-api/server.js (NODE_ENV=production)
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: https:",
  "connect-src 'self' https://api.cora.com.br https://api.brasilapi.com.br https://fonts.gstatic.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "object-src 'none'", "media-src 'self'", "frame-src 'none'", "frame-ancestors 'none'",
  "base-uri 'self'", "form-action 'self'",
].join('; ');

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webm': 'video/webm', '.json': 'application/json', '.ico': 'image/x-icon' };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: true, data: [], items: [], total: 0 }));
  }
  let p = url.pathname.replace(/^\/crm\//, '/');
  const file = path.join(ROOT, decodeURIComponent(p));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  const h = { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' };
  if (WITH_CSP) h['Content-Security-Policy'] = CSP;
  res.writeHead(200, h);
  fs.createReadStream(file).pipe(res);
});

function roleFor(rel) {
  if (rel.startsWith('admin/')) return { userId: 'u0', role: 'superadmin', name: 'Teste Admin', isSuperAdmin: true };
  if (rel.startsWith('tech/') || rel.startsWith('tecnico/')) return { userId: 'u2', role: 'tecnico', name: 'Teste Tecnico' };
  if (rel.startsWith('client/') || rel.startsWith('portal/')) return { userId: 'u3', role: 'cliente', name: 'Teste Cliente', clientId: 'c1' };
  return null;
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(() => chromium.launch());
  const pages = fs.readFileSync(0, 'utf8').trim().split('\n');
  const results = [];
  for (const rel of pages) {
    const ctx = await browser.newContext();
    const role = roleFor(rel);
    await ctx.addInitScript(({ role }) => {
      window.__viol = [];
      document.addEventListener('securitypolicyviolation', e => window.__viol.push(e.violatedDirective + ' ' + (e.blockedURI || '') + ' ' + (e.sample || '').slice(0, 60)));
      if (role) sessionStorage.setItem('rcrm_session', JSON.stringify(Object.assign({ email: 't@t', accessToken: 'test', refreshToken: 'r', expiresAt: Date.now() + 36e5 }, role)));
    }, { role });
    const page = await ctx.newPage();
    const errors = [], cspErr = [], shimErr = [];
    page.on('pageerror', e => errors.push(String(e.message).slice(0, 160)));
    page.on('console', m => {
      const t = m.text();
      if (/Content Security Policy/i.test(t)) cspErr.push(t.slice(0, 120));
      if (t.startsWith('[csp-events]')) shimErr.push(t.slice(0, 220));
    });
    const apiNoAuth = [], apiTotal = [];
    page.on('request', rq => { const u = rq.url(); if (/\/api\//.test(u)) { apiTotal.push(u); const a = rq.headers()['authorization']; if (!a || !/^Bearer \S+/.test(a) || /Bearer (null|undefined)$/.test(a)) apiNoAuth.push(u.replace(/^https?:\/\/[^/]+/, '')); } });
    page.on('dialog', d => d.dismiss().catch(() => {}));
    let finalUrl = '';
    try {
      await page.goto(`http://127.0.0.1:${port}/crm/${rel}`, { waitUntil: 'load', timeout: 15000 });
      await page.waitForTimeout(1200);
      finalUrl = page.url().replace(/^http:\/\/127\.0\.0\.1:\d+\/crm\//, '');
    } catch (e) { errors.push('NAV: ' + e.message.slice(0, 100)); }
    let audit = null, inlineAttrs = 0, viol = [];
    try {
      viol = await page.evaluate(() => window.__viol);
      inlineAttrs = await page.evaluate(() => [...document.querySelectorAll('*')].reduce((n, el) => n + [...el.attributes].filter(a => /^on[a-z]+$/.test(a.name)).length, 0));
      audit = await page.evaluate(() => window.__cspEvents ? window.__cspEvents.audit() : null);
    } catch (e) { errors.push('EVAL: ' + e.message.slice(0, 100)); }

    let clicks = 0, clickErrors = [];
    if (CLICK) {
      const attr = audit ? 'data-on-click' : 'onclick';
      const errStart = errors.length, shimStart = shimErr.length;
      const n = await page.evaluate((attr) => {
        const els = [...document.querySelectorAll('[' + attr + ']')];
        els.forEach((e, i) => e.setAttribute('data-test-idx', i));
        return els.length;
      }, attr);
      for (let i = 0; i < n; i++) {
        const loc = page.locator(`[data-test-idx="${i}"]`);
        try {
          const code = await loc.getAttribute(attr, { timeout: 200 });
          if (!code || /location|logout|href|window\.open|print\(|removeChild|\.click\(\)/.test(code)) continue;
          if (await loc.isVisible({ timeout: 200 })) {
            clicks++;
            await loc.click({ timeout: 800, force: true, noWaitAfter: true });
            await page.waitForTimeout(40);
            await page.keyboard.press('Escape').catch(() => {});
          }
        } catch (_) { /* elemento sumiu/coberto */ }
      }
      await page.waitForTimeout(300);
      clickErrors = errors.slice(errStart).concat(shimErr.slice(shimStart));
    }
    results.push({ page: rel, finalUrl, violDetail: viol, violations: viol.length, cspConsole: cspErr.length, inlineOnAttrs: inlineAttrs,
      handlers: audit ? audit.handlers : null, auditProblems: audit ? audit.problems : null, apiCalls: apiTotal.length, apiNoAuth, clicks, clickErrors, shimErrors: shimErr, pageErrors: errors });
    await ctx.close();
  }
  await browser.close(); server.close();
  fs.writeFileSync(`${__dirname}/csp-result-${LABEL}.json`, JSON.stringify(results, null, 1));
  for (const r of results) {
    console.log(`${r.page.padEnd(34)} viol=${String(r.violations).padStart(3)} onAttrs=${String(r.inlineOnAttrs).padStart(3)} handlers=${String(r.handlers).padStart(4)} audit=${r.auditProblems ? r.auditProblems.length : '-'} clicks=${r.clicks} clickErr=${r.clickErrors.length} api=${r.apiCalls} semToken=${r.apiNoAuth.length} shimErr=${r.shimErrors.length} pageErr=${r.pageErrors.length}${r.finalUrl && r.finalUrl !== r.page ? ' -> ' + r.finalUrl : ''}`);
  }
})();
