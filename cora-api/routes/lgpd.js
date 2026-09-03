/**
 * /api/lgpd — Endpoints REST de LGPD / Compliance (Sprint 17)
 *
 * Endpoints admin (requer role admin+):
 *   GET    /api/lgpd/dsar                      → lista todos DSARs
 *   GET    /api/lgpd/dsar/:id                  → detalhe
 *   PATCH  /api/lgpd/dsar/:id                  → atualiza status
 *   POST   /api/lgpd/export/:clienteId         → exporta dados (JSON download)
 *   POST   /api/lgpd/anonymize/:clienteId      → anonimiza cliente
 *   POST   /api/lgpd/delete/:clienteId         → deleta cliente (direito ao esquecimento)
 *   GET    /api/lgpd/audit                     → lista logs de acesso
 *   GET    /api/lgpd/policies                  → lista políticas de retenção
 *   POST   /api/lgpd/policies/run              → executa política
 *
 * Endpoints do titular (via portal):
 *   POST   /api/lgpd/dsar (já tem /api/portal/lgpd/dsar)
 *   GET    /api/portal/lgpd/me                 → meus dados (acesso + portabilidade)
 *   POST   /api/portal/lgpd/consent            → gerenciar consentimentos
 */

const express = require('express');
const router = express.Router();
const LGPDService = require('../services/LGPDService');
const { requireRole } = require('../middleware/authJWT');

function asyncHandler(fn) {
    return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
}

// ════════════════════════════════════════════════════════════════
// DSAR (admin)
// ════════════════════════════════════════════════════════════════

router.get('/dsar', requireRole('admin', 'superadmin'), asyncHandler(async (req, res) => {
    const dsars = await LGPDService.listDSARs({
        status: req.query.status,
        clienteId: req.query.clienteId,
        limit: req.query.limit,
    });
    return res.json({ success: true, data: dsars, total: dsars.length });
}));

router.get('/dsar/:id', requireRole('admin', 'superadmin'), asyncHandler(async (req, res) => {
    const dsar = await LGPDService.getDSAR(req.params.id);
    if (!dsar) return res.status(404).json({ success: false, error: 'DSAR não encontrado' });
    return res.json({ success: true, data: dsar });
}));

router.patch('/dsar/:id', requireRole('admin', 'superadmin'), asyncHandler(async (req, res) => {
    const { status, atribuidoPara, resposta, arquivoExportUrl } = req.body || {};
    await LGPDService.updateDSARStatus(req.params.id, {
        status, atribuidoPara, resposta, arquivoExportUrl,
    });
    return res.json({ success: true });
}));

// ════════════════════════════════════════════════════════════════
// EXPORTAÇÃO (Portabilidade - LGPD art. 18, V)
// ════════════════════════════════════════════════════════════════

router.post('/export/:clienteId', requireRole('admin', 'superadmin'), asyncHandler(async (req, res) => {
    const { clienteId } = req.params;
    const format = req.query.format || 'inline';  // 'inline' (JSON) ou 'file' (download)

    // Audit do acesso
    await LGPDService.auditAccess({
        userId: req.auditInfo.userId,
        userRole: req.auditInfo.role,
        clienteId,
        acao: 'export',
        entidade: 'cliente',
        entidadeId: clienteId,
        ip: getClientIp(req),
        userAgent: req.headers['user-agent'],
        motivo: 'Exportação LGPD solicitada por admin',
    });

    if (format === 'file') {
        const result = await LGPDService.exportClienteDataToFile(clienteId);
        if (result.filepath) {
            return res.download(result.filepath, result.filename);
        }
        // Fallback: inline
    }

    const data = await LGPDService.exportClienteData(clienteId);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="lgpd_export_${clienteId}_${Date.now()}.json"`);
    return res.send(JSON.stringify(data, null, 2));
}));

// ════════════════════════════════════════════════════════════════
// ANONIMIZAÇÃO
// ════════════════════════════════════════════════════════════════

router.post('/anonymize/:clienteId', requireRole('admin', 'superadmin'), asyncHandler(async (req, res) => {
    const { clienteId } = req.params;
    const { motivo } = req.body || {};
    const result = await LGPDService.anonymizeCliente(clienteId, {
        actorUserId: req.auditInfo.userId,
    });
    return res.json({ success: true, data: result, motivo });
}));

// ════════════════════════════════════════════════════════════════
// EXCLUSÃO (Direito ao Esquecimento - LGPD art. 18, VI)
// ════════════════════════════════════════════════════════════════

router.post('/delete/:clienteId', requireRole('superadmin'), asyncHandler(async (req, res) => {
    const { clienteId } = req.params;
    const { motivo, hard = true } = req.body || {};

    if (hard) {
        // Confirmação extra para hard delete
        const { confirmar } = req.body || {};
        if (confirmar !== 'CONFIRMAR_EXCLUSAO_PERMANENTE') {
            return res.status(400).json({
                success: false,
                error: 'Para hard delete, envie { confirmar: "CONFIRMAR_EXCLUSAO_PERMANENTE" }',
                code: 'CONFIRMATION_REQUIRED',
            });
        }
    }

    const result = await LGPDService.deleteCliente(clienteId, {
        actorUserId: req.auditInfo.userId,
        motivo,
        hard,
    });
    return res.json({ success: true, data: result });
}));

// ════════════════════════════════════════════════════════════════
// AUDIT LOGS
// ════════════════════════════════════════════════════════════════

router.get('/audit', requireRole('admin', 'superadmin'), asyncHandler(async (req, res) => {
    const logs = await LGPDService.getAuditLogs({
        clienteId: req.query.clienteId,
        userId: req.query.userId,
        limite: req.query.limit,
    });
    return res.json({ success: true, data: logs, total: logs.length });
}));

// ════════════════════════════════════════════════════════════════
// POLÍTICA DE RETENÇÃO
// ════════════════════════════════════════════════════════════════

router.get('/policies', requireRole('admin', 'superadmin'), asyncHandler(async (req, res) => {
    const policies = await LGPDService.getPoliticaRetencao();
    return res.json({ success: true, data: policies });
}));

router.patch('/policies/:entidade', requireRole('admin', 'superadmin'), asyncHandler(async (req, res) => {
    await LGPDService.updatePoliticaRetencao(req.params.entidade, req.body || {});
    return res.json({ success: true });
}));

router.post('/policies/run', requireRole('superadmin'), asyncHandler(async (req, res) => {
    const result = await LGPDService.runRetentionPolicy();
    return res.json({ success: true, data: result });
}));

module.exports = router;
