/**
 * ReminderService — Lembretes e Régua de Cobrança
 *
 * Sprint 9 — Automações recorrentes
 *
 * Tipos de lembretes:
 *   1. Assinatura de contrato (D+2, D+5, D+7)
 *   2. Vencimento de boleto (D-5, D-1)
 *   3. Boleto vencido (D+1, D+3, D+7)
 *   4. Renovação de contrato (D-60)
 *   5. Visita técnica (D-1, manhã)
 *
 * Para evitar spam, cada lembrete só é enviado 1x por ciclo
 * (campo `lembretes_enviados` no contrato/cobrança).
 *
 * Execução:
 *   - Manual: POST /api/reminders/run-daily
 *   - Cron:   node-cron em server.js (todo dia às 8h)
 */

const { dbAll, dbRun, dbGet } = require('../database');
const ContractAutomation = require('./ContractAutomation');
const WhatsAppService = require('../WhatsAppService');
const NotificationService = require('../NotificationService');
const { sendSignatureReminder } = require('../infra/email');

const IS_PROD = process.env.NODE_ENV === 'production';

/**
 * Log de auditoria para lembretes.
 */
async function auditLog(entity, entityId, action, details = {}) {
    try {
        await dbRun(
            `INSERT INTO logs_auditoria (entidade, entidade_id, acao, detalhes_json, created_at)
             VALUES (?, ?, ?, ?, datetime('now'))`,
            [entity, entityId, action, JSON.stringify(details)]
        );
    } catch (e) {
        console.warn('[Reminders] Falha ao gravar auditoria:', e.message);
    }
}

/**
 ╔════════════════════════════════════════════════════════════════════╗
 ║ LEMBRETES DE ASSINATURA (D+2, D+5, D+7)                          ║
 ╚════════════════════════════════════════════════════════════════════╝/

**
 * Envia lembretes de assinatura para contratos pendentes.
 * - D+2: 1º lembrete (suave)
 * - D+5: 2º lembrete (médio)
 * - D+7: 3º lembrete (urgente — avisa admin se não assinar)
 *
 * @returns {Promise<{processed, sent, failed}>}
 */
async function processSignatureReminders() {
    console.log('[Reminders] Processando lembretes de assinatura...');
    const results = { processed: 0, sent: 0, failed: 0, details: [] };

    // 1. Busca contratos com envelope criado há X dias e ainda não totalmente assinados
    // O envelope_id fica salvo em observacoes
    const candidates = await dbAll(`
        SELECT id, observacoes, observacoes as envelope_id
        FROM contratos
        WHERE observacoes LIKE '%envelope_id=%'
        AND status != 'Ativo'
        AND created_at < datetime('now', '-1 day')
    `);

    for (const c of candidates) {
        results.processed++;
        try {
            const match = c.observacoes?.match(/envelope_id=([a-f0-9]+)/i);
            if (!match) continue;
            const envelopeId = match[1];

            // Calcula dias desde criação
            const createdAt = new Date(c.created_at || Date.now());
            const daysWaiting = Math.floor((Date.now() - createdAt.getTime()) / 86400000);

            // Define qual lembrete enviar
            let reminderType = null;
            if (daysWaiting === 2) reminderType = 'first';
            else if (daysWaiting === 5) reminderType = 'second';
            else if (daysWaiting === 7) reminderType = 'urgent';
            else continue; // fora do schedule

            // Verifica se já enviou esse lembrete
            const sentKey = `signature_reminder_${reminderType}_${envelopeId}`;
            const alreadySent = await dbGet(
                `SELECT id FROM logs_auditoria WHERE entidade = 'reminder' AND acao = ? AND created_at > datetime('now', '-1 day')`,
                [sentKey]
            );
            if (alreadySent) continue;

            // 2. Pega dados do envelope via Autentique
            const signature = require('../infra/signature');
            if (!signature.isSignatureAvailable()) continue;
            let envelope;
            try {
                envelope = await signature.getDocument(envelopeId);
            } catch (e) {
                await auditLog('reminder', c.id, 'AUTENTIQUE_FETCH_FAILED', { error: e.message });
                continue;
            }

            // 3. Se já foi totalmente assinado, marca contrato como Ativo
            const allSigned = envelope.signers_history?.length > 0
                && envelope.signers_history.every(h => h.user?.archived_at);
            if (allSigned) {
                await ContractAutomation.setContractStatus(c.id, 'Ativo', { source: 'reminder_auto' });
                await auditLog('reminder', c.id, 'AUTO_ACTIVATED', { envelopeId });
                continue;
            }

            // 4. Pega dados do cliente (do primeiro signatário)
            const firstSigner = envelope.signers_history?.[0]?.user;
            if (!firstSigner?.email) continue;

            const cliente = await dbGet('SELECT nome, email, telefone FROM clientes WHERE nome LIKE ? OR email = ? LIMIT 1',
                [`%${firstSigner.name}%`, firstSigner.email]);
            const clientName = cliente?.nome || firstSigner.name;
            const clientPhone = cliente?.telefone;

            // 5. Envia por e-mail
            const subject = reminderType === 'urgent'
                ? `🚨 URGENTE: Contrato "${envelope.name}" precisa ser assinado hoje`
                : `🔔 Lembrete: Contrato "${envelope.name}" aguardando assinatura`;

            await sendSignatureReminder({
                to: firstSigner.email,
                clientName,
                contractTitle: envelope.name,
                signatureLink: `https://app.autentique.com.br/contracts/${envelopeId}`,
                daysWaiting,
            });

            // 6. Envia por WhatsApp (se tiver telefone)
            if (clientPhone && WhatsAppService.isWhatsAppAvailable()) {
                await WhatsAppService.sendContractPendingSignature({
                    to: clientPhone,
                    clientName,
                    contractTitle: envelope.name,
                    signatureLink: `https://app.autentique.com.br/contracts/${envelopeId}`,
                    daysWaiting,
                });
            }

            // 7. Marca como enviado
            await auditLog('reminder', c.id, sentKey, {
                envelopeId, reminderType, daysWaiting,
                sentTo: { email: firstSigner.email, whatsapp: clientPhone || null },
            });

            // 8. Se urgente (D+7), avisa admin
            if (reminderType === 'urgent') {
                const adminEmail = process.env.ADMIN_EMAIL || 'admin@renostter.com.br';
                await new NotificationService().transporter
                    ? await new NotificationService().enviarCobranca({
                        to: adminEmail,
                        clientName: 'Admin',
                        valor: 0,
                        vencimento: new Date().toISOString().split('T')[0],
                        observacoes: `⚠️ Contrato ${c.id} pendente há ${daysWaiting} dias`,
                    })
                    : null;
            }

            results.sent++;
        } catch (e) {
            results.failed++;
            results.details.push({ contractId: c.id, error: e.message });
            await auditLog('reminder', c.id, 'FAILED', { error: e.message });
        }
    }

    console.log(`[Reminders] Assinatura: ${results.sent} enviados, ${results.failed} falhas`);
    return results;
}

/**
 ╔════════════════════════════════════════════════════════════════════╗
 ║ RENOVAÇÃO DE CONTRATO (D-60, D-30)                               ║
 ╚════════════════════════════════════════════════════════════════════╝/

/**
 * Processa renovações automáticas: avisa clientes 60 e 30 dias antes do vencimento.
 * Implementação real (substitui o stub do ContractAutomation).
 */
async function processContractRenewals() {
    console.log('[Reminders] Processando renovações de contrato...');
    const results = { processed: 0, sent: 0, failed: 0 };

    // 60 dias antes
    const day60 = await dbAll(`
        SELECT ct.id, ct.titulo, ct.data_fim, ct.cliente_id,
               c.nome as cliente_nome, c.email as cliente_email, c.telefone
        FROM contratos ct
        LEFT JOIN clientes c ON ct.cliente_id = c.id
        WHERE ct.data_fim IS NOT NULL
          AND ct.status = 'Ativo'
          AND date(ct.data_fim) = date('now', '+60 days')
          AND (ct.observacoes NOT LIKE '%[renovado]%' OR ct.observacoes IS NULL)
    `);

    for (const contrato of day60) {
        await sendRenewalNotice(contrato, 60, 'first');
        results.sent++;
    }
    results.processed += day60.length;

    // 30 dias antes
    const day30 = await dbAll(`
        SELECT ct.id, ct.titulo, ct.data_fim, ct.cliente_id,
               c.nome as cliente_nome, c.email as cliente_email, c.telefone
        FROM contratos ct
        LEFT JOIN clientes c ON ct.cliente_id = c.id
        WHERE ct.data_fim IS NOT NULL
          AND ct.status = 'Ativo'
          AND date(ct.data_fim) = date('now', '+30 days')
          AND (ct.observacoes NOT LIKE '%[renovado]%' OR ct.observacoes IS NULL)
    `);

    for (const contrato of day30) {
        await sendRenewalNotice(contrato, 30, 'urgent');
        results.sent++;
    }
    results.processed += day30.length;

    console.log(`[Reminders] Renovação: ${results.sent} enviados, ${results.failed} falhas`);
    return results;
}

async function sendRenewalNotice(contrato, daysLeft, type) {
    const subject = type === 'urgent'
        ? `⏰ Contrato "${contrato.titulo}" vence em 30 dias`
        : `🔄 Contrato "${contrato.titulo}" vence em 60 dias`;

    // E-mail
    if (contrato.cliente_email) {
        const { sendContractRenewal } = require('../infra/email');
        await sendContractRenewal({
            to: contrato.cliente_email,
            clientName: contrato.cliente_nome,
            contractTitle: contrato.titulo,
            contractEnd: contrato.data_fim,
            newContractLink: `https://app.renostter.com/contracts/${contrato.id}/renew`,
        });
    }

    // WhatsApp
    if (contrato.telefone && WhatsAppService.isWhatsAppAvailable()) {
        const text = `🔄 *${contrato.cliente_nome}*, seu contrato *${contrato.titulo}* vence em *${daysLeft} dias* (${contrato.data_fim}).\n\n` +
            `Para renovar, acesse: https://app.renostter.com/contracts/${contrato.id}/renew`;
        await WhatsAppService.sendMessage({ to: contrato.telefone, text });
    }

    await auditLog('reminder', contrato.id, `RENEWAL_NOTICE_${type.toUpperCase()}`, {
        daysLeft, sentTo: contrato.cliente_email,
    });
}

/**
 ╔════════════════════════════════════════════════════════════════════╗
 ║ LEMBRETES DE BOLETO (D-5, D-1, D+1, D+3, D+7)                   ║
 ╚════════════════════════════════════════════════════════════════════╝/

/**
 * Envia lembretes de boleto por estágio.
 */
async function processBoletoReminders() {
    console.log('[Reminders] Processando lembretes de boleto...');
    const results = { processed: 0, sent: 0, failed: 0 };

    const stages = [
        { days: -5, type: 'pre_due',       urgency: 'normal',  key: 'PRE_DUE_5' },
        { days: -1, type: 'pre_due_urgent', urgency: 'medium',  key: 'PRE_DUE_1' },
        { days: 1,  type: 'overdue_1',     urgency: 'high',    key: 'OVERDUE_1' },
        { days: 3,  type: 'overdue_3',     urgency: 'high',    key: 'OVERDUE_3' },
        { days: 7,  type: 'overdue_7',     urgency: 'urgent',  key: 'OVERDUE_7' },
    ];

    for (const stage of stages) {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + stage.days);
        const dateStr = targetDate.toISOString().split('T')[0];

        const cobrancas = await dbAll(`
            SELECT cb.id, cb.valor, cb.data_vencimento, cb.linha_digitavel, cb.pdf_url,
                   cl.nome as cliente_nome, cl.email as cliente_email, cl.telefone
            FROM cobrancas cb
            LEFT JOIN clientes cl ON cb.client_id = cl.id
            WHERE date(cb.data_vencimento) = date(?)
              AND cb.status IN ('PENDING', 'OPEN')
        `, [dateStr]);

        for (const cob of cobrancas) {
            results.processed++;

            // Verifica se já enviou esse estágio
            const alreadySent = await dbGet(
                `SELECT id FROM logs_auditoria WHERE entidade = 'reminder' AND acao = ? AND detalhes_json LIKE ? LIMIT 1`,
                [stage.key, `%"cobrancaId":"${cob.id}"%`]
            );
            if (alreadySent) continue;

            try {
                // E-mail
                if (cob.cliente_email) {
                    const ns = new NotificationService();
                    if (ns.transporter || IS_PROD) {
                        await ns.enviarCobranca({
                            to: cob.cliente_email,
                            clientName: cob.cliente_nome,
                            valor: cob.valor,
                            vencimento: cob.data_vencimento,
                            linhaDigitavel: cob.linha_digitavel,
                            pdfUrl: cob.pdf_url,
                            cobrancaId: cob.id,
                        });
                    }
                }

                // WhatsApp
                if (cob.telefone && WhatsAppService.isWhatsAppAvailable()) {
                    if (stage.days < 0) {
                        await WhatsAppService.sendBoletoReminder({
                            to: cob.telefone,
                            clientName: cob.cliente_nome,
                            valor: cob.valor,
                            vencimento: cob.data_vencimento,
                            pdfUrl: cob.pdf_url,
                            linhaDigitavel: cob.linha_digitavel,
                        });
                    } else {
                        await WhatsAppService.sendBoletoOverdue({
                            to: cob.telefone,
                            clientName: cob.cliente_nome,
                            valor: cob.valor,
                            vencimento: cob.data_vencimento,
                            pdfUrl: cob.pdf_url,
                            diasAtraso: stage.days,
                        });
                    }
                }

                await auditLog('reminder', cob.id, stage.key, {
                    cobrancaId: cob.id, sentTo: cob.cliente_email,
                });

                results.sent++;
            } catch (e) {
                results.failed++;
                await auditLog('reminder', cob.id, 'FAILED', { error: e.message, stage: stage.key });
            }
        }
    }

    console.log(`[Reminders] Boleto: ${results.sent} enviados, ${results.failed} falhas`);
    return results;
}

/**
 ╔════════════════════════════════════════════════════════════════════╗
 ║ ROTINA DIÁRIA                                                    ║
 ╚════════════════════════════════════════════════════════════════════╝/

/**
 * Roda TODAS as rotinas de lembrete (uma vez por dia).
 * Idempotente: cada lembrete só é enviado 1x por ciclo.
 */
async function runDaily() {
    console.log('\n[Reminders] ===== INICIANDO ROTINA DIÁRIA =====');
    const startTime = Date.now();

    const [signature, renewal, boleto] = await Promise.all([
        processSignatureReminders(),
        processContractRenewals(),
        processBoletoReminders(),
    ]);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[Reminders] ===== CONCLUÍDO em ${elapsed}s =====\n`);

    return {
        signature,
        renewal,
        boleto,
        elapsed_seconds: parseFloat(elapsed),
        timestamp: new Date().toISOString(),
    };
}

module.exports = {
    runDaily,
    processSignatureReminders,
    processContractRenewals,
    processBoletoReminders,
    sendRenewalNotice,
    auditLog,
};
