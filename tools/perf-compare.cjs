/**
 * Comparativo A/B — isola o efeito do rate limiter + timeout.
 */
const http = require('http');

const HOST = 'localhost';
const PORT = 3000;
const HEADERS = { 'Content-Type': 'application/json' };

function req(method, urlPath) {
    return new Promise((resolve, reject) => {
        const t0 = Date.now();
        const r = http.request({
            method, hostname: HOST, port: PORT, path: urlPath, headers: HEADERS
        }, res => {
            let chunks = '';
            res.on('data', c => chunks += c);
            res.on('end', () => resolve({ status: res.statusCode, body: chunks.substring(0, 50), ms: Date.now() - t0 }));
        });
        r.on('error', reject);
        r.end();
    });
}

async function bench(name, url, iters = 30) {
    // warmup
    for (let i = 0; i < 3; i++) await req('GET', url);

    const times = [];
    for (let i = 0; i < iters; i++) {
        const r = await req('GET', url);
        if (r.status === 200) times.push(r.ms);
    }
    times.sort((a, b) => a - b);
    const avg = (times.reduce((s, v) => s + v, 0) / times.length).toFixed(2);
    const p50 = times[Math.floor(times.length / 2)];
    const p95 = times[Math.floor(times.length * 0.95)];
    console.log(`  ${name.padEnd(45)} avg=${avg}ms p50=${p50}ms p95=${p95}ms`);
    return { avg: +avg, p50, p95 };
}

async function run() {
    console.log('\n📊 Re-bench (sequencial puro, n=30):\n');
    await bench('/health', '/health');
    await bench('/api/cobrancas/kpis', '/api/cobrancas/kpis');
    await bench('/api/cobrancas/sync (paginado)', '/api/cobrancas/sync?limit=100');
    await bench('/api/cobrancas/aging', '/api/cobrancas/aging');
    await bench('/api/approvals/pending', '/api/approvals/pending');
    await bench('/api/approvals/count', '/api/approvals/count');
}

run();