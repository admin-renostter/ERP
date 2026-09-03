/**
 * Performance Audit — Renostter CRM Cobrança
 *
 * Mede tempos reais dos endpoints do backend sob carga.
 * Gera relatório com P50/P95/P99 + throughput.
 *
 * Uso: node tools/perf-audit.cjs
 */
const http = require('http');

const HOST = 'localhost';
const PORT = 3000;
const BASE = `http://${HOST}:${PORT}`;

const HEADERS = {
    'Content-Type': 'application/json',
    'X-User-Id': 'u1',
    'X-User-Name': 'Carlos Admin',
    'X-User-Role': 'admin'
};

function req(method, urlPath, body = null, headers = HEADERS) {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : null;
        const t0 = Date.now();
        const r = http.request({
            method,
            hostname: HOST,
            port: PORT,
            path: urlPath,
            headers: { ...headers, ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) }
        }, res => {
            let chunks = '';
            res.on('data', c => chunks += c);
            res.on('end', () => {
                const ms = Date.now() - t0;
                let parsed;
                try { parsed = JSON.parse(chunks); } catch { parsed = chunks; }
                resolve({ status: res.statusCode, body: parsed, ms });
            });
        });
        r.on('error', reject);
        if (data) r.write(data);
        r.end();
    });
}

function stats(arr) {
    const sorted = [...arr].sort((a, b) => a - b);
    return {
        n: sorted.length,
        min: sorted[0],
        max: sorted[sorted.length - 1],
        avg: +(arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(2),
        p50: sorted[Math.floor(sorted.length * 0.5)],
        p95: sorted[Math.floor(sorted.length * 0.95)],
        p99: sorted[Math.floor(sorted.length * 0.99)]
    };
}

async function bench(name, fn, iterations = 50, concurrency = 1) {
    const times = [];
    const errors = [];

    // Warmup
    for (let i = 0; i < 3; i++) {
        try { await fn(); } catch (e) {}
    }

    const t0 = Date.now();
    const workers = [];
    for (let w = 0; w < concurrency; w++) {
        workers.push((async () => {
            const myIter = Math.ceil(iterations / concurrency);
            for (let i = 0; i < myIter && times.length + errors.length < iterations; i++) {
                try {
                    const r = await fn();
                    if (r.status >= 400) errors.push({ status: r.status, body: r.body });
                    else times.push(r.ms);
                } catch (e) {
                    errors.push({ err: e.message });
                }
            }
        })());
    }
    await Promise.all(workers);
    const totalMs = Date.now() - t0;

    const s = stats(times);
    const tps = (times.length / (totalMs / 1000)).toFixed(2);
    return { name, iterations, concurrency, totalMs, stats: s, errors: errors.length, tps };
}

async function run() {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║   Performance Audit — Renostter CRM Cobrança              ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    // Health
    console.log('0. Health check');
    const health = await req('GET', '/health');
    if (health.status !== 200) {
        console.error(`  ❌ Backend não está respondendo (status ${health.status})`);
        process.exit(1);
    }
    console.log(`  ✅ OK (${health.ms}ms)\n`);

    // Endpoints para testar
    const tests = [
        {
            name: 'GET /api/cobrancas (listar 50) — baixa concorrência',
            fn: () => req('GET', '/api/cobrancas?size=50'),
            iters: 50, conc: 5
        },
        {
            name: 'GET /api/cobrancas (listar 50) — ALTA concorrência (20)',
            fn: () => req('GET', '/api/cobrancas?size=50'),
            iters: 100, conc: 20
        },
        {
            name: 'GET /api/cobrancas/kpis',
            fn: () => req('GET', '/api/cobrancas/kpis'),
            iters: 50, conc: 5
        },
        {
            name: 'GET /api/cobrancas/stats',
            fn: () => req('GET', '/api/cobrancas/stats'),
            iters: 30, conc: 3
        },
        {
            name: 'GET /api/cobrancas/summary',
            fn: () => req('GET', '/api/cobrancas/summary'),
            iters: 30, conc: 3
        },
        {
            name: 'GET /api/cobrancas/aging',
            fn: () => req('GET', '/api/cobrancas/aging'),
            iters: 30, conc: 3
        },
        {
            name: 'GET /api/cobrancas/sync',
            fn: () => req('GET', '/api/cobrancas/sync'),
            iters: 30, conc: 3
        },
        {
            name: 'GET /api/approvals/count',
            fn: () => req('GET', '/api/approvals/count'),
            iters: 50, conc: 5
        },
        {
            name: 'GET /api/approvals/pending',
            fn: () => req('GET', '/api/approvals/pending'),
            iters: 30, conc: 3
        }
    ];

    const results = [];
    for (const t of tests) {
        const r = await bench(t.name, t.fn, t.iters, t.conc);
        results.push(r);
        const s = r.stats;
        const speed = r.errors > 0 ? ` ⚠️ ${r.errors} erros` : '';
        console.log(`  ${r.name}`);
        console.log(`     n=${s.n} | avg=${s.avg}ms | p50=${s.p50}ms | p95=${s.p95}ms | p99=${s.p99}ms | max=${s.max}ms | ${r.tps} req/s${speed}`);
        console.log();
    }

    // Análise
    console.log('\n📊 Análise:');
    const slow = results.filter(r => r.stats.p95 > 200);
    if (slow.length > 0) {
        console.log('  ⚠️  Endpoints lentos (P95 > 200ms):');
        slow.forEach(r => console.log(`     - ${r.name}: P95=${r.stats.p95}ms`));
    } else {
        console.log('  ✅ Todos endpoints com P95 < 200ms (saudável)');
    }
}

run().catch(e => { console.error(e); process.exit(1); });