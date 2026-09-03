// E2E test: Contratos
const http = require('http');
const fs = require('fs');

const BASE = 'http://localhost:3000';

function req(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    const opts = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: { 'Content-Type': 'application/json' },
    };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;

    const r = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

(async () => {
  const results = [];
  function check(name, ok, extra = '') {
    results.push({ name, ok, extra });
    console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`);
  }

  try {
    // 1. Login
    const login = await req('POST', '/api/auth/login', {
      email: 'demo@renostter.com',
      password: 'senha123',
    });
    const token = login.body.accessToken || login.body.token;
    check('1. Login usr-demo', login.status === 200 && !!token, `status=${login.status} hasToken=${!!token}`);
    if (!token) { console.log('Response:', JSON.stringify(login.body).substring(0, 200)); return; }

    // 2. GET /api/contratos/options/tipos
    const opts = await req('GET', '/api/contratos/options/tipos', null, token);
    check('2. Options tipos', opts.status === 200 && opts.body.data?.tipos?.length > 0,
      `${opts.body.data?.tipos?.length || 0} tipos`);

    // 3. GET /api/contratos/next-numero
    const next = await req('GET', '/api/contratos/next-numero', null, token);
    check('3. Next número', next.status === 200 && next.body.data?.numero, next.body.data?.numero);

    // 4. GET /api/contratos/cliente/cli-techcorp/historico
    const hist = await req('GET', '/api/contratos/cliente/cli-techcorp/historico', null, token);
    check('4. Histórico cli-techcorp', hist.status === 200, `status=${hist.status} ${hist.body.success ? '' : (hist.body.error || '')}`);
    if (hist.body.data) {
      console.log(`   cliente: ${hist.body.data.cliente?.nome}`);
      console.log(`   contratos: ${hist.body.data.contratos?.length || 0}`);
      console.log(`   sugestoes.tipo: ${hist.body.data.sugestoes?.tipo_contrato}`);
      console.log(`   sugestoes.valor: ${hist.body.data.sugestoes?.valor_mensal}`);
    }

    // 5. POST /api/contratos
    const post = await req('POST', '/api/contratos', {
      cliente_id: 'cli-techcorp',
      tipo_contrato: 'pmoc',
      valor_mensal: 2800,
      data_inicio: '2026-01-01',
      data_fim: '2026-12-31',
      servicos: ['manutencao_preventiva', 'higienizacao', 'pmoc_relatorio'],
      sla_resposta_horas: 4,
      sla_resolucao_horas: 24,
      observacoes: 'Contrato teste E2E',
    }, token);
    check('5. POST contrato', post.status === 201, `status=${post.status} id=${post.body.id || post.body.error}`);
    if (post.body.id) console.log(`   ID criado: ${post.body.id}`);

    // 6. GET /api/contratos (lista)
    const list = await req('GET', '/api/contratos', null, token);
    check('6. GET /api/contratos', list.status === 200, `status=${list.status} total=${list.body.data?.length || 0}`);
    if (list.body.data?.length) {
      console.log(`   primeiro: ${list.body.data[0].id} - ${list.body.data[0].titulo} (R$ ${list.body.data[0].valor_mensal})`);
    }

    // 7. GET /api/contratos/:id
    if (post.body.id) {
      const get1 = await req('GET', `/api/contratos/${post.body.id}`, null, token);
      check('7. GET contrato por ID', get1.status === 200 && get1.body.data, `id=${post.body.id}`);
    }

    // 8. PATCH /api/contratos/:id
    if (post.body.id) {
      const patch = await req('PATCH', `/api/contratos/${post.body.id}`, {
        valor_mensal: 3200,
        observacoes: 'Reajuste anual',
      }, token);
      check('8. PATCH contrato', patch.status === 200, `status=${patch.status}`);
    }

    // 9. Validações
    const val1 = await req('POST', '/api/contratos', { cliente_id: 'cli-techcorp', valor_mensal: 100, data_inicio: '2026-01-01', data_fim: '2026-12-31' }, token);
    check('9a. Rejeita sem tipo', val1.status === 400, `status=${val1.status} body=${JSON.stringify(val1.body).substring(0, 100)}`);

    const val2 = await req('POST', '/api/contratos', { cliente_id: 'cli-techcorp', tipo_contrato: 'pmoc', valor_mensal: 0, data_inicio: '2026-01-01', data_fim: '2026-12-31' }, token);
    check('9b. Rejeita valor zero', val2.status === 400, `status=${val2.status}`);

    const val3 = await req('POST', '/api/contratos', { cliente_id: 'cli-techcorp', tipo_contrato: 'pmoc', valor_mensal: 1000, data_inicio: '2026-12-31', data_fim: '2026-01-01' }, token);
    check('9c. Rejeita vigência inválida', val3.status === 400, `status=${val3.status}`);

    const val4 = await req('POST', '/api/contratos', { cliente_id: 'cli-inexistente', tipo_contrato: 'pmoc', valor_mensal: 1000, data_inicio: '2026-01-01', data_fim: '2026-12-31' }, token);
    check('9d. Rejeita cliente inexistente', val4.status === 404, `status=${val4.status}`);

    // 10. DELETE /api/contratos/:id
    if (post.body.id) {
      const del = await req('DELETE', `/api/contratos/${post.body.id}`, null, token);
      check('10. DELETE contrato', del.status === 200, `status=${del.status}`);
    }

    // Resumo
    const passed = results.filter(r => r.ok).length;
    const failed = results.filter(r => !r.ok);
    console.log(`\n=== RESUMO: ${passed}/${results.length} passando ===`);
    if (failed.length) {
      console.log('FALHAS:');
      failed.forEach(f => console.log(`  ❌ ${f.name} — ${f.extra}`));
      process.exit(1);
    }
  } catch (e) {
    console.error('ERRO:', e);
    process.exit(1);
  }
})();
