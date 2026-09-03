/**
 * CORA API Service Layer
 * Handles mTLS authentication, token management, and all Cora API operations.
 * 
 * Endpoints supported:
 * - POST /token           → OAuth2 Client Credentials (mTLS)
 * - POST /invoices        → Create invoice (boleto + QR Pix)
 * - GET  /invoices/:id    → Get invoice details
 * - PUT  /invoices/:id/notifications → Update notification settings
 * - GET  /banking/statement → Bank statement & balance
 */

const axios = require('axios');
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');
require('dotenv').config();

// ── URL Configuration ──
const CORA_URLS = {
    stage: 'https://matls-clients.api.stage.cora.com.br',
    production: 'https://matls-clients.api.cora.com.br'
};
const CORA_API_URL = CORA_URLS[process.env.CORA_ENV] || CORA_URLS.stage;

let httpsAgent = null;
let accessToken = null;
let tokenExpiry = null;

// ── mTLS HTTPS Agent ──
function getHttpsAgent() {
    if (!httpsAgent) {
        const certPath = process.env.CORA_CERT_PATH || './certs/certificate.pem';
        const keyPath = process.env.CORA_KEY_PATH || './certs/private-key.key';
        try {
            httpsAgent = new https.Agent({
                cert: fs.readFileSync(certPath),
                key: fs.readFileSync(keyPath),
                rejectUnauthorized: true
            });
            console.log('[Cora mTLS] Certificados carregados com sucesso.');
        } catch (error) {
            console.warn(`[Cora mTLS] Certificados não encontrados em ${certPath}. Modo MOCK ativado.`);
            httpsAgent = new https.Agent();
        }
    }
    return httpsAgent;
}

// ── Token Management ──
async function authenticate() {
    if (accessToken && tokenExpiry && Date.now() < tokenExpiry) {
        return accessToken;
    }

    console.log('[Cora Auth] Solicitando novo access_token...');
    try {
        const params = new URLSearchParams();
        params.append('client_id', process.env.CORA_CLIENT_ID);
        params.append('grant_type', 'client_credentials');

        const response = await axios.post(`${CORA_API_URL}/token`, params.toString(), {
            httpsAgent: getHttpsAgent(),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        accessToken = response.data.access_token;
        const expiresIn = response.data.expires_in || 3600;
        tokenExpiry = Date.now() + (expiresIn - 300) * 1000; // 5 min margin
        console.log(`[Cora Auth] Token obtido. Expira em ${expiresIn}s.`);
        return accessToken;
    } catch (error) {
        console.error('[Cora Auth] Falha na autenticação:', error.response?.data || error.message);
        throw new Error('Cora Authentication Failed');
    }
}

// ── Helper: Authenticated Request ──
async function coraRequest(method, path, data = null, idempotencyKey = null) {
    const token = await authenticate();
    const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
    };
    if (idempotencyKey) {
        headers['Idempotency-Key'] = idempotencyKey;
    }

    const config = {
        method,
        url: `${CORA_API_URL}${path}`,
        httpsAgent: getHttpsAgent(),
        headers,
        ...(data && { data })
    };

    try {
        const response = await axios(config);
        return response.data;
    } catch (error) {
        const errData = error.response?.data || { message: error.message };
        const status = error.response?.status || 500;
        console.error(`[Cora API] ${method.toUpperCase()} ${path} failed (${status}):`, errData);
        const err = new Error(errData.message || errData.error || `Cora API Error ${status}`);
        err.status = status;
        err.data = errData;
        throw err;
    }
}

// ═════════════════════════════════════════
// Public API Methods
// ═════════════════════════════════════════

/**
 * Emitir Invoice/Boleto na Cora
 * @param {Object} payload - Invoice payload (customer, services, payment_terms, notifications)
 * @returns {{ data: Object, idempotencyKey: string }}
 */
async function createInvoice(payload) {
    const idempotencyKey = crypto.randomUUID();
    try {
        const data = await coraRequest('post', '/v2/invoices/', payload, idempotencyKey);
        return { data, idempotencyKey };
    } catch (error) {
        console.warn('[Cora Invoice] Falha ao emitir na API real. Gerando boleto simulado (MOCK).');
        // Gerar resposta mock realista para o CRM funcionar em modo dev/demo
        const mockId = 'mock_' + crypto.randomUUID().split('-')[0];
        const mockBarcode = '23793.38128 60000.000003 00000.000409 1 ' + Math.floor(Math.random() * 9e13);
        return {
            data: {
                id: mockId,
                code: payload.code,
                status: 'PENDING',
                mock: true,
                payment_options: {
                    bank_slip: {
                        id: 'slip_' + mockId,
                        bar_code: mockBarcode,
                        pdf: null
                    },
                    pix: {
                        qr_code: '00020126580014br.gov.bcb.pix0136' + crypto.randomUUID().replace(/-/g, '')
                    }
                }
            },
            idempotencyKey
        };
    }
}

/**
 * Consultar detalhes de um Invoice/Boleto
 * @param {string} invoiceId
 */
async function getInvoice(invoiceId) {
    return coraRequest('get', `/v2/invoices/${invoiceId}`);
}

/**
 * Atualizar notificações de um Invoice (WhatsApp, SMS, Email)
 * @param {string} invoiceId
 * @param {{ send_sms: boolean, send_whatsapp: boolean, send_email: boolean }} notifications
 */
async function updateNotifications(invoiceId, notifications) {
    try {
        const idempotencyKey = crypto.randomUUID();
        return await coraRequest('put', `/v2/invoices/${invoiceId}/notifications`, notifications, idempotencyKey);
    } catch (error) {
        console.warn(`[Cora Notifications] Falha ao atualizar notificações para ${invoiceId}:`, error.message);
        return { success: false, mock: true, message: error.message };
    }
}

/**
 * Consultar status de entrega das notificações
 * @param {string} invoiceId
 */
async function getNotificationStatus(invoiceId) {
    try {
        return await coraRequest('get', `/v2/invoices/${invoiceId}/notifications`);
    } catch (error) {
        console.warn(`[Cora Notifications] Falha ao consultar status para ${invoiceId}:`, error.message);
        return { success: false, mock: true, message: error.message };
    }
}

/**
 * Consultar extrato bancário e saldo
 * Retorna transações e saldo da conta Cora.
 */
async function getStatement() {
    try {
        const data = await coraRequest('get', '/v2/banking/statement');
        return {
            balance: data.balance || data.available_amount || 0,
            history: data.entries || data.transactions || []
        };
    } catch (error) {
        // Se não há certificados configurados, retornar dados simulados para a UI não quebrar
        console.warn('[Cora Statement] Falha ao obter extrato real. Retornando mock.');
        return { balance: 0, history: [], mock: true };
    }
}

module.exports = {
    authenticate,
    createInvoice,
    getInvoice,
    updateNotifications,
    getNotificationStatus,
    getStatement,
    CORA_API_URL
};
