/**
 * Webhook — Autentique
 *
 * Sprint 8 — Recebe notificações da Autentique
 *
 * POST /api/webhooks/autentique
 * Headers:
 *   X-Autentique-Signature: HMAC-SHA256 do body
 *   X-Autentique-Event: signed | refused | expired
 *
 * Eventos:
 *   - document.signed    → todos assinaram
 *   - document.refused   → alguém recusou
 *   - document.expired   → envelope expirou
 *
 * Configurar no painel da Autentique:
 *   Painel → API → Webhooks → URL: https://api.renostter.com/api/webhooks/autentique
 *   Eventos: document.signed, document.refused, document.expired
 *   Secret: AUTENTIQUE_WEBHOOK_SECRET (no .env)
 *
 * IMPORTANTE: este webhook NÃO é público — usa HMAC igual ao webhook da Cora.
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const ContractAutomation = require('../services/ContractAutomation');

const WEBHOOK_SECRET = process.env.AUTENTIQUE_WEBHOOK_SECRET || null;

/**
 * Verifica a assinatura HMAC do webhook.
 */
function verifyAutentiqueSignature(rawBody, signature) {
    if (!WEBHOOK_SECRET) {
        // Se secret não configurado em prod, rejeita
        if (process.env.NODE_ENV === 'production') {
            return { ok: false, error: 'AUTENTIQUE_WEBHOOK_SECRET não configurado' };
        }
        // Em dev, permite sem verificação
        return { ok: true, dev: true };
    }
    if (!signature) return { ok: false, error: 'Signature ausente' };

    const expected = crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');
    const provided = signature.replace(/^sha256=/, '').trim();

    const expectedBuf = Buffer.from(expected, 'hex');
    const providedBuf = Buffer.from(provided, 'hex');
    if (expectedBuf.length !== providedBuf.length) return { ok: false, error: 'Tamanho inválido' };
    if (!crypto.timingSafeEqual(expectedBuf, providedBuf)) return { ok: false, error: 'Assinatura inválida' };
    return { ok: true };
}

/**
 * POST /api/webhooks/autentique
 */
router.post('/autentique', async (req, res) => {
    const rawBody = req.rawBody || JSON.stringify(req.body);
    const sigHeader = req.headers['x-autentique-signature'] || req.headers['x-signature'];
    const event = req.headers['x-autentique-event'] || req.body?.event || 'unknown';

    // 1. Verifica assinatura
    const verify = verifyAutentiqueSignature(rawBody, sigHeader);
    if (!verify.ok) {
        return res.status(401).json({ success: false, error: verify.error, code: 'INVALID_SIGNATURE' });
    }

    // 2. Log do webhook
    try {
        const { dbRun } = require('../database');
        await dbRun(
            `INSERT INTO webhooks_recebidos (provider, event_type, raw_payload, http_status, received_at)
             VALUES ('autentique', ?, ?, 200, datetime('now'))`,
            [event, rawBody.substring(0, 5000)]
        );
    } catch (_) {}

    // 3. Processa evento
    const envelopeId = req.body?.document?.id || req.body?.id || req.body?.envelope_id;
    if (!envelopeId) {
        return res.status(400).json({ success: false, error: 'envelope_id ausente no payload', code: 'MISSING_ENVELOPE' });
    }

    try {
        if (event === 'document.signed' || event === 'signed') {
            const result = await ContractAutomation.processWebhook(envelopeId, req.body);
            return res.json(result);
        } else if (event === 'document.refused' || event === 'refused') {
            await ContractAutomation.audit(envelopeId, 'CONTRACT_REFUSED', { payload: req.body });
            return res.json({ success: true, status: 'REFUSED' });
        } else if (event === 'document.expired' || event === 'expired') {
            await ContractAutomation.audit(envelopeId, 'CONTRACT_EXPIRED', { payload: req.body });
            return res.json({ success: true, status: 'EXPIRED' });
        } else {
            // Evento desconhecido — loga mas responde OK
            return res.json({ success: true, status: 'IGNORED', event });
        }
    } catch (e) {
        console.error('[Webhook Autentique] Erro:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
