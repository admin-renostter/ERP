const { dbAll, dbRun } = require('./database');
const NotificationService = require('./NotificationService');
const WhatsAppService = require('./WhatsAppService');

/**
 * ReminderService — Gerencia a Régua de Cobrança Automática
 * FASE 3: Automação Total
 */
class ReminderService {
    constructor() {
        this.notif = new NotificationService();
        this.wa = WhatsAppService;  // WhatsAppService exporta objeto (não class)
    }

    /**
     * Executar a régua de cobrança diária
     */
    async executeDailyReminders() {
        console.log(`[Reminders] Iniciando processamento diário (${new Date().toISOString()})...`);
        
        await this._processDminus5();
        await this._processDminus1();
        await this._processDplus1();

        console.log('[Reminders] Processamento concluído.');
    }

    /**
     * D-5: Lembrete amigável (5 dias antes)
     */
    async _processDminus5() {
        const date = this._getDateOffset(5);
        const pends = await this._findPendingByDate(date);
        for (const cob of pends) {
            await this._sendReminder(cob, 'reminder_d-5', 'Lembrete: Fatura vence em 5 dias');
        }
    }

    /**
     * D-1: Lembrete urgente (1 dia antes)
     */
    async _processDminus1() {
        const date = this._getDateOffset(1);
        const pends = await this._findPendingByDate(date);
        for (const cob of pends) {
            await this._sendReminder(cob, 'reminder_d-1', 'Atenção: Sua fatura vence amanhã');
        }
    }

    /**
     * D+1: Cobrança de atraso (1 dia depois)
     */
    async _processDplus1() {
        const date = this._getDateOffset(-1);
        const overdues = await dbAll(
            "SELECT * FROM cobrancas WHERE data_vencimento = ? AND status IN ('PENDING', 'OPEN', 'OVERDUE')",
            [date]
        );
        for (const cob of overdues) {
            await this._sendReminder(cob, 'overdue_d+1', 'Urgente: Fatura em atraso');
        }
    }

    async _sendReminder(cob, type, subject) {
        try {
            // 1. Email
            if (cob.notif_email && cob.client_email) {
                await this.notif.enviarCobranca({
                    to: cob.client_email,
                    clientName: 'Cliente', // No cenário real, podemos ter client_name no DB também
                    valor: cob.valor,
                    vencimento: cob.data_vencimento,
                    pdfUrl: cob.pdf_url,
                    cobrancaId: cob.id,
                    subjectPrefix: `[${type.toUpperCase()}] `
                });
                await this._logNotif(cob.id, 'email', type, 'sent', null, cob.client_email);
            }

            // 2. WhatsApp
            if (cob.notif_whatsapp && cob.client_phone) {
                await this.wa.sendReminderTemplate({
                    to: cob.client_phone,
                    clientName: 'Cliente',
                    dueDate: cob.data_vencimento,
                    amount: cob.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
                    pdfUrl: cob.pdf_url
                });
                await this._logNotif(cob.id, 'whatsapp', type, 'sent', null, cob.client_phone);
            }
        } catch (e) {
            console.error(`[Reminders] Falha ao enviar ${type} para ${cob.id}:`, e.message);
            await this._logNotif(cob.id, 'any', type, 'failed', e.message, null);
        }
    }

    async _findPendingByDate(date) {
        return dbAll(
            "SELECT * FROM cobrancas WHERE data_vencimento = ? AND status IN ('PENDING', 'OPEN')",
            [date]
        );
    }

    _getDateOffset(days) {
        const d = new Date();
        d.setDate(d.getDate() + days);
        return d.toISOString().split('T')[0];
    }

    async _logNotif(cobId, channel, type, status, error = null, recipient = null) {
        await dbRun(
            `INSERT INTO logs_notificacoes (cobranca_id, channel, type, recipient, status, error_message)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [cobId, channel, type, recipient, status, error]
        );
    }
}

module.exports = ReminderService;
