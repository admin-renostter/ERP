/**
 * PaymentGatewayInterface — Base abstrata para provedores de pagamento
 * 
 * Cada provedor (Cora, Itaú, Bradesco) deve estender esta classe
 * e implementar todos os métodos abstratos.
 */
class PaymentGatewayInterface {
    constructor(config = {}) {
        if (new.target === PaymentGatewayInterface) {
            throw new Error('PaymentGatewayInterface é uma classe abstrata. Use CoraGateway, ItauGateway, etc.');
        }
        this.providerName = 'unknown';
        this.config = config;
    }

    /** Autenticar com o provedor (obter token, etc.) */
    async authenticate() { throw new Error(`${this.providerName}: authenticate() não implementado`); }

    /**
     * Emitir cobrança (boleto/pix)
     * @param {Object} payload - Dados normalizados da cobrança
     * @param {string} payload.code - Código interno (contractId)
     * @param {Object} payload.customer - { name, email, document: { identity, type }, address }
     * @param {Array}  payload.services - [{ name, amount (centavos) }]
     * @param {Object} payload.payment_terms - { due_date, fine, interest, discount }
     * @param {Object} payload.notifications - { email, sms, whatsapp }
     * @returns {{ chargeId, invoiceId, barcode, digitableLine, pixQrCode, pdfUrl, idempotencyKey, raw }}
     */
    async createInvoice(payload) { throw new Error(`${this.providerName}: createInvoice() não implementado`); }

    /**
     * Cancelar cobrança
     * @param {string} invoiceId
     * @returns {{ success: boolean }}
     */
    async cancelInvoice(invoiceId) { throw new Error(`${this.providerName}: cancelInvoice() não implementado`); }

    /**
     * Consultar detalhes de uma cobrança
     * @param {string} invoiceId
     * @returns {Object} Dados normalizados
     */
    async getInvoice(invoiceId) { throw new Error(`${this.providerName}: getInvoice() não implementado`); }

    /**
     * Consultar extrato/saldo bancário
     * @returns {{ balance: number, history: Array }}
     */
    async getStatement() { throw new Error(`${this.providerName}: getStatement() não implementado`); }

    /**
     * Atualizar notificações de uma cobrança
     * @param {string} invoiceId
     * @param {{ email?: boolean, sms?: boolean, whatsapp?: boolean }} opts
     * @returns {Object}
     */
    async updateNotifications(invoiceId, opts) { throw new Error(`${this.providerName}: updateNotifications() não implementado`); }

    /**
     * Consultar status de notificações
     * @param {string} invoiceId
     * @returns {Object}
     */
    async getNotificationStatus(invoiceId) { throw new Error(`${this.providerName}: getNotificationStatus() não implementado`); }

    /**
     * Parsear evento de webhook recebido para formato normalizado
     * @param {Object} rawPayload - Payload bruto do provedor
     * @returns {{ eventType: 'PAID'|'OVERDUE'|'CANCELLED'|'UNKNOWN', chargeId, amount, raw }}
     */
    parseWebhookEvent(rawPayload) { throw new Error(`${this.providerName}: parseWebhookEvent() não implementado`); }
}

module.exports = PaymentGatewayInterface;
