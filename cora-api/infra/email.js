/**
 * Email Service — Resend wrapper
 *
 * Sprint 8 — Email transacional + automação de contratos
 *
 * Setup:
 *   1. Criar conta em https://resend.com
 *   2. Verificar domínio (renostter.com.br) — adiciona registros DNS
 *   3. Criar API key em https://resend.com/api-keys
 *   4. Definir RESEND_API_KEY no .env
 *   5. (Opcional) Definir RESEND_FROM como "Renostter <noreply@renostter.com.br>"
 *
 * Free tier: 3.000 e-mails/mês, 100/dia. Pro: $20/mês para 50.000.
 *
 * Vantagens vs SMTP tradicional:
 *   - API REST, sem precisar configurar SMTP
 *   - Tracking de abertura/clique built-in
 *   - Webhooks de bounce/complaint
 *   - Servidor em São Paulo (sa-east-1) — latência baixa no Brasil
 */

// Node 20+ tem fetch nativo — sem dependência extra
const fetch = globalThis.fetch;

const RESEND_API_KEY = process.env.RESEND_API_KEY || null;
const RESEND_FROM = process.env.RESEND_FROM || 'Renostter CRM <onboarding@resend.dev>';
const RESEND_REPLY_TO = process.env.RESEND_REPLY_TO || 'suporte@renostter.com.br';

const IS_PROD = process.env.NODE_ENV === 'production';

function isEmailAvailable() {
    return !!RESEND_API_KEY;
}

/**
 * Envia um e-mail.
 *
 * @param {Object} opts
 * @param {string|string[]} opts.to - destinatário(s)
 * @param {string} opts.subject - assunto
 * @param {string} [opts.html] - corpo HTML
 * @param {string} [opts.text] - corpo plain text (fallback)
 * @param {string|string[]} [opts.cc] - cópia
 * @param {string|string[]} [opts.bcc] - cópia oculta
 * @param {string|string[]} [opts.replyTo] - reply-to
 * @param {Array<{filename: string, content: string|Buffer}>} [opts.attachments] - anexos
 * @param {Object} [opts.tags] - tags para tracking
 * @returns {Promise<{success: boolean, id?: string, error?: string}>}
 */
async function sendEmail(opts) {
    if (!isEmailAvailable()) {
        if (IS_PROD) {
            throw new Error('RESEND_API_KEY não configurado em produção');
        }
        console.log('[Email] (dev mode) E-mail que seria enviado:');
        console.log(`  Para: ${Array.isArray(opts.to) ? opts.to.join(', ') : opts.to}`);
        console.log(`  Assunto: ${opts.subject}`);
        console.log(`  Tamanho HTML: ${(opts.html || '').length} chars`);
        return { success: true, id: 'dev-' + Date.now(), mode: 'dev' };
    }

    const body = {
        from: RESEND_FROM,
        to: Array.isArray(opts.to) ? opts.to : [opts.to],
        subject: opts.subject,
        ...(opts.html ? { html: opts.html } : {}),
        ...(opts.text ? { text: opts.text } : {}),
        ...(opts.cc ? { cc: Array.isArray(opts.cc) ? opts.cc : [opts.cc] } : {}),
        ...(opts.bcc ? { bcc: Array.isArray(opts.bcc) ? opts.bcc : [opts.bcc] } : {}),
        reply_to: opts.replyTo || RESEND_REPLY_TO,
        ...(opts.attachments ? {
            attachments: opts.attachments.map(a => ({
                filename: a.filename,
                content: typeof a.content === 'string'
                    ? Buffer.from(a.content).toString('base64')
                    : a.content.toString('base64'),
            })),
        } : {}),
        ...(opts.tags ? {
            tags: Object.entries(opts.tags).map(([name, value]) => ({ name, value })),
        } : {}),
    };

    try {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        const data = await res.json();
        if (!res.ok) {
            console.error('[Email] Resend error:', data);
            return { success: false, error: data.message || data.error || `HTTP ${res.status}`, code: data.statusCode };
        }
        return { success: true, id: data.id };
    } catch (e) {
        console.error('[Email] Falha no envio:', e.message);
        return { success: false, error: e.message };
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATES PRÉ-DEFINIDOS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Template: contrato enviado para assinatura.
 */
async function sendContractForSignature({ to, clientName, contractTitle, signatureLink, expiresAt }) {
    const fmtDate = d => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
    const subject = `📝 Renostter — Contrato "${contractTitle}" aguardando sua assinatura`;

    const html = `
<div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;background:#0D1117;color:#E6EDF3;border-radius:12px;overflow:hidden;border:1px solid #30363D">
  <div style="background:linear-gradient(135deg,#0D1B2A,#161B22);padding:24px 30px;border-bottom:1px solid rgba(0,174,239,.2)">
    <h1 style="margin:0;font-size:1.3rem;color:#00AEEF">Renostter Climatização</h1>
    <p style="margin:4px 0 0;font-size:.85rem;color:#8B949E">Contrato aguardando assinatura</p>
  </div>
  <div style="padding:24px 30px">
    <p style="margin:0 0 12px;font-size:.95rem">Olá <strong>${clientName}</strong>,</p>
    <p style="margin:0 0 18px;font-size:.9rem;color:#8B949E">
      Você recebeu um contrato para assinatura digital. É rápido, seguro e tem validade jurídica (Lei 14.063/2020).
    </p>
    <div style="background:#161B22;border:1px solid #30363D;border-radius:8px;padding:16px;margin-bottom:20px">
      <p style="margin:0 0 6px;font-size:.8rem;color:#8B949E">CONTRATO</p>
      <p style="margin:0;font-size:1.1rem;font-weight:600">${contractTitle}</p>
      ${expiresAt ? `<p style="margin:8px 0 0;font-size:.8rem;color:#f59e0b">⏰ Expira em ${fmtDate(expiresAt)}</p>` : ''}
    </div>
    <a href="${signatureLink}"
       style="display:block;background:#00AEEF;color:#0D1117;text-align:center;padding:14px 20px;border-radius:8px;text-decoration:none;font-weight:700;font-size:1rem;margin-bottom:20px">
      ✍️ Assinar contrato
    </a>
    <p style="margin:0;font-size:.75rem;color:#8B949E;line-height:1.5">
      Se o botão não funcionar, copie e cole este link:<br>
      <a href="${signatureLink}" style="color:#00AEEF;word-break:break-all">${signatureLink}</a>
    </p>
  </div>
  <div style="padding:16px 30px;border-top:1px solid #30363D;background:#161B22">
    <p style="margin:0;font-size:.7rem;color:#8B949E;text-align:center">
      Dúvidas? Fale com a gente: ${RESEND_REPLY_TO}
    </p>
  </div>
</div>`.trim();

    return sendEmail({ to, subject, html, tags: { type: 'contract-signature', contract: contractTitle } });
}

/**
 * Template: contrato assinado (confirmação).
 */
async function sendContractSigned({ to, clientName, contractTitle, signedAt, downloadUrl }) {
    const subject = `✅ Renostter — Contrato "${contractTitle}" assinado com sucesso`;

    const html = `
<div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;background:#0D1117;color:#E6EDF3;border-radius:12px;overflow:hidden;border:1px solid #30363D">
  <div style="background:linear-gradient(135deg,#0D1B2A,#161B22);padding:24px 30px;border-bottom:1px solid rgba(34,197,94,.3)">
    <h1 style="margin:0;font-size:1.3rem;color:#22c55e">✓ Contrato Assinado</h1>
  </div>
  <div style="padding:24px 30px">
    <p style="margin:0 0 12px">Olá <strong>${clientName}</strong>,</p>
    <p style="margin:0 0 18px;color:#8B949E">
      Confirmamos o recebimento da sua assinatura no contrato <strong>${contractTitle}</strong>.
    </p>
    <div style="background:#161B22;border:1px solid #22c55e;border-radius:8px;padding:16px;margin-bottom:20px">
      <p style="margin:0 0 6px;font-size:.8rem;color:#8B949E">ASSINADO EM</p>
      <p style="margin:0;font-size:1rem">${new Date(signedAt).toLocaleString('pt-BR')}</p>
    </div>
    ${downloadUrl ? `
    <a href="${downloadUrl}"
       style="display:block;background:#22c55e;color:#0D1117;text-align:center;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:700;margin-bottom:16px">
      ⬇️ Baixar contrato assinado
    </a>` : ''}
    <p style="margin:0;font-size:.85rem;color:#8B949E">
      Guarde este e-mail como comprovante. Uma cópia também está disponível no portal do cliente.
    </p>
  </div>
</div>`.trim();

    return sendEmail({ to, subject, html, tags: { type: 'contract-signed' } });
}

/**
 * Template: lembrete de assinatura.
 */
async function sendSignatureReminder({ to, clientName, contractTitle, signatureLink, daysWaiting }) {
    const subject = `🔔 Renostter — Lembrete: contrato "${contractTitle}" aguardando assinatura`;

    const html = `
<div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;background:#0D1117;color:#E6EDF3;border-radius:12px;overflow:hidden;border:1px solid #30363D">
  <div style="padding:24px 30px">
    <p style="margin:0 0 12px">Olá <strong>${clientName}</strong>,</p>
    <p style="margin:0 0 18px;color:#8B949E">
      Notamos que o contrato <strong>${contractTitle}</strong> ainda está aguardando sua assinatura há ${daysWaiting} dia(s).
    </p>
    <a href="${signatureLink}"
       style="display:block;background:#f59e0b;color:#0D1117;text-align:center;padding:14px 20px;border-radius:8px;text-decoration:none;font-weight:700;margin-bottom:16px">
      ✍️ Assinar agora
    </a>
  </div>
</div>`.trim();

    return sendEmail({ to, subject, html, tags: { type: 'signature-reminder' } });
}

/**
 * Template: renovação de contrato (60 dias antes).
 */
async function sendContractRenewal({ to, clientName, contractTitle, contractEnd, newContractLink }) {
    const subject = `🔄 Renostter — Seu contrato "${contractTitle}" vence em 60 dias`;
    const fmtDate = d => new Date(d).toLocaleDateString('pt-BR');

    const html = `
<div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;background:#0D1117;color:#E6EDF3;border-radius:12px;overflow:hidden;border:1px solid #30363D">
  <div style="padding:24px 30px">
    <p style="margin:0 0 12px">Olá <strong>${clientName}</strong>,</p>
    <p style="margin:0 0 18px;color:#8B949E">
      Seu contrato <strong>${contractTitle}</strong> vence em <strong style="color:#f59e0b">${fmtDate(contractEnd)}</strong>.
      Que tal renovar agora? Mantém a mesma cobertura e condições.
    </p>
    <a href="${newContractLink}"
       style="display:block;background:#00AEEF;color:#0D1117;text-align:center;padding:14px 20px;border-radius:8px;text-decoration:none;font-weight:700;margin-bottom:16px">
      🔄 Renovar contrato
    </a>
    <p style="margin:0;font-size:.8rem;color:#8B949E">
      Se quiser conversar sobre as condições, responde este e-mail.
    </p>
  </div>
</div>`.trim();

    return sendEmail({ to, subject, html, tags: { type: 'contract-renewal' } });
}

module.exports = {
    isEmailAvailable,
    sendEmail,
    sendContractForSignature,
    sendContractSigned,
    sendSignatureReminder,
    sendContractRenewal,
    RESEND_FROM,
    RESEND_REPLY_TO,
};
