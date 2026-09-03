const PaymentGatewayInterface = require('./PaymentGatewayInterface');

/**
 * ItauGateway — Implementação para API Banking Itaú
 * FASE 2: Expansão Multi-Banco
 */
class ItauGateway extends PaymentGatewayInterface {
    constructor(config = {}) {
        super();
        this.config = config; // ambiente, clientId, etc.
    }

    async authenticate() {
        console.log(`[ItauGateway] Autenticando em modo ${this.config.ambiente}...`);
        // Simulação de OAuth2 com Itaú
        return { access_token: 'mock_itau_token_' + Date.now() };
    }

    async createInvoice(payload) {
        return this._withRetry(async () => {
            console.log('[ItauGateway] Criando boleto Itaú...');
            // Simulação de erro aleatório para testar retry (10% de chance)
            if (Math.random() < 0.1) throw new Error('Erro temporário de comunicação com Itaú');

            return {
                success: true,
                chargeId: 'itau_ch_' + Math.random().toString(36).substr(2, 9),
                barcode: '34191.00000 00000.000000 00000.000000 0 000000000000',
                linhaDigitavel: '3419100000000000000000000000000000000000000',
                pdfUrl: 'https://seubanco.itau.com.br/boleto/mock',
                pixQrCode: '00020126580014br.gov.bcb.pix0136itau-mock-qr-code',
                providerName: 'itau'
            };
        });
    }

    async _withRetry(fn, retries = 3) {
        for (let i = 0; i < retries; i++) {
            try {
                return await fn();
            } catch (err) {
                if (i === retries - 1) throw err;
                console.warn(`[ItauGateway] Tentativa ${i + 1} falhou. Retentando em 500ms...`);
                await new Promise(r => setTimeout(r, 500));
            }
        }
    }

    async cancelInvoice(chargeId) {
        console.log(`[ItauGateway] Cancelando boleto ${chargeId}...`);
        return true;
    }

    async getInvoice(chargeId) {
        return { status: 'PENDING' };
    }

    async getStatement() {
        return {
            balance: 5000.00,
            items: [
                { id: '1', date: new Date(), description: 'RECEBIMENTO ITAU MOCK', amount: 1500.00 }
            ]
        };
    }

    parseWebhookEvent(raw) {
        // Mapeamento específico do Itaú
        return {
            type: raw.evento === 'pago' ? 'PAID' : 'OTHER',
            chargeId: raw.id_cobranca,
            amount: raw.valor
        };
    }
}

module.exports = ItauGateway;
