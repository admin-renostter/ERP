/**
 * Wait for Dependencies — Bloqueia até Postgres e Redis estarem prontos
 *
 * Sprint 4 — Cloud-Native Stack
 *
 * Uso:
 *   node scripts/wait-for-deps.js [--timeout=60] [--service=postgres] [--service=redis]
 *
 * Uso como init container Docker:
 *   ENTRYPOINT ["/sbin/tini", "--", "node", "scripts/wait-for-deps.js"]
 *   CMD ["&&", "node", "server.js"]
 *
 * Ou em Kubernetes (initContainer):
 *   initContainers:
 *     - name: wait-for-deps
 *       image: renostter/cora-api:migrator
 *       command: ["node", "scripts/wait-for-deps.js"]
 */

const { Client } = require('pg');
const net = require('net');

const args = process.argv.slice(2).reduce((acc, arg) => {
    const [k, v] = arg.replace(/^--/, '').split('=');
    acc[k] = v || true;
    return acc;
}, {});

const TIMEOUT = parseInt(args.timeout || '60', 10);
const SERVICES = args.service
    ? [args.service]
    : ['postgres', 'redis'];
const POLL_INTERVAL = 2000;

function parseUrl(url, service) {
    try {
        const u = new URL(url);
        return { host: u.hostname, port: parseInt(u.port || (service === 'postgres' ? '5432' : '6379'), 10) };
    } catch (e) {
        return null;
    }
}

function checkTcp(host, port, timeoutMs = 3000) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        const timer = setTimeout(() => {
            socket.destroy();
            resolve(false);
        }, timeoutMs);
        socket.on('connect', () => {
            clearTimeout(timer);
            socket.end();
            resolve(true);
        });
        socket.on('error', () => {
            clearTimeout(timer);
            resolve(false);
        });
        socket.connect(port, host);
    });
}

async function checkPostgres() {
    const url = process.env.DATABASE_URL;
    if (!url) {
        console.log('  ⏭  DATABASE_URL não configurado — pulando verificação Postgres');
        return true;
    }
    const cfg = parseUrl(url, 'postgres');
    if (!cfg) {
        console.error('  ✗ DATABASE_URL inválido:', url);
        return false;
    }
    console.log(`  → Testando Postgres em ${cfg.host}:${cfg.port}...`);
    try {
        const client = new Client({ connectionString: url, connectionTimeoutMillis: 3000 });
        await client.connect();
        const r = await client.query('SELECT 1 as ok');
        await client.end();
        if (r.rows[0]?.ok === 1) {
            console.log('  ✓ Postgres OK');
            return true;
        }
        return false;
    } catch (e) {
        console.log(`     ${e.message}`);
        return false;
    }
}

async function checkRedis() {
    const url = process.env.REDIS_URL;
    if (!url) {
        console.log('  ⏭  REDIS_URL não configurado — pulando verificação Redis');
        return true;
    }
    const cfg = parseUrl(url, 'redis');
    if (!cfg) {
        console.error('  ✗ REDIS_URL inválido:', url);
        return false;
    }
    console.log(`  → Testando Redis em ${cfg.host}:${cfg.port}...`);
    const tcpOk = await checkTcp(cfg.host, cfg.port);
    if (tcpOk) {
        console.log('  ✓ Redis OK (TCP)');
        return true;
    }
    return false;
}

async function waitForService(name, checkFn) {
    const start = Date.now();
    const deadline = start + TIMEOUT * 1000;
    let attempt = 0;
    while (Date.now() < deadline) {
        attempt++;
        process.stdout.write(`  [${name}] tentativa ${attempt}... `);
        const ok = await checkFn();
        if (ok) {
            console.log('OK');
            return true;
        }
        console.log('falhou, aguardando...');
        await new Promise(r => setTimeout(r, POLL_INTERVAL));
    }
    console.error(`  ✗ ${name} não ficou pronto em ${TIMEOUT}s`);
    return false;
}

async function main() {
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  Renostter CRM — Wait for Dependencies');
    console.log(`  Timeout: ${TIMEOUT}s | Services: ${SERVICES.join(', ')}`);
    console.log('═══════════════════════════════════════════════════════════\n');

    const checks = {
        postgres: checkPostgres,
        redis: checkRedis,
    };

    for (const svc of SERVICES) {
        const fn = checks[svc];
        if (!fn) {
            console.error(`  ✗ Serviço desconhecido: ${svc}`);
            process.exit(1);
        }
        const ok = await waitForService(svc, fn);
        if (!ok) {
            console.error(`\n  ❌ Dependência "${svc}" não disponível. Abortando.\n`);
            process.exit(1);
        }
    }

    console.log('\n  ✅ Todas as dependências estão prontas.\n');
    process.exit(0);
}

main().catch(e => {
    console.error('Erro fatal:', e);
    process.exit(1);
});
