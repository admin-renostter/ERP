// HTTP smoke test for Sprint 14 BI endpoints
const http = require('http');
const PORT = 3022;
const BASE = `http://127.0.0.1:${PORT}`;

function fetch(url, opts = {}) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const req = http.request({
            hostname: u.hostname, port: u.port, path: u.pathname + (u.search || ''),
            method: opts.method || 'GET', headers: opts.headers || {},
        }, (res) => {
            let buf = '';
            res.on('data', c => buf += c);
            res.on('end', () => resolve({
                status: res.statusCode,
                headers: res.headers,
                text: () => buf,
                json: () => buf ? JSON.parse(buf) : {},
            }));
        });
        req.on('error', reject);
        if (opts.body) req.write(opts.body);
        req.end();
    });
}

(async () => {
    console.log(`\n=== Sprint 14 BI HTTP Smoke Test (porta ${PORT}) ===\n`);

    // Wait for server to be ready
    await new Promise(r => setTimeout(r, 1500));

    // Health
    const h = await fetch(`${BASE}/health`);
    console.log(`GET /health: ${h.status}`);

    // Login
    const r1 = await fetch(`${BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'tec-001', password: '123' }),
    });
    const login = await r1.json();
    console.log(`POST /api/auth/login: ${r1.status} success=${login.success}`);

    if (!login.accessToken) {
        console.error('Sem accessToken, saindo');
        process.exit(1);
    }

    const headers = { 'Authorization': 'Bearer ' + login.accessToken };

    // BI overview
    const r2 = await fetch(`${BASE}/api/bi/overview?period=30d`, { headers });
    const o = await r2.json();
    console.log(`GET /api/bi/overview: ${r2.status} period=${o.data?.period} tenant=${o.data?.tenantId} cache=${o.data?._cache} cobrancas.qtdTotal=${o.data?.cobrancas?.qtdTotal}`);

    // BI overview noCache (segunda chamada deve ser cache hit)
    const r2b = await fetch(`${BASE}/api/bi/overview?period=30d`, { headers });
    const ob = await r2b.json();
    console.log(`GET /api/bi/overview (2nd): ${r2b.status} cache=${ob.data?._cache}`);

    // Drill cobrancas
    const r3 = await fetch(`${BASE}/api/bi/drill/cobrancas?period=30d&limit=3`, { headers });
    const d = await r3.json();
    console.log(`GET /api/bi/drill/cobrancas: ${r3.status} total=${d.data?.total} metric=${d.data?.metric}`);

    // Drill tickets
    const r3b = await fetch(`${BASE}/api/bi/drill/tickets?period=30d&limit=3`, { headers });
    const db = await r3b.json();
    console.log(`GET /api/bi/drill/tickets: ${r3b.status} total=${db.data?.total}`);

    // Drill leads
    const r3c = await fetch(`${BASE}/api/bi/drill/leads?period=30d&limit=3`, { headers });
    const dc = await r3c.json();
    console.log(`GET /api/bi/drill/leads: ${r3c.status} total=${dc.data?.total}`);

    // Cohort
    const r4 = await fetch(`${BASE}/api/bi/cohort?meses=3`, { headers });
    const c = await r4.json();
    console.log(`GET /api/bi/cohort: ${r4.status} cohorts=${c.data?.cohorts?.length} summary=${JSON.stringify(c.data?.summary)}`);

    // Anomalies
    const r5 = await fetch(`${BASE}/api/bi/anomalies`, { headers });
    const a = await r5.json();
    console.log(`GET /api/bi/anomalies: ${r5.status} total=${a.data?.total}`);

    // Export CSV
    const r6 = await fetch(`${BASE}/api/bi/export/cobrancas?period=30d`, { headers });
    const csv = await r6.text();
    const lines = csv.split('\n');
    console.log(`GET /api/bi/export/cobrancas: ${r6.status} lines=${lines.length} header="${lines[0]?.substring(0, 60)}"`);
    console.log(`  Content-Type: ${r6.headers['content-type']}`);
    console.log(`  Content-Disposition: ${r6.headers['content-disposition']?.substring(0, 60)}`);

    // Cache refresh
    const r7 = await fetch(`${BASE}/api/bi/cache/refresh`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    console.log(`POST /api/bi/cache/refresh: ${r7.status}`);

    // Invalid metric
    const r8 = await fetch(`${BASE}/api/bi/drill/invalid_metric?period=30d`, { headers });
    const err = await r8.json();
    console.log(`GET /api/bi/drill/invalid: ${r8.status} error="${err.error?.substring(0, 50)}"`);

    console.log(`\n=== OK ===`);
    process.exit(0);
})().catch(e => {
    console.error('FATAL:', e);
    process.exit(1);
});
