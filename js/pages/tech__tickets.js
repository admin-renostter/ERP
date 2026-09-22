/* Extraido de tech/tickets.html por tools/csp-migrate.py (CSP sem unsafe-inline). */
/* ── gerado por tools/csp-migrate.py: nomes liberados para os data-on-* desta pagina ── */
;(function () {
  var s = window.__cspScope || (window.__cspScope = {});
  function def(n, g, st) { Object.defineProperty(s, n, { configurable: true, enumerable: true, get: g, set: st }); }
  def('addChecklistItem', function () { return typeof addChecklistItem !== 'undefined' ? addChecklistItem : undefined; }, function (v) { addChecklistItem = v; });
  def('addComment', function () { return typeof addComment !== 'undefined' ? addComment : undefined; }, function (v) { addComment = v; });
  def('addPart', function () { return typeof addPart !== 'undefined' ? addPart : undefined; }, function (v) { addPart = v; });
  def('addTimeLog', function () { return typeof addTimeLog !== 'undefined' ? addTimeLog : undefined; }, function (v) { addTimeLog = v; });
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
  def('delCheckItem', function () { return typeof delCheckItem !== 'undefined' ? delCheckItem : undefined; }, function (v) { delCheckItem = v; });
  def('delTimeLog', function () { return typeof delTimeLog !== 'undefined' ? delTimeLog : undefined; }, function (v) { delTimeLog = v; });
  def('gerarFaturaProposta', function () { return typeof gerarFaturaProposta !== 'undefined' ? gerarFaturaProposta : undefined; }, function (v) { gerarFaturaProposta = v; });
  def('onNtClientChange', function () { return typeof onNtClientChange !== 'undefined' ? onNtClientChange : undefined; }, function (v) { onNtClientChange = v; });
  def('openAddParts', function () { return typeof openAddParts !== 'undefined' ? openAddParts : undefined; }, function (v) { openAddParts = v; });
  def('openChecklistModal', function () { return typeof openChecklistModal !== 'undefined' ? openChecklistModal : undefined; }, function (v) { openChecklistModal = v; });
  def('openNewTicket', function () { return typeof openNewTicket !== 'undefined' ? openNewTicket : undefined; }, function (v) { openNewTicket = v; });
  def('openTimeLogModal', function () { return typeof openTimeLogModal !== 'undefined' ? openTimeLogModal : undefined; }, function (v) { openTimeLogModal = v; });
  def('openTransferModal', function () { return typeof openTransferModal !== 'undefined' ? openTransferModal : undefined; }, function (v) { openTransferModal = v; });
  def('p', function () { return typeof p !== 'undefined' ? p : undefined; }, function (v) { p = v; });
  def('renderPartList', function () { return typeof renderPartList !== 'undefined' ? renderPartList : undefined; }, function (v) { renderPartList = v; });
  def('renderTable', function () { return typeof renderTable !== 'undefined' ? renderTable : undefined; }, function (v) { renderTable = v; });
  def('setInt', function () { return typeof setInt !== 'undefined' ? setInt : undefined; }, function (v) { setInt = v; });
  def('setView', function () { return typeof setView !== 'undefined' ? setView : undefined; }, function (v) { setView = v; });
  def('stopTimer', function () { return typeof stopTimer !== 'undefined' ? stopTimer : undefined; }, function (v) { stopTimer = v; });
  def('submitProposal', function () { return typeof submitProposal !== 'undefined' ? submitProposal : undefined; }, function (v) { submitProposal = v; });
  def('switchDetailTab', function () { return typeof switchDetailTab !== 'undefined' ? switchDetailTab : undefined; }, function (v) { switchDetailTab = v; });
  def('toggleCheckItem', function () { return typeof toggleCheckItem !== 'undefined' ? toggleCheckItem : undefined; }, function (v) { toggleCheckItem = v; });
  def('toggleTimer', function () { return typeof toggleTimer !== 'undefined' ? toggleTimer : undefined; }, function (v) { toggleTimer = v; });
  def('updatePartStatus', function () { return typeof updatePartStatus !== 'undefined' ? updatePartStatus : undefined; }, function (v) { updatePartStatus = v; });
  def('viewTicket', function () { return typeof viewTicket !== 'undefined' ? viewTicket : undefined; }, function (v) { viewTicket = v; });
})();
/* ── fim do bloco gerado ── */

        const session = auth.protect(['tecnico']);
        let currentDetailId = null, currentView = 'mine';

        function setView(v) {
            currentView = v;
            ['mine', 'transferred'].forEach(id => document.getElementById('pill-' + id).classList.toggle('active', id === v));
            renderTable();
        }

        function updateCounts() {
            const all = db.get('tickets');
            const mine = all.filter(t => t.assignedTo === session.userId);
            const xferIds = db.findBy('transfers', 'toUserId', session.userId).map(x => x.ticketId);
            document.getElementById('cnt-mine').textContent = mine.length;
            document.getElementById('cnt-transferred').textContent = all.filter(t => xferIds.includes(t.id)).length;
        }

        function getVisible() {
            const q = document.getElementById('searchInput').value.toLowerCase();
            const st = document.getElementById('fStatus').value;
            let base = db.get('tickets');

            if (currentView === 'mine') {
                base = base.filter(t => t.assignedTo === session.userId || t.assignedName === session.name);
            } else {
                const xferIds = db.findBy('transfers', 'toUserId', session.userId).map(x => x.ticketId);
                base = base.filter(t => xferIds.includes(t.id));
            }

            return base.filter(t => {
                const mQ = !q || t.title?.toLowerCase().includes(q) || t.clientName?.toLowerCase().includes(q) || t.num?.includes(q);
                const mS = !st || t.status === st;
                return mQ && mS;
            }).sort((a, b) => { const p = { critica: 4, alta: 3, media: 2, baixa: 1 }; return (p[b.priority] || 0) - (p[a.priority] || 0); });
        }

        function clientAddr(client) { if (!client) return '—'; return [client.logradouro, client.numero, client.bairro, client.cidade].filter(Boolean).join(', ') || '—'; }
        function clientPhone(client) { if (!client) return '—'; return client.celular || client.telefone || '—'; }

        function renderTable() {
            const data = getVisible();
            const clients = {};
            db.get('clients').forEach(c => { clients[c.id] = c; });
            document.getElementById('ticketsTable').innerHTML = data.length ? data.map(t => {
                const cli = clients[t.clientId] || null;
                const addr = clientAddr(cli);
                const phone = clientPhone(cli);
                return `<tr style="cursor:pointer" data-on-click="viewTicket('${t.id}')">
      <td style="font-family:monospace;font-size:0.78rem;color:var(--text-secondary)">${t.num}</td>
      <td style="max-width:200px"><div style="font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.title)}</div></td>
      <td class="td-muted">${esc(t.clientName)}</td>
      <td class="col-addr td-muted" style="font-size:0.78rem;max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(addr)}">${esc(addr)}</td>
      <td class="col-phone td-muted" style="font-size:0.8rem;white-space:nowrap">${phone !== '—' ? `<a href="tel:${phone.replace(/\D/g, '')}" data-on-click="event.stopPropagation()" style="color:var(--blue);text-decoration:none">${esc(phone)}</a>` : '—'}</td>
      <td>${badgeTicketStatus(t.status)}</td>
      <td>${badgePriority(t.priority)}</td>
      <td>${renderSLABar(t)}</td>
      <td class="td-muted">${fmt.relative(t.createdAt)}</td>
      <td><button class="btn btn-primary btn-sm" data-on-click="event.stopPropagation();viewTicket('${t.id}')">Abrir</button></td>
    </tr>`;
            }).join('') : `<tr><td colspan="10"><div class="empty-state"><h4>Nenhum chamado</h4><p>Quando um chamado for atribuído a você, aparecerá aqui.</p></div></td></tr>`;
            updateCounts();
        }

        function viewTicket(id) {
            currentDetailId = id;
            const t = db.find('tickets', id); if (!t) return;
            document.getElementById('detailTitle').textContent = t.title;
            document.getElementById('detailNum').textContent = `${t.num} · ${t.clientName}`;
            const sel = document.getElementById('detailStatusSelect');
            sel.innerHTML = Object.entries(TICKET_STATUS).map(([k, v]) => `<option value="${k}" ${t.status === k ? 'selected' : ''}>${v.label}</option>`).join('');

            const comments = db.findBy('comments', 'ticketId', id).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            const transfers = db.findBy('transfers', 'ticketId', id).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            const client = db.find('clients', t.clientId) || {};

            const tlItems = [
                ...comments.map(c => ({ type: 'comment', date: c.createdAt, data: c })),
                ...transfers.map(x => ({ type: 'transfer', date: x.createdAt, data: x })),
            ].sort((a, b) => new Date(a.date) - new Date(b.date));

            // V3: Check for expiration before rendering
            try {
                if (Proposals.checkExpiration(t)) {
                    return viewTicket(id); // Reload
                }
            } catch(e) { /* skip if proposals module errors */ }

            const parts = db.get('stock_movements').filter(m => m.ticketId === id);

            // Pre-render parts with status dropdowns to avoid nested template literal issues
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
                    const statusCtrl = _pCanEdit
                        ? '<select class="form-select" style="font-size:0.72rem;padding:2px 6px;max-width:135px" data-on-change="updatePartStatus(\'' + p.id + '\', this.value)">'
                          + '<option value="pendente"' + (p.status === 'pendente' ? ' selected' : '') + '>⏳ Pendente</option>'
                          + '<option value="aprovado"' + (p.status === 'aprovado' ? ' selected' : '') + '>✅ Aprovado</option>'
                          + '<option value="reprovado"' + (p.status === 'reprovado' ? ' selected' : '') + '>❌ Reprovado</option>'
                          + '<option value="expirado"' + (p.status === 'expirado' ? ' selected' : '') + '>⚠️ Expirado</option>'
                          + '</select>'
                        : '<span class="part-status" style="background:' + st.bg + ';color:' + st.color + ';font-size:0.7rem;padding:2px 6px;border-radius:4px;font-weight:600">' + st.lbl + '</span>';
                    const deleteBtn = (_pCanEdit && !_pIsLocked)
                        ? '<button class="btn btn-danger btn-sm btn-icon" title="Excluir peça" data-on-click="confirmRemovePart(\'' + p.id + '\')" style="height:24px;width:24px;padding:0;min-height:24px"><span style="font-size:.8rem">🗑</span></button>'
                        : '';
                    partsHtml += '<div class="part-item">'
                        + '<span style="flex:1"><strong>' + Math.abs(p.quantity) + 'x</strong> ' + esc(p.productName) + '</span>'
                        + '<div style="display:flex;align-items:center;gap:8px">' + statusCtrl + deleteBtn + '</div>'
                        + '</div>';
                });
            } else {
                partsHtml = '<p style="font-size:0.8rem;color:var(--text-secondary)">Nenhuma peça adicionada para este chamado.</p>';
            }

            document.getElementById('detailGrid').innerHTML = `
    <div>
      <div style="margin-bottom:16px"><h4 style="font-size:.8rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Descrição</h4>
        <p style="font-size:0.875rem;line-height:1.7;color:var(--text-secondary)">${t.description ? esc(t.description) : '—'}</p></div>
      
      <div style="margin-bottom:16px">
        <h4 style="font-size:.8rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Peças e Insumos</h4>
        ${t.status === 'aguardando_aprovacao_pecas' ? '<div style="font-size:0.75rem;color:var(--orange);background:rgba(255,107,0,0.1);padding:8px;border-radius:6px;margin-bottom:10px">⏳ Aguardando aprovação do cliente. Você pode alterar o status de cada item abaixo.</div>' : ''}
        <div id="ticketPartsList">${partsHtml}</div>
        ${_pCanEdit && !_pIsLocked ? '<button class="btn btn-ghost btn-sm" style="margin-top:8px" data-on-click="openAddParts()">+ Adicionar Peça</button>' : ''}
      </div>


      <div class="detail-section" style="margin-bottom:20px; border:1px solid var(--blue); border-radius:12px; padding:16px; background:var(--blue-dim)">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px">
              <h4 style="margin:0; color:var(--blue)">⏱️ Cronômetro de Atendimento</h4>
              <div id="timerDisplay" style="font-family:monospace; font-size:1.5rem; font-weight:700; color:var(--text-primary)">00:00:00</div>
          </div>
          <div style="display:flex; gap:8px">
              <button id="btnStartTimer" class="btn btn-primary btn-sm" data-on-click="toggleTimer()">▶️ Iniciar</button>
              <button id="btnStopTimer" class="btn btn-danger btn-sm" data-on-click="stopTimer()" disabled>⏹️ Finalizar</button>
          </div>
          <div id="timerStatus" style="font-size:0.75rem; color:var(--text-secondary); margin-top:8px">Pausado</div>
      </div>

      <div class="detail-tabs">
        <div class="tab-link active" data-on-click="switchDetailTab('history')">Histórico</div>
        <div class="tab-link" data-on-click="switchDetailTab('checklist')">Checklist (${(t.checklists || []).filter(c => c.done).length}/${t.checklists?.length || 0})</div>
        <div class="tab-link" data-on-click="switchDetailTab('timetracker')">Histórico de Tempo</div>
      </div>

      <div id="tab-history" class="tab-content active">
        <div class="detail-section">
          <h4 style="font-size:.8rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Histórico & Interações</h4>
          <div class="timeline">
            ${tlItems.map(item => {
                  if (item.type === 'transfer') {
                      const x = item.data;
                      return `<div class="timeline-item"><div class="timeline-dot" style="background:rgba(0,174,239,.15);color:var(--blue);font-size:.7rem">🔄</div><div class="timeline-content"><div class="timeline-meta">Transferência · ${fmt.datetime(item.date)}</div><div class="transfer-event"><div class="from-to">De: <strong>${esc(x.fromUserName)}</strong> → Para: <strong>${esc(x.toUserName)}</strong></div><div class="reason">Motivo: ${esc(x.reason)}</div></div></div></div>`;
                  }
                  const c = item.data;
                  const attachHtml = c.attachment ? `<div style="margin-top:8px"><img src="${c.attachment}" style="max-width:100%;max-height:300px;border-radius:8px;border:1px solid var(--border);cursor:pointer" data-on-click="window.open('${c.attachment}')"></div>` : '';
                  return `<div class="timeline-item"><div class="timeline-dot" style="background:${c.internal ? 'var(--warning-dim)' : 'var(--bg-surface)'}">${c.authorRole === 'tecnico' ? '🔧' : '👤'}</div><div class="timeline-content"><div class="timeline-meta">${esc(c.authorName)} · ${fmt.datetime(c.createdAt)}${c.internal ? ' · <span style="color:var(--warning)">🔒</span>' : ''}</div><div class="timeline-text ${c.internal ? 'internal' : ''}">${esc(c.text)}${attachHtml}</div></div></div>`;
              }).join('')}
            ${tlItems.length === 0 ? '<p style="font-size:0.82rem;color:var(--text-secondary)">Ainda sem respostas.</p>' : ''}
          </div>
        </div>
        <div class="comment-form" style="margin-top:16px">
          <h4 style="font-size:.8rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Adicionar Resposta</h4>
          <div style="display:flex;gap:8px;margin-bottom:8px">
            <button class="toggle-btn active" id="tPub" data-on-click="setInt(false)">💬 Pública</button>
            <button class="toggle-btn" id="tInt" data-on-click="setInt(true)">🔒 Interna</button>
          </div>
          <div id="internalHint" style="display:none;font-size:0.75rem;color:var(--warning);margin-bottom:8px;padding:4px 8px;background:var(--warning-dim);border-radius:4px">⚠️ Esta nota será visível apenas para a equipe interna.</div>
          <textarea class="form-textarea" id="commentText" placeholder="Laudo técnico, peças utilizadas, próximo passo..." rows="3"></textarea>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
            <div>
              <label class="btn btn-ghost btn-sm" style="cursor:pointer;color:var(--blue);display:flex;align-items:center;gap:4px">
                📷 Anexar Evidência <input type="file" accept="image/*" style="display:none" data-on-change="attachEvidence(this)">
              </label>
              <div id="attachInfo" style="font-size:0.75rem;color:var(--text-secondary);margin-top:4px;display:none"></div>
            </div>
            <button class="btn btn-primary" data-on-click="addComment()">Enviar</button>
          </div>
        </div>
        <div style="margin-top:16px; padding-top:12px; border-top:1px solid rgba(255,255,255,0.05); display:flex; justify-content:flex-end">
          <button id="btnSubmitProposal" class="btn btn-primary" data-on-click="submitProposal()" disabled title="Adicione peças ou observações para enviar para aprovação">
            🚀 Enviar para Aprovação
          </button>
        </div>
      </div>

      <div id="tab-checklist" class="tab-content" style="display:none">
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

      <div id="tab-timetracker" class="tab-content" style="display:none">
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
      <div style="margin-bottom:16px">
        <h4 style="font-size:.8rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Detalhes</h4>
        ${[['Abertura', fmt.datetime(t.createdAt)], ['Contrato', badgeContractType(t.contractType)]].map(([l, v]) => `<div class="meta-item"><span class="meta-label">${l}</span><span class="meta-value">${v}</span></div>`).join('')}
        <div class="meta-item"><span class="meta-label">Prioridade</span><select id="detailPriority" class="form-select" style="max-width:130px;padding:2px 6px;font-size:0.75rem" data-on-change="changePriority(this.value)">
            <option value="baixa" ${t.priority === 'baixa' ? 'selected' : ''}>🟢 Baixa</option><option value="media" ${t.priority === 'media' ? 'selected' : ''}>🔵 Média</option><option value="alta" ${t.priority === 'alta' ? 'selected' : ''}>🟡 Alta</option><option value="critica" ${t.priority === 'critica' ? 'selected' : ''}>🔴 Crítica</option>
          </select></div>
        <div class="meta-item"><span class="meta-label">Categoria</span><select id="detailCategory" class="form-select" style="max-width:130px;padding:2px 6px;font-size:0.75rem" data-on-change="changeCategory(this.value)">
             <option value="corretiva" ${t.category === 'corretiva' ? 'selected' : ''}>Manutenção Corretiva</option><option value="preventiva" ${t.category === 'preventiva' ? 'selected' : ''}>Manutenção Preventiva</option><option value="instalacao" ${t.category === 'instalacao' ? 'selected' : ''}>Instalação</option><option value="higienizacao" ${t.category === 'higienizacao' ? 'selected' : ''}>Higienização</option><option value="gas" ${t.category === 'gas' ? 'selected' : ''}>Suspeita de falta de gás</option><option value="pmoc" ${t.category === 'pmoc' ? 'selected' : ''}>PMOC</option><option value="outros" ${t.category === 'outros' ? 'selected' : ''}>Outros</option>
        </select></div>
      </div>
      <div style="margin-bottom:16px">
        <h4 style="font-size:.8rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">SLA In Loco (Resposta)</h4>
        <div style="padding:12px;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:12px">
          ${renderSLABar(t, 'response')}
          <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:8px">Prazo Máximo: ${t.slaResponseDeadline === 'cronograma' ? '<span style="color:var(--blue)">Conforme Cronograma</span>' : fmt.datetime(t.slaResponseDeadline)}</div>
        </div>
        <h4 style="font-size:.8rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">SLA Fix (Solução)</h4>
        <div style="padding:12px;background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-sm)">
          ${renderSLABar(t, 'resolution')}
          <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:8px">Prazo Máximo: ${t.slaResolutionDeadline === 'cronograma' ? '<span style="color:var(--blue)">Conforme Cronograma</span>' : fmt.datetime(t.slaResolutionDeadline)}</div>
        </div>
      </div>
      <div>
        <h4 style="font-size:.8rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Cliente</h4>
        ${[['Nome', client.fantasia || client.razaoSocial || t.clientName], ['Contato', client.contato || '—'], ['Telefone', client.celular || client.telefone ? `<a href="tel:${(client.celular || client.telefone || '').replace(/\D/g, '')}" style="color:var(--blue)">${esc(client.celular || client.telefone)}</a>` : '—'], ['Endereço', clientAddr(client)]].map(([l, v]) => `<div class="meta-item"><span class="meta-label">${l}</span><span class="meta-value">${v}</span></div>`).join('')}
      </div>
    </div>`;
            
            updateTotalPrevisto(t, parts);
            document.getElementById('detailFooter').style.display = 'flex';
            checkProposalEnabled(t, parts);
            initTimer(t);
            openModal('modalDetail');
        }

        function updateTotalPrevisto(t, parts) {
            const total = parts.reduce((sum, p) => sum + (Math.abs(p.quantity) * (p.unitPrice || 0)), 0);
            document.getElementById('detailTotalPrevisto').textContent = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        }


        function checkProposalEnabled(t, parts) {
            if (!t) t = db.find('tickets', currentDetailId);
            if (!parts) parts = db.get('stock_movements').filter(m => m.ticketId === currentDetailId);
            
            const btn = document.getElementById('btnSubmitProposal');
            if (btn) {
                const pendingItems = parts.filter(p => !p.status || p.status === 'reprovado' || p.status === 'expirado');
                const isWaiting = t.status === 'aguardando_aprovacao_pecas';
                
                btn.disabled = pendingItems.length === 0 || isWaiting;
                
                if (isWaiting) {
                    btn.textContent = '⏳ Aguardando Aprovação';
                    btn.className = 'btn btn-ghost btn-sm';
                } else {
                    btn.textContent = '🚀 Enviar para Aprovação';
                    btn.className = 'btn btn-primary btn-sm';
                }
            }
        }

        function submitProposal() {
            if (!confirm('Deseja enviar as peças pendentes para aprovação do cliente (validade de 10 dias)?')) return;
            Proposals.sendForApproval(currentDetailId, session);
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
            const t = db.find('tickets', currentDetailId);
            const allParts = db.get('stock_movements').filter(m => m.ticketId === currentDetailId);
            updateTotalPrevisto(t, allParts);
            checkProposalEnabled(t, allParts);
            toast('Status atualizado!', '', 'success');
            viewTicket(currentDetailId);
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
                pendingAttachment = e.target.result;
                const info = document.getElementById('attachInfo');
                info.innerHTML = `📎 ${file.name} <button class="btn btn-ghost btn-sm btn-icon" style="color:var(--danger);padding:0 4px" data-on-click="clearAttachment(event)">✕</button>`;
                info.style.display = 'block';
            };
            reader.readAsDataURL(file);
        }

        function clearAttachment(e) {
            if (e) e.preventDefault();
            pendingAttachment = null;
            document.getElementById('attachInfo').innerHTML = '';
            document.getElementById('attachInfo').style.display = 'none';
        }

        function setInt(v) {
            isInternal = v;
            const pub = document.getElementById('tPub');
            const pri = document.getElementById('tInt');
            const hint = document.getElementById('internalHint');
            if (pub) pub.classList.toggle('active', !v);
            if (pri) pri.classList.toggle('active', v);
            if (hint) hint.style.display = v ? 'block' : 'none';
        }
        function changeStatus() {
            const newStatus = document.getElementById('detailStatusSelect').value;
            const update = { status: newStatus };
            const t = db.find('tickets', currentDetailId);
            if (['resolvido', 'fechado'].includes(newStatus)) {
                if (t && !t.closedAt) update.closedAt = new Date().toISOString();
                // Fire CSAT notification to client (only once)
                if (t && !t.csatNotified && !t.csatRating) {
                    update.csatNotified = true;
                    update.awaitingCsat = true;
                    if (t.clientId) {
                        const clientUser = db.get('users').find(u => u.clientId === t.clientId && u.role === 'cliente');
                        db.insert('notifications', {
                            type: 'csat_request',
                            title: '⭐ Como foi o seu atendimento?',
                            text: `O chamado ${t.num} — "${t.title}" foi resolvido. Avalie o atendimento do técnico!`,
                            ticketId: t.id,
                            targetUserId: clientUser?.id || null,
                            targetClientId: t.clientId,
                            read: false
                        });
                    }
                    logAudit('ticket_resolved', `Chamado ${t.num} marcado como ${newStatus} por ${session.name}`);
                }
            }
            db.update('tickets', currentDetailId, update);
            toast('Status atualizado', '', 'success'); renderTable();
        }
        function addComment() {
            const text = document.getElementById('commentText').value.trim();
            if (!text) { toast('Erro', 'Escreva uma mensagem.', 'error'); return; }
            const status = document.getElementById('detailStatusSelect').value;
            const t = db.find('tickets', currentDetailId);
            const update = { status };
            if (['resolvido', 'fechado'].includes(status)) {
                if (t && !t.closedAt) update.closedAt = new Date().toISOString();
                // Fire CSAT notification to client (only once)
                if (t && !t.csatNotified && !t.csatRating) {
                    update.csatNotified = true;
                    update.awaitingCsat = true;
                    if (t.clientId) {
                        const clientUser = db.get('users').find(u => u.clientId === t.clientId && u.role === 'cliente');
                        db.insert('notifications', {
                            type: 'csat_request',
                            title: '⭐ Como foi o seu atendimento?',
                            text: `O chamado ${t.num} — "${t.title}" foi resolvido. Avalie o atendimento do técnico!`,
                            ticketId: t.id,
                            targetUserId: clientUser?.id || null,
                            targetClientId: t.clientId,
                            read: false
                        });
                    }
                    logAudit('ticket_resolved', `Chamado ${t.num} marcado como ${status} por ${session.name}`);
                }
            }
            db.update('tickets', currentDetailId, update);
            db.insert('comments', { ticketId: currentDetailId, authorId: session.userId, authorName: session.name, authorRole: session.role, text, internal: isInternal, attachment: pendingAttachment });
            toast('Resposta adicionada', '', 'success');
            document.getElementById('commentText').value = '';
            clearAttachment();
            viewTicket(currentDetailId); renderTable();
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

        // ─── Create Ticket ───
        function openNewTicket() {
            const clients = db.get('clients').filter(c => c.status === 'ativo');
            document.getElementById('ntClientId').innerHTML =
                clients.map(c => `<option value="${c.id}">${esc(c.fantasia || c.razaoSocial)}</option>`).join('');
            const staff = db.get('users').filter(u => ['tecnico', 'admin', 'superadmin'].includes(u.role) && !u.deactivated);
            document.getElementById('ntAssignTo').innerHTML =
                `<option value="${session.userId}|${esc(session.name)}" selected>${esc(session.name)} (você)</option>` +
                staff.filter(u => u.id !== session.userId).map(u => `<option value="${u.id}|${esc(u.name)}">${esc(u.name)}</option>`).join('');
            document.getElementById('ntTitle').value = '';
            document.getElementById('ntDesc').value = '';
            document.getElementById('ntPriority').value = 'media';
            document.getElementById('ntStatus').value = 'aberto';
            document.getElementById('ntCategory').value = 'corretiva';
            onNtClientChange();
            openModal('modalNewTicket');
        }

        function onNtClientChange() {
            const clientId = document.getElementById('ntClientId').value;
            const contracts = clientId ? db.findBy('contracts', 'clientId', clientId).filter(c => c.status === 'ativo') : [];
            document.getElementById('ntContractId').innerHTML =
                '<option value="">Sem contrato</option>' +
                contracts.map(c => `<option value="${c.id}">${SLA_CONFIG[c.type]?.label || c.type} — SLA ${c.slaH}h</option>`).join('');
        }

        function createTicket() {
            const clientId = document.getElementById('ntClientId').value;
            const title = document.getElementById('ntTitle').value.trim();
            if (!clientId || !title) { toast('Obrigatório', 'Selecione o cliente e informe o título.', 'error'); return; }
            const client = db.find('clients', clientId);
            const contractId = document.getElementById('ntContractId').value;
            const contract = contractId ? db.find('contracts', contractId) : null;
            const assignVal = document.getElementById('ntAssignTo').value;
            const [assignId, assignName] = assignVal ? assignVal.split('|') : [session.userId, session.name];
            const ticket = db.insert('tickets', {
                num: nextTicketNum(),
                clientId, clientName: client?.fantasia || client?.razaoSocial || clientId,
                contractId: contractId || null, contractType: contract?.type || 'basico',
                title,
                category: document.getElementById('ntCategory').value,
                priority: document.getElementById('ntPriority').value,
                status: document.getElementById('ntStatus').value,
                assignedTo: assignId || null,
                assignedName: assignName || null,
                description: document.getElementById('ntDesc').value.trim()
            });
            logAudit('create_ticket', `Criou chamado ${ticket.num} para ${client?.fantasia || clientId} (via portal técnico).`);
            toast('Chamado criado!', ticket.num, 'success');
            closeModal('modalNewTicket'); renderTable();
        }

        // ─── Transfer ───
        function openTransferModal() {
            const t = db.find('tickets', currentDetailId); if (!t) return;
            document.getElementById('transferTicketLabel').textContent = `${t.num} — ${t.title}`;
            document.getElementById('transferReason').value = '';
            const staff = db.get('users').filter(u => ['admin', 'superadmin', 'tecnico'].includes(u.role) && !u.deactivated && u.id !== session.userId);
            document.getElementById('transferToSelect').innerHTML = '<option value="">— Selecione —</option>' + staff.map(u => `<option value="${u.id}|${esc(u.name)}">${esc(u.name)} (${u.role})</option>`).join('');
            openModal('modalTransfer');
        }

        function confirmTransfer() {
            const val = document.getElementById('transferToSelect').value;
            const reason = document.getElementById('transferReason').value.trim();
            if (!val) return toast('Selecione o destinatário', '', 'warning');
            if (!reason) return toast('Motivo obrigatório', '', 'warning');
            const [toId, toName] = val.split('|');
            const t = db.find('tickets', currentDetailId); if (!t) return;
            db.insert('transfers', { ticketId: t.id, ticketNum: t.num, ticketTitle: t.title, fromUserId: session.userId, fromUserName: session.name, toUserId: toId, toUserName: toName, reason });
            db.update('tickets', t.id, { assignedTo: toId, assignedName: toName });
            db.insert('comments', { ticketId: t.id, authorId: session.userId, authorName: session.name, authorRole: session.role, text: `🔄 Chamado transferido para ${toName}. Motivo: ${reason}`, internal: true });
            db.insert('notifications', { type: 'transfer', title: '🔄 Chamado transferido para você', text: `${t.num} foi transferido por ${session.name}.`, ticketId: t.id, targetUserId: toId, read: false });
            logAudit('transfer', `Transferiu ${t.num} de ${session.name} → ${toName}. Motivo: ${reason}`);
            toast('Chamado transferido!', `Para: ${toName}`, 'success');
            closeModal('modalTransfer'); viewTicket(currentDetailId); renderTable();
        }

        // ─── Part Requests ───
        function openAddParts() {
            document.getElementById('partSearch').value = '';
            renderPartList();
            openModal('modalAddParts');
        }

        function renderPartList() {
            const q = document.getElementById('partSearch').value.toLowerCase();
            const items = db.get('inventory').filter(p => (p.status || '').toLowerCase() === 'ativo' && ((p.name || '').toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q)));
            document.getElementById('partList').innerHTML = items.map(p => `
                <div style="display:flex;align-items:center;justify-content:space-between;padding:10px;border-bottom:1px solid var(--border)">
                    <div>
                        <div style="font-size:.85rem;font-weight:600">${esc(p.name)}</div>
                        <div style="font-size:.75rem;color:var(--text-secondary)">SKU: ${esc(p.sku)} · Saldo: ${p.currentStock}</div>
                    </div>
                    <div style="display:flex;gap:4px;align-items:center">
                        <div style="display:flex;flex-direction:column;gap:4px">
                            <label style="font-size:0.65rem;color:var(--text-secondary)">Qtd</label>
                            <input type="number" id="qty_${p.id}" value="1" min="1" max="${p.currentStock}" style="width:45px;height:28px;font-size:.8rem;padding:0 4px;border-radius:4px;border:1px solid var(--border);background:var(--bg-hover);color:var(--text-primary)">
                        </div>
                        <div style="display:flex;flex-direction:column;gap:4px">
                            <label style="font-size:0.65rem;color:var(--text-secondary)">Vlr Unit. (R$)</label>
                            <input type="number" id="price_${p.id}" value="${p.salePrice || 0}" step="0.01" style="width:70px;height:28px;font-size:.8rem;padding:0 4px;border-radius:4px;border:1px solid var(--border);background:var(--bg-hover);color:var(--text-primary)">
                        </div>
                        <button class="btn btn-primary btn-sm" style="align-self: flex-end" data-on-click="addPart('${p.id}')" ${p.currentStock <= 0 ? 'disabled' : ''}>Add</button>
                    </div>
                </div>
            `).join('') || '<p style="padding:20px;text-align:center;color:var(--text-secondary)">Nenhum produto encontrado.</p>';
        }

        function addPart(pid) {
            const p = db.find('inventory', pid);
            const qty = parseInt(document.getElementById('qty_' + pid).value) || 0;
            const price = parseFloat(document.getElementById('price_' + pid).value) || 0;
            if (qty <= 0) return toast('Erro', 'Quantidade inválida', 'error');
            if (qty > p.currentStock) return toast('Erro', 'Saldo insuficiente no estoque', 'error');

            const t = db.find('tickets', currentDetailId);

            // Lança o movimento já aprovado, dando baixa
            db.insert('stock_movements', {
                productId: pid, productName: p.name, productSku: p.sku,
                type: 'saida', quantity: -qty, status: 'pendente',
                unitPrice: price || p.salePrice || p.sellPrice || 0,
                ticketId: t.id, ticketNum: t.num,
                technicianId: session.userId, technicianName: session.name,
                notes: `Adicionado via técnico no chamado ${t.num}`
            });

            // Promove o abatimento no inventário
            db.update('inventory', pid, { currentStock: p.currentStock - qty });

            // Injeta o log no ticket notificando a ação
            db.insert('comments', {
                ticketId: t.id, authorId: session.userId, authorName: session.name, authorRole: session.role,
                text: `📦 Insumo Adicionado: ${qty}x ${p.name} (SKU: ${p.sku}).`, internal: true
            });

            toast('Adicionada!', `Peça vinculada ao chamado: ${p.name}`, 'success');
            renderPartList();
            viewTicket(currentDetailId);
            checkProposalEnabled();
        }

        function confirmRemovePart(mid) {
            if (!confirm('Deseja realmente remover esta peça do chamado?')) return false;

            const m = db.find('stock_movements', mid);
            if (!m) return false;

            // Como as peças inseridas pelos técnicos afetam o estoque automaticamente (status 'aprovado'),
            // o estorno precisa repor essa quantia fisicamente na base.
            if (m.status === 'aprovado' || m.status === 'pendente') {
                const p = db.find('inventory', m.productId);
                if (p) {
                    db.update('inventory', p.id, { currentStock: p.currentStock + Math.abs(m.quantity) });
                }
            }

            const t = db.find('tickets', currentDetailId);
            db.insert('comments', {
                ticketId: t.id, authorId: session.userId, authorName: session.name, authorRole: session.role,
                text: `🗑️ Peça Removida: ${Math.abs(m.quantity)}x ${m.productName} (SKU: ${m.productSku}).\nSaldo de inventário re-estornado à prateleira.`, internal: true
            });

            toast('Peça Removida', m.productName, 'success');
            db.delete('stock_movements', mid);
            viewTicket(currentDetailId);
            checkProposalEnabled();
            return true;
        }

        // ─── TABS ───
        function switchDetailTab(tabId) {
            document.querySelectorAll('#modalDetail .tab-link').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('#modalDetail .tab-content').forEach(el => el.style.display = 'none');
            const targetContent = document.getElementById('tab-' + tabId);
            if (targetContent) {
                targetContent.style.display = 'block';
                // Find matching link dynamically since we re-render the HTML string completely
                const tabLinks = document.querySelectorAll('#modalDetail .tab-link');
                tabLinks.forEach(link => {
                    if (link.getAttribute('data-on-click').includes(tabId)) {
                        link.classList.add('active');
                    }
                });
            }
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
            viewTicket(currentDetailId);
            setTimeout(() => switchDetailTab('checklist'), 10);
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

        // ─── TIME TRACKER ───
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
            updateTotalPrevisto();
            checkProposalEnabled();
        }

        let timerInterval = null;
        let timerData = { running: false, startTime: 0, elapsed: 0 };

        function initTimer(t) {
            if (timerInterval) clearInterval(timerInterval);
            timerData = {
                running: !!t.timerRunning,
                startTime: t.timerStart || 0,
                elapsed: t.timerElapsed || 0
            };
            if (timerData.running) {
                timerInterval = setInterval(updateTimerDisplay, 1000);
            }
            updateTimerDisplay();
        }

        function toggleTimer() {
            const t = db.find('tickets', currentDetailId);
            if (!timerData.running) {
                // Iniciar/Retomar
                timerData.running = true;
                timerData.startTime = Date.now();
                db.update('tickets', currentDetailId, {
                    timerRunning: true,
                    timerStart: timerData.startTime
                });
                timerInterval = setInterval(updateTimerDisplay, 1000);
                toast('Cronômetro', 'Atendimento iniciado/retomado.', 'info');
            } else {
                // Pausar
                timerData.running = false;
                clearInterval(timerInterval);
                const sessionElapsed = Date.now() - timerData.startTime;
                timerData.elapsed += sessionElapsed;
                db.update('tickets', currentDetailId, {
                    timerRunning: false,
                    timerElapsed: timerData.elapsed,
                    timerStart: 0
                });
                toast('Cronômetro', 'Atendimento pausado.', 'warning');
            }
            updateTimerDisplay();
        }

        function stopTimer() {
            if (!confirm('Deseja finalizar o cronômetro e registrar o tempo no chamado?')) return;
            
            clearInterval(timerInterval);
            let totalMs = timerData.elapsed;
            if (timerData.running) {
                totalMs += (Date.now() - timerData.startTime);
            }
            
            const hours = totalMs / (1000 * 60 * 60);
            
            // Resetar estado no banco
            db.update('tickets', currentDetailId, {
                timerRunning: false,
                timerStart: 0,
                timerElapsed: 0
            });
            timerData = { running: false, startTime: 0, elapsed: 0 };
            
            // Abrir modal de log preenchido
            openTimeLogModal();
            document.getElementById('tlHours').value = hours.toFixed(2);
            document.getElementById('tlType').value = 'Atendimento In Loco';
            document.getElementById('tlObs').value = 'Tempo registrado via cronômetro.';
            
            updateTimerDisplay();
        }

        function updateTimerDisplay() {
            let totalMs = timerData.elapsed;
            if (timerData.running) {
                totalMs += (Date.now() - timerData.startTime);
            }
            
            const s = Math.floor(totalMs / 1000) % 60;
            const m = Math.floor(totalMs / (1000 * 60)) % 60;
            const h = Math.floor(totalMs / (1000 * 60 * 60));
            
            const display = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
            const displayEl = document.getElementById('timerDisplay');
            if (displayEl) displayEl.textContent = display;
            
            const btnStart = document.getElementById('btnStartTimer');
            if (btnStart) {
                btnStart.innerHTML = timerData.running ? '⏸️ Pausar' : '▶️ Iniciar / Retomar';
                btnStart.className = timerData.running ? 'btn btn-warning btn-sm' : 'btn btn-primary btn-sm';
            }
            
            const btnStop = document.getElementById('btnStopTimer');
            if (btnStop) btnStop.disabled = (totalMs === 0 && !timerData.running);
            
            const statusEl = document.getElementById('timerStatus');
            if (statusEl) statusEl.textContent = timerData.running ? '🔴 Atendimento em andamento...' : '⏸️ Pausado';
        }

        initSidebar(); renderTable();
    
