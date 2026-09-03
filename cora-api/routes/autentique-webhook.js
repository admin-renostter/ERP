/**
 * Webhook — Autentique
 *
 * Sprint 21 — Recebe notificações de mudança de status dos documentos
 * (document_signed, document_rejected, document_canceled)
 *
 * Endpoint: POST /api/webhooks/autentique
 *
 * Autenticação: configurada no painel Autentique (webhook secret).
 * Em modo dev (sem secret configurado), aceita sem auth para testes.
 *
 * IMPORTANTE: Para produção, configure AUTENTIQUE_WEBHOOK_SECRET no .env
 * e valide o header X-Autentique-Signature.
 */

const express = require('express');
const router = express.Router();
const { dbRun, dbGet } = require('../database');

const WEBHOOK_SECRET = process.env.AUTENTIQUE_WEBHOOK_SECRET || null;

/**
 * Mapeia evento do Autentique → status interno
 */
function mapEventToStatus(event, payload) {
    const e = (event || '').toLowerCase();
    if (e.includes('signed') || e === 'document_signed') return 'assinado';
    if (e.includes('rejected') || e === 'document_rejected') return 'rejeitado';
    if (e.includes('canceled') || e.includes('cancelled') || e === 'document_canceled') return 'cancelado';
    if (e.includes('created') || e.includes('sent') || e === 'document_created') return 'enviado';
    return null;
}

router.post('/', express.json({ limit: '1mb' }), async (req, res) => {
    try {
        // 1. Validar assinatura se secret configurado
        if (WEBHOOK_SECRET) {
            const sig = req.headers['x-autentique-signature'] || req.headers['x-signature'] || '';
            const expected = require('crypto')
                .createHmac('sha256', WEBHOOK_SECRET)
                .update(JSON.stringify(req.body))
                .digest('hex');
            if (sig !== expected && sig !== `sha256=${expected}`) {
                console.warn('[Autentique:Webhook] Assinatura inválida');
                return res.status(401).json({ success: false, error: 'Invalid signature' });
            }
        }

        // 2. Extrair dados
        const body = req.body || {};
        const event = body.event || body.type || body.action;
        const document = body.document || body.data || body;
        const documentId = document.id || document.document_id;
        const signerInfo = body.signer || null;

        if (!documentId) {
            console.warn('[Autentique:Webhook] Sem document.id no payload');
            return res.json({ success: true, message: 'no document id' });
        }

        // 3. Mapear status
        const newStatus = mapEventToStatus(event, body);
        if (!newStatus) {
            console.log(`[Autentique:Webhook] Evento ignorado: ${event}`);
            return res.json({ success: true, message: 'event ignored', event });
        }

        // 4. Atualizar contrato_gerado
        const result = await dbRun(
            `UPDATE contratos_gerados
                SET status = ?,
                    data_assinatura = CASE WHEN ? = 'assinado' THEN datetime('now') ELSE data_assinatura END,
                    updated_at = datetime('now')
              WHERE autentique_document_id = ?`,
            [newStatus, newStatus, String(documentId)]
        );

        if (result.changes > 0) {
            console.log(`[Autentique:Webhook] ${event} → ${newStatus} (doc ${documentId})`);

            // Audit log
            try {
                const { dbRun: dbR } = require('../database');
                await dbR(
                    `INSERT INTO logs_auditoria (entidade, entidade_id, acao, user_id, ip_address, detalhes_json, created_at)
                     VALUES ('autentique_webhook', ?, ?, 'system', ?, ?, datetime('now'))`,
                    [String(documentId), newStatus, req.ip,
                     JSON.stringify({ event, signer: signerInfo?.email, document_name: document.name })]
                );
            } catch (_) {}
        } else {
            console.log(`[Autentique:Webhook] Nenhum contrato_gerado encontrado para doc ${documentId}`);
        }

        res.json({ success: true, processed: result.changes, status: newStatus });
    } catch (e) {
        console.error('[Autentique:Webhook] Erro:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * GET /api/webhooks/autentique/health
 * Healthcheck do webhook
 */
router.get('/health', (req, res) => {
    res.json({
        success: true,
        mode: WEBHOOK_SECRET ? 'live' : 'dev (sem secret — não use em produção)',
        events_supported: ['document_signed', 'document_rejected', 'document_canceled', 'document_created'],
    });
});

module.exports = router;
