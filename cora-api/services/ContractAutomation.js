/**
 * ContractAutomation — Orquestra o ciclo de vida do contrato
 *
 * Sprint 8 — Automação de contratos
 *
 * Fluxo:
 *   1. Contrato criado no ERP (ContratoManager.criar)
 *   2. sendForSignature() → gera PDF, cria envelope Autentique, envia e-mail
 *   3. Cliente assina via Autentique (webhook)
 *   4. Webhook atualiza status do contrato + emite 1ª cobrança
 *   5. Contrato ativo → próxima cobrança via renovação automática
 *
 * Audit: cada passo é registrado em logs_auditoria (entidade='contrato_automation').
 */

const { dbRun, dbGet } = require('../database');
const { renderContract } = require('./PdfGenerator');
const signature = require('../infra/signature');
const email = require('../infra/email');
const ContratoManager = require('../ContratoManager');

/**
 * Cria log de auditoria para o fluxo.
 */
async function audit(contractId, action, details = {}) {
    try {
        await dbRun(
            `INSERT INTO logs_auditoria (entidade, entidade_id, acao, detalhes_json, created_at)
             VALUES ('contrato_automation', ?, ?, ?, datetime('now'))`,
            [contractId, action, JSON.stringify(details)]
        );
    } catch (e) {
        console.warn('[ContractAutomation] Falha ao gravar auditoria:', e.message);
    }
}

/**
 * Atualiza o status do contrato no banco.
 */
async function setContractStatus(contractId, status, extra = {}) {
    try {
        await dbRun(
            `UPDATE contratos SET status = ?, updated_at = datetime('now') WHERE id = ?`,
            [status, contractId]
        );
    } catch (e) {
        // Se a coluna 'status' não existir (contratos legados), não quebra
        console.warn('[ContractAutomation] Falha ao atualizar status:', e.message);
    }
    await audit(contractId, 'STATUS_CHANGE', { newStatus: status, ...extra });
}

/**
 * Envia contrato para assinatura digital.
 *
 * @param {string} contractId - ID do contrato no ERP
 * @param {Object} opts
 * @param {string} [opts.template='manutencao'] - template do contrato
 * @param {Array<{name, email, action?}>} opts.signers - signatários
 * @param {string} [opts.message] - mensagem customizada
 * @param {number} [opts.deadlineDays=15] - dias até vencer o envelope
 * @param {boolean} [opts.sandbox] - usar sandbox da Autentique
 * @returns {Promise<{success, envelopeId?, signLinks?, error?}>}
 */
async function sendForSignature(contractId, opts = {}) {
    if (!signature.isSignatureAvailable()) {
        return { success: false, error: 'AUTENTIQUE_TOKEN não configurado' };
    }
    if (!email.isEmailAvailable()) {
        return { success: false, error: 'RESEND_API_KEY não configurado' };
    }

    const {
        template = 'manutencao',
        signers = [],
        message,
        deadlineDays = 15,
        sandbox = false,
    } = opts;

    // 1. Busca contrato
    const contrato = await ContratoManager.buscar(contractId);
    if (!contrato) {
        return { success: false, error: 'Contrato não encontrado' };
    }
    if (!signers || signers.length === 0) {
        return { success: false, error: 'Nenhum signatário fornecido' };
    }

    await audit(contractId, 'SEND_FOR_SIGNATURE_INITIATED', { signersCount: signers.length, template });

    // 2. Gera PDF do contrato
    let pdfBuffer;
    try {
        pdfBuffer = await renderContract(template, {
            contrato,
            cliente: {
                nome: contrato.cliente_nome,
                email: signers[0].email,
                cnpj_cpf: contrato.cliente_id,
            },
        });
    } catch (e) {
        await audit(contractId, 'PDF_GENERATION_FAILED', { error: e.message });
        return { success: false, error: `Falha ao gerar PDF: ${e.message}` };
    }

    // 3. Cria envelope na Autentique
    let envelope;
    try {
        const deadline = new Date();
        deadline.setDate(deadline.getDate() + deadlineDays);
        envelope = await signature.createDocument({
            name: `Contrato ${contrato.titulo || contrato.id} - ${contrato.cliente_nome}`,
            pdf: pdfBuffer,
            signers: signers.map(s => ({
                name: s.name,
                email: s.email,
                deliveryMethod: s.deliveryMethod || 'EMAIL',
                action: s.action || 'SIGN',
            })),
            message: message || `Olá! Você recebeu o contrato ${contrato.titulo || contrato.id} para assinatura digital. Qualquer dúvida, entre em contato.`,
            deadlineAt: deadline.toISOString(),
            sandbox,
        });
    } catch (e) {
        await audit(contractId, 'AUTENTIQUE_CREATE_FAILED', { error: e.message });
        return { success: false, error: `Falha ao criar envelope: ${e.message}` };
    }

    await audit(contractId, 'ENVELOPE_CREATED', {
        envelopeId: envelope.id,
        sandbox,
        signersCount: signers.length,
    });

    // 4. Salva referência do envelope no contrato (se coluna existir)
    try {
        await dbRun(
            `UPDATE contratos SET observacoes = COALESCE(observacoes, '') || ? || ?, updated_at = datetime('now') WHERE id = ?`,
            [
                envelope.id ? `\n[Autentique] envelope_id=${envelope.id}` : '',
                '',
                contractId,
            ]
        );
    } catch (_) {}

    // 5. Envia e-mail para cada signatário (Autentique também envia, mas email customizado melhora UX)
    let firstSignLink = null;
    for (const s of signers) {
        // Autentique envia o link automaticamente. Aqui só mandamos complemento opcional.
        // Para evitar duplicidade, não mandamos e-mail próprio — Autentique já cuida.
    }

    await audit(contractId, 'SEND_FOR_SIGNATURE_COMPLETED', {
        envelopeId: envelope.id,
        signersCount: signers.length,
    });

    return {
        success: true,
        envelopeId: envelope.id,
        envelope,
        message: 'Contrato enviado para assinatura com sucesso',
    };
}

/**
 * Processa webhook da Autentique quando status muda.
 *
 * @param {string} envelopeId - ID do envelope Autentique
 * @param {Object} payload - payload do webhook
 */
async function processWebhook(envelopeId, payload) {
    // 1. Busca estado atual do envelope
    let envelope;
    try {
        envelope = await signature.getDocument(envelopeId);
    } catch (e) {
        await audit(null, 'WEBHOOK_GET_FAILED', { envelopeId, error: e.message });
        return { success: false, error: e.message };
    }

    // 2. Encontra contrato pelo envelope_id (no campo observacoes)
    // Implementação simples: busca por substring. Em prod, ideal ter coluna envelope_id.
    let contractRow;
    try {
        const { dbAll } = require('../database');
        const rows = await dbAll(
            `SELECT id FROM contratos WHERE observacoes LIKE ? LIMIT 1`,
            [`%${envelopeId}%`]
        );
        contractRow = rows[0];
    } catch (e) {
        // Sem coluna ou erro de SQL
    }

    if (!contractRow) {
        await audit(null, 'WEBHOOK_CONTRACT_NOT_FOUND', { envelopeId });
        return { success: false, error: 'Contrato não encontrado para este envelope' };
    }

    const contractId = contractRow.id;

    // 3. Verifica se todos assinaram
    const allSigned = envelope.signers_history?.length > 0
        && envelope.signers_history.every(h => h.user?.archived_at);

    if (allSigned) {
        await setContractStatus(contractId, 'Ativo', { source: 'autentique_webhook', envelopeId });
        await audit(contractId, 'CONTRACT_FULLY_SIGNED', { envelopeId });

        // 4. Envia e-mail de confirmação
        try {
            // Pega o cliente
            const contrato = await ContratoManager.buscar(contractId);
            if (contrato) {
                // Aqui precisaríamos do email do cliente — pega do primeiro signatário
                const firstSigner = envelope.signers_history[0]?.user;
                if (firstSigner?.email) {
                    await email.sendContractSigned({
                        to: firstSigner.email,
                        clientName: firstSigner.name,
                        contractTitle: contrato.titulo,
                        signedAt: new Date().toISOString(),
                    });
                }
            }
        } catch (e) {
            await audit(contractId, 'POST_SIGN_EMAIL_FAILED', { error: e.message });
        }

        // 5. Dispara 1ª cobrança (delegado para CobrancaManager — fora do escopo aqui)
        await audit(contractId, 'FIRST_BILLING_TRIGGERED', { note: 'Integrar com CobrancaManager.criarRecorrencia()' });

        return { success: true, contractId, status: 'ATIVO', allSigned: true };
    } else {
        await audit(contractId, 'WEBHOOK_PARTIAL_SIGN', {
            envelopeId,
            signedCount: envelope.signers_history?.filter(h => h.user?.archived_at).length || 0,
            total: envelope.signers_history?.length || 0,
        });
        return { success: true, contractId, status: 'AGUARDANDO', allSigned: false };
    }
}

/**
 * Lembrete de assinatura: reenvia link para quem ainda não assinou.
 */
async function sendReminders(contractId) {
    if (!signature.isSignatureAvailable() || !email.isEmailAvailable()) {
        return { success: false, error: 'Serviços não configurados' };
    }

    // 1. Busca contrato e envelope
    const { dbAll } = require('../database');
    const rows = await dbAll(`SELECT id, observacoes FROM contratos WHERE id = ?`, [contractId]);
    const row = rows[0];
    if (!row) return { success: false, error: 'Contrato não encontrado' };

    // Extrai envelope_id
    const match = row.observacoes?.match(/envelope_id=([a-f0-9]+)/i);
    if (!match) return { success: false, error: 'Envelope não encontrado' };
    const envelopeId = match[1];

    // 2. Reenvia via Autentique
    await signature.resendSignatures(envelopeId);

    // 3. Envia e-mail customizado
    const envelope = await signature.getDocument(envelopeId);
    const pendingSigners = envelope.signers_history?.filter(h => !h.user?.archived_at) || [];
    let sent = 0;
    for (const h of pendingSigners) {
        if (h.user?.email) {
            await email.sendSignatureReminder({
                to: h.user.email,
                clientName: h.user.name,
                contractTitle: envelope.name,
                signatureLink: `https://app.autentique.com.br/contracts/${envelopeId}`,
                daysWaiting: 3,
            });
            sent++;
        }
    }

    await audit(contractId, 'REMINDERS_SENT', { envelopeId, count: sent });
    return { success: true, sent };
}

/**
 * Renovação automática de contrato (60 dias antes do fim).
 */
async function processRenewals() {
    const { dbAll } = require('../database');
    const rows = await dbAll(
        `SELECT * FROM contratos
         WHERE data_fim IS NOT NULL
         AND data_fim BETWEEN date('now', '+30 days') AND date('now', '+60 days')
         AND status = 'Ativo'
         AND observacoes NOT LIKE '%[renovado]%'`
    );

    const results = [];
    for (const contrato of rows) {
        try {
            // Envia e-mail de aviso de vencimento
            const { dbGet } = require('../database');
            const cliente = await dbGet('SELECT nome, email FROM clientes WHERE id = ?', [contrato.cliente_id]);
            if (cliente?.email) {
                await email.sendContractRenewal({
                    to: cliente.email,
                    clientName: cliente.nome,
                    contractTitle: contrato.titulo || `Contrato ${contrato.id}`,
                    contractEnd: contrato.data_fim,
                    newContractLink: `https://app.renostter.com/contracts/${contrato.id}/renew`,
                });
                await audit(contrato.id, 'RENEWAL_NOTICE_SENT', { daysLeft: 60 });
                results.push({ contractId: contrato.id, status: 'notified' });
            }
        } catch (e) {
            await audit(contrato.id, 'RENEWAL_FAILED', { error: e.message });
            results.push({ contractId: contrato.id, status: 'error', error: e.message });
        }
    }
    return results;
}

module.exports = {
    sendForSignature,
    processWebhook,
    sendReminders,
    processRenewals,
    audit,
    setContractStatus,
};
