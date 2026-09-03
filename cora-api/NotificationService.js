/**
 * NotificationService — Serviço de notificações por e-mail
 * 
 * Envia e-mails de cobrança ao cliente com dados do boleto (PDF, código de barras,
 * linha digitável, QR Pix). Funciona como fallback quando a Cora não envia
 * automaticamente, ou como canal adicional.
 * 
 * Configuração via .env:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 * 
 * Se SMTP não configurado, opera em modo LOG (apenas registra no console).
 */

const nodemailer = require('nodemailer');

class NotificationService {
    constructor() {
        this.smtpConfigured = !!(process.env.SMTP_HOST && process.env.SMTP_USER);
        this.transporter = null;

        if (this.smtpConfigured) {
            this.transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: parseInt(process.env.SMTP_PORT) || 587,
                secure: (process.env.SMTP_PORT === '465'),
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS
                }
            });
            console.log(`[NotificationService] SMTP configurado: ${process.env.SMTP_HOST}`);
        } else {
            console.log('[NotificationService] SMTP não configurado — modo LOG ativado (e-mails serão simulados).');
        }
    }

    /**
     * Enviar e-mail de cobrança
     * @param {Object} params
     * @param {string} params.to - E-mail do destinatário
     * @param {string} params.clientName - Nome do cliente
     * @param {number} params.valor - Valor em reais
     * @param {string} params.vencimento - Data de vencimento (YYYY-MM-DD)
     * @param {string} [params.barcode]
     * @param {string} [params.linhaDigitavel]
     * @param {string} [params.pdfUrl]
     * @param {string} [params.pixQrCode]
     * @param {string} [params.cobrancaId]
     * @returns {{ success: boolean, messageId?: string, mode: 'smtp'|'log' }}
     */
    async enviarCobranca({ to, clientName, valor, vencimento, barcode, linhaDigitavel, pdfUrl, pixQrCode, cobrancaId }) {
        const fmtVal = v => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const fmtDate = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—';

        const subject = `Renostter — Cobrança ${fmtVal(valor)} vence em ${fmtDate(vencimento)}`;

        const html = `
        <div style="font-family:'Inter',Arial,sans-serif;max-width:600px;margin:0 auto;background:#0D1117;color:#E6EDF3;border-radius:12px;overflow:hidden;border:1px solid #30363D">
            <div style="background:linear-gradient(135deg,#0D1B2A,#161B22);padding:24px 30px;border-bottom:1px solid rgba(0,174,239,.2)">
                <h1 style="margin:0;font-size:1.2rem;color:#00AEEF">Renostter Climatização</h1>
                <p style="margin:4px 0 0;font-size:.85rem;color:#8B949E">Cobrança de Serviços</p>
            </div>
            <div style="padding:24px 30px">
                <p style="margin:0 0 16px;font-size:.95rem">Olá <strong>${clientName}</strong>,</p>
                <p style="margin:0 0 20px;font-size:.9rem;color:#8B949E">Segue abaixo a sua cobrança referente aos serviços contratados:</p>
                
                <div style="background:#161B22;border:1px solid #30363D;border-radius:8px;padding:16px;margin-bottom:20px">
                    <table style="width:100%;border-collapse:collapse;font-size:.9rem">
                        <tr><td style="padding:6px 0;color:#8B949E">Valor:</td><td style="padding:6px 0;text-align:right;font-weight:700;font-size:1.1rem;color:#00AEEF">${fmtVal(valor)}</td></tr>
                        <tr><td style="padding:6px 0;color:#8B949E">Vencimento:</td><td style="padding:6px 0;text-align:right;font-weight:600">${fmtDate(vencimento)}</td></tr>
                        ${cobrancaId ? `<tr><td style="padding:6px 0;color:#8B949E">Ref:</td><td style="padding:6px 0;text-align:right;font-size:.8rem;color:#8B949E">${cobrancaId}</td></tr>` : ''}
                    </table>
                </div>

                ${linhaDigitavel ? `
                <div style="background:#0D1B2A;border:1px solid rgba(0,174,239,.3);border-radius:8px;padding:14px;margin-bottom:16px;text-align:center">
                    <p style="margin:0 0 6px;font-size:.72rem;color:#8B949E;text-transform:uppercase;letter-spacing:.05em">Linha Digitável</p>
                    <p style="margin:0;font-family:'Courier New',monospace;font-size:.85rem;color:#00AEEF;letter-spacing:1px;word-break:break-all">${linhaDigitavel}</p>
                </div>` : ''}

                ${pdfUrl ? `
                <div style="text-align:center;margin:20px 0">
                    <a href="${pdfUrl}" style="display:inline-block;background:#00AEEF;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-size:.9rem;font-weight:600">📄 Baixar Boleto PDF</a>
                </div>` : ''}

                ${pixQrCode ? `
                <div style="background:#161B22;border:1px solid #30363D;border-radius:8px;padding:14px;margin-bottom:16px">
                    <p style="margin:0 0 6px;font-size:.72rem;color:#8B949E;text-transform:uppercase">Pix Copia e Cola</p>
                    <p style="margin:0;font-family:'Courier New',monospace;font-size:.72rem;color:#E6EDF3;word-break:break-all">${pixQrCode}</p>
                </div>` : ''}
            </div>
            <div style="padding:16px 30px;border-top:1px solid #30363D;font-size:.75rem;color:#484F58;text-align:center">
                Renostter Climatização — Soluções em Climatização e PMOC<br>
                Este é um e-mail automático. Em caso de dúvidas, entre em contato pelo CRM.
            </div>
        </div>`;

        const textFallback = `Renostter — Cobrança\n\nOlá ${clientName},\n\nValor: ${fmtVal(valor)}\nVencimento: ${fmtDate(vencimento)}\n${linhaDigitavel ? `Linha Digitável: ${linhaDigitavel}\n` : ''}${pdfUrl ? `PDF: ${pdfUrl}\n` : ''}`;

        if (this.smtpConfigured && this.transporter) {
            try {
                const info = await this.transporter.sendMail({
                    from: process.env.SMTP_FROM || process.env.SMTP_USER,
                    to,
                    subject,
                    text: textFallback,
                    html
                });
                console.log(`[NotificationService] E-mail enviado para ${to} — MessageID: ${info.messageId}`);
                return { success: true, messageId: info.messageId, mode: 'smtp' };
            } catch (error) {
                console.error(`[NotificationService] Falha no envio para ${to}:`, error.message);
                return { success: false, error: error.message, mode: 'smtp' };
            }
        } else {
            // Modo LOG — simula envio
            console.log(`[NotificationService] [LOG MODE] E-mail simulado:`);
            console.log(`  Para: ${to}`);
            console.log(`  Assunto: ${subject}`);
            console.log(`  Valor: ${fmtVal(valor)} | Vencimento: ${fmtDate(vencimento)}`);
            return { success: true, messageId: 'log_' + Date.now(), mode: 'log' };
        }
    }

    /**
     * Enviar lembrete de vencimento
     */
    async enviarLembrete({ to, clientName, valor, vencimento, diasRestantes, pdfUrl, linhaDigitavel }) {
        const fmtVal = v => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        return this.enviarCobranca({
            to, clientName, valor, vencimento, pdfUrl, linhaDigitavel,
            cobrancaId: `Lembrete: ${diasRestantes} dia(s) para o vencimento`
        });
    }
}

module.exports = NotificationService;
