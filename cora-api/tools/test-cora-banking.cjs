/**
 * Teste dos 3 endpoints de Banking da Cora (API 2026):
 *   1. GET /third-party/account/balance   → Saldo
 *   2. GET /third-party/account/          → Dados da conta
 *   3. GET /bank-statement/statement      → Extrato (com filtros)
 *
 * Uso: node tools/test-cora-banking.cjs
 *
 * Requer:
 *   - .env com CORA_CERT_PATH e CORA_KEY_PATH (aponta para os mTLS certs)
 *   - Token válido em tokens_integracao (ou gera novo via /token)
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');
const axios = require('axios');
const sqlite3 = require('sqlite3');

const certPath = path.resolve(__dirname, '..', process.env.CORA_CERT_PATH || 'certificate.pem');
const keyPath  = path.resolve(__dirname, '..', process.env.CORA_KEY_PATH || 'private-key.key');
const baseUrl  = 'https://matls-clients.api.cora.com.br';
const dbPath   = path.resolve(__dirname, '..', 'cora.sqlite');

let passed = 0, failed = 0;
function check(name, ok, detail = '') {
    if (ok) { console.log(`  ✅ ${name}${detail ? ' — ' + detail : ''}`); passed++; }
    else    { console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); failed++; }
}

const agent = new https.Agent({
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath),
    rejectUnauthorized: true
});

async function getToken() {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath);
        db.get(
            'SELECT access_token FROM tokens_integracao WHERE provider=? ORDER BY created_at DESC LIMIT 1',
            ['cora'],
            (e, r) => {
                db.close();
                if (e) return reject(e);
                if (!r) return reject(new Error('Token não encontrado em tokens_integracao'));
                resolve(r.access_token);
            }
        );
    });
}

async function callCora(method, path, token) {
    return axios({
        method,
        url: baseUrl + path,
        httpsAgent: agent,
        headers: { Authorization: 'Bearer ' + token },
        timeout: 15000
    });
}

async function main() {
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║   Teste Banking Cora — 3 endpoints (API 2026)            ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    let token;
    try {
        token = await getToken();
        check('Token recuperado do banco', true);
    } catch (e) {
        check('Token recuperado do banco', false, e.message);
        process.exit(1);
    }

    // ── 1. Saldo ──
    console.log('\n[1] GET /third-party/account/balance');
    try {
        const r = await callCora('get', '/third-party/account/balance', token);
        const balance = r.data.balance ?? r.data.available_amount;
        check('Status 200', r.status === 200);
        check('Tem campo balance', balance !== undefined, `balance: ${balance}`);
        check('Resposta JSON válida', typeof r.data === 'object');
        console.log('   Resposta:', JSON.stringify(r.data).substring(0, 200));
    } catch (e) {
        const s = e.response?.status;
        const d = e.response?.data;
        check('Status 200', false, `status: ${s}, error: ${JSON.stringify(d)?.substring(0, 200)}`);
    }

    // ── 2. Dados da conta ──
    console.log('\n[2] GET /third-party/account/');
    try {
        const r = await callCora('get', '/third-party/account/', token);
        check('Status 200', r.status === 200);
        check('Resposta JSON válida', typeof r.data === 'object');
        check('Tem identificador (id/company/document)', r.data.id || r.data.company || r.data.document, '');
        console.log('   Resposta:', JSON.stringify(r.data).substring(0, 200));
    } catch (e) {
        const s = e.response?.status;
        const d = e.response?.data;
        check('Status 200', false, `status: ${s}, error: ${JSON.stringify(d)?.substring(0, 200)}`);
    }

    // ── 3. Extrato ──
    console.log('\n[3] GET /bank-statement/statement');
    try {
        const r = await callCora('get', '/bank-statement/statement?page=0&size=10', token);
        const entries = r.data.entries || r.data.transactions || r.data.statement || [];
        check('Status 200', r.status === 200);
        check('Tem entries/transactions', Array.isArray(entries), `count: ${entries.length}`);
        check('Tem campo balance', r.data.balance !== undefined || r.data.available_amount !== undefined);
        console.log('   Resposta (primeiros 300 chars):', JSON.stringify(r.data).substring(0, 300));
    } catch (e) {
        const s = e.response?.status;
        const d = e.response?.data;
        check('Status 200', false, `status: ${s}, error: ${JSON.stringify(d)?.substring(0, 200)}`);
    }

    console.log(`\n${'─'.repeat(60)}`);
    console.log(`Total: ${passed + failed} | ✅ ${passed} OK | ❌ ${failed} falhas`);
    process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
