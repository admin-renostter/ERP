/**
 * Renostter CRM — Billing Module E2E Test Suite
 * Run: node test.js (server must be running on PORT 3000)
 * 
 * Tests all endpoints:
 *   /api/cobrancas/*   (new architecture)
 *   /api/cora/*        (backward compatibility)
 */

const http = require('http');
const BASE = 'http://localhost:3000';
let passed = 0, failed = 0, skipped = 0;
let emittedId = null; // store for cross-test references

function request(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE);
        const options = {
            method,
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            headers: { 'Content-Type': 'application/json' }
        };
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch { resolve({ status: res.statusCode, body: data }); }
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

function assert(condition, testName) {
    if (condition) { console.log('  ✅ ' + testName); passed++; }
    else { console.log('  ❌ ' + testName); failed++; }
}

function skip(testName, reason) { console.log('  ⏭️  ' + testName + ' — ' + reason); skipped++; }

async function runTests() {
    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║   Renostter CRM — E2E Test Suite (Billing Module) ║');
    console.log('╚════════════════════════════════════════════════════╝\n');

    const ts = Date.now();

    // ═══════════════════════════════════════
    // 1. HEALTH
    // ═══════════════════════════════════════
    console.log('📡 [1] Health Check');
    try {
        const r = await request('GET', '/health');
        assert(r.status === 200, 'GET /health → 200');
        assert(r.body.status === 'ok', 'status = "ok"');
        assert(r.body.gateway === 'cora', 'gateway = "cora"');
    } catch (e) {
        console.log('  ❌ Servidor não está rodando em localhost:3000');
        console.log('     Execute "npm start" antes de rodar os testes.\n');
        process.exit(1);
    }

    // ═══════════════════════════════════════
    // 2. EMISSÃO (novos endpoints)
    // ═══════════════════════════════════════
    console.log('\n💳 [2] Emissão de Cobrança — POST /api/cobrancas/emitir');
    const testContractId = `e2e_${ts}`;
    const emPayload = {
        contractId: testContractId,
        clientId: 'e2e_client',
        value: 799.90,
        dueDate: '2026-06-15',
        services: ['Manutenção PMOC', 'Limpeza de Condensadora'],
        customerPayload: {
            name: 'Empresa E2E Teste LTDA',
            email: 'e2e@teste.dev',
            document: { identity: '12345678000190', type: 'CNPJ' },
            address: { street: 'Rua Teste', number: '42', district: 'Centro', city: 'São Paulo', state: 'SP', zip_code: '01001000' }
        },
        fineSettings: { juros: 1, multa: 2 },
        userId: 'e2e_tester'
    };

    const em = await request('POST', '/api/cobrancas/emitir', emPayload);
    assert(em.status === 200, 'POST /api/cobrancas/emitir → 200');
    assert(em.body.success === true, 'success = true');
    assert(typeof em.body.cobrancaId === 'string', 'cobrancaId retornado');
    assert(typeof em.body.chargeId === 'string', 'chargeId retornado');
    assert(typeof em.body.barcode === 'string', 'barcode retornado');
    emittedId = em.body.cobrancaId;

    // 2b. Idempotência
    console.log('\n🔄 [3] Idempotência — Emissão duplicada');
    const em2 = await request('POST', '/api/cobrancas/emitir', emPayload);
    assert(em2.body.success === true, 'Duplicada retorna success=true');
    assert(em2.body.duplicate === true, 'duplicate = true');
    assert(em2.body.cobrancaId === emittedId, 'Retorna mesmo cobrancaId');

    // 2c. Validação
    console.log('\n🚫 [4] Validação — Payload incompleto');
    const emInvalid = await request('POST', '/api/cobrancas/emitir', { contractId: 'x' });
    assert(emInvalid.status === 400, 'POST com payload incompleto → 400');
    assert(emInvalid.body.error.includes('obrigat'), 'Mensagem de erro descritiva');

    // ═══════════════════════════════════════
    // 3. LISTAGEM E CONSULTAS
    // ═══════════════════════════════════════
    console.log('\n📋 [5] Listagem — GET /api/cobrancas');
    const list = await request('GET', '/api/cobrancas');
    assert(list.status === 200, 'GET /api/cobrancas → 200');
    assert(Array.isArray(list.body.data), 'data é array');
    assert(list.body.data.length > 0, 'Retorna pelo menos 1 cobrança');

    console.log('\n🔍 [6] Detalhe — GET /api/cobrancas/:id');
    const detail = await request('GET', `/api/cobrancas/${emittedId}`);
    assert(detail.status === 200, 'GET /api/cobrancas/:id → 200');
    assert(detail.body.data.id === emittedId, 'ID bate');
    assert(detail.body.data.valor === 799.90, 'Valor correto');
    assert(detail.body.data.gateway_provider === 'cora', 'Provider = cora');

    console.log('\n📊 [7] Detalhe inexistente → 404');
    const notFound = await request('GET', '/api/cobrancas/nao_existe');
    assert(notFound.status === 404, 'GET cobranca inexistente → 404');

    console.log('\n📈 [8] KPIs — GET /api/cobrancas/kpis');
    const kpis = await request('GET', '/api/cobrancas/kpis');
    assert(kpis.status === 200, 'GET /api/cobrancas/kpis → 200');
    assert(typeof kpis.body.data.totalEmitido.valor === 'number', 'KPI valor numérico');
    assert(kpis.body.data.totalEmitido.qtd > 0, 'KPI qtd > 0');
    assert(kpis.body.data.pago !== undefined, 'KPI pago presente');
    assert(kpis.body.data.vencido !== undefined, 'KPI vencido presente');

    console.log('\n📂 [9] Por contrato — GET /api/cobrancas/contrato/:cid');
    const byContract = await request('GET', `/api/cobrancas/contrato/${testContractId}`);
    assert(byContract.status === 200, 'GET contrato → 200');
    assert(byContract.body.data.length >= 1, 'Pelo menos 1 cobrança do contrato');

    // ═══════════════════════════════════════
    // 4. EXTRATO
    // ═══════════════════════════════════════
    console.log('\n💰 [10] Extrato — GET /api/cobrancas/extrato');
    const extrato = await request('GET', '/api/cobrancas/extrato');
    assert(extrato.status === 200, 'GET /api/cobrancas/extrato → 200');
    assert(typeof extrato.body.data.balance === 'number', 'balance numérico');

    // ═══════════════════════════════════════
    // 5. WEBHOOK
    // ═══════════════════════════════════════
    console.log('\n📨 [11] Webhook PAID — POST /api/cobrancas/webhook');
    const whPaid = await request('POST', '/api/cobrancas/webhook', {
        type: 'INVOICE.PAID', data: { id: `wh_paid_${ts}` }
    });
    assert(whPaid.status === 200, 'Webhook PAID → 200');
    assert(whPaid.body.received === true, 'received = true');
    assert(whPaid.body.eventType === 'PAID', 'eventType = PAID');

    console.log('\n📨 [12] Webhook OVERDUE');
    const whOD = await request('POST', '/api/cobrancas/webhook', {
        type: 'INVOICE.OVERDUE', data: { id: `wh_od_${ts}` }
    });
    assert(whOD.body.eventType === 'OVERDUE', 'eventType = OVERDUE');

    console.log('\n📨 [13] Webhook desconhecido');
    const whUk = await request('POST', '/api/cobrancas/webhook', {
        type: 'UNKNOWN_EVENT', data: { id: 'uk' }
    });
    assert(whUk.status === 200, 'Webhook desconhecido → 200 (não crash)');

    // ═══════════════════════════════════════
    // 6. SYNC
    // ═══════════════════════════════════════
    console.log('\n🔄 [14] Sync — GET /api/cobrancas/sync');
    const sync = await request('GET', '/api/cobrancas/sync');
    assert(sync.status === 200, 'GET /api/cobrancas/sync → 200');
    assert(Array.isArray(sync.body.data), 'data é array');

    // ═══════════════════════════════════════
    // 7. RECORRÊNCIA
    // ═══════════════════════════════════════
    const recContractId = `rec_e2e_${ts}`;
    console.log('\n🔁 [15] Criar recorrência');
    const rec = await request('POST', '/api/cobrancas/recorrencia', {
        contractId: recContractId, clientId: 'e2e_client', value: 500, nextDueDate: '2026-07-01'
    });
    assert(rec.body.success === true, 'POST recorrência → success');

    console.log('\n🔁 [16] Listar recorrências');
    const recList = await request('GET', '/api/cobrancas/recorrencia');
    assert(recList.body.data.length >= 1, 'Pelo menos 1 recorrência ativa');

    console.log('\n🔁 [17] Desativar recorrência');
    const recDel = await request('DELETE', `/api/cobrancas/recorrencia/${recContractId}`);
    assert(recDel.body.success === true, 'DELETE recorrência → success');

    // ═══════════════════════════════════════
    // 8. NOTIFICAÇÕES GATEWAY
    // ═══════════════════════════════════════
    console.log('\n📲 [18] Notificações — POST /api/cobrancas/notificacoes');
    const notif = await request('POST', '/api/cobrancas/notificacoes', {
        cobrancaId: emittedId, send_sms: true, send_whatsapp: true, send_email: true
    });
    assert(notif.status === 200, 'POST notificações → 200');

    // ═══════════════════════════════════════
    // 9. EMAIL
    // ═══════════════════════════════════════
    console.log('\n📧 [19] Email — POST /api/cobrancas/email');
    const email = await request('POST', '/api/cobrancas/email', {
        cobrancaId: emittedId, email: 'e2e@teste.dev'
    });
    assert(email.status === 200, 'POST email → 200');
    assert(email.body.success === true, 'Email enviado (ou log mode)');
    assert(['smtp', 'log'].includes(email.body.mode), 'mode é smtp ou log');

    console.log('\n📧 [20] Email — Validação sem campos');
    const emailInvalid = await request('POST', '/api/cobrancas/email', {});
    assert(emailInvalid.status === 400, 'Email sem campos → 400');

    // ═══════════════════════════════════════
    // 10. LOGS E AUDITORIA
    // ═══════════════════════════════════════
    console.log('\n📝 [21] Logs HTTP');
    const logs = await request('GET', '/api/cobrancas/logs?limit=5');
    assert(logs.status === 200, 'GET /api/cobrancas/logs → 200');
    assert(logs.body.data.length > 0, 'Logs não vazios');

    console.log('\n📝 [22] Auditoria');
    const audit = await request('GET', '/api/cobrancas/auditoria?limit=5');
    assert(audit.status === 200, 'GET /api/cobrancas/auditoria → 200');
    assert(audit.body.data.length > 0, 'Auditoria não vazia');
    assert(audit.body.data.some(a => a.acao === 'emitir'), 'Existe log de emissão');

    // ═══════════════════════════════════════
    // 11. CANCELAMENTO
    // ═══════════════════════════════════════
    console.log('\n🚫 [23] Cancelar cobrança');
    const cancel = await request('DELETE', `/api/cobrancas/${emittedId}`);
    assert(cancel.body.success === true, 'DELETE cobrança → success');

    const afterCancel = await request('GET', `/api/cobrancas/${emittedId}`);
    assert(afterCancel.body.data.status === 'CANCELLED', 'Status atualizado para CANCELLED');

    console.log('\n🚫 [24] Cancelar cobrança inexistente');
    const cancelInexist = await request('DELETE', '/api/cobrancas/fake_id');
    assert(cancelInexist.status === 400, 'Cancelar inexistente → 400');

    // ═══════════════════════════════════════
    // 12. COMPAT — Endpoints antigos (/api/cora/*)
    // ═══════════════════════════════════════
    console.log('\n🔙 [25] Compat — POST /api/cora/boleto');
    const compat = await request('POST', '/api/cora/boleto', {
        contractId: `compat_${ts}`, clientId: 'e2e_client', value: 350, dueDate: '2026-08-01',
        customerPayload: { name: 'Compat Test', document: { identity: '12345678000190', type: 'CNPJ' } }
    });
    assert(compat.body.success === true, 'Compat boleto → success');
    assert(typeof compat.body.chargeId === 'string', 'chargeId no formato antigo');

    console.log('\n🔙 [26] Compat — GET /api/cora/sync');
    const cSync = await request('GET', '/api/cora/sync');
    assert(cSync.status === 200, 'Compat sync → 200');

    console.log('\n🔙 [27] Compat — GET /api/cora/boletos');
    const cBoletos = await request('GET', '/api/cora/boletos');
    assert(cBoletos.status === 200, 'Compat boletos → 200');

    console.log('\n🔙 [28] Compat — GET /api/cora/extrato');
    const cExtrato = await request('GET', '/api/cora/extrato');
    assert(cExtrato.status === 200, 'Compat extrato → 200');

    console.log('\n🔙 [29] Compat — GET /api/cora/logs');
    const cLogs = await request('GET', '/api/cora/logs?limit=2');
    assert(cLogs.status === 200, 'Compat logs → 200');

    console.log('\n🔙 [30] Compat — POST /api/cora/webhook/receber');
    const cWh = await request('POST', '/api/cora/webhook/receber', {
        type: 'INVOICE.PAID', data: { id: `compat_wh_${ts}` }
    });
    assert(cWh.status === 200, 'Compat webhook → 200');

    // ═══════════════════════════════════════
    // SUMMARY
    // ═══════════════════════════════════════
    const total = passed + failed + skipped;
    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log(`║  Total: ${String(total).padEnd(4)}| ✅ PASS: ${String(passed).padEnd(4)}| ❌ FAIL: ${String(failed).padEnd(4)}| ⏭️  SKIP: ${String(skipped).padEnd(4)}║`);
    console.log('╚════════════════════════════════════════════════════╝');
    if (failed > 0) console.log('\n  ⚠️  Existem testes falhando! Revise os resultados acima.\n');
    else console.log('\n  🎉 Todos os testes passaram!\n');

    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
    console.error('Erro ao executar testes:', err);
    process.exit(1);
});
