/* Extraido de admin/aprovacoes.html por tools/csp-migrate.py (CSP sem unsafe-inline). */
/* ── gerado por tools/csp-migrate.py: nomes liberados para os data-on-* desta pagina ── */
;(function () {
  var s = window.__cspScope || (window.__cspScope = {});
  function def(n, g, st) { Object.defineProperty(s, n, { configurable: true, enumerable: true, get: g, set: st }); }
  def('auth', function () { return typeof auth !== 'undefined' ? auth : undefined; }, function (v) { auth = v; });
  def('closeDecisionModal', function () { return typeof closeDecisionModal !== 'undefined' ? closeDecisionModal : undefined; }, function (v) { closeDecisionModal = v; });
  def('exportAprovacoes', function () { return typeof exportAprovacoes !== 'undefined' ? exportAprovacoes : undefined; }, function (v) { exportAprovacoes = v; });
  def('loadApprovals', function () { return typeof loadApprovals !== 'undefined' ? loadApprovals : undefined; }, function (v) { loadApprovals = v; });
  def('openDecisionModal', function () { return typeof openDecisionModal !== 'undefined' ? openDecisionModal : undefined; }, function (v) { openDecisionModal = v; });
  def('submitDecision', function () { return typeof submitDecision !== 'undefined' ? submitDecision : undefined; }, function (v) { submitDecision = v; });
  def('updateReasonHint', function () { return typeof updateReasonHint !== 'undefined' ? updateReasonHint : undefined; }, function (v) { updateReasonHint = v; });
})();
/* ── fim do bloco gerado ── */

        const session = auth.protect(['admin', 'superadmin', 'financeiro']);
        const isDecider = ['admin', 'superadmin'].includes(session.role);
        initSidebar();

        const API = ''; // mesma origem (/api/...)
        let approvals = [];

        // ── Header info ──
        function setApiAuthHeaders() {
            return {
                'Content-Type': 'application/json',
                'X-User-Id': session.userId,
                'X-User-Name': session.name || '',
                'X-User-Role': session.role
            };
        }

        // ── Carregar ──
        async function loadApprovals() {
            const tier = document.getElementById('filterTier').value;
            const status = document.getElementById('filterStatus').value;
            const search = (document.getElementById('searchInput').value || '').toLowerCase();

            let url = `${API}/api/approvals?`;
            if (tier) url += `tier=${tier}&`;
            if (status) url += `status=${status}&`;
            try {
                const res = await fetch(url, { headers: setApiAuthHeaders() });
                const json = await res.json();
                if (!json.success) throw new Error(json.error || 'Erro');
                approvals = json.data || [];
            } catch (e) {
                approvals = [];
                toast('Erro', 'API inacessível: ' + e.message, 'error');
            }

            renderApprovals(search);
            await loadKpis();
            await loadCount();
        }

        function renderApprovals(search) {
            const list = document.getElementById('approvalList');
            const filtered = approvals.filter(a => {
                if (!search) return true;
                const blob = `${a.client_id || ''} ${a.requested_by || ''} ${a.ticket_id || ''}`.toLowerCase();
                return blob.includes(search);
            });

            document.getElementById('pendingBanner').style.display = filtered.length > 0 ? 'flex' : 'none';
            document.getElementById('bannerTitle').textContent =
                `${filtered.length} pendência${filtered.length !== 1 ? 's' : ''} aguardando sua decisão`;

            if (filtered.length === 0) {
                list.innerHTML = '<div style="text-align:center;padding:60px;color:var(--text-secondary);background:var(--bg-surface);border-radius:12px">✅ Nenhuma pendência ativa no momento.</div>';
                return;
            }

            list.innerHTML = filtered.map(a => {
                const tierCls = a.tier;
                const tierLabel = a.tier === 'compliance' ? 'COMPLIANCE' : a.tier.toUpperCase();
                const statusBadge = a.status === 'ESCALATED'
                    ? '<span class="tier-badge escalated">ESCALADA</span>'
                    : '';
                const borderCls = a.status === 'ESCALATED' ? 'escalated' : `${a.tier === 'compliance' ? 'compliance' : (a.tier === 'superadmin' ? 'escalated' : 'admin-level')}`;

                return `
                <div class="approval-card ${borderCls}">
                    <div class="approval-info">
                        <h4>
                            ${esc(a.client_id)}
                            <span class="tier-badge ${tierCls}">${tierLabel}</span>
                            ${statusBadge}
                        </h4>
                        <div style="font-size:0.92rem;color:var(--text-primary);font-weight:600;margin:6px 0">${fmt.currency(a.request_value)}</div>
                        <div class="approval-meta">
                            ${a.ticket_id ? `<span>🎫 Chamado: ${esc(a.ticket_id)}</span>` : ''}
                            <span>👤 Por: ${esc(a.requested_by)}</span>
                            <span>📅 ${fmt.relative(a.created_at)}</span>
                            <span>📝 ${esc(a.requires_approval_reason || '—')}</span>
                        </div>
                    </div>
                    <div class="approval-actions">
                        ${isDecider && (a.status === 'PENDING' || a.status === 'ESCALATED') ? `
                            <button class="btn btn-primary btn-sm" data-on-click="openDecisionModal('${esc(a.id)}', 'approve')">✓ Aprovar</button>
                            <button class="btn btn-ghost btn-sm" data-on-click="openDecisionModal('${esc(a.id)}', 'edit')">✎ Editar</button>
                            <button class="btn btn-ghost btn-sm" style="color:var(--danger);border-color:var(--danger)" data-on-click="openDecisionModal('${esc(a.id)}', 'reject')">✗ Rejeitar</button>
                        ` : (a.status === 'APPROVED'
                                ? `<span class="tier-badge" style="background:rgba(46,160,67,.18);color:#2EA043">✅ APROVADA</span>`
                                : a.status === 'REJECTED'
                                    ? `<span class="tier-badge" style="background:rgba(218,54,51,.18);color:#DA3633">✗ REJEITADA</span>`
                                    : a.status === 'EXPIRED'
                                        ? `<span class="tier-badge" style="background:rgba(139,148,158,.18);color:#8B949E">⏱ EXPIRADA</span>`
                                        : '')}
                    </div>
                </div>`;
            }).join('');
        }

        async function loadKpis() {
            // Pendentes
            try {
                const r = await fetch(`${API}/api/approvals/count`, { headers: setApiAuthHeaders() });
                const j = await r.json();
                document.getElementById('kpiPending').textContent = j.count || 0;
            } catch {}
            // Escaladas
            try {
                const r = await fetch(`${API}/api/approvals?status=ESCALATED`, { headers: setApiAuthHeaders() });
                const j = await r.json();
                const escs = j.data || [];
                document.getElementById('kpiEscalated').textContent = escs.length;
                // Total valor pendente
                const total = approvals.filter(a => a.status === 'PENDING' || a.status === 'ESCALATED')
                                        .reduce((s, a) => s + (a.request_value || 0), 0);
                document.getElementById('kpiTotalValue').textContent = fmt.currency(total);
            } catch {}
            // Aprovadas hoje
            try {
                const r = await fetch(`${API}/api/approvals?status=APPROVED&limit=200`, { headers: setApiAuthHeaders() });
                const j = await r.json();
                const today = new Date().toISOString().split('T')[0];
                const approvedToday = (j.data || []).filter(a => a.decided_at && a.decided_at.startsWith(today)).length;
                document.getElementById('kpiApprovedToday').textContent = approvedToday;
            } catch {}
        }

        async function loadCount() {
            try {
                const r = await fetch(`${API}/api/approvals/count`, { headers: setApiAuthHeaders() });
                const j = await r.json();
                const badge = document.getElementById('navBadge');
                if (j.count > 0) {
                    badge.textContent = j.count;
                    badge.style.display = '';
                } else {
                    badge.style.display = 'none';
                }
            } catch {}
        }

        // ── Modal ──
        let currentApproval = null;
        let currentAction = null;

        function openDecisionModal(id, action) {
            const a = approvals.find(x => x.id === id);
            if (!a) return;
            currentApproval = a;
            currentAction = action;

            document.getElementById('modalTitle').textContent =
                action === 'approve' ? '✓ Aprovar Pendência'
                : action === 'edit' ? '✎ Editar Valor da Pendência'
                : '✗ Rejeitar Pendência';

            document.getElementById('modalContext').innerHTML = `
                <div style="margin-bottom:6px"><strong>Cliente:</strong> ${esc(a.client_id)}</div>
                <div style="margin-bottom:6px"><strong>Valor Original:</strong> ${fmt.currency(a.request_value)}</div>
                <div style="margin-bottom:6px"><strong>Ticket:</strong> ${esc(a.ticket_id || '—')}</div>
                <div style="margin-bottom:6px"><strong>Solicitante:</strong> ${esc(a.requested_by)}</div>
                <div><strong>Tier:</strong> <span class="tier-badge ${a.tier}">${a.tier.toUpperCase()}</span></div>
            `;

            document.getElementById('newValueGroup').style.display = action === 'edit' ? '' : 'none';
            document.getElementById('newValue').value = a.request_value;

            const isCompliance = a.tier === 'compliance';
            const minLen = isCompliance ? 200 : 30;
            document.getElementById('motivoRequired').textContent = '*';
            document.getElementById('reasonHint').textContent = `Mínimo ${minLen} caracteres${isCompliance ? ' (compliance exige detalhamento)' : ''}`;
            document.getElementById('reasonHint').classList.toggle('danger', false);
            document.getElementById('decisionReason').value = '';

            // Botões
            document.getElementById('btnApprove').style.display = action === 'approve' ? '' : 'none';
            document.getElementById('btnEdit').style.display = action === 'edit' ? '' : 'none';
            document.getElementById('btnReject').style.display = action === 'reject' ? '' : 'none';

            // Impacto
            document.getElementById('impactBox').style.display = '';
            document.getElementById('impactText').textContent =
                action === 'approve' ? 'Fatura ajustada → boleto bancário será emitido automaticamente via gateway Cora.'
                : action === 'edit' ? 'Fatura será reemitida com o novo valor; boleto gerado via gateway Cora.'
                : 'OS será marcada como reprovada; cliente será notificado.';

            openModal('modalDecision');
        }

        function updateReasonHint() {
            const reason = document.getElementById('decisionReason').value.trim();
            const len = reason.length;
            const min = currentApproval && currentApproval.tier === 'compliance' ? 200 : 30;
            const hint = document.getElementById('reasonHint');
            hint.textContent = `${len}/${min} caracteres`;
            hint.classList.toggle('danger', len < min);
        }

        function closeDecisionModal() {
            closeModal('modalDecision');
            currentApproval = null;
            currentAction = null;
        }

        async function submitDecision(action) {
            if (!currentApproval) return;
            const reason = document.getElementById('decisionReason').value.trim();
            const minLen = currentApproval.tier === 'compliance' ? 200 : 30;
            if (action !== 'approve' && reason.length < minLen) {
                toast('Motivo curto demais', `Mínimo ${minLen} caracteres. Atual: ${reason.length}`, 'warning');
                return;
            }

            let url = `${API}/api/approvals/${currentApproval.id}/${action}`;
            const body = { reason };
            if (action === 'edit') {
                body.newValue = parseFloat(document.getElementById('newValue').value);
                if (isNaN(body.newValue) || body.newValue <= 0) {
                    return toast('Valor inválido', 'Informe o novo valor.', 'warning');
                }
            }

            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: setApiAuthHeaders(),
                    body: JSON.stringify(body)
                });
                const json = await res.json();
                if (!res.ok || !json.success) throw new Error(json.error || 'Erro ao decidir');
                toast('Sucesso', `Pendência ${action === 'approve' ? 'aprovada' : action === 'edit' ? 'editada' : 'rejeitada'}.`, 'success');
                closeDecisionModal();
                loadApprovals();
            } catch (e) {
                toast('Erro', e.message, 'error');
            }
        }

        // ── Export ──
        function exportAprovacoes() {
            const rows = approvals.map(a => ({
                id: a.id,
                clientId: a.client_id,
                ticketId: a.ticket_id || '',
                valorOriginal: a.request_value,
                novoValor: a.new_value || '',
                tier: a.tier,
                status: a.status,
                decisao: a.decision_type || '',
                decididoPor: a.decided_by || '',
                decididoEm: a.decided_at || '',
                motivo: a.decision_reason || '',
                criadoEm: a.created_at
            }));
            exportCSV(rows, `aprovacoes-${new Date().toISOString().split('T')[0]}.csv`);
            toast('Exportado', 'CSV baixado.', 'success');
        }

        // ── Init ──
        document.addEventListener('DOMContentLoaded', () => {
            try { initSidebar(); } catch (e) {}
            loadApprovals();
            // Refresh a cada 60s para o badge ficar vivo
            setInterval(() => loadCount(), 60000);
        });
    
