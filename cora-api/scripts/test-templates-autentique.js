// Test E2E: Templates + Autentique (Sprint 21)
const http = require('http');
const fs = require('fs');

const BASE = 'http://localhost:3000';

function req(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    const opts = {
      method, hostname: url.hostname, port: url.port, path: url.pathname + url.search,
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
    const login = await req('POST', '/api/auth/login', { email: 'demo@renostter.com', password: 'senha123' });
    const token = login.body.accessToken;
    check('1. Login', login.status === 200 && !!token);

    // 2. Status Autentique
    const autSt = await req('GET', '/api/contract-templates/autentique/status', null, token);
    check('2. Autentique status', autSt.body.ok === true, `mode=${autSt.body.mode}`);

    // 3. Webhook health (público)
    const wh = await req('GET', '/api/webhooks/autentique/health');
    check('3. Webhook health', wh.body.success === true, `mode=${wh.body.mode}`);

    // 4. Listar templates
    const tpls = await req('GET', '/api/contract-templates', null, token);
    check('4. Listar templates', tpls.status === 200, `total=${tpls.body.data?.length || 0}`);

    // 5. Seed templates (se já existirem, retorna os existentes)
    const seed = await req('POST', '/api/contract-templates/seed', {}, token);
    check('5. Seed templates', seed.body.success === true, `results=${seed.body.results?.length || 0}`);

    // 6. Listar templates novamente (deve ter 2+)
    const tpls2 = await req('GET', '/api/contract-templates', null, token);
    const tplId = tpls2.body.data[0].id;
    check('6. Templates pós-seed', tpls2.body.data.length >= 1, `tplId=${tplId}`);

    // 7. Contratos gerados (vazio inicialmente)
    const cg0 = await req('GET', '/api/contract-templates/contratos-gerados', null, token);
    check('7. Contratos gerados (vazio)', cg0.body.success === true);

    // 8. Gerar contrato (mock Autentique)
    const gerar = await req('POST', '/api/contract-templates/gerar', {
      template_id: tplId,
      cliente_id: 'cli-techcorp',
      enviar_autentique: true,
      signers: [{ email: 'contato@techcorp.com', name: 'TechCorp Solutions' }],
    }, token);
    check('8. Gerar contrato', gerar.status === 201 && gerar.body.success === true,
      `id=${gerar.body.id} status=${gerar.body.documento?.status} aut=${!!gerar.body.autentique}`);
    const cgenId = gerar.body.id;

    // 9. Contratos gerados (deve ter 1)
    const cg1 = await req('GET', '/api/contract-templates/contratos-gerados', null, token);
    check('9. Contratos gerados (1)', cg1.body.data?.length >= 1, `total=${cg1.body.total}`);

    // 10. Detalhe contrato gerado
    const cgDet = await req('GET', `/api/contract-templates/contratos-gerados/${cgenId}`, null, token);
    check('10. Detalhe contrato gerado', cgDet.body.success && cgDet.body.data?.autentique_document_id,
      `aut_id=${cgDet.body.data?.autentique_document_id}`);

    // 11. Status sync (mock retorna 'sent')
    const sync = await req('GET', `/api/contract-templates/contratos-gerados/${cgenId}/status`, null, token);
    check('11. Status sync', sync.body.success, `status=${sync.body.status} aut=${sync.body.autentique_status}`);

    // 12. Erro: template_id faltando
    const err1 = await req('POST', '/api/contract-templates/gerar', { cliente_id: 'cli-techcorp' }, token);
    check('12. Erro: sem template_id', err1.status === 400 && err1.body.code === 'MISSING_TEMPLATE');

    // 13. Erro: cliente_id faltando
    const err2 = await req('POST', '/api/contract-templates/gerar', { template_id: tplId }, token);
    check('13. Erro: sem cliente_id', err2.status === 400 && err2.body.code === 'MISSING_CLIENTE');

    // 14. Erro: template inexistente
    const err3 = await req('POST', '/api/contract-templates/gerar', { template_id: 'nao-existe', cliente_id: 'cli-techcorp' }, token);
    check('14. Erro: template não existe', err3.status === 404 && err3.body.code === 'TEMPLATE_NOT_FOUND');

    // 15. Erro: cliente inexistente
    const err4 = await req('POST', '/api/contract-templates/gerar', { template_id: tplId, cliente_id: 'cli-fake' }, token);
    check('15. Erro: cliente não existe', err4.status === 404 && err4.body.code === 'CLIENTE_NOT_FOUND');

    // 16. Webhook Autentique (simulando document_signed)
    const wh2 = await req('POST', '/api/webhooks/autentique', {
      event: 'document_signed',
      document: { id: 'mock-test', name: 'Teste' },
    });
    check('16. Webhook signed', wh2.body.success === true, `processed=${wh2.body.processed}`);

    // 17. Webhook Autentique (simulando document_rejected)
    const wh3 = await req('POST', '/api/webhooks/autentique', {
      event: 'document_rejected',
      document: { id: 'mock-test', name: 'Teste' },
    });
    check('17. Webhook rejected', wh3.body.success === true, `processed=${wh3.body.processed}`);

    // 18. Webhook Autentique (evento desconhecido)
    const wh4 = await req('POST', '/api/webhooks/autentique', {
      event: 'document_unknown',
      document: { id: 'mock-test' },
    });
    check('18. Webhook evento desconhecido', wh4.body.success === true);

    // 19. Webhook sem documentId
    const wh5 = await req('POST', '/api/webhooks/autentique', { event: 'document_signed' });
    check('19. Webhook sem doc id', wh5.body.success === true, 'no document id');

    // 20. /extract-vars
    const extract = await req('POST', '/api/contract-templates/extract-vars', {
      html: '<p>Cliente: {{cliente.nome}} - Valor: {{contrato.valor_mensal}}</p>',
    }, token);
    check('20. Extract vars', extract.body.success && extract.body.variables?.length === 2,
      `vars=${JSON.stringify(extract.body.variables)}`);

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
    console.error('ERRO FATAL:', e);
    process.exit(1);
  }
})();
