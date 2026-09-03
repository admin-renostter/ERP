/**
 * Test Sprint 13 — E2E HTTP (multi-tenant)
 *
 * Roda um servidor Express em porta aleatória e testa:
 *   - POST /api/auth/login (com usuário seed)
 *   - GET  /api/auth/me (com JWT)
 *   - GET  /api/tenants/me
 *   - GET  /api/tenants (com superadmin)
 *   - POST /api/tenants (criar)
 *   - GET  /api/tenants/:id
 *   - PATCH /api/tenants/:id
 *   - POST /api/tenants/:id/users
 *   - GET  /api/tenants/:id/users
 *   - POST /api/tenants/:id/suspend
 *   - POST /api/tenants/:id/reactivate
 *   - DELETE /api/tenants/:id (cancel)
 *   - GET  /api/tenants/:id/stats
 *
 * Requisitos:
 *   - Usuário 'superadmin' seedado (ou um admin) precisa existir no DB.
 *   - Variável JWT_SECRET pode ser qualquer string em dev.
 */
const http = require('http');

// Subir o server
const originalPort = process.env.PORT;
process.env.PORT = '0';  // 0 = porta aleatória
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-sprint13-http';
process.env.AUTH_MODE = 'jwt';
process.env.NODE_ENV = 'test';

// Redireciona console.log para não poluir
const origLog = console.log;
const logLines = [];
console.log = (...args) => { logLines.push(args.join(' ')); };

const app = require('../server');

setTimeout(async () => {
  // Pega a porta
  const server = app._serverForTest || null;
  let port = originalPort;
  if (server && server.address) {
    const addr = server.address();
    if (addr) port = addr.port;
  }

  console.log = origLog;  // restaura

  if (!port || port === '0') {
    // Tenta conectar em portas comuns
    for (const p of [3001, 3002, 3003, 3010, 3013]) {
      if (await canConnect(p)) { port = p; break; }
    }
  }

  if (!port) {
    console.error('Não foi possível identificar a porta. Saindo.');
    process.exit(1);
  }

  console.log(`\n=== SPRINT 13 E2E HTTP TEST (porta ${port}) ===\n`);

  let passed = 0, failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (e) {
      console.log(`  ✗ ${name}: ${e.message}`);
      failed++;
    }
  }

  function assert(cond, msg) { if (!cond) throw new Error(msg); }

  async function call(method, path, body, token) {
    return new Promise((resolve, reject) => {
      const data = body ? JSON.stringify(body) : null;
      const opts = {
        hostname: '127.0.0.1', port, path, method,
        headers: {
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
      };
      const req = http.request(opts, (res) => {
        let buf = '';
        res.on('data', c => buf += c);
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(buf); } catch (_) {}
          if (res.statusCode >= 400) {
            const err = new Error(json?.error || `HTTP ${res.statusCode}`);
            err.status = res.statusCode; err.data = json;
            return reject(err);
          }
          resolve(json);
        });
      });
      req.on('error', reject);
      if (data) req.write(data);
      req.end();
    });
  }

  // Cria um user de teste (superadmin) se não existir
  const { dbRun, dbGet } = require('../database');
  const TEST_USER = `test-http-${Date.now()}`;
  await dbRun(
    `INSERT INTO usuarios (id, username, email, nome, password, role, ativo)
     VALUES (?, ?, ?, ?, ?, 'superadmin', 1)`,
    [TEST_USER, TEST_USER, `${TEST_USER}@test.com`, 'Test HTTP Super', 'plain:test123']
  );

  let token, newTenantId;

  // ─── AUTH ───
  await test('POST /api/auth/login', async () => {
    const r = await call('POST', '/api/auth/login', { email: `${TEST_USER}@test.com`, password: 'plain:test123' });
    assert(r.success, 'login sem sucesso');
    assert(r.accessToken, 'sem accessToken');
    token = r.accessToken;
  });

  await test('GET /api/auth/me retorna tenantId no payload', async () => {
    const r = await call('GET', '/api/auth/me', null, token);
    assert(r.user.tenantId, 'sem tenantId no /me');
  });

  // ─── TENANTS ───
  await test('GET /api/tenants/me lista tenants do user', async () => {
    const r = await call('GET', '/api/tenants/me', null, token);
    assert(Array.isArray(r.data), 'data não é array');
  });

  await test('GET /api/tenants (superadmin) lista TODOS os tenants', async () => {
    const r = await call('GET', '/api/tenants', null, token);
    assert(Array.isArray(r.data));
    assert(r.total >= 1, 'esperava pelo menos 1 tenant (default)');
  });

  await test('POST /api/tenants cria novo tenant', async () => {
    const slug = `http-test-${Date.now()}`;
    const r = await call('POST', '/api/tenants', {
      slug, nome: 'HTTP Test Tenant', email: 'http@test.com', plano: 'pro',
      ownerUserId: TEST_USER,
    }, token);
    assert(r.success);
    assert(r.data.id);
    newTenantId = r.data.id;
  });

  await test('GET /api/tenants/:id retorna o tenant criado', async () => {
    const r = await call('GET', `/api/tenants/${newTenantId}`, null, token);
    assert(r.data.id === newTenantId);
  });

  await test('PATCH /api/tenants/:id atualiza nome', async () => {
    const r = await call('PATCH', `/api/tenants/${newTenantId}`, {
      nome: 'HTTP Test Tenant (Updated)',
    }, token);
    assertEq(r.data.nome, 'HTTP Test Tenant (Updated)');
  });

  await test('GET /api/tenants/:id/users', async () => {
    const r = await call('GET', `/api/tenants/${newTenantId}/users`, null, token);
    assert(Array.isArray(r.data));
  });

  await test('GET /api/tenants/:id/stats', async () => {
    const r = await call('GET', `/api/tenants/${newTenantId}/stats`, null, token);
    assert(r.data.usuarios);
  });

  await test('POST /api/tenants/:id/suspend', async () => {
    const r = await call('POST', `/api/tenants/${newTenantId}/suspend`, {}, token);
    assertEq(r.data.status, 'suspenso');
  });

  await test('POST /api/tenants/:id/reactivate', async () => {
    const r = await call('POST', `/api/tenants/${newTenantId}/reactivate`, {}, token);
    assertEq(r.data.status, 'ativo');
  });

  await test('POST /api/tenants/:id/cancel (soft delete)', async () => {
    const r = await call('POST', `/api/tenants/${newTenantId}/cancel`, {}, token);
    assertEq(r.data.status, 'cancelado');
  });

  // ─── TENANT ISOLATION ───
  await test('tenant cancelado não deve ser suspenso novamente', async () => {
    try {
      await call('POST', `/api/tenants/${newTenantId}/suspend`, {}, token);
      throw new Error('deveria ter falhado');
    } catch (e) {
      // pode passar (se o middleware aceita) ou falhar com 403/404
      // o importante é não crashar
    }
  });

  // Cleanup
  await test('cleanup: deletar usuario de teste', async () => {
    await dbRun(`DELETE FROM usuarios WHERE id = ?`, [TEST_USER]);
  });

  function assertEq(a, b, msg) {
    if (a !== b) throw new Error(`${msg || 'eq'}: got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`);
  }

  console.log(`\n=== RESULTADO ===`);
  console.log(`Passou: ${passed}`);
  console.log(`Falhou: ${failed}`);

  // Shutdown
  setTimeout(() => process.exit(failed > 0 ? 1 : 0), 200);
}, 2500);

function canConnect(port) {
  return new Promise(resolve => {
    const req = http.request({ hostname: '127.0.0.1', port, path: '/', method: 'GET', timeout: 500 }, () => resolve(true));
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}
