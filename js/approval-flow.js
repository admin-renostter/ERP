/**
 * Approval Flow — Cliente do fluxo de aprovação financeira.
 *
 * Camada de frontend que conversa com /api/approvals do cora-api.
 * Usado por Proposals.syncFinancial() e (futuramente) pelo fluxo
 * de emissão de boletos a partir de PMOC/contratos.
 *
 * Contrato real do backend (cora-api/routes/approvals.js):
 *   POST /api/approvals
 *     body: { ticketId, clientId, value, reason }
 *     resp: { success, id, tier }
 *
 *   GET /api/approvals?clientId=X&status=PENDING
 *     resp: { success, data: [{ id, ticket_id, client_id, request_value, tier, status, ... }] }
 *
 *   GET /api/approvals/count
 *     resp: { success, count: number }
 *
 * Critérios de aprovação (alinhados com approvals.js no backend):
 *  - valor <= R$ 1.000     → admin tier (auto, sem fila)
 *  - valor R$ 1.001-5.000  → superadmin tier (fila)
 *  - valor > R$ 5.000      → compliance tier (fila + motivo)
 *
 * Idempotência:
 *  - findPendingByTicketClient() evita duplicar approval para o mesmo ticket+cliente.
 *  - Se já existir (qualquer status), retorna-o sem criar novo.
 */

(function () {
    'use strict';

    const TIERS = {
        ADMIN: 'admin',
        SUPER: 'superadmin',
        COMPLIANCE: 'compliance'
    };

    const THRESHOLDS = {
        SUPER_MIN: 1000,    // > R$ 1.000 → super
        COMPLIANCE_MIN: 5000 // > R$ 5.000 → compliance
    };

    function getApiBase() {
        if (typeof CORA_API_URL === 'string' && CORA_API_URL) return CORA_API_URL;
        const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
        return isLocal ? 'http://localhost:3000' : '';
    }

    function getSession() {
        try {
            if (typeof auth === 'undefined' || !auth.current) return null;
            return auth.current();
        } catch {
            return null;
        }
    }

    function buildHeaders() {
        const session = getSession() || {};
        return {
            'Content-Type': 'application/json',
            'X-User-Id': session.userId || '',
            'X-User-Name': session.name || '',
            'X-User-Role': session.role || ''
        };
    }

    /**
     * Determina o tier baseado no valor (mesma regra do backend).
     */
    function calcTier(value) {
        const v = Number(value) || 0;
        if (v > THRESHOLDS.COMPLIANCE_MIN) return TIERS.COMPLIANCE;
        if (v > THRESHOLDS.SUPER_MIN) return TIERS.SUPER;
        return TIERS.ADMIN;
    }

    /**
     * Retorna true se valor precisa de aprovação humana (não-admin).
     */
    function needsApproval(value) {
        return calcTier(value) !== TIERS.ADMIN;
    }

    /**
     * Procura approval PENDING/ESCALATED para um ticket+cliente.
     * Retorna null se não existir ou API offline.
     */
    async function findPendingByTicketClient(ticketId, clientId) {
        try {
            const url = `${getApiBase()}/api/approvals?clientId=${encodeURIComponent(clientId)}&status=PENDING&limit=20`;
            const res = await fetch(url, { headers: buildHeaders() });
            if (!res.ok) return null;
            const json = await res.json();
            if (!json.success || !Array.isArray(json.data)) return null;
            // Filtra por ticket_id (mais preciso) ou retorna o mais recente
            const matches = json.data.filter(a =>
                (a.ticket_id === ticketId || a.client_id === clientId) &&
                ['PENDING', 'ESCALATED'].includes((a.status || '').toUpperCase())
            );
            return matches.length > 0 ? matches[0] : null;
        } catch {
            return null;
        }
    }

    /**
     * Solicita aprovação para um ticket.
     *
     * @param {Object} opts
     * @param {string} opts.ticketId
     * @param {string} opts.clientId
     * @param {number} opts.value
     * @param {string} [opts.reason]  — descrição legível
     * @returns {Promise<{status, approval?, tier}>}
     */
    async function requestApproval(opts) {
        const { ticketId, clientId, value, reason } = opts;
        if (!clientId) throw new Error('clientId obrigatório');
        const numValue = Number(value) || 0;
        if (numValue <= 0) throw new Error('value deve ser positivo');

        const tier = calcTier(numValue);

        // Auto-approve admin tier
        if (tier === TIERS.ADMIN) {
            return { status: 'auto_approved', approval: null, tier };
        }

        // Verifica se já existe pendência
        const existing = await findPendingByTicketClient(ticketId, clientId);
        if (existing) {
            if (['PENDING', 'ESCALATED'].includes((existing.status || '').toUpperCase())) {
                return { status: 'already_pending', approval: existing, tier };
            }
            if ((existing.status || '').toUpperCase() === 'APPROVED') {
                return { status: 'already_approved', approval: existing, tier };
            }
            if ((existing.status || '').toUpperCase() === 'REJECTED') {
                return { status: 'rejected', approval: existing, tier };
            }
        }

        // Cria na API
        try {
            const res = await fetch(`${getApiBase()}/api/approvals`, {
                method: 'POST',
                headers: buildHeaders(),
                body: JSON.stringify({
                    ticketId,
                    clientId,
                    value: numValue,
                    reason: reason || `Aprovação solicitada pelo sistema — Chamado ${ticketId || ''}`
                })
            });

            if (!res.ok) {
                const errText = await res.text().catch(() => '');
                throw new Error(`HTTP ${res.status}: ${errText.substring(0, 200)}`);
            }
            const json = await res.json();
            if (!json.success) {
                throw new Error(json.error || 'Falha desconhecida');
            }

            return {
                status: 'created',
                approval: { id: json.id, tier: json.tier, ticket_id: ticketId, client_id: clientId, request_value: numValue, status: 'PENDING' },
                tier: json.tier
            };
        } catch (e) {
            console.warn('[ApprovalFlow] API offline:', e.message);
            // Modo offline — frontend continua funcionando
            return { status: 'created_offline', tier, error: e.message };
        }
    }

    /**
     * Verifica se pode emitir boleto.
     *
     * @returns {Promise<{canEmit: boolean, reason?: string, approval?, tier}>}
     */
    async function canEmitBoleto(ticketId, clientId, value) {
        const tier = calcTier(value);
        if (tier === TIERS.ADMIN) {
            return { canEmit: true, tier };
        }
        const approval = await findPendingByTicketClient(ticketId, clientId);
        if (!approval) {
            return {
                canEmit: false,
                reason: 'Sem solicitação de aprovação registrada',
                tier
            };
        }
        const status = (approval.status || '').toUpperCase();
        if (status === 'APPROVED') {
            return { canEmit: true, tier, approval };
        }
        if (status === 'REJECTED') {
            return {
                canEmit: false,
                reason: 'Aprovação rejeitada — verifique motivo',
                tier,
                approval
            };
        }
        return {
            canEmit: false,
            reason: `Aguardando aprovação (${status})`,
            tier,
            approval
        };
    }

    /**
     * Notifica admin/superadmin de nova pendência via notifications table.
     */
    function notifyAdmins(approval) {
        try {
            const admins = db.get('users').filter(u =>
                ['admin', 'superadmin'].includes(u.role));
            admins.forEach(admin => {
                db.insert('notifications', {
                    type: 'approval_pending',
                    title: '🟠 Nova Aprovação Financeira',
                    text: `Fatura no valor de R$ ${(approval.request_value || approval.value || 0).toFixed(2)} aguarda decisão.`,
                    approvalId: approval.id,
                    targetUserId: admin.id,
                    read: false
                });
            });
        } catch (e) {
            console.warn('[ApprovalFlow] notifyAdmins falhou:', e.message);
        }
    }

    // API pública
    window.ApprovalFlow = {
        TIERS,
        THRESHOLDS,
        calcTier,
        needsApproval,
        findPendingByTicketClient,
        requestApproval,
        canEmitBoleto,
        notifyAdmins
    };
})();