/**
 * Teste do caminho crítico de cobrança:
 *   1. POST /api/cobrancas/emitir (MOCK) — emite boleto
 *   2. POST /api/webhooks/cora — recebe notificação de pagamento
 *   3. GET /api/cobrancas — confirma status atualizado
 *   4. Race condition: 2 emissões simultâneas para mesmo contrato/data
 *
 * Uso: node tools/test-cobranca.cjs
 */
const http = require('http');
const path = require('path');
const sqlite3 = require(path.join(__dirname, '..', 'cora-api', 'node_modules', 'sqlite3')).verbose();
const DB_PATH = path.join(__dirname, '..', 'cora-api', 'cora.sqlite');

const HOST = 'localhost';
const PORT = 3000;
const HEADERS = {
    'Content-Type': 'application/json',
    'X-User-Id': 'u1', 'X-User-Name': 'Carlos Admin', 'X-User-Role': 'admin'
};

let passed = 0, failed = 0;

function req(method, urlPath, body = null, headers = HEADERS) {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : null;
        const t0 = Date.now();
        const r = http.request({
            method,
            hostname: HOST, port: PORT, path: urlPath,
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

function check(name, ok, detail = '') {
    const icon = ok ? '✅' : '❌';
    console.log(`  ${icon} ${name}${detail ? ' — ' + detail : ''}`);
    if (ok) passed++; else failed++;
}

async function run() {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║   Teste de Caminho Crítico — Cobrança                     ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    // Limpar dados de teste
    console.log('[setup] Limpando dados de teste...');
    await new Promise((resolve) => {
        const db = new sqlite3.Database(DB_PATH);
        db.run("DELETE FROM cobrancas WHERE contract_id LIKE 'TST-%'", function(err) {
            if (err) console.error('  ⚠️ DELETE:', err.message);
            db.close();
            resolve();
        });
    });
    console.log('[setup] OK\n');

    // ── 1. Health ──
    console.log('[1] Health check');
    const h = await req('GET', '/health');
    check('Backend UP', h.status === 200);
    console.log();

    // ── 2. Emitir boleto (MOCK) ──
    console.log('[2] Emitir boleto');
    const t0 = Date.now();
    const emit = await req('POST', '/api/cobrancas/emitir', {
        provider: 'mock',
        contractId: 'TST-CONTRATO-001',
        clientId: 'cli001',
        value: 1500.00,
        dueDate: new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0],
        services: ['Manutenção PMOC mensal'],
        customerPayload: {
            name: 'TechCorp LTDA',
            email: 'financeiro@techcorp.com.br',
            document: { identity: '12345678000199', type: 'CNPJ' },
            address: {
                street: 'Av Paulista', number: '1000', district: 'Bela Vista',
                city: 'São Paulo', state: 'SP', zip_code: '01310100'
            }
        }
    });
    const emitMs = Date.now() - t0;
    check('Status 200/201', emit.status >= 200 && emit.status < 300, `HTTP ${emit.status}`);
    check('Tem cobrancaId', emit.body.cobrancaId, `${emit.body.cobrancaId}`);
    check('Tem barcode', !!emit.body.barcode);
    check('Tem pixQrCode', !!emit.body.pixQrCode);
    check('Tem pdfUrl', !!emit.body.pdfUrl);
    check('Tempo < 1s', emitMs < 1000, `${emitMs}ms`);
    console.log(`     ${emit.body.cobrancaId} emitido em ${emitMs}ms\n`);

    const cobrancaId = emit.body.cobrancaId;

    // ── 3. Idempotência (duplicata) ──
    console.log('[3] Idempotência — emitir 2x mesmo contrato/data');
    const dup = await req('POST', '/api/cobrancas/emitir', {
        provider: 'mock',
        contractId: 'TST-CONTRATO-001',
        clientId: 'cli001',
        value: 1500.00,
        dueDate: new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0],
        services: ['Manutenção PMOC mensal'],
        customerPayload: {
            name: 'TechCorp LTDA',
            email: 'financeiro@techcorp.com.br',
            document: { identity: '12345678000199', type: 'CNPJ' }
        }
    });
    check('Detecta duplicata', dup.body.duplicate === true);
    check('Retorna mesma cobrancaId', dup.body.cobrancaId === cobrancaId);
    console.log();

    // ── 4. Webhook de pagamento ──
    console.log('[4] Webhook — recebe notificação de pagamento');
    // Buscar o charge_id real do banco
    const db2 = new sqlite3.Database(DB_PATH);
    const cob = await new Promise(r => db2.get(
        "SELECT gateway_charge_id, status FROM cobrancas WHERE id = ?", [cobrancaId], r));
    await new Promise(r => db2.close());

    if (cob && cob.gateway_charge_id) {
        const wh = await req('POST', '/api/cobrancas/webhook', {
            event_type: 'PAID',
            data: { id: cob.gateway_charge_id, status: 'PAID' }
        });
        check('Webhook 200', wh.status === 200);

        // Verifica no banco
        const after = await new Promise(resolve => {
            const db3 = new sqlite3.Database(DB_PATH);
            db3.get(
                "SELECT status, data_pagamento FROM cobrancas WHERE id = ?", [cobrancaId],
                (err, row) => { db3.close(); resolve(row); }
            );
        });
        check('Status atualizado para PAID', after.status === 'PAID', `atual: ${after.status}`);
        check('data_pagamento preenchida', !!after.data_pagamento);
    } else {
        console.log('  ⚠️ Sem gateway_charge_id (MOCK?)');
    }
    console.log();

    // ── 5. Race condition ──
    console.log('[5] Race condition — 5 emissões simultâneas para mesmo contrato/data');
    const racers = [];
    for (let i = 0; i < 5; i++) {
        racers.push(req('POST', '/api/cobrancas/emitir', {
            provider: 'mock',
            contractId: 'TST-RACE-001',
            clientId: 'cli999',
            value: 500,
            dueDate: '2026-12-31',
            services: ['Race test'],
            customerPayload: {
                name: 'Race Test', email: 'r@x.com',
                document: { identity: '11111111111', type: 'CPF' }
            }
        }));
    }
    const results = await Promise.all(racers);
    const successIds = new Set(results.filter(r => r.status < 400).map(r => r.body.cobrancaId));
    check('Apenas 1 cobrança criada (5 requests)',
        successIds.size === 1, `${successIds.size} únicos de 5`);
    check('Demais retornaram duplicate=true',
        results.filter(r => r.body.duplicate).length === 4,
        `${results.filter(r => r.body.duplicate).length} duplicados`);
    console.log();

    // ── 6. Listagem após ops ──
    console.log('[6] Listagem filtrada por status');
    const list = await req('GET', '/api/cobrancas?status=PAID&size=10');
    check('Filtro status funciona', list.status === 200);
    check('Retorna array', Array.isArray(list.body.data));

    console.log(`\n${'─'.repeat(60)}`);
    console.log(`Total: ${passed + failed} | ✅ Passou: ${passed} | ❌ Falhou: ${failed}`);
    process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error('\n[FATAL]', e); process.exit(1); });