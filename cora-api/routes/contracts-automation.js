/**
 * Routes — Automação de Contratos
 *
 * Sprint 8 — Endpoints REST
 *
 * POST   /api/contracts/:id/send-for-signature   Envia contrato para assinatura
 * GET    /api/contracts/:id/signature-status     Status do envelope
 * POST   /api/contracts/:id/send-reminders       Reenvia lembrete
 * POST   /api/contracts/process-renewals         (admin) Processa renovações
 * GET    /api/contracts/templates                Lista templates disponíveis
 */

const express = require('express');
const router = express.Router();
const { requireRole } = require('../middleware/authJWT');
const ContractAutomation = require('../services/ContractAutomation');
const signature = require('../infra/signature');
const email = require('../infra/email');

/**
 * POST /api/contracts/:id/send-for-signature
 * Body: {
 *   template?: "manutencao" | "pmoc" | "instalacao" | "emergencial",
 *   signers: [{ name, email, action?: 'SIGN'|'APPROVE' }],
 *   message?: "...",
 *   deadlineDays?: 15,
 *   sandbox?: false
 * }
 */
router.post('/:id/send-for-signature', requireRole('admin', 'superadmin', 'financeiro'), async (req, res) => {
    const { id } = req.params;
    const { template, signers, message, deadlineDays, sandbox } = req.body || {};

    if (!signers || !Array.isArray(signers) || signers.length === 0) {
        return res.status(400).json({ success: false, error: 'signers é obrigatório (array)', code: 'MISSING_SIGNERS' });
    }
    for (const s of signers) {
        if (!s.name || !s.email) {
            return res.status(400).json({ success: false, error: 'Cada signatário precisa de name e email', code: 'INVALID_SIGNER' });
        }
    }

    const result = await ContractAutomation.sendForSignature(id, {
        template,
        signers,
        message,
        deadlineDays,
        sandbox: sandbox === true,
    });

    const status = result.success ? 200 : (result.error?.includes('não encontrado') ? 404 : 500);
    res.status(status).json(result);
});

/**
 * GET /api/contracts/:id/signature-status
 * Retorna o status atual do envelope Autentique.
 */
router.get('/:id/signature-status', requireRole('admin', 'superadmin', 'financeiro', 'tecnico'), async (req, res) => {
    const { id } = req.params;

    // Busca o envelope_id salvo nas observações
    const { dbGet } = require('../database');
    const contrato = await dbGet('SELECT id, observacoes FROM contratos WHERE id = ?', [id]);
    if (!contrato) {
        return res.status(404).json({ success: false, error: 'Contrato não encontrado' });
    }

    const match = contrato.observacoes?.match(/envelope_id=([a-f0-9]+)/i);
    if (!match) {
        return res.status(404).json({ success: false, error: 'Contrato ainda não foi enviado para assinatura' });
    }
    const envelopeId = match[1];

    if (!signature.isSignatureAvailable()) {
        return res.status(503).json({ success: false, error: 'Autentique não configurado', code: 'SIGNATURE_NOT_CONFIGURED' });
    }

    try {
        const envelope = await signature.getDocument(envelopeId);
        const signers = envelope.signers_history?.map(h => ({
            name: h.user?.name,
            email: h.user?.email,
            deliveryMethod: h.user?.delivery_method,
            signed: !!h.user?.archived_at,
            signedAt: h.user?.archived_at,
        })) || [];

        const allSigned = signers.length > 0 && signers.every(s => s.signed);
        return res.json({
            success: true,
            contractId: id,
            envelopeId,
            status: allSigned ? 'ASSINADO' : (signers.some(s => s.signed) ? 'PARCIAL' : 'AGUARDANDO'),
            sandbox: envelope.sandbox,
            deadlineAt: envelope.deadline_at,
            signers,
            createdAt: envelope.created_at,
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message, code: 'GET_ENVELOPE_FAILED' });
    }
});

/**
 * POST /api/contracts/:id/send-reminders
 * Reenvia e-mail de lembrete para signatários pendentes.
 */
router.post('/:id/send-reminders', requireRole('admin', 'superadmin', 'financeiro'), async (req, res) => {
    const result = await ContractAutomation.sendReminders(req.params.id);
    res.json(result);
});

/**
 * POST /api/contracts/process-renewals
 * (admin) Processa renovações automáticas (60 dias antes do fim).
 */
router.post('/process-renewals', requireRole('admin', 'superadmin'), async (req, res) => {
    const results = await ContractAutomation.processRenewals();
    res.json({ success: true, processed: results.length, results });
});

/**
 * GET /api/contracts/templates
 * Lista os templates de contrato disponíveis.
 * SECURITY HARDENING 2 — V02
 */
router.get('/templates', requireRole('admin', 'superadmin', 'financeiro', 'tecnico'), (req, res) => {
    const fs = require('fs');
    const path = require('path');
    const templatesDir = path.resolve(__dirname, '..', 'templates', 'contracts');

    let templates = [];
    if (fs.existsSync(templatesDir)) {
        templates = fs.readdirSync(templatesDir)
            .filter(f => f.endsWith('.html'))
            .map(f => f.replace('.html', ''));
    } else {
        // Templates inline (fallback)
        templates = ['manutencao', 'pmoc', 'instalacao', 'emergencial'];
    }
    res.json({ success: true, templates });
});

/**
 * GET /api/contracts/integrations/status
 * Informa quais integrações estão configuradas.
 * SECURITY HARDENING 2 — V02
 */
router.get('/integrations/status', requireRole('admin', 'superadmin'), (req, res) => {
    res.json({
        success: true,
        email: {
            available: email.isEmailAvailable(),
            from: email.RESEND_FROM,
        },
        signature: {
            available: signature.isSignatureAvailable(),
            sandbox: signature.IS_SANDBOX,
        },
    });
});

module.exports = router;
