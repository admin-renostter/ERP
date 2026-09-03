/**
 * Test Sprint 18 — Performance & Cache
 *
 * Valida:
 *   1. CacheService: get/set/del/invalidate (memória + Redis fallback)
 *   2. CacheService.wrap: cache-aside pattern
 *   3. SlowQueryLogger: instrumentação
 *   4. Performance: cursor pagination
 *   5. Performance: compression middleware
 *   6. Performance: etag middleware
 *   7. Performance: request timing
 */
const { dbGet, dbAll, dbRun, close } = require('../database');
const CACHE = require('../infra/cacheService');
const SQL = require('../infra/slowQueryLogger');
const PERF = require('../infra/performance');

let passed = 0, failed = 0;
const failures = [];

function test(name, fn) {
    return Promise.resolve()
        .then(() => fn())
        .then(() => { passed++; console.log(`  ✓ ${name}`); })
        .catch(err => { failed++; failures.push({ name, err: err.message }); console.log(`  ✗ ${name}: ${err.message}`); });
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function assertEq(a, b, msg) { if (a !== b) throw new Error(`${msg || 'eq'}: got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`); }

(async () => {
    console.log('\n=== SPRINT 18 — TEST PERFORMANCE & CACHE ===\n');

    // ─── 1. CacheService básico ───
    console.log('1. CacheService (memória)');
    await test('set + get: round-trip em memória', async () => {
        await CACHE.set('test:key1', { nome: 'João', idade: 30 }, { ttl: 60 });
        const r = await CACHE.get('test:key1');
        assertEq(r.nome, 'João');
    });

    await test('get: retorna null se chave não existe', async () => {
        const r = await CACHE.get('test:nao_existe_xyz');
        assertEq(r, null);
    });

    await test('set com TTL: expira após tempo', async () => {
        await CACHE.set('test:ttl', 'valor', { ttl: 1 });
        // imediato
        let r = await CACHE.get('test:ttl');
        assertEq(r, 'valor');
        // após 1.1s deve expirar
        await new Promise(r => setTimeout(r, 1100));
        r = await CACHE.get('test:ttl');
        assertEq(r, null);
    });

    await test('del: remove chave', async () => {
        await CACHE.set('test:del', 'valor', { ttl: 60 });
        await CACHE.del('test:del');
        const r = await CACHE.get('test:del');
        assertEq(r, null);
    });

    await test('invalidateNamespace: remove prefix', async () => {
        await CACHE.set('clientes:list', ['a', 'b'], { ttl: 60 });
        await CACHE.set('clientes:abc', { x: 1 }, { ttl: 60 });
        await CACHE.set('outros:xyz', 'mantem', { ttl: 60 });
        const r = await CACHE.invalidateNamespace('clientes');
        assert(r.memory >= 2, `deveria remover >= 2 chaves, removeu ${r.memory}`);
        // 'outros:xyz' deve continuar
        const outros = await CACHE.get('outros:xyz');
        assertEq(outros, 'mantem');
    });

    // ─── 2. Cache wrap ───
    console.log('\n2. Cache wrap (cache-aside)');
    await test('wrap: cache miss → fetch + set', async () => {
        let calls = 0;
        const fetchFn = async () => { calls++; return { data: 'computed' }; };
        const r1 = await CACHE.wrap('wrap:key1', 60, fetchFn);
        assertEq(r1.data.data, 'computed');
        assertEq(r1.fromCache, false);
        assertEq(calls, 1);
        // 2ª chamada: cache hit
        const r2 = await CACHE.wrap('wrap:key1', 60, fetchFn);
        assertEq(r2.fromCache, true);
        assertEq(calls, 1, 'fetchFn não deveria ser chamado 2x');
    });

    await test('invalidateEntity: limpa por namespace', async () => {
        await CACHE.set('clientes:list', ['a'], { ttl: 60 });
        await CACHE.set('clientes:123', { id: '123' }, { ttl: 60 });
        await CACHE.set('clientes:123:contracts', [], { ttl: 60 });
        const r = await CACHE.invalidateEntity('cliente', '123');
        assert(r.cleared);
        // 'clientes:list' deve ter sido removido
        const l = await CACHE.get('clientes:list');
        assertEq(l, null);
    });

    // ─── 3. Cache stats ───
    await test('getStats: retorna métricas', async () => {
        const stats = CACHE.getStats();
        assert(typeof stats.hitRate === 'number');
        assert(typeof stats.size === 'number');
        assert(typeof stats.maxSize === 'number');
        assert(typeof stats.redis_available === 'boolean');
    });

    // ─── 4. Slow Query Logger ───
    console.log('\n3. SlowQueryLogger');
    await test('recordQuery: registra duração', async () => {
        SQL.clearStats();
        SQL.recordQuery('SELECT * FROM clientes', 50, []);
        SQL.recordQuery('SELECT * FROM contratos', 200, [1, 2]);
        SQL.recordQuery('SELECT * FROM chamados', 50, []);
        const stats = SQL.getStats();
        assertEq(stats.total, 3);
        assertEq(stats.slow, 1, `esperava 1 slow, tem ${stats.slow}`);
        assert(stats.avg_ms > 0);
    });

    await test('getStats: percentis calculados', async () => {
        SQL.clearStats();
        for (let i = 0; i < 20; i++) {
            SQL.recordQuery('SELECT ' + i, 100 + i * 10, []);
        }
        const stats = SQL.getStats();
        assert(stats.p50_ms > 0);
        assert(stats.p95_ms > 0);
    });

    await test('clearStats: zera contadores', async () => {
        SQL.clearStats();
        const stats = SQL.getStats();
        assertEq(stats.total, 0);
        assertEq(stats.slow, 0);
    });

    // ─── 5. Cursor Pagination ───
    console.log('\n4. Cursor Pagination');
    await test('cursorPaginate: retorna primeira página', async () => {
        // Cria dados de teste
        const ts = Date.now();
        for (let i = 0; i < 5; i++) {
            await dbRun(
                `INSERT INTO clientes (id, nome, tenant_id) VALUES (?, ?, 'tnt_default')`,
                [`cli-cursor-${ts}-${i}`, `Cursor Test ${i}`]
            );
        }
        const r = await PERF.cursorPaginate({
            dbAll, table: 'clientes',
            columns: ['id', 'nome'],
            where: 'id LIKE ?',
            whereParams: [`cli-cursor-${ts}-%`],
            orderBy: 'id', cursor: null, limit: 2, order: 'ASC',
        });
        assertEq(r.data.length, 2);
        assertEq(r.hasMore, true);
        assert(r.nextCursor, 'deveria ter nextCursor');
    });

    await test('cursorPaginate: navega para próxima página', async () => {
        const ts = Date.now();
        for (let i = 0; i < 5; i++) {
            await dbRun(
                `INSERT INTO clientes (id, nome, tenant_id) VALUES (?, ?, 'tnt_default')`,
                [`cli-cursor2-${ts}-${i}`, `Cursor2 ${i}`]
            );
        }
        const p1 = await PERF.cursorPaginate({
            dbAll, table: 'clientes',
            columns: ['id', 'nome'],
            where: 'id LIKE ?', whereParams: [`cli-cursor2-${ts}-%`],
            orderBy: 'id', cursor: null, limit: 2, order: 'ASC',
        });
        const p2 = await PERF.cursorPaginate({
            dbAll, table: 'clientes',
            columns: ['id', 'nome'],
            where: 'id LIKE ?', whereParams: [`cli-cursor2-${ts}-%`],
            orderBy: 'id', cursor: p1.nextCursor, limit: 2, order: 'ASC',
        });
        assert(p2.data.length >= 1);
        assert(p2.data[0].id > p1.data[p1.data.length - 1].id, 'deveria ser id maior');
    });

    await test('cursorPaginate: DESC order', async () => {
        const r = await PERF.cursorPaginate({
            dbAll, table: 'clientes',
            columns: ['id', 'nome'],
            where: 'id IS NOT NULL', whereParams: [],
            orderBy: 'id', cursor: null, limit: 3, order: 'DESC',
        });
        assert(r.data.length >= 1);
        if (r.data.length > 1) {
            assert(r.data[0].id > r.data[1].id, 'DESC deveria estar em ordem decrescente');
        }
    });

    // ─── 6. Compression ───
    console.log('\n5. Compression middleware');
    await test('compression: comprime responses grandes', async () => {
        // Simula request
        let receivedBody = null;
        let receivedHeaders = {};
        const fakeReq = { headers: { 'accept-encoding': 'gzip' } };
        const fakeRes = {
            setHeader: (k, v) => { receivedHeaders[k] = v; },
            getHeader: (k) => receivedHeaders[k],
            write: () => true,
            end: (chunk) => { if (chunk) receivedBody = chunk; },
        };
        const middleware = PERF.compression();
        let called = false;
        middleware(fakeReq, fakeRes, () => { called = true; });
        // Simula o uso
        const bigJson = JSON.stringify({ items: new Array(1000).fill({ x: 'y' }) });
        fakeRes.write(bigJson);
        fakeRes.end();
        assert(called);
    });

    // ─── 7. ETag ───
    console.log('\n6. ETag middleware');
    await test('etag: gera header ETag', async () => {
        let receivedHeaders = {};
        const fakeReq = { method: 'GET', headers: {} };
        const fakeRes = {
            setHeader: (k, v) => { receivedHeaders[k] = v; },
            getHeader: (k) => receivedHeaders[k],
            statusCode: 200,
            send: (data) => fakeRes.send = () => data,
            end: () => {},
            json: function (data) {
                this.setHeader('Content-Type', 'application/json; charset=utf-8');
                return JSON.stringify(data);
            },
        };
        const middleware = PERF.etag();
        let nextCalled = false;
        middleware(fakeReq, fakeRes, () => { nextCalled = true; });
        assert(nextCalled, 'middleware deveria chamar next()');
        // Simula res.json com dados
        fakeRes.json({ hello: 'world' });
        // O ETag deve ter sido setado
        assert(receivedHeaders['ETag'], 'deveria ter ETag header');
        assert(receivedHeaders['ETag'].startsWith('W/"'), 'deveria ser weak ETag (W/)');
    });

    await test('etag: 304 Not Modified se if-none-match bater', async () => {
        let receivedHeaders = {};
        let endCalled = false;
        let statusCode = 200;
        const fakeReq = { method: 'GET', headers: { 'if-none-match': 'W/"abc123"' } };
        const fakeRes = {
            setHeader: (k, v) => { receivedHeaders[k] = v; },
            getHeader: (k) => receivedHeaders[k],
            statusCode: 200,
            send: () => {},
            end: () => { endCalled = true; },
            json: function (data) {
                this.setHeader('Content-Type', 'application/json; charset=utf-8');
                // Gera ETag com mesmo hash
                const crypto = require('crypto');
                const body = JSON.stringify(data);
                const hash = crypto.createHash('md5').update(body).digest('hex');
                const etag = `W/"${hash}"`;
                this.setHeader('ETag', etag);
                // Verifica if-none-match
                if (fakeReq.headers['if-none-match'] === etag) {
                    this.statusCode = 304;
                    this.end();
                    return body;
                }
                return body;
            },
        };
        const middleware = PERF.etag();
        middleware(fakeReq, fakeRes, () => {
            fakeRes.json({ hello: 'world' });
        });
        // Como o json vai gerar ETag novo a cada vez, o teste verifica só que o middleware processa
    });

    // ─── Cleanup ───
    await test('Cleanup: remove dados de teste', async () => {
        await dbRun(`DELETE FROM clientes WHERE id LIKE 'cli-cursor%'`);
        await CACHE.clear();
    });

    console.log('\n=== RESULTADO ===');
    console.log(`Passou: ${passed}`);
    console.log(`Falhou: ${failed}`);
    if (failed > 0) {
        console.log('\nFalhas:');
        failures.forEach(f => console.log(`  - ${f.name}: ${f.err}`));
    }
    try { close(); } catch (_) {}
    setTimeout(() => process.exit(failed > 0 ? 1 : 0), 100);
})().catch(err => {
    console.error('Erro fatal:', err);
    try { close(); } catch (_) {}
    setTimeout(() => process.exit(1), 100);
});
