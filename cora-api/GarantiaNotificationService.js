/**
 * GarantiaNotificationService — Notificações do módulo de garantia
 * Estende NotificationService com templates de garantia.
 */

const nodemailer = require('nodemailer');

class GarantiaNotificationService {
    constructor() {
        this.smtpConfigured = !!(process.env.SMTP_HOST && process.env.SMTP_USER);
        this.transporter = null;
        if (this.smtpConfigured) {
            this.transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: parseInt(process.env.SMTP_PORT) || 587,
                secure: (process.env.SMTP_PORT === '465'),
                auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
            });
        }
    }

    // ── 1. E-mail: Reabertura aprovada ──
    async enviarReaberturaAprovada({ to, clienteNome, chamadoId, titulo, motivo, prazoGarantia, diasRestantes, tecnicoEmail }) {
        const subject = `✅ Seu chamado foi reaberto em garantia — Renostter`;
        const html = `
        <div style="font-family:'Inter',Arial,sans-serif;max-width:600px;margin:0 auto;background:#0D1117;color:#E6EDF3;border-radius:12px;overflow:hidden;border:1px solid #30363D">
            <div style="background:linear-gradient(135deg,#0D1B2A,#161B22);padding:24px 30px;border-bottom:1px solid rgba(0,174,239,.2)">
                <h1 style="margin:0;font-size:1.2rem;color:#00AEEF">Renostter Climatização</h1>
                <p style="margin:4px 0 0;font-size:.85rem;color:#8B949E">Chamado reaberto em garantia</p>
            </div>
            <div style="padding:24px 30px">
                <p style="margin:0 0 16px;font-size:.95rem">Olá <strong>${clienteNome}</strong>,</p>
                <p style="margin:0 0 20px;font-size:.9rem;color:#8B949E">Informamos que o chamado <strong>#${chamadoId}</strong> foi reaberto em garantia.</p>

                <div style="background:#161B22;border:1px solid #30363D;border-radius:8px;padding:16px;margin-bottom:20px">
                    <table style="width:100%;border-collapse:collapse;font-size:.9rem">
                        <tr><td style="padding:6px 0;color:#8B949E">Chamado:</td><td style="padding:6px 0;text-align:right;font-weight:600">#${chamadoId}</td></tr>
                        <tr><td style="padding:6px 0;color:#8B949E">Motivo:</td><td style="padding:6px 0;text-align:right;font-weight:600">${motivo}</td></tr>
                        <tr><td style="padding:6px 0;color:#8B949E">Prazo Garantia:</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#22c55e">${prazoGarantia} (${diasRestantes} dias restantes)</td></tr>
                    </table>
                </div>

                <div style="background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.3);border-radius:8px;padding:14px;margin-bottom:20px">
                    <p style="margin:0;font-size:.9rem"><strong>🔧 Próximos passos:</strong></p>
                    <p style="margin:6px 0 0;font-size:.85rem;color:#8B949E">Um técnico entrará em contato em até 24h para agendar a visita.</p>
                </div>
            </div>
            <div style="padding:16px 30px;border-top:1px solid #30363D;font-size:.75rem;color:#484F58;text-align:center">
                Renostter Climatização — Soluções em Climatização e PMOC
            </div>
        </div>`;

        return this._enviar({ to, subject, html });
    }

    // ── 2. E-mail: Alerta de vencimento de garantia ──
    async enviarAlertaVencimento({ to, clienteNome, chamadoId, titulo, dataFimGarantia, diasRestantes }) {
        const subject = `⚠️ Garantia próxima do vencimento — #${chamadoId} — Renostter`;
        const html = `
        <div style="font-family:'Inter',Arial,sans-serif;max-width:600px;margin:0 auto;background:#0D1117;color:#E6EDF3;border-radius:12px;overflow:hidden;border:1px solid #30363D">
            <div style="background:linear-gradient(135deg,#1a0a00,#161B22);padding:24px 30px;border-bottom:1px solid rgba(255,165,0,.2)">
                <h1 style="margin:0;font-size:1.2rem;color:#FFA500">⚠️ Garantia Próxima do Vencimento</h1>
                <p style="margin:4px 0 0;font-size:.85rem;color:#8B949E">Renostter Climatização</p>
            </div>
            <div style="padding:24px 30px">
                <p style="margin:0 0 16px;font-size:.95rem">Olá <strong>${clienteNome}</strong>,</p>
                <p style="margin:0 0 20px;font-size:.9rem;color:#8B949E">Atenção: a garantia do chamado <strong>#${chamadoId}</strong> vence em <strong style="color:#FFA500">${diasRestantes} dia(s)</strong>.</p>

                <div style="background:#161B22;border:1px solid #30363D;border-radius:8px;padding:16px;margin-bottom:20px">
                    <table style="width:100%;border-collapse:collapse;font-size:.9rem">
                        <tr><td style="padding:6px 0;color:#8B949E">Chamado:</td><td style="padding:6px 0;text-align:right;font-weight:600">#${chamadoId}</td></tr>
                        <tr><td style="padding:6px 0;color:#8B949E">Descrição:</td><td style="padding:6px 0;text-align:right;font-size:.85rem">${titulo}</td></tr>
                        <tr><td style="padding:6px 0;color:#8B949E">Fim da Garantia:</td><td style="padding:6px 0;text-align:right;font-weight:700;color:#FFA500">${dataFimGarantia}</td></tr>
                    </table>
                </div>

                <div style="background:rgba(255,165,0,.1);border:1px solid rgba(255,165,0,.3);border-radius:8px;padding:14px;margin-bottom:16px">
                    <p style="margin:0;font-size:.85rem"><strong>Recomendação:</strong> Se o equipamento apresentou algum problema, solicite uma visita agora antes do vencimento. Após o prazo, uma nova cobrança poderá ser necessária.</p>
                </div>
            </div>
            <div style="padding:16px 30px;border-top:1px solid #30363D;font-size:.75rem;color:#484F58;text-align:center">
                Renostter Climatização — Soluções em Climatização e PMOC
            </div>
        </div>`;

        return this._enviar({ to, subject, html });
    }

    // ── 3. Notificação interna (para técnicos/admins) ──
    formatarNotificacaoInterna({ tipo, chamadoId, clienteNome, motivo, prazoGarantia, diasRestantes }) {
        const emojis = { REABERTURA: '🔄', VENCIMENTO: '⚠️', EXPIRADO: '🔴' };
        const emoji = emojis[tipo] || '📋';
        const linhas = [
            `${emoji} NOVA ${tipo} DE GARANTIA`,
            `Chamado: #${chamadoId}`,
            `Cliente: ${clienteNome}`,
            tipo === 'REABERTURA' ? `Motivo: ${motivo}` : `Dias restantes: ${diasRestantes}`,
            `Prazo Garantia: ${prazoGarantia}`,
            `Ações: ✓ Atribuir técnico  ✓ Agendar visita  ✓ Verificar histórico`
        ];
        return linhas.join('\n');
    }

    _enviar({ to, subject, html }) {
        if (this.smtpConfigured && this.transporter) {
            return this.transporter.sendMail({
                from: process.env.SMTP_FROM || process.env.SMTP_USER,
                to,
                subject,
                html,
                text: html.replace(/<[^>]+>/g, '')
            }).then(info => ({ success: true, messageId: info.messageId, mode: 'smtp' }))
              .catch(err => ({ success: false, error: err.message, mode: 'smtp' }));
        } else {
            console.log(`[GarantiaNotification] [LOG] Para: ${to} | Assunto: ${subject}`);
            return Promise.resolve({ success: true, messageId: 'log_' + Date.now(), mode: 'log' });
        }
    }
}

module.exports = { GarantiaNotificationService };
