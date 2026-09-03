/**
 * WhatsAppService — Mensageria via WhatsApp
 *
 * Sprint 9 — Substitui o mock por providers reais
 *
 * Suporta:
 *   - UAZAPI (padrão para usuários BR) — https://api.uazapi.com
 *   - Z-API — https://api.z-api.io
 *   - Twilio (internacional)
 *   - Mock (dev only)
 *
 * Variáveis de ambiente:
 *   WHATSAPP_PROVIDER=uazapi  # uazapi | zapi | twilio | mock
 *   WHATSAPP_INSTANCE=Renostter-1
 *   WHATSAPP_TOKEN=<token>
 *   WHATSAPP_BASE_URL=https://api.uazapi.com  # ou seu endpoint customizado
 *   WHATSAPP_FROM=5511958918398  # número de origem (DDI+DDD+Número)
 *
 * Custo médio:
 *   - UAZAPI: R$ 50-150/mês (instância + 1000 mensagens inclusas)
 *   - Z-API: R$ 60-200/mês
 *   - Twilio: $0.005 por mensagem
 */

const fetch = globalThis.fetch;

const WHATSAPP_PROVIDER = (process.env.WHATSAPP_PROVIDER || 'mock').toLowerCase();
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || null;
const WHATSAPP_INSTANCE = process.env.WHATSAPP_INSTANCE || null;
const WHATSAPP_BASE_URL = process.env.WHATSAPP_BASE_URL || 'https://api.uazapi.com';
const WHATSAPP_FROM = process.env.WHATSAPP_FROM || null;

const IS_PROD = process.env.NODE_ENV === 'production';

/**
 * Formata número para o padrão WhatsApp (DDI+DDD+Número, só dígitos).
 * Aceita: "(11) 95891-8398", "+5511958918398", "5511958918398"
 */
function formatPhone(phone) {
    if (!phone) return null;
    const digits = String(phone).replace(/\D/g, '');
    if (!digits) return null;
    // Se não tem DDI (55), adiciona
    return digits.startsWith('55') ? digits : '55' + digits;
}

/**
 * Verifica se o provider está configurado e funcional.
 */
function isWhatsAppAvailable() {
    if (WHATSAPP_PROVIDER === 'mock') return true; // mock sempre disponível
    return !!WHATSAPP_TOKEN;
}

/**
 ╔════════════════════════════════════════════════════════════════════╗
 ║ PROVIDERS                                                        ║
 ╚════════════════════════════════════════════════════════════════════╝/

/**
 * UAZAPI — provider primário (Brasil)
 * Documentação: https://docs.uazapi.com/
 *
 * Endpoint principal: POST /send/text
 * Body: { number, text, delay, readchat, readmessages, etc }
 */
async function sendViaUAZAPI({ to, text, mediaUrl }) {
    const url = `${WHATSAPP_BASE_URL}/send/text`;
    const body = {
        number: to,
        text,
        delay: 1000,  // 1s delay (anti-ban)
        readchat: true,
    };
    if (mediaUrl) {
        body.media_url = mediaUrl;
    }

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': WHATSAPP_TOKEN,
        },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`UAZAPI error ${res.status}: ${errBody.substring(0, 200)}`);
    }

    return res.json();
}

/**
 * Z-API — provider alternativo (Brasil)
 * Documentação: https://developer.z-api.io/
 *
 * Endpoint: POST /instances/{instance}/token/{token}/send-text
 */
async function sendViaZAPI({ to, text, mediaUrl }) {
    if (!WHATSAPP_INSTANCE) {
        throw new Error('WHATSAPP_INSTANCE não configurado (necessário para Z-API)');
    }
    const url = `https://api.z-api.io/instances/${WHATSAPP_INSTANCE}/token/${WHATSAPP_TOKEN}/send-text`;
    const body = {
        phone: to,
        message: text,
    };
    if (mediaUrl) {
        body.image = mediaUrl;
    }

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Z-API error ${res.status}: ${errBody.substring(0, 200)}`);
    }

    return res.json();
}

/**
 * Twilio — provider internacional
 * Documentação: https://www.twilio.com/docs/whatsapp/api
 *
 * Requer: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM
 */
async function sendViaTwilio({ to, text, mediaUrl }) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_WHATSAPP_FROM || WHATSAPP_FROM;

    if (!accountSid || !authToken) {
        throw new Error('TWILIO_ACCOUNT_SID e TWILIO_AUTH_TOKEN obrigatórios');
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const body = new URLSearchParams({
        To: `whatsapp:+${to}`,
        From: `whatsapp:${from}`,
        Body: text,
    });
    if (mediaUrl) {
        body.append('MediaUrl', mediaUrl);
    }

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
    });

    if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Twilio error ${res.status}: ${errBody.substring(0, 200)}`);
    }

    return res.json();
}

/**
 * Mock — fallback dev (apenas loga)
 */
async function sendViaMock({ to, text }) {
    console.log(`[WhatsApp MOCK] Para: ${to}`);
    console.log(`[WhatsApp MOCK] Texto: ${text.substring(0, 120)}${text.length > 120 ? '...' : ''}`);
    await new Promise(r => setTimeout(r, 200));
    return {
        success: true,
        messageId: 'mock_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        mode: 'mock',
    };
}

/**
 ╔════════════════════════════════════════════════════════════════════╗
 ║ API PÚBLICA                                                      ║
 ╚════════════════════════════════════════════════════════════════════╝/

/**
 * Envia mensagem WhatsApp.
 *
 * @param {Object} opts
 * @param {string} opts.to - número (qualquer formato, será normalizado)
 * @param {string} opts.text - mensagem (max 4096 chars)
 * @param {string} [opts.mediaUrl] - URL de imagem/PDF
 * @returns {Promise<{success, messageId, provider}>}
 */
async function sendMessage({ to, text, mediaUrl }) {
    const phone = formatPhone(to);
    if (!phone) {
        return { success: false, error: 'Número inválido', code: 'INVALID_PHONE' };
    }
    if (!text && !mediaUrl) {
        return { success: false, error: 'Mensagem vazia', code: 'EMPTY_MESSAGE' };
    }

    if (text && text.length > 4096) {
        text = text.substring(0, 4090) + '...';
    }

    if (WHATSAPP_PROVIDER === 'mock' && !IS_PROD) {
        return sendViaMock({ to: phone, text, mediaUrl });
    }

    if (!isWhatsAppAvailable()) {
        if (IS_PROD) {
            return { success: false, error: 'WhatsApp não configurado em produção', code: 'NOT_CONFIGURED' };
        }
        return sendViaMock({ to: phone, text, mediaUrl });
    }

    try {
        let result;
        switch (WHATSAPP_PROVIDER) {
            case 'uazapi':  result = await sendViaUAZAPI({ to: phone, text, mediaUrl }); break;
            case 'zapi':    result = await sendViaZAPI({ to: phone, text, mediaUrl });   break;
            case 'twilio':  result = await sendViaTwilio({ to: phone, text, mediaUrl }); break;
            default:
                return { success: false, error: `Provider desconhecido: ${WHATSAPP_PROVIDER}`, code: 'UNKNOWN_PROVIDER' };
        }
        return { success: true, ...result, provider: WHATSAPP_PROVIDER };
    } catch (e) {
        console.error('[WhatsApp] Falha:', e.message);
        return { success: false, error: e.message, provider: WHATSAPP_PROVIDER };
    }
}

// ═══════════════════════════════════════════════════════════════════════
// TEMPLATES
// ═══════════════════════════════════════════════════════════════════════

/**
 * Template: contrato aguardando assinatura (com link)
 */
async function sendContractPendingSignature({ to, clientName, contractTitle, signatureLink, daysWaiting }) {
    const text = `🔔 Olá *${clientName}*! Seu contrato "${contractTitle}" está aguardando assinatura há ${daysWaiting || 1} dia(s).\n\n` +
        `Para assinar, clique aqui:\n${signatureLink}\n\n` +
        `Qualquer dúvida, responde esta mensagem.`;
    return sendMessage({ to, text });
}

/**
 * Template: lembrete de vencimento de boleto (D-5, D-1)
 */
async function sendBoletoReminder({ to, clientName, valor, vencimento, pdfUrl, linhaDigitavel }) {
    const fmtVal = Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const fmtDate = vencimento ? new Date(vencimento + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
    const text = `Olá *${clientName}*! 📋\n\n` +
        `Sua fatura *${fmtVal}* vence em *${fmtDate}*.\n\n` +
        (linhaDigitavel ? `Linha digitável: \`${linhaDigitavel}\`\n\n` : '') +
        (pdfUrl ? `📄 Baixar boleto: ${pdfUrl}\n\n` : '') +
        `_Renostter Climatização_`;
    return sendMessage({ to, text, mediaUrl: pdfUrl });
}

/**
 * Template: boleto vencido (D+1, D+3, D+7)
 */
async function sendBoletoOverdue({ to, clientName, valor, vencimento, pdfUrl, diasAtraso }) {
    const fmtVal = Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const text = `⚠️ *${clientName}*, sua fatura de *${fmtVal}* venceu há *${diasAtraso} dia(s)* (vencimento: ${vencimento}).\n\n` +
        `Para evitar bloqueio do serviço, regularize pelo link:\n${pdfUrl}\n\n` +
        `Se já pagou, desconsere esta mensagem.`;
    return sendMessage({ to, text, mediaUrl: pdfUrl });
}

/**
 * Template: contrato assinado (confirmação)
 */
async function sendContractSignedConfirmation({ to, clientName, contractTitle, downloadUrl }) {
    const text = `✅ *${clientName}*, confirmamos sua assinatura no contrato *${contractTitle}*.\n\n` +
        `O contrato já está ativo. ${downloadUrl ? `Cópia: ${downloadUrl}` : ''}`;
    return sendMessage({ to, text });
}

/**
 * Template: aviso de visita técnica amanhã
 */
async function sendVisitTomorrowReminder({ to, clientName, tecnicoNome, periodo, endereco }) {
    const text = `📅 *${clientName}*, sua visita técnica está agendada para *amanhã*.\n\n` +
        `Técnico: ${tecnicoNome}\n` +
        `Período: ${periodo}\n` +
        `Endereço: ${endereco}\n\n` +
        `Se precisar reagendar, responde esta mensagem.`;
    return sendMessage({ to, text });
}

module.exports = {
    isWhatsAppAvailable,
    sendMessage,
    sendContractPendingSignature,
    sendBoletoReminder,
    sendBoletoOverdue,
    sendContractSignedConfirmation,
    sendVisitTomorrowReminder,
    formatPhone,
    WHATSAPP_PROVIDER,
    WHATSAPP_FROM,
};
