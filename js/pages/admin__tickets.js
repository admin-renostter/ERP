/* Extraido de admin/tickets.html por tools/csp-migrate.py (CSP sem unsafe-inline). */
/* ── gerado por tools/csp-migrate.py: nomes liberados para os data-on-* desta pagina ── */
;(function () {
  var s = window.__cspScope || (window.__cspScope = {});
  function def(n, g, st) { Object.defineProperty(s, n, { configurable: true, enumerable: true, get: g, set: st }); }
  def('$', function () { return typeof $ !== 'undefined' ? $ : undefined; }, function (v) { $ = v; });
  def('Proposals', function () { return typeof Proposals !== 'undefined' ? Proposals : undefined; }, function (v) { Proposals = v; });
  def('addChecklistItem', function () { return typeof addChecklistItem !== 'undefined' ? addChecklistItem : undefined; }, function (v) { addChecklistItem = v; });
  def('addComment', function () { return typeof addComment !== 'undefined' ? addComment : undefined; }, function (v) { addComment = v; });
  def('addTimeLog', function () { return typeof addTimeLog !== 'undefined' ? addTimeLog : undefined; }, function (v) { addTimeLog = v; });
  def('adminAddPart', function () { return typeof adminAddPart !== 'undefined' ? adminAddPart : undefined; }, function (v) { adminAddPart = v; });
  def('applyFilters', function () { return typeof applyFilters !== 'undefined' ? applyFilters : undefined; }, function (v) { applyFilters = v; });
  def('attachEvidence', function () { return typeof attachEvidence !== 'undefined' ? attachEvidence : undefined; }, function (v) { attachEvidence = v; });
  def('auth', function () { return typeof auth !== 'undefined' ? auth : undefined; }, function (v) { auth = v; });
  def('changeCategory', function () { return typeof changeCategory !== 'undefined' ? changeCategory : undefined; }, function (v) { changeCategory = v; });
  def('changePriority', function () { return typeof changePriority !== 'undefined' ? changePriority : undefined; }, function (v) { changePriority = v; });
  def('changeStatus', function () { return typeof changeStatus !== 'undefined' ? changeStatus : undefined; }, function (v) { changeStatus = v; });
  def('clearAttachment', function () { return typeof clearAttachment !== 'undefined' ? clearAttachment : undefined; }, function (v) { clearAttachment = v; });
  def('closeModal', function () { return typeof closeModal !== 'undefined' ? closeModal : undefined; }, function (v) { closeModal = v; });
  def('confirmRemovePart', function () { return typeof confirmRemovePart !== 'undefined' ? confirmRemovePart : undefined; }, function (v) { confirmRemovePart = v; });
  def('confirmTransfer', function () { return typeof confirmTransfer !== 'undefined' ? confirmTransfer : undefined; }, function (v) { confirmTransfer = v; });
  def('createTicket', function () { return typeof createTicket !== 'undefined' ? createTicket : undefined; }, function (v) { createTicket = v; });
  def('currentPage', function () { return typeof currentPage !== 'undefined' ? currentPage : undefined; }, function (v) { currentPage = v; });
  def('delCheckItem', function () { return typeof delCheckItem !== 'undefined' ? delCheckItem : undefined; }, function (v) { delCheckItem = v; });
  def('delTimeLog', function () { return typeof delTimeLog !== 'undefined' ? delTimeLog : undefined; }, function (v) { delTimeLog = v; });
  def('exportTickets', function () { return typeof exportTickets !== 'undefined' ? exportTickets : undefined; }, function (v) { exportTickets = v; });
  def('i', function () { return typeof i !== 'undefined' ? i : undefined; }, function (v) { i = v; });
  def('loadAllTickets', function () { return typeof loadAllTickets !== 'undefined' ? loadAllTickets : undefined; }, function (v) { loadAllTickets = v; });
  def('openAdminAddPart', function () { return typeof openAdminAddPart !== 'undefined' ? openAdminAddPart : undefined; }, function (v) { openAdminAddPart = v; });
  def('openChecklistModal', function () { return typeof openChecklistModal !== 'undefined' ? openChecklistModal : undefined; }, function (v) { openChecklistModal = v; });
  def('openNewTicket', function () { return typeof openNewTicket !== 'undefined' ? openNewTicket : undefined; }, function (v) { openNewTicket = v; });
  def('openSwapPart', function () { return typeof openSwapPart !== 'undefined' ? openSwapPart : undefined; }, function (v) { openSwapPart = v; });
  def('openTimeLogModal', function () { return typeof openTimeLogModal !== 'undefined' ? openTimeLogModal : undefined; }, function (v) { openTimeLogModal = v; });
  def('openTransferModal', function () { return typeof openTransferModal !== 'undefined' ? openTransferModal : undefined; }, function (v) { openTransferModal = v; });
  def('p', function () { return typeof p !== 'undefined' ? p : undefined; }, function (v) { p = v; });
  def('reassign', function () { return typeof reassign !== 'undefined' ? reassign : undefined; }, function (v) { reassign = v; });
  def('rejectBatchPrompt', function () { return typeof rejectBatchPrompt !== 'undefined' ? rejectBatchPrompt : undefined; }, function (v) { rejectBatchPrompt = v; });
  def('renderAdminPartList', function () { return typeof renderAdminPartList !== 'undefined' ? renderAdminPartList : undefined; }, function (v) { renderAdminPartList = v; });
  def('renderTable', function () { return typeof renderTable !== 'undefined' ? renderTable : undefined; }, function (v) { renderTable = v; });
  def('searchClients', function () { return typeof searchClients !== 'undefined' ? searchClients : undefined; }, function (v) { searchClients = v; });
  def('selectClient', function () { return typeof selectClient !== 'undefined' ? selectClient : undefined; }, function (v) { selectClient = v; });
  def('session', function () { return typeof session !== 'undefined' ? session : undefined; }, function (v) { session = v; });
  def('setInternal', function () { return typeof setInternal !== 'undefined' ? setInternal : undefined; }, function (v) { setInternal = v; });
  def('setView', function () { return typeof setView !== 'undefined' ? setView : undefined; }, function (v) { setView = v; });
  def('switchDetailTab', function () { return typeof switchDetailTab !== 'undefined' ? switchDetailTab : undefined; }, function (v) { switchDetailTab = v; });
  def('toggleCheckItem', function () { return typeof toggleCheckItem !== 'undefined' ? toggleCheckItem : undefined; }, function (v) { toggleCheckItem = v; });
  def('updatePartStatus', function () { return typeof updatePartStatus !== 'undefined' ? updatePartStatus : undefined; }, function (v) { updatePartStatus = v; });
  def('viewTicket', function () { return typeof viewTicket !== 'undefined' ? viewTicket : undefined; }, function (v) { viewTicket = v; });
})();
/* ── fim do bloco gerado ── */

        const session = auth.protect(['admin', 'superadmin', 'tecnico']);
        if (!session) throw new Error('Access denied');

        if (session.role === 'admin' || session.role === 'superadmin') {
            document.addEventListener('DOMContentLoaded', () => {
                const btn = document.getElementById('btnNewTicketAdmin');
                if (btn) btn.style.display = 'inline-flex';
            });
        }

        let currentPage = 1, currentDetailId = null, currentView = 'all';
        const PER_PAGE = 10;

        // ─── View Toggle ───
        function setView(v) {
            currentView = v;
            ['all', 'mine', 'transferred'].forEach(id => {
                document.getElementById('tab-' + id).classList.toggle('active', id === v);
            });
            currentPage = 1;
            renderTable();
        }

        function updatePillCounts() {
            const all = db.get('tickets');
            const mine = all.filter(t => t.assignedTo === session.userId);
            const xferIds = db.findBy('transfers', 'toUserId', session.userId).map(x => x.ticketId);
            const transferred = all.filter(t => xferIds.includes(t.id));
            document.getElementById('cnt-all').textContent = all.length;
            document.getElementById('cnt-mine').textContent = mine.length;
            document.getElementById('cnt-transferred').textContent = transferred.length;
        }

        // ─── KPIs ───
        function loadKpis() {
            const t = db.get('tickets');
            const now = Date.now();
            const expiredSLA = t.filter(x => !['resolvido', 'fechado', 'cancelado'].includes(x.status) && new Date((x.slaResolutionDeadline === 'cronograma' ? 0 : x.slaResolutionDeadline) || 0).getTime() < now).length;
            document.getElementById('ticketKpis').innerHTML = [
                { label: 'Abertos', value: t.filter(x => x.status === 'aberto').length, icon: '🔵', cls: 'blue' },
                { label: 'Em Andamento', value: t.filter(x => x.status === 'andamento').length, icon: '🟡', cls: 'yellow' },
                { label: 'Aguardando', value: t.filter(x => x.status === 'aguardando').length, icon: '⚪', cls: 'gray' },
                { label: 'Resolvidos', value: t.filter(x => ['resolvido', 'fechado'].includes(x.status)).length, icon: '🟢', cls: 'green' },
                { label: 'SLAs Vencidos', value: expiredSLA, icon: '🔴', cls: 'red' },
            ].map(k => `<div class="kpi-card"><div class="kpi-info"><div class="kpi-label">${k.label}</div><div class="kpi-value">${k.value}</div></div><div class="kpi-icon ${k.cls || 'blue'}" style="font-size:1.3rem">${k.icon}</div></div>`).join('');
        }

        // ─── Filter & Data ───
        function getFiltered() {
            const q = document.getElementById('searchInput').value.toLowerCase();
            const st = document.getElementById('fStatus').value;
            const pr = document.getElementById('fPriority').value;
            const ct = document.getElementById('fCategory').value;

            let base = db.get('tickets');

            if (currentView === 'mine') {
                base = base.filter(t => t.assignedTo === session.userId);
            } else if (currentView === 'transferred') {
                const xferIds = db.findBy('transfers', 'toUserId', session.userId).map(x => x.ticketId);
                base = base.filter(t => xferIds.includes(t.id));
            }

            return base.filter(t => {
                const mQ = !q || t.title?.toLowerCase().includes(q) || t.clientName?.toLowerCase().includes(q) || t.num?.includes(q);
                const mS = !st || t.status === st;
                const mP = !pr || t.priority === pr;
                const mC = !ct || t.category === ct;
                return mQ && mS && mP && mC;
            }).sort((a, b) => {
                const pOrder = { critica: 4, alta: 3, media: 2, baixa: 1 };
                return (pOrder[b.priority] || 0) - (pOrder[a.priority] || 0) || (new Date(b.createdAt) - new Date(a.createdAt));
            });
        }

        function applyFilters() { currentPage = 1; renderTable(); }

        // ─── Client contact helpers ───
        function clientAddr(client) {
            if (!client) return '—';
            const parts = [client.logradouro, client.numero, client.bairro, client.cidade].filter(Boolean);
            return parts.join(', ') || '—';
        }
        function clientPhone(client) {
            if (!client) return '—';
            return client.celular || client.telefone || '—';
        }

        // ─── Render Table ───
        function renderTable() {
            const data = getFiltered();
            const start = (currentPage - 1) * PER_PAGE;
            const page = data.slice(start, start + PER_PAGE);
            const clients = {};
            db.get('clients').forEach(c => { clients[c.id] = c; });

            document.getElementById('ticketsTable').innerHTML = page.length ? page.map(t => {
                const cli = clients[t.clientId] || null;
                const addr = clientAddr(cli);
                const phone = clientPhone(cli);
                return `
    <tr style="cursor:pointer" data-on-click="viewTicket('${t.id}')">
      <td style="font-family:monospace;font-size:0.78rem;color:var(--text-secondary)">${esc(t.num)}</td>
      <td>
        <div style="font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.title)}</div>
        <div style="font-size:0.72rem;color:var(--text-secondary)">${t.category || ''}</div>
      </td>
      <td class="td-muted">${esc(t.clientName)}</td>
      <td class="td-muted" style="font-size:0.78rem;max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(addr)}">${esc(addr)}</td>
      <td class="td-muted" style="font-size:0.8rem;white-space:nowrap">
        ${phone !== '—' ? `<a href="tel:${phone.replace(/\D/g, '')}" data-on-click="event.stopPropagation()" style="color:var(--blue);text-decoration:none">${esc(phone)}</a>` : '—'}
      </td>
      <td>${badgeTicketStatus(t.status)}</td>
      <td>${badgePriority(t.priority)}</td>
      <td class="td-muted" style="font-size:0.8rem">${t.assignedName ? esc(t.assignedName) : '<span style="color:var(--text-muted)">—</span>'}</td>
      <td>${renderSLABar(t)}</td>
      <td class="td-muted">${fmt.relative(t.createdAt)}</td>
    </tr>`;
            }).join('') : `<tr><td colspan="10"><div class="empty-state"><h4>Nenhum chamado encontrado</h4></div></td></tr>`;

            const pages = Math.ceil(data.length / PER_PAGE);
            document.getElementById('paginInfo').textContent = `${Math.min(start + 1, data.length)}–${Math.min(start + PER_PAGE, data.length)} de ${data.length}`;
            document.getElementById('paginBtns').innerHTML = Array.from({ length: pages }, (_, i) => `<button class="page-btn ${i + 1 === currentPage ? 'active' : ''}" data-on-click="currentPage=${i + 1};renderTable()">${i + 1}</button>`).join('');
            updatePillCounts();
        }

        // ─── Ticket Detail ───
        function viewTicket(id) {
            currentDetailId = id;
            const t = db.find('tickets', id); if (!t) return;
            document.getElementById('detailTitle').textContent = t.title;
            document.getElementById('detailNum').textContent = `${t.num} · ${TICKET_STATUS[t.status]?.label || t.status}`;
            const sel = document.getElementById('detailStatusSelect');
            sel.innerHTML = Object.entries(TICKET_STATUS).map(([k, v]) => `<option value="${k}" ${t.status === k ? 'selected' : ''}>${v.label}</option>`).join('');

            // Show transfer button for admin/superadmin/tecnico
            document.getElementById('btnTransfer').style.display = ['admin', 'superadmin', 'tecnico'].includes(session.role) ? '' : 'none';

            const comments = db.findBy('comments', 'ticketId', id).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            const transfers = db.findBy('transfers', 'ticketId', id).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            const sla = calcSLA(t, t.contractType);
            const client = db.find('clients', t.clientId) || {};
            const contract = db.find('contracts', t.contractId) || {};

            // Build merged timeline
            const tlItems = [
                { type: 'open', date: t.createdAt },
                ...comments.map(c => ({ type: 'comment', date: c.createdAt, data: c })),
                ...transfers.map(x => ({ type: 'transfer', date: x.createdAt, data: x })),
                ...(t.closedAt ? [{ type: 'close', date: t.closedAt }] : []),
            ].sort((a, b) => new Date(a.date) - new Date(b.date));

            // V3: Check for expiration before rendering
            try {
                if (Proposals.checkExpiration(t)) {
                    return viewTicket(id); // Reload
                }
            } catch(e) { /* skip if proposals module errors */ }

            const parts = db.get('stock_movements').filter(m => m.ticketId === id);

            // Pre-render parts to avoid nested template literal issues
            const _pStMap = {
                pendente: { lbl: '⏳ Pendente', color: '#D29922', bg: 'rgba(210,153,34,.15)' },
                aprovado: { lbl: '✅ Aprovado', color: '#2EA043', bg: 'rgba(46,160,67,.15)' },
                reprovado: { lbl: '❌ Reprovado', color: '#DA3633', bg: 'rgba(218,54,51,.15)' },
                expirado: { lbl: '⚠️ Expirado', color: '#8B949E', bg: 'rgba(139,148,158,.15)' }
            };
            const _pCanEdit = !['resolvido', 'fechado', 'cancelado'].includes(t.status);
            const _pIsLocked = t.status === 'aguardando_aprovacao_pecas';
            let partsHtml = '';
            if (parts.length) {
                parts.forEach(function(p) {
                    const st = _pStMap[p.status] || _pStMap.pendente;
                    // Admin always sees the status dropdown
                    const statusCtrl = _pCanEdit
                        ? '<select class="form-select" style="font-size:0.72rem;padding:2px 6px;max-width:135px" data-on-change="updatePartStatus(\'' + p.id + '\', this.value)">'
                          + '<option value="pendente"' + (p.status === 'pendente' ? ' selected' : '') + '>⏳ Pendente</option>'
                          + '<option value="aprovado"' + (p.status === 'aprovado' ? ' selected' : '') + '>✅ Aprovado</option>'
                          + '<option value="reprovado"' + (p.status === 'reprovado' ? ' selected' : '') + '>❌ Reprovado</option>'
                          + '<option value="expirado"' + (p.status === 'expirado' ? ' selected' : '') + '>⚠️ Expirado</option>'
                          + '</select>'
                        : '<span class="part-status" style="background:' + st.bg + ';color:' + st.color + ';font-size:0.7rem;padding:2px 6px;border-radius:4px;font-weight:600">' + st.lbl + '</span>';
                    const mgmtBtns = _pCanEdit
                        ? '<div style="display:flex;gap:4px;margin-top:4px">'
                          + '<button class="btn btn-ghost btn-sm btn-icon" title="Trocar peça" data-on-click="openSwapPart(\'' + p.id + '\')" style="height:24px;width:24px;padding:0;min-height:24px"><span style="font-size:.8rem">🔄</span></button>'
                          + '<button class="btn btn-danger btn-sm btn-icon" title="Excluir peça" data-on-click="confirmRemovePart(\'' + p.id + '\')" style="height:24px;width:24px;padding:0;min-height:24px"><span style="font-size:.8rem">🗑</span></button>'
                          + '</div>'
                        : '';
                    partsHtml += '<div class="part-item">'
                        + '<span style="flex:1"><strong>' + Math.abs(p.quantity) + 'x</strong> ' + esc(p.productName)
                        + '<div style="font-size:.7rem;color:var(--text-muted)">SKU: ' + esc(p.productSku || '') + ' · Por: ' + esc(p.technicianName || 'Admin') + '</div></span>'
                        + '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px">' + statusCtrl + mgmtBtns + '</div>'
                        + '</div>';
                });
            } else {
                partsHtml = '<p style="font-size:0.8rem;color:var(--text-secondary)">Nenhuma peça solicitada para este chamado.</p>';
            }

            function renderTLItem(item) {
                if (item.type === 'open') return `<div class="timeline-item"><div class="timeline-dot" style="background:var(--blue-dim);color:var(--blue);font-size:0.7rem">🎫</div><div class="timeline-content"><div class="timeline-meta">Chamado aberto · ${fmt.datetime(item.date)}</div><div class="timeline-text">Chamado ${t.num} criado.</div></div></div>`;
                if (item.type === 'close') return `<div class="timeline-item"><div class="timeline-dot" style="background:var(--success-dim);color:var(--success)">✅</div><div class="timeline-content"><div class="timeline-meta">Chamado encerrado · ${fmt.datetime(item.date)}</div></div></div>`;
                if (item.type === 'transfer') {
                    const x = item.data;
                    return `<div class="timeline-item"><div class="timeline-dot" style="background:rgba(0,174,239,.15);color:var(--blue)">🔄</div><div class="timeline-content"><div class="timeline-meta">Transferência · ${fmt.datetime(item.date)}</div><div class="transfer-event"><div class="from-to">De: <strong>${esc(x.fromUserName)}</strong> → Para: <strong>${esc(x.toUserName)}</strong></div><div class="reason">Motivo: ${esc(x.reason)}</div></div></div></div>`;
                }
                const c = item.data;
                const attachHtml = c.attachment ? `<div style="margin-top:8px"><img src="${c.attachment}" style="max-width:100%;max-height:300px;border-radius:8px;border:1px solid var(--border);cursor:pointer" data-on-click="window.open('${c.attachment}')"></div>` : '';
                return `<div class="timeline-item"><div class="timeline-dot" style="background:${c.internal ? 'var(--warning-dim)' : 'var(--bg-inset)'}">${renderAvatar(c.authorId, '24px', '0.7rem')}</div><div class="timeline-content"><div class="timeline-meta">${esc(c.authorName)} · ${fmt.datetime(c.createdAt)}${c.internal ? ' · <span style="color:var(--warning)">🔒 Nota interna</span>' : ''}</div><div class="timeline-text ${c.internal ? 'internal' : ''}">${esc(c.text)}${attachHtml}</div></div></div>`;
            }

            document.getElementById('detailGrid').innerHTML = `
    <div>
      <div class="detail-section">
        <h4>Descrição</h4>
        <p style="font-size:0.875rem;line-height:1.7;color:var(--text-secondary)">${t.description ? esc(t.description) : '—'}</p>
      </div>

      <div class="detail-tabs">
        <div class="tab-link active" data-on-click="switchDetailTab('history')">Histórico</div>
        <div class="tab-link" data-on-click="switchDetailTab('checklist')">Checklist (${(t.checklists || []).filter(c => c.done).length}/${t.checklists?.length || 0})</div>
        <div class="tab-link" data-on-click="switchDetailTab('timetracker')">Registro de Tempo</div>
      </div>

      <div id="tab-history" class="tab-content active">
          <div class="detail-section">
            <div style="margin-top:8px">
              ${t.status === 'aguardando_aprovacao_pecas' ? '<div style="font-size:0.75rem;color:var(--orange);background:rgba(255,107,0,0.1);padding:8px;border-radius:6px;margin-bottom:10px">⏳ Aguardando aprovação. Admins podem alterar o status de cada item abaixo.</div>' : ''}
              <div id="ticketPartsList">${partsHtml}</div>
              ${_pCanEdit ? '<button class="btn btn-ghost btn-sm" style="margin-top:6px" data-on-click="openAdminAddPart()">+ Adicionar Peça</button>' : ''}
            </div>
          </div>
          <div class="detail-section">
            <h4>Histórico & Transferências</h4>
            <div class="timeline">${tlItems.map(renderTLItem).join('')}</div>
          </div>
          <div class="comment-form">
            <h4 style="font-size:0.8rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.06em">Adicionar Resposta</h4>
            <div class="comment-toggle">
              <button class="toggle-btn active" id="togglePublic" data-on-click="setInternal(false)">💬 Pública</button>
              <button class="toggle-btn" id="toggleInternal" data-on-click="setInternal(true)">🔒 Interna</button>
            </div>
            <div id="internalHint" style="display:none;font-size:0.75rem;color:var(--warning);margin-bottom:8px;padding:4px 8px;background:var(--warning-dim);border-radius:4px">⚠️ Esta nota será visível apenas para a equipe interna.</div>
            <textarea class="form-textarea" id="commentText" placeholder="Escreva sua resposta aqui..." rows="3"></textarea>
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-top:12px">
              <div>
                <label class="btn btn-ghost btn-sm" style="cursor:pointer;color:var(--blue);display:flex;align-items:center;gap:4px">
                  📷 Anexar Evidência <input type="file" accept="image/*" style="display:none" data-on-change="attachEvidence(this)">
                </label>
                <div id="attachInfo" style="font-size:0.75rem;color:var(--text-secondary);margin-top:4px;display:none"></div>
              </div>
              <div style="display:flex;gap:8px;justify-content:flex-end">
                <select class="form-select" id="commentStatus" style="max-width:180px">
                  ${Object.entries(TICKET_STATUS).filter(([k]) => k !== 'cancelado').map(([k, v]) => `<option value="${k}" ${t.status === k ? 'selected' : ''}>${v.label}</option>`).join('')}
                </select>
                <button class="btn btn-primary" data-on-click="addComment()">Enviar</button>
              </div>
            </div>
          </div>
      </div>

      <div id="tab-checklist" class="tab-content">
          <div class="detail-section">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
                <h4 style="margin:0">Checklist de Tarefas</h4>
                <button class="btn btn-ghost btn-sm" data-on-click="openChecklistModal()">+ Adicionar Item</button>
            </div>
            <div id="checklistItems">
                ${(t.checklists || []).map(i => `
                    <div class="checklist-item ${i.done ? 'done' : ''}">
                        <input type="checkbox" ${i.done ? 'checked' : ''} data-on-change="toggleCheckItem('${i.id}')">
                        <span style="flex:1">${esc(i.text)}</span>
                        <button class="btn btn-ghost btn-sm" data-on-click="delCheckItem('${i.id}')">🗑</button>
                    </div>
                `).join('') || '<p style="text-align:center;padding:20px;color:var(--text-muted)">Nenhum item adicionado.</p>'}
            </div>
          </div>
      </div>

      <div id="tab-timetracker" class="tab-content">
          <div class="detail-section">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
                <h4 style="margin:0">Registro de Atividade</h4>
                <button class="btn btn-primary btn-sm" data-on-click="openTimeLogModal()">⏱ Adicionar Tempo</button>
            </div>
            <div style="margin-bottom:16px;font-size:0.9rem;font-weight:600;color:var(--text-secondary)">
                Total lançado: <span style="color:var(--text-primary)">${(t.timeLogs || []).reduce((acc,l)=>acc+(parseFloat(l.hours)||0),0).toFixed(1)}h</span>
            </div>
            <div id="timeLogsList">
                ${(t.timeLogs || []).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).map(l => `
                    <div style="display:flex;flex-direction:column;padding:12px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;background:var(--bg-inset);font-size:0.85rem">
                        <div style="display:flex;justify-content:space-between;font-weight:600;margin-bottom:4px">
                            <span>${esc(l.type)} (${parseFloat(l.hours).toFixed(1)}h)</span>
                            <div style="display:flex;gap:8px;align-items:center">
                                <span style="color:var(--text-muted);font-weight:normal;font-size:0.75rem">${fmt.date(l.date)}</span>
                                <button class="btn btn-ghost btn-sm btn-icon" style="color:var(--danger);padding:0;height:auto;min-height:0" data-on-click="delTimeLog('${l.id}')">✕</button>
                            </div>
                        </div>
                        <div style="color:var(--text-secondary);margin-bottom:4px">${esc(l.obs || '')}</div>
                        <div style="color:var(--text-muted);font-size:0.75rem">Registrado por ${esc(l.userName)} em ${fmt.datetime(l.createdAt)}</div>
                    </div>
                `).join('') || '<p style="text-align:center;padding:20px;color:var(--text-muted)">Nenhum registro de tempo ainda.</p>'}
            </div>
          </div>
      </div>
    </div>
    <div>
      <div class="detail-section">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
            <h4 style="margin:0">Metadados</h4>
            ${t.priority === 'critica' ? '<span class="badge badge-red Pulse">CRÍTICO</span>' : ''}
        </div>
        ${[['Status', badgeTicketStatus(t.status)], ['Atribuído', t.assignedName ? esc(t.assignedName) : '—'], ['Abertura', fmt.datetime(t.createdAt)], ['Última atualização', fmt.datetime(t.updatedAt || t.createdAt)]].map(([l, v]) => `<div class="meta-item"><span class="meta-label">${l}</span><span class="meta-value">${v}</span></div>`).join('')}
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--bg-inset);border-radius:8px;margin-bottom:16px;border-left:4px solid var(--blue);margin-top:12px">
           <span style="font-size:0.85rem;font-weight:600;color:var(--text-secondary)">Total Previsto</span>
           <span id="detailTotalPrevisto" style="font-size:1.1rem;font-weight:700;color:var(--blue)">R$ 0,00</span>
        </div>
        <div class="meta-item"><span class="meta-label">Prioridade</span><select id="detailPriority" class="form-select" style="max-width:130px;padding:2px 6px;font-size:0.75rem" data-on-change="changePriority(this.value)">
            <option value="baixa" ${t.priority === 'baixa' ? 'selected' : ''}>🟢 Baixa</option><option value="media" ${t.priority === 'media' ? 'selected' : ''}>🔵 Média</option><option value="alta" ${t.priority === 'alta' ? 'selected' : ''}>🟡 Alta</option><option value="critica" ${t.priority === 'critica' ? 'selected' : ''}>🔴 Crítica</option>
          </select></div>
        <div class="meta-item"><span class="meta-label">Categoria</span><select id="detailCategory" class="form-select" style="max-width:130px;padding:2px 6px;font-size:0.75rem" data-on-change="changeCategory(this.value)">
             <option value="corretiva" ${t.category === 'corretiva' ? 'selected' : ''}>Manutenção Corretiva</option><option value="preventiva" ${t.category === 'preventiva' ? 'selected' : ''}>Manutenção Preventiva</option><option value="instalacao" ${t.category === 'instalacao' ? 'selected' : ''}>Instalação</option><option value="higienizacao" ${t.category === 'higienizacao' ? 'selected' : ''}>Higienização</option><option value="gas" ${t.category === 'gas' ? 'selected' : ''}>Suspeita de falta de gás</option><option value="pmoc" ${t.category === 'pmoc' ? 'selected' : ''}>PMOC</option><option value="outros" ${t.category === 'outros' ? 'selected' : ''}>Outros</option>
        </select></div>
      </div>
      ${t.status === 'aguardando_aprovacao' ? renderProposalApproval(t) : ''}
      <div class="detail-section">
        <h4 title="Tempo de Início/Chegada em Campo">SLA In Loco (Resposta)</h4>
        <div style="padding:12px;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:12px">
          ${renderSLABar(t, 'response')}
          <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:8px">Prazo Máximo: ${t.slaResponseDeadline === 'cronograma' ? '<span style="color:var(--blue)">Conforme Cronograma</span>' : fmt.datetime(t.slaResponseDeadline)}</div>
        </div>
        <h4 title="Conclusão do Chamado">SLA Fix (Solução)</h4>
        <div style="padding:12px;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-sm)">
          ${renderSLABar(t, 'resolution')}
          <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:8px">Prazo Máximo: ${t.slaResolutionDeadline === 'cronograma' ? '<span style="color:var(--blue)">Conforme Cronograma</span>' : fmt.datetime(t.slaResolutionDeadline)}</div>
        </div>
      </div>
      <div class="detail-section">
        <h4>Cliente</h4>
        <div style="padding:12px;background:var(--bg-inset);border-radius:8px;margin-bottom:12px">
            <div style="font-weight:700;font-size:0.9rem">${esc(client.fantasia || client.razaoSocial || t.clientName)}</div>
            <div style="font-size:0.8rem;color:var(--text-secondary);margin-top:4px">${clientAddr(client)}</div>
        </div>
        ${[['Contato', client.contato ? esc(client.contato) : '—'], ['Telefone', client.celular || client.telefone ? `<a href="tel:${(client.celular || client.telefone || '').replace(/\D/g, '')}" style="color:var(--blue)">${esc(client.celular || client.telefone)}</a>` : '—'], ['Contrato', badgeContractType(t.contractType)], ['SLA contratado', contract.slaH ? contract.slaH + 'h' : '—']].map(([l, v]) => `<div class="meta-item"><span class="meta-label">${l}</span><span class="meta-value">${v}</span></div>`).join('')}
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <select class="form-select" id="assignSelect">
          <option value="">Sem atribuição</option>
          ${db.get('users').filter(u => ['tecnico', 'admin'].includes(u.role) && !u.deactivated).map(u => `<option value="${u.id}|${esc(u.name)}" ${t.assignedTo === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}
        </select>
        <button class="btn btn-ghost btn-sm" data-on-click="reassign()">Reatribuir Técnico</button>
      </div>
    </div>`;
            updateTotalPrevisto(t, parts);
            openModal('modalDetail');
        }

        let isInternal = false;
        let pendingAttachment = null;

        function attachEvidence(input) {
            const file = input.files[0];
            if (!file) return;
            if (!/^image\//.test(file.type)) { toast('Erro', 'Por favor, selecione apenas imagens.', 'error'); return; }
            if (file.size > 2 * 1024 * 1024) { toast('Erro', 'A imagem deve ter no máximo 2MB.', 'error'); return; }

            const reader = new FileReader();
            reader.onload = (e) => {
                // Foto reduzida (max 1280px, JPEG) antes de ir para o banco.
                const reduzir = (window.dbRemote && dbRemote.reduzirImagem) || ((u, cb) => cb(u));
                reduzir(e.target.result, (url) => {
                    pendingAttachment = url;
                    const info = document.getElementById('attachInfo');
                    info.innerHTML = `📎 ${file.name} <button class="btn btn-ghost btn-sm btn-icon" style="color:var(--danger);padding:0 4px" data-on-click="clearAttachment(event)">✕</button>`;
                    info.style.display = 'block';
                });
            };
            reader.readAsDataURL(file);
        }

        function clearAttachment(e) {
            if (e) e.preventDefault();
            pendingAttachment = null;
            document.getElementById('attachInfo').innerHTML = '';
            document.getElementById('attachInfo').style.display = 'none';
        }

        function setInternal(v) {
            isInternal = v;
            const pub = document.getElementById('togglePublic');
            const pri = document.getElementById('toggleInternal');
            const hint = document.getElementById('internalHint');
            if (pub) pub.classList.toggle('active', !v);
            if (pri) pri.classList.toggle('active', v);
            if (hint) hint.style.display = v ? 'block' : 'none';
        }

        function changeStatus() {
            const t = db.find('tickets', currentDetailId); if (!t) return;
            const newStatus = document.getElementById('detailStatusSelect').value;
            const update = { status: newStatus };
            if (['resolvido', 'fechado'].includes(newStatus) && !t.closedAt) update.closedAt = new Date().toISOString();
            // Fire CSAT notification to client (only once)
            if (['resolvido', 'fechado'].includes(newStatus) && !t.csatNotified && !t.csatRating && t.clientId) {
                update.csatNotified = true;
                update.awaitingCsat = true;
                const clientUser = db.get('users').find(u => u.clientId === t.clientId && u.role === 'cliente');
                db.insert('notifications', {
                    type: 'csat_request',
                    title: '⭐ Como foi o seu atendimento?',
                    text: `O chamado ${t.num} — "${t.title}" foi resolvido. Avalie o atendimento!`,
                    ticketId: t.id,
                    targetUserId: clientUser?.id || null,
                    targetClientId: t.clientId,
                    read: false
                });
                logAudit('ticket_resolved', `Chamado ${t.num} marcado como ${newStatus} por ${session.name}`);
            }
            db.update('tickets', currentDetailId, update);
            toast('Status atualizado', TICKET_STATUS[newStatus]?.label, 'success');
            loadKpis(); renderTable();
            if (window.updateTicketBadge) window.updateTicketBadge();
        }

        function updatePartStatus(partId, newStatus) {
            const item = db.find('stock_movements', partId);
            if (!item) return;
            const labels = { pendente: 'Pendente', aprovado: 'Aprovado', reprovado: 'Reprovado', expirado: 'Expirado' };
            const oldStatus = item.status || 'pendente';
            db.update('stock_movements', partId, {
                status: newStatus,
                updatedBy: session.userId,
                updatedAt: new Date().toISOString()
            });
            db.insert('comments', {
                ticketId: currentDetailId,
                authorId: session.userId,
                authorName: session.name,
                authorRole: session.role,
                text: '🔄 Status de "' + item.productName + '" alterado de "' + (labels[oldStatus] || oldStatus) + '" para "' + (labels[newStatus] || newStatus) + '".',
                internal: false
            });
            if (newStatus === 'aprovado') {
                const updated = db.find('stock_movements', partId);
                try { Proposals.syncFinancial(updated, session); } catch(e) {}
            }
            // Check if all items resolved → revert ticket status
            const pending = db.get('stock_movements').filter(m => m.ticketId === currentDetailId && m.status === 'pendente');
            if (pending.length === 0) {
                const tk = db.find('tickets', currentDetailId);
                if (tk && tk.status === 'aguardando_aprovacao_pecas') {
                    db.update('tickets', currentDetailId, { status: 'andamento' });
                }
            }
            logAudit('part_status_change', 'Status de "' + item.productName + '" alterado para "' + newStatus + '" no chamado ' + currentDetailId);
            toast('Status atualizado!', '', 'success');
            viewTicket(currentDetailId);
        }

        function addComment() {
            const text = document.getElementById('commentText').value.trim();
            if (!text) { toast('Erro', 'Escreva uma mensagem.', 'error'); return; }
            const status = document.getElementById('commentStatus').value;
            const t = db.find('tickets', currentDetailId);
            const update = { status };

            // Check for @mentions
            const mentions = text.match(/@(\w+)/g);
            if (mentions) {
                mentions.forEach(m => {
                    const userName = m.substring(1);
                    const targetUser = db.get('users').find(u => u.name.toLowerCase().replace(/\s/g, '') === userName.toLowerCase());
                    if (targetUser) {
                        db.insert('notifications', {
                            type: 'mention',
                            title: '🔔 Você foi mencionado!',
                            text: `${session.name} mencionou você no chamado ${t.num}`,
                            ticketId: t.id,
                            targetUserId: targetUser.id,
                            read: false
                        });
                        toast('Menção enviada', `Notificação enviada para ${targetUser.name}`, 'info');
                    }
                });
            }

            if (['resolvido', 'fechado'].includes(status)) {
                if (t && !t.closedAt) update.closedAt = new Date().toISOString();
                // Fire CSAT notification (only once)
                if (t && !t.csatNotified && !t.csatRating && t.clientId) {
                    update.csatNotified = true;
                    update.awaitingCsat = true;
                    const clientUser = db.get('users').find(u => u.clientId === t.clientId && u.role === 'cliente');
                    db.insert('notifications', {
                        type: 'csat_request',
                        title: '⭐ Como foi o seu atendimento?',
                        text: `O chamado ${t.num} — "${t.title}" foi resolvido. Avalie o atendimento!`,
                        ticketId: t.id,
                        targetUserId: clientUser?.id || null,
                        targetClientId: t.clientId,
                        read: false
                    });
                    logAudit('ticket_resolved', `Chamado ${t.num} marcado como ${status} por ${session.name}`);
                }
            }
            db.update('tickets', currentDetailId, update);
            db.insert('comments', { ticketId: currentDetailId, authorId: session.userId, authorName: session.name, authorRole: session.role, text, internal: isInternal, attachment: pendingAttachment });
            toast('Resposta adicionada', '', 'success');
            document.getElementById('commentText').value = '';
            clearAttachment();
            viewTicket(currentDetailId); loadKpis(); renderTable();
        }

        function changePriority(val) {
            db.update('tickets', currentDetailId, { priority: val });
            db.insert('comments', { ticketId: currentDetailId, authorId: session.userId, authorName: session.name, authorRole: session.role, text: `⚠️ Prioridade do chamado alterada para: ${val.toUpperCase()}. Prazos de SLA foram recalculados in loco.`, internal: true });
            toast('Prioridade e SLA atualizados!', '', 'success'); viewTicket(currentDetailId); renderTable();
        }

        function changeCategory(val) {
            db.update('tickets', currentDetailId, { category: val });
            db.insert('comments', { ticketId: currentDetailId, authorId: session.userId, authorName: session.name, authorRole: session.role, text: `🏷 Categoria do chamado alterada para: ${val.toUpperCase()}. Prazos de SLA foram recalculados.`, internal: true });
            toast('Categoria e SLA atualizados!', '', 'success'); viewTicket(currentDetailId); renderTable();
        }

        function reassign() {
            const val = document.getElementById('assignSelect').value;
            const [uid, uname] = val.split('|');
            db.update('tickets', currentDetailId, { assignedTo: uid || null, assignedName: uname || null });
            toast('Técnico atualizado', '', 'success'); renderTable();
        }

        function sendCSATRequest(id) {
            const t = db.find('tickets', id); if (!t) return;
            if (t.csatNotified) { toast('Já enviado', 'Uma solicitação já foi enviada a este cliente.', 'warning'); return; }
            const clientUser = db.get('users').find(u => u.clientId === t.clientId && u.role === 'cliente');
            db.insert('notifications', {
                type: 'csat_request',
                title: '⭐ Como foi o seu atendimento?',
                text: `O chamado ${t.num} — "${t.title}" foi resolvido. Avalie o atendimento!`,
                ticketId: t.id,
                targetUserId: clientUser?.id || null,
                targetClientId: t.clientId,
                read: false
            });
            db.update('tickets', id, { csatNotified: true, awaitingCsat: true });
            logAudit('csat_request_sent', `Solicitação CSAT enviada para cliente do chamado ${t.num}`);
            toast('Solicitação enviada!', 'O cliente será notificado para avaliar o atendimento.', 'success');
            viewTicket(id);
        }

        // ─── Tabs & Advanced Features ───
        function switchDetailTab(tab) {
            document.querySelectorAll('.tab-link').forEach(l => l.classList.toggle('active', l.getAttribute('data-on-click').includes(tab)));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-' + tab));
        }

        // ─── CHECKLIST ───
        function openChecklistModal() {
            document.getElementById('ckText').value = '';
            openModal('modalChecklist');
        }

        function addChecklistItem() {
            const text = document.getElementById('ckText').value.trim();
            if (!text) return toast('Erro', 'A descrição da tarefa não pode ser vazia.', 'warning');
            
            const t = db.find('tickets', currentDetailId);
            const checklists = t.checklists || [];
            checklists.push({ id: 'ck' + Date.now(), text, done: false });
            
            db.insert('comments', {
                ticketId: t.id, authorId: session.userId, authorName: session.name, authorRole: session.role,
                text: `✅ Tarefa Adicionada ao Checklist: "${text}"`, internal: true
            });
            
            db.update('tickets', currentDetailId, { checklists });
            toast('Sucesso', 'Tarefa adicionada ao checklist.', 'success');
            closeModal('modalChecklist');
            
            viewTicket(currentDetailId);
            setTimeout(() => switchDetailTab('checklist'), 10);
        }

        function toggleCheckItem(id) {
            const t = db.find('tickets', currentDetailId);
            const item = t.checklists.find(i => i.id === id);
            if (!item) return;
            const newState = !item.done;
            const checklists = t.checklists.map(i => i.id === id ? { ...i, done: newState } : i);
            
            db.insert('comments', {
                ticketId: t.id, authorId: session.userId, authorName: session.name, authorRole: session.role,
                text: `✅ Tarefa do Checklist marcada como ${newState ? 'Concluída' : 'Pendente'}: "${item.text}"`, internal: true
            });

            db.update('tickets', currentDetailId, { checklists });
            renderChecklist(checklists);
        }

        function delCheckItem(id) {
            if (!confirm('Excluir este item?')) return;
            const t = db.find('tickets', currentDetailId);
            const item = t.checklists.find(i => i.id === id);
            const checklists = t.checklists.filter(i => i.id !== id);
            
            if (item) {
                db.insert('comments', {
                    ticketId: t.id, authorId: session.userId, authorName: session.name, authorRole: session.role,
                    text: `🗑️ Tarefa do Checklist excluída: "${item.text}"`, internal: true
                });
            }

            db.update('tickets', currentDetailId, { checklists });
            viewTicket(currentDetailId);
            setTimeout(() => switchDetailTab('checklist'), 10);
        }

        function renderChecklist(items) {
            document.getElementById('checklistItems').innerHTML = items.map(i => `
                <div class="checklist-item ${i.done ? 'done' : ''}">
                    <input type="checkbox" ${i.done ? 'checked' : ''} data-on-change="toggleCheckItem('${i.id}')">
                    <span style="flex:1">${esc(i.text)}</span>
                    <button class="btn btn-ghost btn-sm" data-on-click="delCheckItem('${i.id}')">🗑</button>
                </div>
            `).join('') || '<p style="text-align:center;padding:20px;color:var(--text-muted)">Nenhum item adicionado.</p>';
        }

        function openTimeLogModal() {
            document.getElementById('tlDate').value = new Date().toISOString().split('T')[0];
            document.getElementById('tlType').value = 'Deslocamento';
            document.getElementById('tlHours').value = '';
            document.getElementById('tlObs').value = '';
            openModal('modalTimeLog');
        }

        function addTimeLog() {
            const date = document.getElementById('tlDate').value;
            const type = document.getElementById('tlType').value;
            const hours = parseFloat(document.getElementById('tlHours').value);
            const obs = document.getElementById('tlObs').value.trim();

            if (!date || !type || isNaN(hours) || hours <= 0) {
                return toast('Erro', 'Preencha a data, tipo e uma quantidade válida de horas.', 'error');
            }

            const t = db.find('tickets', currentDetailId);
            const timeLogs = t.timeLogs || [];
            timeLogs.push({
                id: 'tl' + Date.now(),
                date,
                type,
                hours,
                obs,
                userId: session.userId,
                userName: session.name,
                createdAt: new Date().toISOString()
            });

            // Adiciona history comment para registro do tempo
            db.insert('comments', {
                ticketId: t.id, authorId: session.userId, authorName: session.name, authorRole: session.role,
                text: `⏱ Tempo Registrado: ${hours.toFixed(1)}h em ${type}. (${obs || 'Sem observação'})`, internal: true
            });

            db.update('tickets', currentDetailId, { timeLogs });
            toast('Tempo Lançado', `${hours}h de ${type} registradas com sucesso.`, 'success');
            
            closeModal('modalTimeLog');
            viewTicket(currentDetailId);
            setTimeout(() => switchDetailTab('timetracker'), 10);
        }

        function delTimeLog(logId) {
            if (!confirm('Tem certeza que deseja apagar este registro de horas?')) return;
            const t = db.find('tickets', currentDetailId);
            const timeLogs = (t.timeLogs || []).filter(l => l.id !== logId);
            db.update('tickets', currentDetailId, { timeLogs });
            viewTicket(currentDetailId);
            setTimeout(() => switchDetailTab('timetracker'), 10);
        }

        // ─── Transfer ───
        function openTransferModal() {
            const t = db.find('tickets', currentDetailId); if (!t) return;
            document.getElementById('transferTicketLabel').textContent = `Chamado: ${t.num} — ${t.title}`;
            document.getElementById('transferReason').value = '';

            const staff = db.get('users').filter(u =>
                ['admin', 'superadmin', 'tecnico'].includes(u.role) &&
                !u.deactivated &&
                u.id !== session.userId
            );
            document.getElementById('transferToSelect').innerHTML =
                '<option value="">— Selecione o responsável —</option>' +
                staff.map(u => `<option value="${u.id}|${esc(u.name)}">${esc(u.name)} (${u.role})</option>`).join('');

            openModal('modalTransfer');
        }

        function confirmTransfer() {
            const val = document.getElementById('transferToSelect').value;
            const reason = document.getElementById('transferReason').value.trim();
            if (!val) return toast('Selecione o destinatário', '', 'warning');
            if (!reason) return toast('Motivo obrigatório', 'Informe o motivo da transferência.', 'warning');

            const [toId, toName] = val.split('|');
            const t = db.find('tickets', currentDetailId); if (!t) return;

            // Save transfer record
            db.insert('transfers', {
                ticketId: t.id,
                ticketNum: t.num,
                ticketTitle: t.title,
                fromUserId: session.userId,
                fromUserName: session.name,
                toUserId: toId,
                toUserName: toName,
                reason,
            });

            // Update ticket assignment
            db.update('tickets', t.id, { assignedTo: toId, assignedName: toName });

            // Add timeline comment
            db.insert('comments', {
                ticketId: t.id,
                authorId: session.userId,
                authorName: session.name,
                authorRole: session.role,
                text: `🔄 Chamado transferido para ${toName}. Motivo: ${reason}`,
                internal: true,
            });

            // Notify recipient
            db.insert('notifications', {
                type: 'transfer',
                title: '🔄 Chamado transferido para você',
                text: `${t.num} — "${t.title}" foi transferido por ${session.name}.`,
                ticketId: t.id,
                targetUserId: toId,
                read: false,
            });

            // Audit log
            logAudit('transfer', `Transferiu ${t.num} de ${session.name} → ${toName}. Motivo: ${reason}`);

            toast('Chamado transferido!', `Atribuído a ${toName}`, 'success');
            closeModal('modalTransfer');
            viewTicket(currentDetailId);
            loadKpis(); renderTable();
        }

        // ─── Create Ticket ───
        function openNewTicket() {
            document.getElementById('ntClientId').value = '';
            document.getElementById('ntClientSearch').value = '';
            const staff = db.get('users').filter(u => ['tecnico', 'admin'].includes(u.role) && !u.deactivated);
            document.getElementById('ntAssignTo').innerHTML = '<option value="">Sem atribuição</option>' + staff.map(u => `<option value="${u.id}|${esc(u.name)}">${esc(u.name)}</option>`).join('');
            document.getElementById('ntTitle').value = ''; document.getElementById('ntDesc').value = '';
            document.getElementById('ntPriority').value = 'media'; document.getElementById('ntStatus').value = 'aberto';
            onClientChange();
            openModal('modalNewTicket');
        }

        function searchClients(q) {
            const resEl = document.getElementById('ntClientResults');
            if (!q || q.trim().length === 0) {
                resEl.style.display = 'none';
                document.getElementById('ntClientId').value = '';
                onClientChange();
                return;
            }
            const qLower = q.toLowerCase();
            const matches = db.get('clients').filter(c =>
                (c.fantasia?.toLowerCase().includes(qLower) || c.razaoSocial?.toLowerCase().includes(qLower) || c.doc?.replace(/\D/g, '').includes(q.replace(/\D/g, '')) || c.email?.toLowerCase().includes(qLower)) && c.status === 'ativo'
            );

            if (matches.length === 0) {
                resEl.innerHTML = '<div style="padding:10px; color:var(--text-muted); text-align:center; font-size:0.85rem">Nenhum cliente encontrado</div>';
                resEl.style.display = 'block';
                return;
            }

            resEl.innerHTML = matches.map(c => {
                const title = c.fantasia || c.razaoSocial;
                const sub = c.doc ? ` (${c.doc})` : '';
                return `<div class="autocomplete-item" style="padding:10px; cursor:pointer; border-bottom:1px solid var(--border); font-size:0.9rem" data-on-mousedown="selectClient('${c.id}', '${esc(title)}')">
                    <strong>${esc(title)}</strong><span style="color:var(--text-muted); font-size:0.8rem">${esc(sub)}</span>
                </div>`;
            }).join('');
            resEl.style.display = 'block';
        }

        function selectClient(id, name) {
            document.getElementById('ntClientId').value = id;
            document.getElementById('ntClientSearch').value = name;
            document.getElementById('ntClientResults').style.display = 'none';
            onClientChange();
        }

        document.addEventListener('mousedown', (e) => {
            const searchEl = document.getElementById('ntClientSearch');
            const resEl = document.getElementById('ntClientResults');
            if (searchEl && resEl && e.target !== searchEl && !resEl.contains(e.target)) {
                resEl.style.display = 'none';
            }
        });

        function onClientChange() {
            const clientId = document.getElementById('ntClientId').value;
            const contracts = db.findBy('contracts', 'clientId', clientId).filter(c => c.status === 'ativo');
            document.getElementById('ntContractId').innerHTML = '<option value="">Sem contrato</option>' + contracts.map(c => `<option value="${c.id}">${c.type}</option>`).join('');
        }

        function createTicket() {
            const clientId = document.getElementById('ntClientId').value;
            const title = document.getElementById('ntTitle').value.trim();
            if (!clientId || !title) { toast('Obrigatório', 'Selecione o cliente e informe o título.', 'error'); return; }
            const client = db.find('clients', clientId);
            const contractId = document.getElementById('ntContractId').value;
            const contract = contractId ? db.find('contracts', contractId) : null;
            const assignVal = document.getElementById('ntAssignTo').value;
            const [assignId, assignName] = assignVal.split('|');

            const ticket = db.insert('tickets', {
                num: nextTicketNum(), clientId, clientName: client?.fantasia || client?.razaoSocial || clientId,
                contractId: contractId || null, contractType: contract?.type || 'basico',
                title, category: document.getElementById('ntCategory').value,
                priority: document.getElementById('ntPriority').value,
                status: document.getElementById('ntStatus').value,
                assignedTo: assignId || null, assignedName: assignName || null,
                description: document.getElementById('ntDesc').value.trim()
            });
            logAudit('create_ticket', `Criou chamado ${ticket.num} para ${client?.fantasia || clientId}.`);
            toast('Chamado criado', ticket.num, 'success');
            closeModal('modalNewTicket'); loadKpis(); renderTable();
            if (window.updateTicketBadge) window.updateTicketBadge();
        }

        function delTicket(id, e) {
            e.stopPropagation();
            if (!confirm('Excluir este chamado?')) return;
            db.delete('tickets', id); toast('Chamado excluído', '', 'success'); loadKpis(); renderTable();
            if (window.updateTicketBadge) window.updateTicketBadge();
        }

        function exportTickets() {
            const data = getFiltered().map(t => {
                const cli = db.find('clients', t.clientId) || {};
                return { num: t.num, titulo: t.title, cliente: t.clientName, endereco: clientAddr(cli), telefone: clientPhone(cli), status: t.status, prioridade: t.priority, tecnico: t.assignedName || '', abertura: fmt.date(t.createdAt) };
            });
            exportCSV(data, 'chamados-renostter.csv');
            toast('CSV exportado', '', 'success');
        }

        function clientAddr(client) {
            if (!client) return '';
            return [client.logradouro, client.numero, client.bairro, client.cidade].filter(Boolean).join(', ');
        }
        function clientPhone(client) {
            if (!client) return '';
            return client.celular || client.telefone || '';
        }

        // ─── Part Management ───
        function openAdminAddPart() {
            document.getElementById('adminPartSearch').value = '';
            renderAdminPartList();
            openModal('modalAdminAddPart');
        }

        function renderAdminPartList() {
            const q = document.getElementById('adminPartSearch').value.toLowerCase();
            const items = db.get('inventory').filter(p =>
                (p.status || '').toLowerCase() === 'ativo' &&
                ((p.name || '').toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q))
            );
            document.getElementById('adminPartList').innerHTML = items.map(p => `
                <div style="display:flex;align-items:center;justify-content:space-between;padding:12px;border-bottom:1px solid var(--border)">
                    <div>
                        <div style="font-size:.85rem;font-weight:600">${esc(p.name)}</div>
                        <div style="font-size:.75rem;color:var(--text-secondary)">SKU: ${esc(p.sku)} · Saldo: ${p.currentStock}</div>
                    </div>
                    <div style="display:flex;gap:4px">
                        <input type="number" id="aqty_${p.id}" value="1" min="1" max="${p.currentStock}" style="width:50px;height:30px;font-size:.8rem;padding:0 4px;border-radius:4px;border:1px solid var(--border);background:var(--bg-hover);color:var(--text-primary)">
                        <button class="btn btn-primary btn-sm" data-on-click="adminAddPart('${p.id}')" ${p.currentStock <= 0 ? 'disabled' : ''}>Adicionar</button>
                    </div>
                </div>
            `).join('') || '<p style="padding:20px;text-align:center;color:var(--text-secondary)">Nenhum produto encontrado.</p>';
        }

        function adminAddPart(pid) {
            const p = db.find('inventory', pid);
            const qty = parseInt(document.getElementById('aqty_' + pid).value) || 0;
            if (qty <= 0) return toast('Erro', 'Quantidade inválida', 'error');
            if (qty > p.currentStock) return toast('Erro', 'Saldo insuficiente', 'error');

            const t = db.find('tickets', currentDetailId);

            if (swapMovementId) {
                const oldM = db.find('stock_movements', swapMovementId);
                const oldProductName = oldM ? oldM.productName : 'Peça desconhecida';
                const oldProductSku = oldM ? oldM.productSku : '';

                // Exclusão silenciosa (estorno) antes de alocar a nova
                confirmRemovePart(swapMovementId, true);

                // Registra auditoria/comentário sobre a troca
                db.insert('comments', {
                    ticketId: t.id, authorId: session.userId, authorName: session.name, authorRole: session.role,
                    text: `🔄 Troca de Insumo: [${oldProductName} - SKU: ${oldProductSku}] foi substituído por [${qty}x ${p.name} - SKU: ${p.sku}].`, internal: true
                });

                swapMovementId = null;
                closeModal('modalAdminAddPart');
            }

            const mov = db.insert('stock_movements', {
                productId: pid, productName: p.name, productSku: p.sku,
                unitPrice: p.sellPrice || 0,
                type: 'saida', quantity: -qty, status: 'aprovado',
                ticketId: t.id, ticketNum: t.num,
                technicianId: session.userId, technicianName: session.name,
                notes: `Adicionado manualmente via admin no chamado ${t.num}`
            });

            db.update('inventory', pid, { currentStock: p.currentStock - qty });
            toast('Peça vinculada!', p.name, 'success');
            viewTicket(currentDetailId);
        }

        function approvePart(mid) {
            const m = db.find('stock_movements', mid);
            const p = db.find('inventory', m.productId);
            const qty = Math.abs(m.quantity);
            if (p.currentStock < qty) return toast('Erro', 'Saldo insuficiente', 'error');

            db.update('stock_movements', mid, { status: 'aprovado' });
            db.update('inventory', p.id, { currentStock: p.currentStock - qty });
            toast('Aprovado!', 'A peça foi baixada do estoque.', 'success');
            viewTicket(currentDetailId);
        }

        function rejectPart(mid) {
            db.update('stock_movements', mid, { status: 'rejeitado' });
            toast('Rejeitado', 'A solicitação foi cancelada.', 'info');
            viewTicket(currentDetailId);
        }

        let swapMovementId = null;

        function openSwapPart(mid) {
            swapMovementId = mid;
            document.querySelector('#modalAdminAddPart .modal-title').textContent = '🔄 Selecionar nova peça (Troca)';
            document.getElementById('adminPartSearch').value = '';
            renderAdminPartList();
            openModal('modalAdminAddPart');
        }

        function confirmRemovePart(mid, isSilentSwap = false) {
            if (!isSilentSwap && !confirm('Deseja realmente remover esta peça do chamado?')) return false;

            const m = db.find('stock_movements', mid);
            if (!m) return false;

            // Se a peça já foi baixada do estoque, estornar o valor
            if (m.status === 'aprovado') {
                const p = db.find('inventory', m.productId);
                if (p) {
                    db.update('inventory', p.id, { currentStock: p.currentStock + Math.abs(m.quantity) });
                }
            }

            // Registrar log no ticket
            if (!isSilentSwap) {
                const t = db.find('tickets', currentDetailId);
                db.insert('comments', {
                    ticketId: t.id, authorId: session.userId, authorName: session.name, authorRole: session.role,
                    text: `🗑️ Peça removida: ${Math.abs(m.quantity)}x ${m.productName} (SKU: ${m.productSku}).`, internal: true
                });
                toast('Peça removida', m.productName, 'success');
            }

            db.delete('stock_movements', mid);
            if (!isSilentSwap) viewTicket(currentDetailId);
            return true;
        }

        function updateTotalPrevisto(t, parts) {
            const total = parts.reduce((sum, p) => sum + (Math.abs(p.quantity) * (p.unitPrice || 0)), 0);
            const el = document.getElementById('detailTotalPrevisto');
            if (el) el.textContent = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        }


        // ─── Proposal Approval (Admin) ───
        function renderProposalApproval(t) {
            const pendingParts = db.get('stock_movements').filter(m => m.ticketId === t.id && m.status === 'pendente');
            
            // New "Send" button for admin if there are pending items to send
            if (t.status !== 'aguardando_aprovacao_pecas' && pendingParts.length > 0) {
                 return `
                <div style="margin-top:16px; padding:16px; background:var(--bg-inset); border:1px solid var(--blue); border-radius:12px">
                    <button class="btn btn-primary" style="width:100%" data-on-click="Proposals.sendForApproval('${t.id}', session)">🚀 Enviar Peças para Aprovação Cliente</button>
                </div>`;
            }

            if (t.status !== 'aguardando_aprovacao_pecas') return '';

            return `
            <div style="margin-top:16px; padding:16px; background:var(--bg-inset); border:1px solid var(--orange); border-radius:12px; animation: fadeInUp 0.3s ease">
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px">
                    <span style="font-size:1.2rem">📄</span>
                    <h4 style="margin:0; font-size:0.9rem; color:var(--orange)">Aprovação Pendente (Cliente)</h4>
                </div>
                
                <div style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:12px">
                    Esta proposta aguarda ação do cliente. Você pode aprovar em lote se necessário.
                </div>

                <div style="display:flex; gap:8px">
                    <button class="btn btn-primary btn-sm" style="flex:1" data-on-click="Proposals.approveAll('${t.id}', session)">Aprovar Todos (Admin)</button>
                    <button class="btn btn-ghost btn-sm" style="flex:1; border-color:var(--danger); color:var(--danger)" data-on-click="rejectBatchPrompt('${t.id}')">Reprovar Todos</button>
                </div>
            </div>`;
        }

        function rejectBatchPrompt(id) {
            const reason = prompt('Informe o motivo da reprovação em lote:');
            if (reason === null) return;
            const parts = db.get('stock_movements').filter(m => m.ticketId === id && m.status === 'pendente');
            parts.forEach(p => Proposals.rejectItem(p.id, session, reason));
        }

        // ─── Refresh all ───
        function loadAllTickets() {
            try {
                loadKpis();
                renderTable();
                const lu = document.getElementById('lastUpdated');
                if (lu) {
                    lu.textContent = 'Atualizado: ' + new Date().toLocaleTimeString('pt-BR');
                    lu.classList.remove('error');
                }
            } catch(e) {
                console.error('Tickets refresh error:', e);
                const lu = document.getElementById('lastUpdated');
                if (lu) {
                    lu.textContent = 'Erro ao carregar. Tente novamente.';
                    lu.classList.add('error');
                }
            }
        }

        initSidebar();
        loadAllTickets();
        setInterval(loadAllTickets, 300000); // auto-refresh a cada 5 min
    
