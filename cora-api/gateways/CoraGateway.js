/**
 * CoraGateway — Implementação da PaymentGatewayInterface para a API Cora
 * 
 * Suporta:
 * - Autenticação OAuth2 com mTLS (certificados PEM)
 * - Emissão de boleto registrado com QR Pix
 * - Consulta de extrato e saldo
 * - Notificações SMS/WhatsApp/Email
 * - Parsing de webhooks (INVOICE.PAID, INVOICE.OVERDUE, INVOICE.CANCELLED)
 */

const PaymentGatewayInterface = require('./PaymentGatewayInterface');
const axios = require('axios');
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');
const { dbGet, dbRun } = require('../database');

const CORA_URLS = {
    stage: 'https://matls-clients.api.stage.cora.com.br',
    production: 'https://matls-clients.api.cora.com.br'
};

class CoraGateway extends PaymentGatewayInterface {
    constructor(config = {}) {
        super(config);
        this.providerName = 'cora';
        this.env = config.env || process.env.CORA_ENV || 'stage';
        this.clientId = config.clientId || process.env.CORA_CLIENT_ID;
        this.certPath = config.certPath || process.env.CORA_CERT_PATH || './certs/certificate.pem';
        this.keyPath = config.keyPath || process.env.CORA_KEY_PATH || './certs/private-key.key';
        this.baseUrl = CORA_URLS[this.env] || CORA_URLS.stage;

        // [FIX] O 2º argumento do construtor (forceMock) ativa o modo MOCK
        // sem precisar de cert. Usado por getGateway('mock') em server.js.
        this._forceMock = config === null || config.forceMock === true || process.env.CORA_FORCE_MOCK === 'true';
        // 2º argumento posicional (`null, true`) — retrocompat com código antigo
        if (arguments.length >= 2 && arguments[1] === true) this._forceMock = true;

        this._httpsAgent = null;
        this._accessToken = null;
        this._tokenExpiry = null;
    }

    // ── mTLS HTTPS Agent ──
    _getAgent() {
        if (!this._httpsAgent) {
            try {
                this._httpsAgent = new https.Agent({
                    cert: fs.readFileSync(this.certPath),
                    key: fs.readFileSync(this.keyPath),
                    rejectUnauthorized: true
                });
                console.log('[Cora mTLS] Certificados carregados com sucesso.');
                console.log(`[Cora mTLS] certPath=${this.certPath}, keyPath=${this.keyPath}`);
                console.log(`[Cora mTLS] certBytes=${this._httpsAgent.options.cert.length}, keyBytes=${this._httpsAgent.options.key.length}`);
            } catch (error) {
                // Hotfix Camada 1 (C7): modo MOCK só pode existir fora de produção.
                // Em produção, falta de cert = bloqueio total (não envia cobrança sem mTLS).
                if (process.env.NODE_ENV === 'production') {
                    console.error('[Cora mTLS] ✗ Certificados não encontrados em produção — bloqueando operação.');
                    throw new Error(`Certificados mTLS não encontrados (cert: ${this.certPath}, key: ${this.keyPath}). Em produção, é obrigatório ter os arquivos para autenticação.`);
                }
                console.warn(`[Cora mTLS] Certificados não encontrados em ${this.certPath}. Modo MOCK ativado (apenas dev).`);
                this._httpsAgent = new https.Agent();
            }
        }
        return this._httpsAgent;
    }

    // ── Token Management ──
    async authenticate() {
        // [FIX] Em modo MOCK, retornar token fake sem fazer request real.
        if (this._forceMock) {
            this._accessToken = 'MOCK_TOKEN_' + Date.now();
            this._tokenExpiry = Date.now() + 3600 * 1000;
            return this._accessToken;
        }

        // 1. Cache L1: Memória
        if (this._accessToken && this._tokenExpiry && Date.now() < this._tokenExpiry) {
            return this._accessToken;
        }

        // 2. Cache L2: Banco de Dados (Fase 6 - Persistência)
        try {
            const cached = await dbGet(
                'SELECT access_token, expires_at FROM tokens_integracao WHERE provider = ? AND client_id = ?',
                [this.providerName, this.clientId]
            );
            if (cached && Date.now() < cached.expires_at) {
                this._accessToken = cached.access_token;
                this._tokenExpiry = cached.expires_at;
                console.log(`[Cora Auth] Token restaurado do DB para API ${this.providerName} (${this.clientId.substring(0,8)}...)`);
                return this._accessToken;
            }
        } catch (dbErr) {
            console.warn('[Cora Auth] Falha ao consultar cache DB, solicitando novo token...', dbErr.message);
        }

        // 3. L3: Nova requisição mTLS
        console.log('[Cora Auth] Solicitando novo access_token da API Cora (mTLS)...');
        try {
            const params = new URLSearchParams();
            params.append('client_id', this.clientId);
            params.append('grant_type', 'client_credentials');

            const response = await axios.post(`${this.baseUrl}/token`, params.toString(), {
                httpsAgent: this._getAgent(),
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });

            this._accessToken = response.data.access_token;
            const expiresIn = response.data.expires_in || 3600;
            // Margem de segurança de 5 minutos (300s) para expiração local/DB
            this._tokenExpiry = Date.now() + (expiresIn - 300) * 1000;

            // Salvar L2: Atualizar DB
            try {
                await dbRun(
                    `INSERT INTO tokens_integracao (provider, client_id, access_token, expires_at)
                     VALUES (?, ?, ?, ?)
                     ON CONFLICT(provider, client_id) DO UPDATE SET
                     access_token = excluded.access_token,
                     expires_at = excluded.expires_at,
                     created_at = CURRENT_TIMESTAMP`,
                    [this.providerName, this.clientId, this._accessToken, this._tokenExpiry]
                );
            } catch (dbErr) {
                console.warn('[Cora Auth] Atenção: Não foi possível persistir token no DB:', dbErr.message);
            }

            console.log(`[Cora Auth] Token obtido e persistido com sucesso. Válido por ${expiresIn}s.`);
            return this._accessToken;
        } catch (error) {
            console.error('[Cora Auth] Falha na autenticação HTTP:', error.response?.data || error.message);
            console.error('[Cora Auth] DEBUG status=', error.response?.status, 'url=', error.config?.url);
            console.error('[Cora Auth] DEBUG certPath=', this.certPath, 'keyPath=', this.keyPath);
            console.error('[Cora Auth] DEBUG agentCert=', !!this._httpsAgent?.options?.cert, 'agentKey=', !!this._httpsAgent?.options?.key);
            console.error('[Cora Auth] DEBUG agentConstructor=', this._httpsAgent?.constructor?.name);
            throw new Error('Cora Authentication Failed');
        }
    }

    // ── Authenticated HTTP request helper ──
    async _request(method, path, data = null, idempotencyKey = null, retries = 3) {
        // SECURITY HARDENING 3 — MOCK mode: retorna resposta fictícia sem fazer HTTP real
        if (this._forceMock) {
            return this._mockResponse(method, path, data, idempotencyKey);
        }

        const token = await this.authenticate();
        const headers = {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        };
        // Requisito 2: Idempotency-Key obrigatória em mutações (POST/PUT/DELETE)
        if (idempotencyKey) {
            headers['Idempotency-Key'] = idempotencyKey;
        } else if (['post', 'put', 'delete', 'patch'].includes(method.toLowerCase())) {
            idempotencyKey = crypto.randomUUID();
            headers['Idempotency-Key'] = idempotencyKey;
        }

        const url = `${this.baseUrl}${path}`;
        let delayMs = 1000;

        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const response = await axios({
                    method,
                    url,
                    httpsAgent: this._getAgent(),
                    headers,
                    ...(data && { data })
                });

                this._logRequest(method, url, response.status, data, response.data, idempotencyKey);
                return response.data;
            } catch (error) {
                const status = error.response?.status || 500;
                const errData = error.response?.data || { message: error.message };

                // Exponential Backoff para falhas transitórias (5xx)
                if (attempt < retries && status >= 500) {
                    console.log(`[Cora API] Retry ${attempt}/${retries} para ${method.toUpperCase()} ${path} após erro ${status}. Aguardando ${delayMs}ms...`);
                    await new Promise(r => setTimeout(r, delayMs));
                    delayMs *= 2; // 1s, 2s, 4s
                    continue;
                }

                this._logRequest(method, url, status, data, errData, idempotencyKey);

                console.error(`[Cora API] ${method.toUpperCase()} ${path} failed (${status}):`, JSON.stringify(errData, null, 2));
                
                const err = new Error(errData.message || errData.error || `Cora API Error ${status}`);
                err.status = status;
                err.code = errData.code || 'UNKNOWN_ERROR';
                err.errors = errData.errors || [];
                err.data = errData;
                throw err;
            }
        }
    }

    _logRequest(method, url, status, reqData, resData, idempotencyKey) {
        dbRun(
            `INSERT INTO logs_integracao_cora (method, url, http_status, request_payload, response_payload, idempotency_key)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                method.toUpperCase(), url, status,
                reqData ? JSON.stringify(reqData) : null,
                resData ? JSON.stringify(resData) : null,
                idempotencyKey || null
            ]
        ).catch(err => console.error('[Cora API Log] Falha ao registrar log de auditoria:', err.message));
    }

    // ═══════════════════════════════════════
    // Interface Methods
    // ═══════════════════════════════════════

    async createInvoice(payload) {
        const idempotencyKey = crypto.randomUUID();
        const raw = await this._request('post', '/v2/invoices/', payload, idempotencyKey);
        return {
            chargeId: raw.id,
            invoiceId: raw.id,
            barcode: raw.payment_options?.bank_slip?.barcode || raw.payment_options?.bank_slip?.bar_code || null,
            digitableLine: raw.payment_options?.bank_slip?.digitable || null,
            pixQrCode: raw.payment_options?.pix?.qr_code || raw.pix?.qr_code || null,
            pdfUrl: raw.payment_options?.bank_slip?.url || raw.payment_options?.bank_slip?.pdf || null,
            status: raw.status || 'PENDING',
            idempotencyKey,
            mock: false,
            raw
        };
    }

    async cancelInvoice(invoiceId) {
        await this._request('delete', `/v2/invoices/${invoiceId}`);
        return { success: true };
    }

    async getInvoice(invoiceId) {
        return this._request('get', `/v2/invoices/${invoiceId}`);
    }

    /**
     * Extrato bancário (bank-statement) — API atualizada 2026
     * Endpoint: GET /bank-statement/statement
     * Suporta filtros: start_date, end_date, page, size
     */
    async getStatement(opts = {}) {
        const { startDate, endDate, page = 0, size = 50 } = opts;
        const params = new URLSearchParams();
        params.append('page', page);
        params.append('size', size);
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);
        const data = await this._request('get', `/bank-statement/statement?${params.toString()}`);
        return {
            balance: data.balance || data.available_amount || 0,
            history: data.entries || data.transactions || data.statement || []
        };
    }

    /**
     * Saldo em conta — API atualizada 2026
     * Endpoint: GET /third-party/account/balance
     */
    async getBalance() {
        const data = await this._request('get', '/third-party/account/balance');
        return {
            balance: data.balance ?? data.available_amount ?? 0,
            currency: data.currency || 'BRL',
            updated_at: data.updated_at || new Date().toISOString()
        };
    }

    /**
     * Dados da conta — API atualizada 2026
     * Endpoint: GET /third-party/account/
     */
    async getAccountInfo() {
        return this._request('get', '/third-party/account/');
    }

    async updateNotifications(invoiceId, opts) {
        const coraPayload = {
            send_sms: opts.sms !== undefined ? opts.sms : true,
            send_whatsapp: opts.whatsapp !== undefined ? opts.whatsapp : true,
            send_email: opts.email !== undefined ? opts.email : true
        };
        const idempotencyKey = crypto.randomUUID();
        return await this._request('put', `/v2/invoices/${invoiceId}/notifications`, coraPayload, idempotencyKey);
    }

    async getNotificationStatus(invoiceId) {
        return await this._request('get', `/v2/invoices/${invoiceId}/notifications`);
    }

    async registerWebhook(url) {
        const payload = {
            url,
            triggers: ['invoice.paid', 'invoice.created', 'invoice.overdue', 'invoice.cancelled']
        };
        const idempotencyKey = crypto.randomUUID();
        return await this._request('post', '/v2/endpoints', payload, idempotencyKey);
    }

    parseWebhookEvent(rawPayload) {
        const typeMap = {
            'INVOICE.PAID': 'PAID',
            'INVOICE.OVERDUE': 'OVERDUE',
            'INVOICE.CANCELLED': 'CANCELLED',
            'INVOICE.CREATED': 'CREATED'
        };
        return {
            eventType: typeMap[rawPayload.type] || 'UNKNOWN',
            chargeId: rawPayload.data?.id || null,
            amount: rawPayload.data?.amount || rawPayload.data?.total_amount || null,
            raw: rawPayload
        };
    }

    /**
     * MOCK response generator — simula resposta da API Cora em modo dev
     * Retorna dados estruturados compatíveis com a API real
     */
    _mockResponse(method, path, data, idempotencyKey) {
        const now = new Date();
        const dueDate = data?.due_date || data?.services?.[0]?.due_date
            || new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const value = (data?.total_amount || data?.services?.reduce((s, x) => s + (x.amount * (x.quantity || 1)), 0) || 51000) / 100;

        // Gera linha digitável fake (47 dígitos)
        const fakeDigits = (idempotencyKey || 'mock').replace(/[^0-9]/g, '').padEnd(20, '0').slice(0, 20);
        const linhaDigitavel = (fakeDigits + '0000000000000000000000000000000000000000000').slice(0, 47);

        if (path.includes('/v2/invoices') && method.toLowerCase() === 'post') {
            // Create invoice
            const mockId = `inv_mock_${(idempotencyKey || Date.now()).replace(/[^a-z0-9]/gi, '').slice(0, 12)}`;
            console.log(`[Cora MOCK] POST /v2/invoices/ → ${mockId} | value=R$${value}`);
            return {
                id: mockId,
                status: 'PENDING',
                amount: data?.total_amount || 51000,
                total_amount: data?.total_amount || 51000,
                due_date: dueDate,
                created_at: now.toISOString(),
                payment_options: {
                    bank_slip: {
                        bar_code: linhaDigitavel,
                        barcode: linhaDigitavel,
                        linha_digitavel: linhaDigitavel,
                        url: `https://mock.cora.com.br/boleto/${mockId}.pdf`,
                        pdf: `https://mock.cora.com.br/boleto/${mockId}.pdf`,
                    },
                    pix: {
                        qr_code: '00020126580014BR.GOV.BCB.PIX0136mock-pix-key@example.com5204000053039865802BR5913RENOSTTER MOCK6009SAO PAULO62070503***6304ABCD',
                        qr_code_url: `https://mock.cora.com.br/pix/${mockId}.png`,
                        expires_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
                    }
                },
                customer: data?.customer || {},
                services: data?.services || [],
                mock: true,
            };
        }
        if (path.includes('/v2/invoices/') && method.toLowerCase() === 'get') {
            return { id: path.split('/').pop(), status: 'PENDING', mock: true };
        }
        if (path.includes('/bank-statement') || path.includes('/balance')) {
            return { balance: 125430.50, available_amount: 125430.50, currency: 'BRL', mock: true };
        }
        if (path.includes('/third-party/account')) {
            return { name: 'Renostter Climatização LTDA', document: '11222333000144', mock: true };
        }
        // Default mock response
        return { mock: true, method, path, ok: true };
    }
}

module.exports = CoraGateway;
