/**
 * Approvals Router — Fluxo de Aprovação Financeira Administrativa
 *
 * Endpoints:
 *   GET  /api/approvals/pending          → Admin/Super listam pendentes (mesmo escopo)
 *   GET  /api/approvals/count            → Badge na sidebar
 *   GET  /api/approvals/:id              → Detalhe
 *   GET  /api/approvals?status=...       → Histórico filtrado (Admin/Super/Financeiro)
 *   POST /api/approvals                   → Criar manualmente (uso interno)
 *   POST /api/approvals/:id/approve      → Admin/Super aceitam valor original
 *   POST /api/approvals/:id/edit         → Admin/Super editam valor (precisam motivo)
 *   POST /api/approvals/:id/reject       → Admin/Super rejeitam (precisam motivo)
 *   POST /api/approvals/:id/escalate     → Sistema (cron) escalona PENDING antigas
 *   POST /api/cron/escalate              → Endpoint do cron job
 *
 * REGRA CORPORATIVA (a partir de 2026-07-05):
 *   - Admin e Superadmin têm **as mesmas permissões** neste fluxo.
 *   - Ambos decidem QUALQUER tier (admin, superadmin, compliance).
 *   - A diferença entre Admin e Superadmin é gerencial (usuários, regras de automação),
 *     não financeira.
 */

const express = require('express');
const crypto = require('crypto');
const { dbAll, dbGet, dbRun } = require('../database');
const { encrypt, decrypt } = require('../crypto');
const { requireRole } = require('../middleware/authJWT');
const router = express.Router();

const TIER_ORDER = { admin: 1, superadmin: 2, compliance: 3 };
const ADMIN_LIMIT = 1000; // até R$ 1k → admin; R$ 1k-5k → super; >R$ 5k → compliance

function calcTier(value) {
    if (value > 5000) return 'compliance';
    if (value > ADMIN_LIMIT) return 'superadmin';
    return 'admin';
}

function canDecide(requesterRole) {
    // Admin e Superadmin decidem qualquer tier — mesmas permissões
    return ['admin', 'superadmin'].includes(requesterRole);
}

function getAuditInfo(req) {
    return req.auditInfo || {
        ip: req.ip,
        userId: req.headers['x-user-id'] || 'anonymous',
        role: req.headers['x-user-role'] || 'guest'
    };
}

function authorizeAdmin(req, res, next) {
    const role = getAuditInfo(req).role;
    if (!['admin', 'superadmin'].includes(role)) {
        return res.status(403).json({ success: false, error: 'Requer permissão admin/superadmin' });
    }
    next();
}

function authorizeReader(req, res, next) {
    const role = getAuditInfo(req).role;
    if (!['admin', 'superadmin', 'financeiro'].includes(role)) {
        return res.status(403).json({ success: false, error: 'Acesso restrito' });
    }
    next();
}

/* ── Listar pendentes ── */
router.get('/pending', authorizeAdmin, async (req, res) => {
    try {
        // Admin e Superadmin veem o mesmo escopo: TODAS as pendências (mesmo direito).
        const sql = `SELECT * FROM pending_approvals WHERE status IN ('PENDING', 'ESCALATED') ORDER BY
            CASE status WHEN 'ESCALATED' THEN 0 ELSE 1 END,
            CASE tier WHEN 'compliance' THEN 0 WHEN 'superadmin' THEN 1 ELSE 2 END,
            created_at ASC`;
        const data = await dbAll(sql);
        res.json({ success: true, data });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/* ── Contagem (badge sidebar) ── */
router.get('/count', authorizeReader, async (req, res) => {
    try {
        // Admin e Financeiro veem o mesmo escopo: pendências ativas (qualquer tier).
        const sql = `SELECT COUNT(*) as count FROM pending_approvals WHERE status IN ('PENDING', 'ESCALATED')`;
        const row = await dbGet(sql);
        res.json({ success: true, count: row.count });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/* ── Detalhe ── */
router.get('/:id', authorizeReader, async (req, res) => {
    try {
        const row = await dbGet(`SELECT * FROM pending_approvals WHERE id = ?`, [req.params.id]);
        if (!row) return res.status(404).json({ success: false, error: 'Não encontrado' });
        res.json({ success: true, data: row });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/* ── Histórico filtrado ── */
router.get('/', authorizeReader, async (req, res) => {
    try {
        const { status, tier, clientId, limit = 50, offset = 0 } = req.query;
        let sql = `SELECT * FROM pending_approvals WHERE 1=1`;
        const params = [];
        if (status) { sql += ' AND status = ?'; params.push(status); }
        if (tier) { sql += ' AND tier = ?'; params.push(tier); }
        if (clientId) { sql += ' AND client_id = ?'; params.push(clientId); }
        sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));
        const data = await dbAll(sql, params);
        res.json({ success: true, data });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/* ── Criar manualmente (uso interno ou via endpoint de teste) ── */
router.post('/', authorizeAdmin, async (req, res) => {
    try {
        const audit = getAuditInfo(req);
        const { ticketId, clientId, value, reason } = req.body;
        if (!clientId || !value) {
            return res.status(400).json({ success: false, error: 'clientId e value são obrigatórios' });
        }
        const id = 'appr_' + crypto.randomUUID().split('-')[0];
        const tier = calcTier(value);
        await dbRun(
            `INSERT INTO pending_approvals
             (id, ticket_id, client_id, requested_by, request_value, original_value,
              requires_approval_reason, tier, status)
             VALUES (?,?,?,?,?,?,?,?,'PENDING')`,
            [id, ticketId, clientId, audit.userId, value, value, reason || 'manual', tier]
        );
        res.json({ success: true, id, tier });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/* ── Aprovar (valor original) ── */
router.post('/:id/approve', authorizeAdmin, async (req, res) => {
    try {
        const audit = getAuditInfo(req);
        const pa = await dbGet(`SELECT * FROM pending_approvals WHERE id = ?`, [req.params.id]);
        if (!pa) return res.status(404).json({ success: false, error: 'Não encontrado' });
        if (!['PENDING', 'ESCALATED'].includes(pa.status)) {
            return res.status(400).json({ success: false, error: 'Esta pendência não pode mais ser aprovada (status: ' + pa.status + ')' });
        }
        if (!canDecide(audit.role)) {
            return res.status(403).json({
                success: false,
                error: 'Apenas Admin ou Superadmin pode decidir esta pendência.'
            });
        }
        await dbRun(
            `UPDATE pending_approvals
             SET status = 'APPROVED',
                 decided_by = ?,
                 decided_at = CURRENT_TIMESTAMP,
                 decision_type = 'approve',
                 decision_reason = ?
             WHERE id = ?`,
            [audit.userId, req.body.reason || null, req.params.id]
        );
        // Audit log
        await dbRun(
            `INSERT INTO logs_auditoria (user_id, user_name, acao, entidade, entidade_id, detalhes_json, ip_address)
             VALUES (?, '', 'aprovar_pendencia', 'pending_approval', ?, ?, ?)`,
            [audit.userId, pa.id, JSON.stringify({ value: pa.request_value, tier: pa.tier, role: audit.role }), audit.ip]
        );
        res.json({ success: true, status: 'APPROVED', next: 'Liberar geração de boleto no CobrancaManager' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/* ── Editar valor (precisa motivo) ── */
router.post('/:id/edit', authorizeAdmin, async (req, res) => {
    try {
        const audit = getAuditInfo(req);
        const pa = await dbGet(`SELECT * FROM pending_approvals WHERE id = ?`, [req.params.id]);
        if (!pa) return res.status(404).json({ success: false, error: 'Não encontrado' });
        if (!['PENDING', 'ESCALATED'].includes(pa.status)) {
            return res.status(400).json({ success: false, error: 'Esta pendência não pode mais ser editada' });
        }
        if (!canDecide(audit.role)) {
            return res.status(403).json({ success: false, error: 'Permissão insuficiente — apenas Admin ou Superadmin pode editar.' });
        }
        const newValue = parseFloat(req.body.newValue);
        const reason = (req.body.reason || '').trim();
        if (isNaN(newValue) || newValue <= 0) {
            return res.status(400).json({ success: false, error: 'newValue inválido' });
        }
        // Compliance: motivo ≥ 200 chars
        const tierNew = calcTier(newValue);
        const minReasonLength = (tierNew === 'compliance' || pa.tier === 'compliance') ? 200 : 30;
        if (reason.length < minReasonLength) {
            return res.status(400).json({
                success: false,
                error: `Motivo deve ter pelo menos ${minReasonLength} caracteres para este tier. Atual: ${reason.length}`
            });
        }
        await dbRun(
            `UPDATE pending_approvals
             SET status = 'APPROVED',
                 decided_by = ?,
                 decided_at = CURRENT_TIMESTAMP,
                 decision_type = 'edit',
                 decision_reason = ?,
                 new_value = ?
             WHERE id = ?`,
            [audit.userId, reason, newValue, req.params.id]
        );
        await dbRun(
            `INSERT INTO logs_auditoria (user_id, user_name, acao, entidade, entidade_id, detalhes_json, ip_address)
             VALUES (?, '', 'editar_valor_pendencia', 'pending_approval', ?, ?, ?)`,
            [audit.userId, pa.id, JSON.stringify({ original: pa.request_value, novo: newValue, motivo: reason }), audit.ip]
        );
        res.json({ success: true, status: 'APPROVED', oldValue: pa.request_value, newValue, newTier: tierNew });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/* ── Rejeitar (precisa motivo) ── */
router.post('/:id/reject', authorizeAdmin, async (req, res) => {
    try {
        const audit = getAuditInfo(req);
        const pa = await dbGet(`SELECT * FROM pending_approvals WHERE id = ?`, [req.params.id]);
        if (!pa) return res.status(404).json({ success: false, error: 'Não encontrado' });
        if (!['PENDING', 'ESCALATED'].includes(pa.status)) {
            return res.status(400).json({ success: false, error: 'Esta pendência não pode mais ser rejeitada' });
        }
        if (!canDecide(audit.role)) {
            return res.status(403).json({ success: false, error: 'Permissão insuficiente — apenas Admin ou Superadmin pode rejeitar.' });
        }
        const reason = (req.body.reason || '').trim();
        if (reason.length < 20) {
            return res.status(400).json({ success: false, error: 'Motivo de rejeição deve ter pelo menos 20 caracteres' });
        }
        await dbRun(
            `UPDATE pending_approvals
             SET status = 'REJECTED',
                 decided_by = ?,
                 decided_at = CURRENT_TIMESTAMP,
                 decision_type = 'reject',
                 decision_reason = ?
             WHERE id = ?`,
            [audit.userId, reason, req.params.id]
        );
        await dbRun(
            `INSERT INTO logs_auditoria (user_id, user_name, acao, entidade, entidade_id, detalhes_json, ip_address)
             VALUES (?, '', 'rejeitar_pendencia', 'pending_approval', ?, ?, ?)`,
            [audit.userId, pa.id, JSON.stringify({ motivo: reason }), audit.ip]
        );
        res.json({ success: true, status: 'REJECTED' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/* ── Escalonar (uso interno do cron: PENDING → ESCALATED após 24h) ── */
router.post('/:id/escalate', authorizeAdmin, async (req, res) => {
    try {
        const pa = await dbGet(`SELECT * FROM pending_approvals WHERE id = ?`, [req.params.id]);
        if (!pa) return res.status(404).json({ success: false, error: 'Não encontrado' });
        if (pa.status !== 'PENDING') {
            return res.status(400).json({ success: false, error: 'Só PENDING pode ser escalada' });
        }
        const newTier = calcTier(pa.request_value) === 'compliance' ? 'compliance' : 'superadmin';
        await dbRun(
            `UPDATE pending_approvals SET status = 'ESCALATED', tier = ? WHERE id = ?`,
            [newTier, req.params.id]
        );
        res.json({ success: true, status: 'ESCALATED', tier: newTier });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/* ── Cron: escalar e expirar ── */
// SECURITY HARDENING 2 — V02: cron usa requireRole (futuramente apiKeyAuth)
router.post('/cron-escalate', requireRole('admin', 'superadmin'), async (req, res) => {
    try {
        // Escalar: PENDING > 24h → ESCALATED com tier superadmin
        const escalated = await dbRun(
            `UPDATE pending_approvals
             SET status = 'ESCALATED',
                 tier = 'superadmin'
             WHERE status = 'PENDING'
               AND tier = 'admin'
               AND created_at < datetime('now', '-24 hours')`
        );

        // Expirar: PENDING/ESCALATED > 7 dias → EXPIRED
        const expired = await dbRun(
            `UPDATE pending_approvals
             SET status = 'EXPIRED'
             WHERE status IN ('PENDING', 'ESCALATED')
               AND created_at < datetime('now', '-7 days')`
        );

        res.json({
            success: true,
            escalated: escalated.changes || 0,
            expired: expired.changes || 0
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
