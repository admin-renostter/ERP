// Smoke test E2E do fluxo de aprovação administrativa
// Cenario:
//   1. INSERT em pending_approvals (admin tier)
//   2. GET /api/approvals/count com role admin
//   3. GET /api/approvals/pending (admin ve so tier=admin)
//   4. POST /api/approvals/:id/approve (admin)
//   5. Confirma status=APPROVED
//   6. INSERT em pending_approvals (compliance tier R$ 6000)
//   7. POST /api/approvals/:id/edit com motivo curto (deve falhar 400)
//   8. POST /api/approvals/:id/edit com motivo 250 chars (deve passar)
//   9. POST /api/approvals/:id/reject no proximo (deve rejeitar)
//   10. POST /api/cron-escalate (deve processar)

const http = require('http');
const path = require('path');
const sqlite3 = require(path.join(__dirname, '..', 'node_modules', 'sqlite3')).verbose();
const DB_PATH = path.join(__dirname, '..', 'cora.sqlite');

const PORT = 3099;
const ADMIN_HEADERS = { 'Content-Type': 'application/json', 'X-User-Id': 'u1', 'X-User-Name': 'Carlos Admin', 'X-User-Role': 'admin' };
const SUPER_HEADERS = { 'Content-Type': 'application/json', 'X-User-Id': 'u0', 'X-User-Name': 'Administrador Master', 'X-User-Role': 'superadmin' };
const NO_AUTH_HEADERS = { 'Content-Type': 'application/json' };

let passed = 0, failed = 0;

function req(method, urlPath, body = null, headers = ADMIN_HEADERS) {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : null;
        const opts = {
            method,
            hostname: 'localhost',
            port: PORT,
            path: urlPath,
            headers: { ...headers, ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) }
        };
        const r = http.request(opts, res => {
            let chunks = '';
            res.on('data', c => chunks += c);
            res.on('end', () => {
                let parsed;
                try { parsed = JSON.parse(chunks); } catch { parsed = chunks; }
                resolve({ status: res.statusCode, body: parsed });
            });
        });
        r.on('error', reject);
        if (data) r.write(data);
        r.end();
    });
}

function check(name, ok, detail = '') {
    if (ok) { console.log(`  ✅ ${name}${detail ? ' — ' + detail : ''}`); passed++; }
    else { console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); failed++; }
}

function dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DB_PATH);
        db.run(sql, params, function (err) {
            db.close();
            if (err) reject(err); else resolve(this);
        });
    });
}
function dbAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DB_PATH);
        db.all(sql, params, (err, rows) => {
            db.close();
            if (err) reject(err); else resolve(rows);
        });
    });
}

async function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function runSmoke() {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║   Smoke Test — Fluxo de Aprovação Financeira              ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    // Esperar backend estar pronto
    let ready = false;
    for (let i = 0; i < 10; i++) {
        try {
            const r = await req('GET', '/health', null, NO_AUTH_HEADERS);
            if (r.status === 200) { ready = true; break; }
        } catch {}
        await delay(500);
    }
    if (!ready) { console.log('Backend nao subiu'); process.exit(1); }
    console.log('[OK] Backend em http://localhost:' + PORT + '\n');

    // Limpar dados de teste anteriores
    try { await dbRun('DELETE FROM pending_approvals WHERE client_id LIKE ?', ['aprov_test%']); } catch {}

    // ── 1. Criar pendência tier admin (R$ 500, abaixo do limite) ──
    console.log('[1] Criar pendência tier=admin (R$ 500)');
    const r1 = await req('POST', '/api/approvals',
        { ticketId: 't_teste_1', clientId: 'aprov_test', value: 500, reason: 'has_parts' },
        ADMIN_HEADERS);
    check('Resposta 200', r1.status === 200, JSON.stringify(r1.body));
    const idAdmin = r1.body.id;
    check('id começa com appr_', idAdmin && idAdmin.startsWith('appr_'));
    check('tier admin (≤R$1k)', r1.body.tier === 'admin');

    // ── 2. Criar pendência tier superadmin (R$ 3.000) ──
    console.log('\n[2] Criar pendência tier=superadmin (R$ 3.000)');
    const r2 = await req('POST', '/api/approvals',
        { ticketId: 't_teste_2', clientId: 'aprov_test_super', value: 3000, reason: 'has_parts' },
        SUPER_HEADERS);
    check('tier superadmin (R$ 1k-5k)', r2.body.tier === 'superadmin');

    // ── 3. Criar pendência tier compliance (R$ 7.000) ──
    console.log('\n[3] Criar pendência tier=compliance (R$ 7.000)');
    const r3 = await req('POST', '/api/approvals',
        { ticketId: 't_teste_3', clientId: 'aprov_test_compliance', value: 7000, reason: 'high_value_with_parts' },
        SUPER_HEADERS);
    check('tier compliance (>R$ 5k)', r3.body.tier === 'compliance');
    const idCompl = r3.body.id;

    // ── 4. /api/approvals/count com admin ──
    console.log('\n[4] GET /api/approvals/count (admin)');
    const r4 = await req('GET', '/api/approvals/count', null, ADMIN_HEADERS);
    check('Status 200', r4.status === 200);
    // Admin tem o MESMO direito que superadmin — vê todos os tiers ativos (3)
    check('count = 3 (admin = superadmin neste fluxo)', r4.body.count === 3, `count=${r4.body.count}`);

    // ── 5. /api/approvals/pending com admin (mesmo escopo do superadmin) ──
    console.log('\n[5] GET /api/approvals/pending (admin)');
    const r5 = await req('GET', '/api/approvals/pending', null, ADMIN_HEADERS);
    check('Status 200', r5.status === 200);
    check('Vê 3 pendentes (mesmo escopo do superadmin)', r5.body.data.length === 3, `length=${r5.body.data.length}`);

    // ── 6. Admin AGORA pode aprovar compliance (mesmas permissões) ──
    console.log('\n[6] Admin aprova compliance (AGORA permitido)');
    // Compliance ainda exige motivo ≥200 chars, então usamos o motivo longo
    const motivoComplianceAprovar = 'Aprovação regular conforme análise técnica da OS realizada, com substituição de peças cobertas pela garantia estendida conforme contrato de prestação';
    const r6 = await req('POST', '/api/approvals/' + idCompl + '/approve',
        { reason: motivoComplianceAprovar }, ADMIN_HEADERS);
    check('Status 200 (admin tem poder de compliance)', r6.status === 200, `status=${r6.status} | body=${JSON.stringify(r6.body)}`);
    const complRowAprov = await dbAll('SELECT status, decided_by FROM pending_approvals WHERE id = ?', [idCompl]);
    check('compliance status = APPROVED', complRowAprov[0].status === 'APPROVED');
    check('decided_by = u1 (admin)', complRowAprov[0].decided_by === 'u1');

    // ── 6b. NÃO-admin (sem role) ainda é bloqueado ──
    console.log('\n[6b] Sem role admin/super é bloqueado');
    const r6b = await req('GET', '/api/approvals/pending', null, NO_AUTH_HEADERS);
    check('Bloqueado com 403', r6b.status === 403, `status=${r6b.status}`);

    // ── 7. Admin aprova pendência admin (deve passar) ──
    console.log('\n[7] Admin aprova pendência admin');
    const r7 = await req('POST', '/api/approvals/' + idAdmin + '/approve', { reason: 'aprovação OK' }, ADMIN_HEADERS);
    check('Status 200', r7.status === 200, `body=${JSON.stringify(r7.body)}`);
    const approvedRow = await dbAll('SELECT status, decided_by, decision_type FROM pending_approvals WHERE id = ?', [idAdmin]);
    check('status = APPROVED', approvedRow[0].status === 'APPROVED');
    check('decided_by = u1', approvedRow[0].decided_by === 'u1');
    check('decision_type = approve', approvedRow[0].decision_type === 'approve');

    // ── 8. (compliance já foi aprovado em #6, então criamos uma nova para testar edit) ──
    console.log('\n[8] Compliance: edit com motivo curto (deve falhar)');
    // Criar nova pendência compliance para testar edit
    const r8criar = await req('POST', '/api/approvals',
        { ticketId: 't_teste_5', clientId: 'aprov_test_compliance2', value: 8000 },
        SUPER_HEADERS);
    const idCompl2 = r8criar.body.id;
    const r8 = await req('POST', '/api/approvals/' + idCompl2 + '/edit',
        { newValue: 7800, reason: 'muito curto' }, ADMIN_HEADERS);
    check('Bloqueado com 400 (motivo curto)', r8.status === 400, `status=${r8.status}`);

    // ── 9. Compliance: edit com motivo longo (deve passar, com admin) ──
    console.log('\n[9] Compliance: admin edita com motivo longo (deve passar)');
    const longReason = 'Conforme análise detalhada do escopo, o valor foi ajustado para refletir os custos efetivos das peças importadas com substituição de componentes defeituosos pela garantia estendida conforme contrato de prestação de serviços vigente entre as partes';
    const r9 = await req('POST', '/api/approvals/' + idCompl2 + '/edit',
        { newValue: 7800, reason: longReason }, ADMIN_HEADERS);
    check('Status 200 (admin editou compliance)', r9.status === 200, `body=${JSON.stringify(r9.body)}`);
    const editedRow = await dbAll('SELECT status, decision_type, new_value, decided_by FROM pending_approvals WHERE id = ?', [idCompl2]);
    check('status = APPROVED', editedRow[0].status === 'APPROVED');
    check('decision_type = edit', editedRow[0].decision_type === 'edit');
    check('new_value = 7800', editedRow[0].new_value === 7800);
    check('decided_by = u1 (admin)', editedRow[0].decided_by === 'u1');

    // ── 10. Reject sem motivo suficiente (deve falhar) ──
    console.log('\n[10] Reject sem motivo suficiente (deve falhar)');
    // Criar pendência nova para rejeitar
    const r10criar = await req('POST', '/api/approvals',
        { ticketId: 't_teste_4', clientId: 'aprov_test', value: 200 },
        ADMIN_HEADERS);
    check('Criada com sucesso', r10criar.status === 200);
    const r10 = await req('POST', '/api/approvals/' + r10criar.body.id + '/reject',
        { reason: 'nao' }, ADMIN_HEADERS);
    check('Bloqueado com 400', r10.status === 400, `status=${r10.status}`);

    // ── 11. Reject com motivo suficiente (deve passar) ──
    console.log('\n[11] Reject com motivo válido');
    const r11 = await req('POST', '/api/approvals/' + r10criar.body.id + '/reject',
        { reason: 'Cliente cancelou o atendimento antes da conclusão' }, ADMIN_HEADERS);
    check('Status 200', r11.status === 200);
    const rejectedRow = await dbAll('SELECT status FROM pending_approvals WHERE id = ?', [r10criar.body.id]);
    check('status = REJECTED', rejectedRow[0].status === 'REJECTED');

    // ── 12. Sem auth (deve falhar 403) ──
    console.log('\n[12] Tentar acessar sem role admin/super (deve 403)');
    const r12 = await req('GET', '/api/approvals/pending', null, NO_AUTH_HEADERS);
    check('Bloqueado com 403', r12.status === 403, `status=${r12.status}`);

    // ── 13. Histórico completo ──
    console.log('\n[13] GET /api/approvals (histórico)');
    const r13 = await req('GET', '/api/approvals?limit=10', null, SUPER_HEADERS);
    check('Status 200', r13.status === 200);
    check('Vê histórico completo', r13.body.data.length >= 4);

    // ── 14. Cron escalate (simulação) ──
    console.log('\n[14] POST /api/approvals/cron-escalate');
    const r14 = await req('POST', '/api/approvals/cron-escalate', null, NO_AUTH_HEADERS);
    check('Resposta 200 (endpoint aberto para cron)', r14.status === 200, `body=${JSON.stringify(r14.body)}`);

    console.log(`\n\n📊 Resultado: ${passed} OK / ${failed} FALHAS`);
    if (failed === 0) console.log('🎉 Todos os testes passaram!');
    else console.log('⚠️ Há falhas. Veja acima.');
    process.exit(failed === 0 ? 0 : 1);
}

runSmoke().catch(e => { console.error('Erro fatal:', e); process.exit(2); });
