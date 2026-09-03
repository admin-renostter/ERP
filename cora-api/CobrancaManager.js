/**
 * CobrancaManager — Orquestra emissão, cancelamento, consulta e notificações
 * 
 * Responsabilidades:
 * - Criar cobranças usando o gateway configurado
 * - Salvar/atualizar cobranças no SQLite
 * - Processar webhooks e atualizar status
 * - Registrar logs de auditoria
 * - Gerenciar recorrência
 */

const crypto = require('crypto');
const { dbAll, dbGet, dbRun } = require('./database');
// Sprint 13.8: wrappers tenant-aware (filtram automaticamente por req.tenantId)
const { dbAllTenant, dbGetTenant, dbRunTenant } = require('./infra/tenantAwareDb');
const NotificationService = require('./NotificationService');

/**
 * Requisito 3: Formatação de Datas
 * In: Qualquer formato aceito pelo JS
 * Out: YYYY-MM-DD
 */
function formatDateRequest(date) {
    if (!date) return null;
    const d = new Date(date);
    if (isNaN(d.getTime())) return date; // Retorna original se inválido para evitar quebra
    return d.toISOString().split('T')[0];
}

class CobrancaManager {
    // ERR-08 Fix: Status válidos para cobranças (espelhado no trigger do banco)
    static VALID_STATUSES = ['PENDING', 'OPEN', 'PAID', 'OVERDUE', 'CANCELLED'];

    constructor() {
        this.notifier = new NotificationService();
    }

    async getCobranca(id) {
        // Sprint 13.8: filtra por tenant automaticamente
        return await dbGetTenant('SELECT * FROM cobrancas WHERE id = ?', [id]);
    }

    /**
     * Validar um status de cobrança antes de persistir
     * @param {string} status
     * @returns {string} status normalizado (uppercase)
     * @throws {Error} se status inválido
     */
    _validateStatus(status) {
        const normalized = (status || 'PENDING').toUpperCase();
        if (!CobrancaManager.VALID_STATUSES.includes(normalized)) {
            throw new Error(`Status inválido: '${status}'. Permitidos: ${CobrancaManager.VALID_STATUSES.join(', ')}`);
        }
        return normalized;
    }

    // ═══════════════════════════════════════
    // Emissão de Cobrança
    // ═══════════════════════════════════════

    /**
     * Emitir nova cobrança
     * @param {Object} params
     * @param {string} params.contractId
     * @param {string} params.clientId
     * @param {number} params.value - Valor em REAIS
     * @param {string} params.dueDate - YYYY-MM-DD (Será normalizada)
     * @param {Array}  params.services - ['serviço 1', ...]
     * @param {Object} params.customerPayload - { name, email, document, address }
     * @param {Object} [params.fineSettings] - { juros, multa, desconto, descontoAte }
     * @param {string} [params.userId] - Quem emitiu
     * @returns {{ success, cobrancaId, chargeId, barcode, pdfUrl, ... }}
     */
    async emitirCobranca(gateway, { contractId, clientId, value, dueDate, services, customerPayload, fineSettings, observacoes, userId }, auditInfo = null) {
        const uId = userId || auditInfo?.userId || 'system';
        const uIp = auditInfo?.ip || null;
        // 1. Verificar duplicidade (idempotência)
        const existing = await dbGetTenant(
            `SELECT * FROM cobrancas WHERE contract_id = ? AND data_vencimento = ? AND status IN ('PENDING','OPEN')`,
            [contractId, dueDate]
        );
        if (existing) {
            return {
                success: true,
                duplicate: true,
                cobrancaId: existing.id,
                chargeId: existing.gateway_charge_id,
                barcode: existing.barcode,
                digitableLine: existing.linha_digitavel,
                pdfUrl: existing.pdf_url,
                pixQrCode: existing.pix_qrcode
            };
        }

        // 2. Montar payload para o gateway
        const gatewayPayload = {
            code: contractId,
            customer: customerPayload || { name: 'Cliente', document: { identity: '00000000000', type: 'CPF' } },
            services: (services || ['Serviço']).map(s => ({
                name: typeof s === 'string' ? s : s.name,
                amount: typeof s === 'string' ? Math.round(value * 100) : (s.amount || Math.round(value * 100))
            })),
            payment_terms: {
                due_date: formatDateRequest(dueDate),
                ...(fineSettings?.juros && { interest: { type: 'PERCENTAGE', value: fineSettings.juros } }),
                ...(fineSettings?.multa && { fine: { type: 'PERCENTAGE', value: fineSettings.multa } }),
                ...(fineSettings?.desconto && {
                    discount: {
                        type: 'FIXED',
                        value: Math.round(fineSettings.desconto * 100),
                        ...(fineSettings.descontoAte && { limit_date: fineSettings.descontoAte })
                    }
                })
            },
            notifications: { send_on_creation: true }
        };

        // 3. Chamar gateway
        const result = await gateway.createInvoice(gatewayPayload);

        // 4. Salvar no banco
        const cobrancaId = 'cob_' + crypto.randomUUID().split('-')[0];
        const email = customerPayload?.email || null;
        const phone = customerPayload?.phoneNumber || customerPayload?.phone || null;

         const finalStatus = this._validateStatus(result.status || 'PENDING');

         await dbRun(
            `INSERT INTO cobrancas
             (id, contract_id, client_id, gateway_provider, gateway_charge_id, gateway_invoice_id,
              valor, data_vencimento, status, barcode, linha_digitavel, pix_qrcode, pdf_url,
              idempotency_key, emitido_por, observacoes, mock)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [cobrancaId, contractId, clientId, gateway.providerName || 'cora',
             result.chargeId, result.invoiceId,
             value, dueDate, finalStatus,
             result.barcode, result.digitableLine, result.pixQrCode, result.pdfUrl,
             result.idempotencyKey, userId || null, result.mock ? 1 : 0]
        );

        // 5. Log de auditoria (Enhanced as per Point 6)
        await this._audit(uId, 'emitir', 'cobranca', cobrancaId, {
            contractId, value, dueDate, gateway: gateway.providerName, mock: result.mock
        }, gatewayPayload, uIp);

        // 6. Log HTTP
        await this._logHttp('INVOICE_CREATE', '/v2/invoices/', contractId, result.chargeId, 200, gatewayPayload, result);

        // 7. Enviar e-mail de cobrança (assíncrono, não bloqueia)
        if (email) {
            this.notifier.enviarCobranca({
                to: email,
                clientName: customerPayload.name || 'Cliente',
                valor: value,
                vencimento: dueDate,
                barcode: result.barcode,
                linhaDigitavel: result.digitableLine,
                pdfUrl: result.pdfUrl,
                pixQrCode: result.pixQrCode,
                cobrancaId
            }).catch(e => console.warn('[Email] Falha no envio automático:', e.message));
        }

        return {
            success: true,
            cobrancaId,
            chargeId: result.chargeId,
            barcode: result.barcode,
            digitableLine: result.digitableLine,
            pixQrCode: result.pixQrCode,
            pdfUrl: result.pdfUrl,
            mock: result.mock || false
        };
    }

    // ═══════════════════════════════════════
    // Consultas
    // ═══════════════════════════════════════

    /**
     * Requisito 4: Paginação
     * Os parâmetros limit e offset são calculados de acordo com page e size.
     */
    async listarCobrancas({ clientId, status, page = 0, size = 50 } = {}) {
        const limit = size;
        const offset = page * size;
        let sql = 'SELECT * FROM cobrancas WHERE 1=1';
        const params = [];
        if (clientId) { sql += ' AND client_id = ?'; params.push(clientId); }
        if (status) { sql += ' AND status = ?'; params.push(status); }

        // Requisito 3: Datas na resposta devem ser ISO (SQLite já armazena em formato próximo, mas garantimos no parse se necessário)
        sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);
        // Sprint 13.8: filtra por tenant automaticamente
        return await dbAllTenant(sql, params);
    }

    async buscarCobranca(cobrancaId) {
        return await dbGetTenant('SELECT * FROM cobrancas WHERE id = ?', [cobrancaId]);
    }

    async buscarPorContrato(contractId) {
        return await dbAllTenant('SELECT * FROM cobrancas WHERE contract_id = ? ORDER BY created_at DESC', [contractId]);
    }

    /**
     * Relatório de Envelhecimento (Aging Report)
     * Divide a inadimplência em baldes de tempo
     */
    async getAgingReport() {
        const today = new Date().toISOString().split('T')[0];
        const rows = await dbAllTenant(`
            SELECT
                CASE
                    WHEN (julianday(?) - julianday(data_vencimento)) <= 30 THEN '0-30 dias'
                    WHEN (julianday(?) - julianday(data_vencimento)) <= 60 THEN '31-60 dias'
                    WHEN (julianday(?) - julianday(data_vencimento)) <= 90 THEN '61-90 dias'
                    ELSE '90+ dias'
                END as bucket,
                SUM(valor) as total,
                COUNT(*) as qtd
            FROM cobrancas
            WHERE status IN ('PENDING', 'OPEN', 'OVERDUE')
              AND data_vencimento < ?
            GROUP BY bucket
        `, [today, today, today, today]);

        return rows;
    }

    /**
     * Resumo Executivo para a Diretoria
     */
    async getExecutiveSummary() {
        const [kpis, aging] = await Promise.all([
            this.getKPIs(),
            this.getAgingReport()
        ]);
        return {
            generated_at: new Date().toISOString(),
            kpis,
            aging,
            audit_meta: { total_logs: (await dbGetTenant('SELECT COUNT(*) as c FROM logs_auditoria')).c }
        };
    }

    async getKPIs() {
        // [PERF] 5 queries → 1 (CASE WHEN agregador). Reduz round-trip ao SQLite
        // e aproveita os índices idx_cobrancas_status e idx_cobrancas_created.
        // Sprint 13.8: filtra por tenant automaticamente
        const row = await dbGetTenant(`
            SELECT
                COALESCE(SUM(valor), 0)                                  AS total_valor,
                COUNT(*)                                                 AS total_qtd,
                COALESCE(SUM(CASE WHEN status IN ('PENDING','OPEN') THEN valor ELSE 0 END), 0) AS pendente_valor,
                COUNT(CASE WHEN status IN ('PENDING','OPEN') THEN 1 END) AS pendente_qtd,
                COALESCE(SUM(CASE WHEN status = 'PAID' THEN valor ELSE 0 END), 0)              AS pago_valor,
                COUNT(CASE WHEN status = 'PAID' THEN 1 END)              AS pago_qtd,
                COALESCE(SUM(CASE WHEN status = 'OVERDUE' THEN valor ELSE 0 END), 0)           AS vencido_valor,
                COUNT(CASE WHEN status = 'OVERDUE' THEN 1 END)           AS vencido_qtd
            FROM cobrancas
        `);
        const breakdown = await dbAllTenant(
            "SELECT gateway_provider as provider, SUM(valor) as total, COUNT(*) as qtd FROM cobrancas GROUP BY gateway_provider"
        );
        return {
            totalEmitido: { valor: row.total_valor, qtd: row.total_qtd },
            pendente:     { valor: row.pendente_valor, qtd: row.pendente_qtd },
            pago:         { valor: row.pago_valor, qtd: row.pago_qtd },
            vencido:      { valor: row.vencido_valor, qtd: row.vencido_qtd },
            breakdown
        };
    }

    // ═══════════════════════════════════════
    // Cancelamento
    // ═══════════════════════════════════════

    async cancelarCobranca(gateway, cobrancaId, userId, auditInfo = null) {
        const uId = userId || auditInfo?.userId || 'system';
        const uIp = auditInfo?.ip || null;
        const cob = await this.buscarCobranca(cobrancaId);
        if (!cob) return { success: false, error: 'Cobrança não encontrada' };
        if (cob.status === 'PAID') return { success: false, error: 'Cobrança já paga, não pode ser cancelada' };

        if (cob.gateway_invoice_id && !cob.mock) {
            await gateway.cancelInvoice(cob.gateway_invoice_id);
        }

        await dbRun(
            'UPDATE cobrancas SET status = ?, cancelado_por = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            ['CANCELLED', userId, cobrancaId]
        );

        await this._audit(uId, 'cancelar', 'cobranca', cobrancaId, { previousStatus: cob.status }, null, uIp);
        return { success: true };
    }

    // ═══════════════════════════════════════
    // Webhooks
    // ═══════════════════════════════════════

    async processarWebhook(gateway, rawPayload) {
        const event = gateway.parseWebhookEvent(rawPayload);

        // Salvar webhook bruto
        await dbRun(
            `INSERT INTO webhooks_recebidos (provider, event_type, gateway_charge_id, http_status, raw_payload, processed)
             VALUES (?,?,?,?,?,?)`,
            [gateway.providerName, event.eventType, event.chargeId, 200, JSON.stringify(rawPayload), 'sim']
        );

        // Atualizar cobrança correspondente
        if (event.chargeId && event.eventType !== 'UNKNOWN') {
            const statusMap = { PAID: 'PAID', OVERDUE: 'OVERDUE', CANCELLED: 'CANCELLED' };
            const newStatus = statusMap[event.eventType];

            if (newStatus) {
                const updateFields = ['status = ?', 'updated_at = CURRENT_TIMESTAMP'];
                const updateParams = [newStatus];

                if (newStatus === 'PAID') {
                    updateFields.push('data_pagamento = CURRENT_TIMESTAMP');
                }

                updateParams.push(event.chargeId);
                await dbRun(
                    `UPDATE cobrancas SET ${updateFields.join(', ')} WHERE gateway_charge_id = ?`,
                    updateParams
                );
            }
        }

        return { received: true, eventType: event.eventType, chargeId: event.chargeId };
    }

    // ═══════════════════════════════════════
    // Recorrência
    // ═══════════════════════════════════════

    async criarRecorrencia(gateway, { contractId, clientId, value, frequency = 'monthly', nextDueDate, customerPayload, services }) {
        await dbRun(
            `INSERT OR REPLACE INTO cobrancas_recorrentes 
             (contract_id, client_id, gateway_provider, valor, frequency, next_due_date, active, customer_payload, services)
             VALUES (?,?,?,?,?,?,1,?,?)`,
            [contractId, clientId, gateway.providerName, value, frequency, nextDueDate,
             JSON.stringify(customerPayload || {}), JSON.stringify(services || [])]
        );
        return { success: true, message: `Recorrência ${frequency} ativada para contrato ${contractId}` };
    }

    async listarRecorrencias() {
        return await dbAllTenant('SELECT * FROM cobrancas_recorrentes WHERE active = 1 ORDER BY next_due_date');
    }

    async desativarRecorrencia(contractId) {
        await dbRunTenant('UPDATE cobrancas_recorrentes SET active = 0 WHERE contract_id = ?', [contractId]);
        return { success: true };
    }

    /**
     * Executar cobranças recorrentes pendentes (chamado pelo cron)
     *
     * [PERF] Paralelização com limite — antes era sequencial (1 contrato = 1 round-trip
     * ao gateway). Agora processa até 5 em paralelo sem sobrecarregar o gateway.
     */
    async executarRecorrencias(gatewayResolver) {
        const today = new Date().toISOString().split('T')[0];
        const pendentes = await dbAll(
            'SELECT * FROM cobrancas_recorrentes WHERE active = 1 AND next_due_date <= ?',
            [today]
        );

        const CONCURRENCY = 5;
        const results = [];

        // Processa em chunks de CONCURRENCY
        for (let i = 0; i < pendentes.length; i += CONCURRENCY) {
            const chunk = pendentes.slice(i, i + CONCURRENCY);
            const chunkResults = await Promise.all(chunk.map(async rec => {
                try {
                    const gateway = await gatewayResolver(rec.gateway_provider);
                    const result = await this.emitirCobranca(gateway, {
                        contractId: rec.contract_id,
                        clientId: rec.client_id,
                        value: rec.valor,
                        dueDate: rec.next_due_date,
                        services: JSON.parse(rec.services || '[]'),
                        customerPayload: JSON.parse(rec.customer_payload || '{}'),
                        userId: 'cron_system'
                    });

                    // Avançar para próximo vencimento
                    const nextDate = new Date(rec.next_due_date);
                    if (rec.frequency === 'monthly') nextDate.setMonth(nextDate.getMonth() + 1);
                    else if (rec.frequency === 'bimonthly') nextDate.setMonth(nextDate.getMonth() + 2);
                    else if (rec.frequency === 'quarterly') nextDate.setMonth(nextDate.getMonth() + 3);
                    else if (rec.frequency === 'semiannual') nextDate.setMonth(nextDate.getMonth() + 6);
                    else if (rec.frequency === 'annual') nextDate.setFullYear(nextDate.getFullYear() + 1);

                    await dbRun(
                        'UPDATE cobrancas_recorrentes SET next_due_date = ?, last_emission_date = ? WHERE id = ?',
                        [nextDate.toISOString().split('T')[0], today, rec.id]
                    );

                    return { contractId: rec.contract_id, success: true, cobrancaId: result.cobrancaId };
                } catch (err) {
                    return { contractId: rec.contract_id, success: false, error: err.message };
                }
            }));
            results.push(...chunkResults);
        }
        return results;
    }

    // ═══════════════════════════════════════
    // Extrato e Saldo (Paginação via page/size Padrão Cora)
    // ═══════════════════════════════════════

    async getExtrato(gatewayResolver, opts = { page: 0, size: 50 }) {
        if (!gatewayResolver) gatewayResolver = await require('./server').getGateway('cora'); // fallback inject se nao vier
        // Se vier gateway (instância da CoraGateway) ou undefined
        const gw = typeof gatewayResolver === 'function' ? null : gatewayResolver;
        if (gw) {
            return gw.getStatement(opts);
        }
        // Fallback genérico caso chamem sem injetar
        const cora = require('./gateways/CoraGateway');
        const instance = new cora();
        return instance.getStatement(opts);
    }

    // ═══════════════════════════════════════
    // Notificações
    // ═══════════════════════════════════════

    async ativarNotificacoes(gateway, cobrancaId, opts) {
        const cob = await this.buscarCobranca(cobrancaId);
        if (!cob || !cob.gateway_invoice_id) {
            return { success: false, error: 'Cobrança não encontrada ou sem ID de gateway' };
        }
        const result = await gateway.updateNotifications(cob.gateway_invoice_id, opts);
        await dbRun(
            'UPDATE cobrancas SET ultima_notif_em = CURRENT_TIMESTAMP WHERE id = ?',
            [cobrancaId]
        );
        return { success: true, data: result };
    }

    async statusNotificacoes(gateway, invoiceId) {
        return gateway.getNotificationStatus(invoiceId);
    }

    /**
     * Enviar e-mail manualmente para uma cobrança existente
     */
    async enviarEmailCobranca(cobrancaId, email) {
        const cob = await this.buscarCobranca(cobrancaId);
        if (!cob) return { success: false, error: 'Cobrança não encontrada' };
        const result = await this.notifier.enviarCobranca({
            to: email,
            clientName: 'Cliente',
            valor: cob.valor,
            vencimento: cob.data_vencimento,
            barcode: cob.barcode,
            linhaDigitavel: cob.linha_digitavel,
            pdfUrl: cob.pdf_url,
            pixQrCode: cob.pix_qrcode,
            cobrancaId
        });
        await this._audit(null, 'email_enviado', 'cobranca', cobrancaId, { email, mode: result.mode });
        return result;
    }

    // ═══════════════════════════════════════
    // Logs
    // ═══════════════════════════════════════

    async getLogs({ limit = 50, offset = 0 } = {}) {
        return dbAll('SELECT * FROM cora_logs ORDER BY created_at DESC LIMIT ? OFFSET ?', [limit, offset]);
    }

    async getAuditoria({ limit = 50 } = {}) {
        return dbAll('SELECT * FROM logs_auditoria ORDER BY created_at DESC LIMIT ?', [limit]);
    }

    // ── Internal helpers ──

    async _audit(userId, acao, entidade, entidadeId, detalhes, fullPayload = null, ip = null) {
        try {
            await dbRun(
                'INSERT INTO logs_auditoria (user_id, user_name, acao, entidade, entidade_id, detalhes_json, detalhes_json_full, ip_address) VALUES (?,?,?,?,?,?,?,?)',
                [userId || 'system', '', acao, entidade, entidadeId, JSON.stringify(detalhes || {}), fullPayload ? JSON.stringify(fullPayload) : null, ip]
            );
        } catch (e) { console.warn('[Audit] Falha:', e.message); }
    }

    async _logHttp(type, endpoint, contractId, chargeId, status, payload, response) {
        try {
            await dbRun(
                'INSERT INTO cora_logs (type, direction, endpoint, contract_id, charge_id, http_status, payload, response) VALUES (?,?,?,?,?,?,?,?)',
                [type, 'outbound', endpoint, contractId, chargeId, status,
                 JSON.stringify(payload), JSON.stringify(response)]
            );
        } catch (e) { console.warn('[Log] Falha:', e.message); }
    }

    // ═══════════════════════════════════════
    // MÓDULO DE FATURAS (Fase 7)
    // ═══════════════════════════════════════

    /**
     * Gerar nova fatura a partir de itens
     */
    async criarFatura({ chamadoId, clienteId, itens, emitidoPor }, auditInfo = null) {
        const uId = emitidoPor || auditInfo?.userId || 'system';
        const uIp = auditInfo?.ip || null;
        const faturaId = 'fat_' + crypto.randomUUID().split('-')[0];
        
        // Gerar número de fatura (FAT-YYYY-NNNN)
        const year = new Date().getFullYear();
        const lastFat = await dbGet("SELECT numero_fatura FROM faturas WHERE numero_fatura LIKE ? ORDER BY created_at DESC LIMIT 1", [`FAT-${year}-%`]);
        let nextSeq = 1;
        if (lastFat) {
            const lastSeq = parseInt(lastFat.numero_fatura.split('-')[2]);
            nextSeq = lastSeq + 1;
        }
        const numeroFatura = `FAT-${year}-${String(nextSeq).padStart(4, '0')}`;

        const valorTotal = itens.reduce((acc, it) => acc + (it.quantidade * it.valorUnitario), 0);

        await dbRun(
            `INSERT INTO faturas (id, chamado_id, cliente_id, numero_fatura, valor_total, status)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [faturaId, chamadoId, clienteId, numeroFatura, valorTotal, 'AGUARDANDO_AUTORIZACAO']
        );

        for (const it of itens) {
            await dbRun(
                `INSERT INTO itens_fatura (fatura_id, descricao, quantidade, valor_unitario, valor_total, tipo)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [faturaId, it.descricao, it.quantidade, it.valorUnitario, it.quantidade * it.valorUnitario, it.tipo || 'peca']
            );
        }

        await this._audit(uId, 'gerar_fatura', 'fatura', faturaId, { chamadoId, numeroFatura, valorTotal }, { itens }, uIp);
        return { success: true, faturaId, numeroFatura };
    }

    async buscarFatura(faturaId) {
        const fatura = await dbGet('SELECT * FROM faturas WHERE id = ?', [faturaId]);
        if (fatura) {
            fatura.itens = await dbAll('SELECT * FROM itens_fatura WHERE fatura_id = ?', [faturaId]);
        }
        return fatura;
    }

    async listarFaturas({ clienteId, status, limit = 50, offset = 0 } = {}) {
        let sql = 'SELECT * FROM faturas WHERE 1=1';
        const params = [];
        if (clienteId) { sql += ' AND cliente_id = ?'; params.push(clienteId); }
        if (status) { sql += ' AND status = ?'; params.push(status); }
        sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);
        return dbAll(sql, params);
    }

    async aprovarFatura(gateway, faturaId, userId, auditInfo = null) {
        const uId = userId || auditInfo?.userId || 'system';
        const uIp = auditInfo?.ip || null;
        const fat = await this.buscarFatura(faturaId);
        if (!fat) throw new Error('Fatura não encontrada');
        if (fat.status !== 'AGUARDANDO_AUTORIZACAO') throw new Error('Fatura não está pendente de autorização');

        // 1. Gerar cobrança real no gateway
        // Buscamos os dados do cliente para o payload de cobrança
        // (Isso assume que o clienteId no banco de cobranças é o mesmo ID do sistema)
        // Aqui usaremos os dados que já temos na fatura para simplificar
        const result = await this.emitirCobranca(gateway, {
            contractId: `FAT-${fat.numero_fatura}`,
            clientId: fat.cliente_id,
            value: fat.valor_total,
            dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // D+5
            services: fat.itens.map(it => it.descricao),
            customerPayload: { name: 'Cliente Fatura ' + fat.numero_fatura }, // Idealmente buscar dados reais do cliente
            userId: userId
        });

        // 2. Atualizar status da fatura
        await dbRun(
            `UPDATE faturas SET status = 'APROVADA', data_aprovacao = CURRENT_TIMESTAMP, cobranca_id = ? 
             WHERE id = ?`,
            [result.cobrancaId, faturaId]
        );

        // 3. Vincular fatura na cobrança
        await dbRun("UPDATE cobrancas SET fatura_id = ?, chamado_id_meta = ? WHERE id = ?", [faturaId, fat.chamado_id, result.cobrancaId]);

        await this._audit(uId, 'aprovar_fatura', 'fatura', faturaId, { cobrancaId: result.cobrancaId }, null, uIp);
        return { success: true, cobrancaId: result.cobrancaId };
    }

    async reprovarFatura(faturaId, justificativa, userId) {
        await dbRun(
            `UPDATE faturas SET status = 'REPROVADA', justificativa_reprovacao = ? 
             WHERE id = ?`,
            [justificativa, faturaId]
        );
        await this._audit(userId, 'reprovar_fatura', 'fatura', faturaId, { justificativa });
        return { success: true };
    }
}

module.exports = CobrancaManager;
