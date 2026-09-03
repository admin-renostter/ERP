/**
 * Proposals.js (V3) - Direct Parts Approval logic
 * Manages item-level status, 10-day expiration, and automatic invoicing.
 */

const Proposals = {
    EXPIRATION_DAYS: 10,

    /**
     * Sends a list of items for approval.
     */
    sendForApproval(ticketId, session) {
        const ticket = db.find('tickets', ticketId);
        if (!ticket) return;

        const parts = db.get('stock_movements').filter(m => m.ticketId === ticketId && (!m.status || m.status === 'reprovado' || m.status === 'expirado'));
        if (parts.length === 0) {
            toast('Erro', 'Nenhuma peça pendente para envio.', 'error');
            return;
        }

        const now = new Date();
        const expirationDate = new Date();
        expirationDate.setDate(now.getDate() + this.EXPIRATION_DAYS);

        // Update each item status
        parts.forEach(p => {
            db.update('stock_movements', p.id, { 
                status: 'pendente', 
                sentAt: now.toISOString(),
                expiresAt: expirationDate.toISOString()
            });
        });

        // Update ticket status
        db.update('tickets', ticketId, { 
            status: 'aguardando_aprovacao_pecas',
            proposalSentAt: now.toISOString(),
            proposalExpiresAt: expirationDate.toISOString()
        });

        // Log history
        db.insert('comments', {
            ticketId,
            authorId: session.userId,
            authorName: session.name,
            authorRole: session.role,
            text: `📊 Envio de ${parts.length} itens para aprovação do cliente. Prazo: ${fmt.date(expirationDate)}.`,
            internal: false
        });

        // Notify client
        const clientUser = db.get('users').find(u => u.clientId === ticket.clientId && u.role === 'cliente');
        db.insert('notifications', {
            type: 'proposal_pending',
            title: '🛠️ Aprovação de Peças Pendente',
            text: `Há ${parts.length} itens aguardando sua aprovação no chamado ${ticket.num}. Prazo de 10 dias.`,
            ticketId: ticket.id,
            targetUserId: clientUser?.id || null,
            targetClientId: ticket.clientId,
            read: false
        });

        toast('Enviado!', 'Proposta enviada ao cliente com validade de 10 dias.', 'success');
        if (typeof renderTable === 'function') renderTable();
        if (typeof viewTicket === 'function') viewTicket(ticketId);
    },

    /**
     * Checks if a ticket has expired proposals.
     */
    checkExpiration(ticket) {
        if (ticket.status !== 'aguardando_aprovacao_pecas' || !ticket.proposalExpiresAt) return;

        const now = new Date();
        const expires = new Date(ticket.proposalExpiresAt);

        if (now > expires) {
            // Mark all pending items as expired
            const parts = db.get('stock_movements').filter(m => m.ticketId === ticket.id && m.status === 'pendente');
            parts.forEach(p => {
                db.update('stock_movements', p.id, { status: 'expirado' });
            });

            // Revert ticket status
            db.update('tickets', ticket.id, { status: 'andamento' });

            // Notify
            db.insert('comments', {
                ticketId: ticket.id,
                authorId: 'system',
                authorName: 'Sistema',
                authorRole: 'system',
                text: `⚠️ O prazo de 10 dias para aprovação expirou. O chamado retornou para "Em Andamento".`,
                internal: false
            });

            toast('Proposta Expirada', 'O prazo de 10 dias se esgotou.', 'warning');
            return true;
        }
        return false;
    },

    /**
     * Global check for dashboards.
     */
    checkAndNotify(session, client) {
        const tickets = db.get('tickets').filter(t => t.status === 'aguardando_aprovacao_pecas');
        
        // For client: show popup if they have pending approvals
        if (session.role === 'cliente') {
            const myPending = tickets.filter(t => t.clientId === (client?.id || session.clientId));
            if (myPending.length > 0 && !sessionStorage.getItem('notified_proposal_' + myPending[0].id)) {
                const t = myPending[0];
                sessionStorage.setItem('notified_proposal_' + t.id, 'true');
                
                // Show modal (central UI logic)
                const modal = document.createElement('div');
                modal.className = 'modal-overlay';
                modal.id = 'modalNotifyProposal';
                modal.style.display = 'flex';
                modal.innerHTML = `
                <div class="modal modal-sm" style="animation: modalIn 0.4s ease">
                    <div class="modal-header">
                        <span class="modal-title">📦 Aprovação Pendente</span>
                    </div>
                    <div class="modal-body" style="text-align:center">
                        <div style="font-size:3rem; margin-bottom:15px">🔔</div>
                        <p>Há itens aguardando sua autorização no chamado <strong>${t.num}</strong>.</p>
                        <p style="font-size:0.8rem; color:var(--orange)">Prazo limite: ${fmt.date(new Date(t.proposalExpiresAt))}</p>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-ghost" onclick="document.body.removeChild(this.closest('.modal-overlay'))">Depois</button>
                        <button class="btn btn-primary" onclick="location.href='tickets.html?id=${t.id}'">Visualizar Agora</button>
                    </div>
                </div>`;
                document.body.appendChild(modal);
            }
        }
    },

    /**
     * Approves an individual item.
     */
    approveItem(itemId, session) {
        const item = db.find('stock_movements', itemId);
        if (!item) return;

        db.update('stock_movements', itemId, { status: 'aprovado', approvedAt: new Date().toISOString() });
        
        this.logMovement(item.ticketId, session, `✅ Item aprovado: ${item.productName}`);
        this.syncFinancial(item, session);
        this.checkConclusion(item.ticketId, session);
    },

    /**
     * Rejects an individual item.
     */
    rejectItem(itemId, session, reason) {
        const item = db.find('stock_movements', itemId);
        if (!item) return;

        db.update('stock_movements', itemId, { status: 'reprovado', rejectReason: reason, rejectedAt: new Date().toISOString() });
        
        this.logMovement(item.ticketId, session, `❌ Item reprovado: ${item.productName}. Motivo: ${reason}`);
        this.checkConclusion(item.ticketId, session);
    },

    /**
     * Batch approve all.
     */
    approveAll(ticketId, session) {
        const parts = db.get('stock_movements').filter(m => m.ticketId === ticketId && m.status === 'pendente');
        parts.forEach(p => this.approveItem(p.id, session));
        toast('Sucesso', 'Todos os itens foram aprovados.', 'success');
    },

    logMovement(ticketId, session, text) {
        db.insert('comments', {
            ticketId,
            authorId: session.userId,
            authorName: session.name,
            authorRole: session.role,
            text,
            internal: false
        });
    },

    /**
     * Checks if all items in a proposal were decided.
     */
    checkConclusion(ticketId, session) {
        const parts = db.get('stock_movements').filter(m => m.ticketId === ticketId && m.status === 'pendente');
        if (parts.length === 0) {
            db.update('tickets', ticketId, { status: 'andamento' });
            toast('Concluído', 'Todas as pendências de peças foram resolvidas.', 'success');
        }
        if (typeof viewTicket === 'function') viewTicket(ticketId);
        if (typeof viewDetail === 'function') viewDetail(ticketId);
    },

    /**
     * Generates invoice for an approved item.
     *
     * Fluxo:
     *   1. Cria/atualiza fatura local com item aprovado
     *   2. Sincroniza ledger (financial_transactions)
     *   3. Se valor total >= R$ 1.000 → cria pending_approval (NÃO emite boleto)
     *   4. Se valor < R$ 1.000 OU approval approved → emite boleto via Cora
     *
     * ApprovalFlow.calcTier(value):
     *   < R$ 1.000       → admin tier (auto, sem fila)
     *   R$ 1.000-5.000   → superadmin tier (fila)
     *   >= R$ 5.000      → compliance tier (fila + motivo >=200 chars)
     */
    syncFinancial(item, session) {
        const ticket = db.find('tickets', item.ticketId);
        if (!ticket) return;

        // Try to find an open invoice for this ticket
        let invoice = db.get('faturas').find(f => f.ticketId === ticket.id && f.status === 'pendente');

        if (!invoice) {
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + 5); // Default 5 days
            invoice = db.insert('faturas', {
                ticketId: ticket.id,
                clientId: ticket.clientId,
                clientName: ticket.clientName,
                total: 0,
                status: 'pendente',
                dueDate: dueDate.toISOString(),
                description: `Faturamento de peças - Chamado ${ticket.num}`
            });
        }

        // Add item to invoice
        db.insert('itens_fatura', {
            faturaId: invoice.id,
            description: item.productName,
            qty: Math.abs(item.quantity),
            unitPrice: item.unitPrice || 0,
            total: Math.abs(item.quantity) * (item.unitPrice || 0)
        });

        // Update invoice total
        const items = db.findBy('itens_fatura', 'faturaId', invoice.id);
        const newTotal = items.reduce((sum, it) => sum + it.total, 0);
        db.update('faturas', invoice.id, { total: newTotal });

        // Synchronize with financial_transactions (LEDGER)
        let trans = db.get('financial_transactions').find(t => t.ticketId === ticket.id && t.categoryId === 'fcat3' && t.status === 'pendente');

        if (!trans) {
            trans = db.insert('financial_transactions', {
                type: 'receita',
                description: `Venda de Peças — Chamado ${ticket.num}`,
                value: newTotal,
                dueDate: invoice.dueDate.split('T')[0],
                status: 'pendente',
                clientId: ticket.clientId,
                categoryId: 'fcat3',
                ticketId: ticket.id
            });
        } else {
            db.update('financial_transactions', trans.id, { value: newTotal });
        }

        // 🚦 APPROVAL FLOW — antes de emitir boleto, verifica se precisa aprovação
        // ApprovalFlow é carregado via <script> em tickets.html / dashboard.html.
        // Se não estiver carregado, fallback para o fluxo antigo (sem aprovação).
        const emitBoletoSafely = async () => {
            if (typeof CoraIntegration === 'undefined') return;
            try {
                const client = db.find('clients', ticket.clientId);
                const mockContract = {
                    id: `Chamado ${ticket.num}`,
                    value: newTotal,
                    servicos: [`Peça: ${item.productName} (Chamado ${ticket.num})`]
                };
                await CoraIntegration.emitirBoleto(mockContract, client, invoice.dueDate.split('T')[0]);
                console.log(`[Proposals] API Invoice generated for part: ${item.productName}`);

                // Marca fatura como enviada para a Cora
                db.update('faturas', invoice.id, {
                    status: 'emitida',
                    emittedAt: new Date().toISOString()
                });
            } catch (err) {
                console.warn('[Proposals] API Sync failed:', err.message);
                // Marca como erro de emissão — admin pode re-tentar
                db.update('faturas', invoice.id, {
                    emissionError: err.message
                });
            }
        };

        if (typeof ApprovalFlow !== 'undefined') {
            (async () => {
                try {
                    const tier = ApprovalFlow.calcTier(newTotal);
                    const needs = ApprovalFlow.needsApproval(newTotal);

                    if (!needs) {
                        // <= R$ 1.000 — auto-approved, emite direto
                        await emitBoletoSafely();
                        return;
                    }

                    // >= R$ 1.000 — verifica se já tem aprovação
                    const check = await ApprovalFlow.canEmitBoleto(ticket.id, ticket.clientId, newTotal);

                    if (check.canEmit) {
                        // Já aprovada (caso o admin aprove entre o request e o emit)
                        await emitBoletoSafely();
                        return;
                    }

                    // Marca fatura como aguardando aprovação
                    db.update('faturas', invoice.id, {
                        status: 'aguardando_aprovacao',
                        pendingApprovalTier: tier,
                        pendingApprovalReason: check.reason || 'Valor acima do limite de auto-aprovação'
                    });

                    // Cria/atualiza pending_approval
                    const req = await ApprovalFlow.requestApproval({
                        ticketId: ticket.id,
                        clientId: ticket.clientId,
                        value: newTotal,
                        reason: `Fatura #${invoice.id} — Chamado ${ticket.num} — ${ticket.clientName || ''}`
                    });

                    if (req.status === 'created' || req.status === 'already_pending') {
                        if (req.approval) ApprovalFlow.notifyAdmins(req.approval);
                        toast(
                            'Aguardando Aprovação',
                            `Fatura R$ ${newTotal.toFixed(2)} enviada para fila ${req.tier}. ` +
                            `Admin/Superadmin precisa aprovar antes de emitir boleto.`,
                            'warning'
                        );
                        this.logMovement(item.ticketId, session,
                            `🟠 Fatura R$ ${newTotal.toFixed(2)} marcada como aguardando aprovação (tier ${req.tier}).`);
                    } else if (req.status === 'rejected') {
                        toast(
                            'Aprovação Rejeitada',
                            'Fatura rejeitada — verifique motivo e ajuste valor.',
                            'error'
                        );
                    } else if (req.status === 'created_offline') {
                        // Backend offline — segue com warning
                        db.update('faturas', invoice.id, {
                            offlineApproval: true
                        });
                        toast(
                            'Modo Offline',
                            'Backend de aprovação offline. Fatura marcada para revisão manual.',
                            'warning'
                        );
                    }
                } catch (err) {
                    console.error('[Proposals] Approval flow error:', err);
                    await emitBoletoSafely();
                }
            })();
        } else {
            // ApprovalFlow não carregado — emite direto (modo legacy)
            if (typeof CoraIntegration !== 'undefined') {
                (async () => {
                    try {
                        const client = db.find('clients', ticket.clientId);
                        const mockContract = {
                            id: `Chamado ${ticket.num}`,
                            value: newTotal,
                            servicos: [`Peça: ${item.productName} (Chamado ${ticket.num})`]
                        };
                        await CoraIntegration.emitirBoleto(mockContract, client, invoice.dueDate.split('T')[0]);
                        console.log(`[Proposals] API Invoice generated for part: ${item.productName}`);
                    } catch (err) {
                        console.warn('[Proposals] API Sync failed:', err.message);
                    }
                })();
            }
        }

        // Update client balance if applicable
        const client = db.find('clients', ticket.clientId);
        if (client) {
            const pending = (client.pendingBalance || 0) + (Math.abs(item.quantity) * (item.unitPrice || 0));
            db.update('clients', client.id, { pendingBalance: pending });
        }
    }
};
