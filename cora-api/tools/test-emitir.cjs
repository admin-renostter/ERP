/**
 * Teste de emissão real de boleto via API Cora
 * Estrutura do payload baseada em CobrancaManager.js (já validada)
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const axios = require('axios');

async function main() {
    const certPath = path.resolve(__dirname, '..', process.env.CORA_CERT_PATH || 'certificate.pem');
    const keyPath  = path.resolve(__dirname, '..', process.env.CORA_KEY_PATH || 'private-key.key');
    const baseUrl  = process.env.CORA_ENV === 'production'
        ? 'https://matls-clients.api.cora.com.br'
        : 'https://matls-clients.api.stage.cora.com.br';

    console.log('🔐 Cora mTLS Emission Test');
    console.log('═'.repeat(50));
    console.log('Env:', process.env.CORA_ENV);
    console.log('Base URL:', baseUrl);

    if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
        console.error('❌ Certificados não encontrados!'); process.exit(1);
    }
    console.log('✅ Certificados OK\n');

    const httpsAgent = new https.Agent({
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath),
        rejectUnauthorized: true
    });

    // ── 1. Auth ──
    console.log('[1] Autenticando via mTLS...');
    let accessToken;
    try {
        const params = new URLSearchParams();
        params.append('client_id', process.env.CORA_CLIENT_ID);
        params.append('grant_type', 'client_credentials');

        const resp = await axios.post(`${baseUrl}/token`, params.toString(), {
            httpsAgent,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 10000
        });
        accessToken = resp.data.access_token;
        console.log(`   ✅ Token: ${accessToken.substring(0, 18)}... (expira em ${resp.data.expires_in}s)\n`);
    } catch (e) {
        console.error('❌ Auth falhou:', e.response?.status, e.response?.data || e.message);
        process.exit(1);
    }

    // ── 2. Emitir Invoice ──
    const idempotencyKey = crypto.randomUUID();
    const dueDate = '2026-08-15';
    // Payload com estrutura idêntica ao CobrancaManager.js (validada)
    const invoicePayload = {
        code: `TEST-${Date.now()}`,
        customer: {
            name: 'João Paulo Teste',
            email: 'joaopaulo@antgravity.com.br',
            document: { identity: '12345678909', type: 'CPF' }
        },
        services: [{
            name: 'Serviço de Manutenção Preventiva',
            amount: 10000  // R$ 100,00 em centavos
        }],
        payment_terms: {
            due_date: dueDate
        },
        notifications: { send_on_creation: true }
    };

    console.log('[2] Emitindo invoice...');
    console.log(`   amount: R$ ${(invoicePayload.services[0].amount / 100).toFixed(2)}`);
    console.log(`   due_date: ${dueDate}`);
    console.log(`   idempotency: ${idempotencyKey}`);

    try {
        const resp = await axios.post(`${baseUrl}/v2/invoices/`, invoicePayload, {
            httpsAgent,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'Idempotency-Key': idempotencyKey
            },
            timeout: 15000
        });

        const data = resp.data;
        console.log('\n✅ INVOICE CRIADO!');
        console.log('─'.repeat(40));
        console.log('   Invoice ID  :', data.id);
        console.log('   Status      :', data.status);
        console.log('   Código      :', data.code);

        if (data.payment_options?.bank_slip) {
            const slip = data.payment_options.bank_slip;
            console.log('   Barcode     :', slip.bar_code || slip.barcode || '(n/a)');
            console.log('   Digitable   :', slip.digitable || '(n/a)');
            console.log('   PDF URL     :', slip.url || slip.pdf || '(n/a)');
        }
        if (data.payment_options?.pix) {
            const pix = data.payment_options.pix;
            console.log('   PIX QR Code :', (pix.qr_code || '').substring(0, 60) + '...');
        }

        // ── 3. Consultar invoice criado ──
        console.log('\n[3] Consultando invoice criado...');
        const getResp = await axios.get(`${baseUrl}/v2/invoices/${data.id}`, {
            httpsAgent,
            headers: { Authorization: `Bearer ${accessToken}` },
            timeout: 10000
        });
        console.log('   ✅ Consulta OK — status:', getResp.data.status);
        console.log('\n🎉 INTEGRAÇÃO CORA OPERACIONAL!\n');
        process.exit(0);

    } catch (e) {
        const status = e.response?.status;
        const respData = e.response?.data;
        console.error('\n❌ Erro na emissão:', status);
        console.error('   URL:', e.config?.url);
        console.error('   Response:', JSON.stringify(respData, null, 2));
        console.error('   Headers:', JSON.stringify(e.response?.headers, null, 2));
        process.exit(1);
    }
}

main();
