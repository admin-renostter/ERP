/**
 * Routes — Lembretes automáticos
 *
 * Sprint 9
 *
 * POST /api/reminders/run-daily       Executa TODOS os lembretes (manual)
 * POST /api/reminders/signature       Só lembretes de assinatura
 * POST /api/reminders/renewals        Só renovações
 * POST /api/reminders/boletos         Só boletos
 * GET  /api/reminders/status          Status do cron + estatísticas
 */

const express = require('express');
const router = express.Router();
const { requireRole } = require('../middleware/authJWT');
const ReminderService = require('../services/ReminderService');
const dailyRemindersCron = require('../jobs/dailyReminders');

/**
 * POST /api/reminders/run-daily
 * Roda a rotina completa. Útil pra teste ou execução forçada.
 */
router.post('/run-daily', requireRole('admin', 'superadmin'), async (req, res) => {
    try {
        const result = await ReminderService.runDaily();
        res.json({ success: true, ...result });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * POST /api/reminders/signature
 */
router.post('/signature', requireRole('admin', 'superadmin'), async (req, res) => {
    try {
        const result = await ReminderService.processSignatureReminders();
        res.json({ success: true, ...result });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * POST /api/reminders/renewals
 */
router.post('/renewals', requireRole('admin', 'superadmin'), async (req, res) => {
    try {
        const result = await ReminderService.processContractRenewals();
        res.json({ success: true, ...result });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * POST /api/reminders/boletos
 */
router.post('/boletos', requireRole('admin', 'superadmin'), async (req, res) => {
    try {
        const result = await ReminderService.processBoletoReminders();
        res.json({ success: true, ...result });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * GET /api/reminders/status
 * Informa se o cron está ativo e estatísticas rápidas.
 */
router.get('/status', requireRole('admin', 'superadmin', 'financeiro'), async (req, res) => {
    const { dbGet } = require('../database');
    let lastRun = null;
    try {
        const r = await dbGet(
            `SELECT created_at, detalhes_json FROM logs_auditoria
             WHERE entidade = 'reminder' AND acao = 'DAILY_RUN'
             ORDER BY created_at DESC LIMIT 1`
        );
        if (r) lastRun = { at: r.created_at };
    } catch (_) {}

    // Conta pendentes
    let pending = {};
    try {
        const { dbAll } = require('../database');
        const sigPending = await dbAll(
            `SELECT COUNT(*) as n FROM contratos
             WHERE observacoes LIKE '%envelope_id=%'
             AND status != 'Ativo'
             AND created_at < datetime('now', '-1 day')`
        );
        const renewPending = await dbAll(
            `SELECT COUNT(*) as n FROM contratos
             WHERE data_fim IS NOT NULL
             AND status = 'Ativo'
             AND date(data_fim) IN (date('now', '+30 days'), date('now', '+60 days'))`
        );
        const overdue = await dbAll(
            `SELECT COUNT(*) as n FROM cobrancas
             WHERE data_vencimento < date('now')
             AND status IN ('PENDING', 'OPEN')`
        );
        pending = {
            signature: sigPending[0]?.n || 0,
            renewal: renewPending[0]?.n || 0,
            overdue: overdue[0]?.n || 0,
        };
    } catch (_) {}

    res.json({
        success: true,
        cron: {
            enabled: dailyRemindersCron.CRON_ENABLED,
            hour: parseInt(process.env.REMINDERS_HOUR || '8', 10),
            timezone: process.env.TZ || 'America/Sao_Paulo',
        },
        lastRun,
        pending,
        integrations: {
            whatsapp: require('../WhatsAppService').isWhatsAppAvailable(),
            email: require('../infra/email').isEmailAvailable(),
            signature: require('../infra/signature').isSignatureAvailable(),
        },
    });
});

module.exports = router;
