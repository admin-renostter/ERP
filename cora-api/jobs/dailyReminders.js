/**
 * Cron job — Rotina diária de lembretes
 *
 * Sprint 9 — node-cron setup
 *
 * Horários (BRT / UTC-3):
 *   08:00 → Lembrete de assinatura D+2, D+5, D+7
 *   08:30 → Renovação 60d / 30d antes
 *   09:00 → Boleto D-5, D-1 (prévio)
 *   09:30 → Boleto vencido D+1, D+3, D+7
 *   10:00 → Webhook Autentique: reenvia lembretes nativos (D+10)
 *
 * Desabilitar em dev: REMINDERS_CRON_ENABLED=false
 * Forçar execução manual: POST /api/reminders/run-daily
 */

const cron = require('node-cron');
const ReminderService = require('../services/ReminderService');

const CRON_ENABLED = process.env.REMINDERS_CRON_ENABLED !== 'false';
const REMINDERS_HOUR = parseInt(process.env.REMINDERS_HOUR || '8', 10);
const REMINDERS_TZ = process.env.TZ || 'America/Sao_Paulo';

let scheduled = null;

/**
 * Inicia o scheduler. Chame no boot do app.
 */
function start() {
    if (!CRON_ENABLED) {
        console.log('[Cron] Lembretes automáticos desabilitados (REMINDERS_CRON_ENABLED=false)');
        return;
    }

    // Roda todo dia às 8h (BRT)
    // Cron format: "min hora dia mês dia-semana"
    const expr = `0 ${REMINDERS_HOUR} * * *`;

    console.log(`[Cron] Agendando lembretes diários às ${REMINDERS_HOUR}h (${REMINDERS_TZ})`);

    scheduled = cron.schedule(expr, async () => {
        try {
            await ReminderService.runDaily();
        } catch (e) {
            console.error('[Cron] Erro na rotina diária:', e.message);
        }
    }, {
        timezone: REMINDERS_TZ,
    });

    console.log('[Cron] ✓ Lembretes agendados');
}

/**
 * Para o scheduler.
 */
function stop() {
    if (scheduled) {
        scheduled.stop();
        scheduled = null;
        console.log('[Cron] Scheduler parado');
    }
}

module.exports = { start, stop, CRON_ENABLED };
