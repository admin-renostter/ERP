/* Extraido de client/tickets.html por tools/csp-migrate.py (CSP sem unsafe-inline). */
/* ── gerado por tools/csp-migrate.py: nomes liberados para os data-on-* desta pagina ── */
;(function () {
  var s = window.__cspScope || (window.__cspScope = {});
  function def(n, g, st) { Object.defineProperty(s, n, { configurable: true, enumerable: true, get: g, set: st }); }
  def('Proposals', function () { return typeof Proposals !== 'undefined' ? Proposals : undefined; }, function (v) { Proposals = v; });
  def('addClientComment', function () { return typeof addClientComment !== 'undefined' ? addClientComment : undefined; }, function (v) { addClientComment = v; });
  def('attachEvidence', function () { return typeof attachEvidence !== 'undefined' ? attachEvidence : undefined; }, function (v) { attachEvidence = v; });
  def('auth', function () { return typeof auth !== 'undefined' ? auth : undefined; }, function (v) { auth = v; });
  def('c', function () { return typeof c !== 'undefined' ? c : undefined; }, function (v) { c = v; });
  def('clearAttachment', function () { return typeof clearAttachment !== 'undefined' ? clearAttachment : undefined; }, function (v) { clearAttachment = v; });
  def('closeModal', function () { return typeof closeModal !== 'undefined' ? closeModal : undefined; }, function (v) { closeModal = v; });
  def('filterTab', function () { return typeof filterTab !== 'undefined' ? filterTab : undefined; }, function (v) { filterTab = v; });
  def('openCsat', function () { return typeof openCsat !== 'undefined' ? openCsat : undefined; }, function (v) { openCsat = v; });
  def('openNewTicketModal', function () { return typeof openNewTicketModal !== 'undefined' ? openNewTicketModal : undefined; }, function (v) { openNewTicketModal = v; });
  def('p', function () { return typeof p !== 'undefined' ? p : undefined; }, function (v) { p = v; });
  def('rejectBatchPrompt', function () { return typeof rejectBatchPrompt !== 'undefined' ? rejectBatchPrompt : undefined; }, function (v) { rejectBatchPrompt = v; });
  def('rejectItemPrompt', function () { return typeof rejectItemPrompt !== 'undefined' ? rejectItemPrompt : undefined; }, function (v) { rejectItemPrompt = v; });
  def('selectStar', function () { return typeof selectStar !== 'undefined' ? selectStar : undefined; }, function (v) { selectStar = v; });
  def('session', function () { return typeof session !== 'undefined' ? session : undefined; }, function (v) { session = v; });
  def('submitCsat', function () { return typeof submitCsat !== 'undefined' ? submitCsat : undefined; }, function (v) { submitCsat = v; });
  def('submitTicket', function () { return typeof submitTicket !== 'undefined' ? submitTicket : undefined; }, function (v) { submitTicket = v; });
  def('viewDetail', function () { return typeof viewDetail !== 'undefined' ? viewDetail : undefined; }, function (v) { viewDetail = v; });
})();
/* ── fim do bloco gerado ── */

        const session = auth.protect(['cliente']);
        const clientId = session.clientId;
        const client = db.find('clients', clientId) || {};
        const myContracts = db.findBy('contracts', 'clientId', clientId).filter(c => c.status === 'ativo');
        const contract = myContracts[0] || null;

        // SLA hint
        document.getElementById('slaHint').textContent = SLA_CONFIG[contract?.type || 'basico']?.responseH || '—';

        let tabFilter = 'all', csatTicketId = null;

        function filterTab(val, btn) {
            tabFilter = val;
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn?.classList.add('active');
            renderCards();
        }

        function getTickets() {
            const all = db.get('tickets').filter(t =>
                (clientId && t.clientId === clientId) ||
                t.clientId === session.userId ||
                t.userId === session.userId
            );

            if (tabFilter === 'all') return all;
            if (tabFilter === 'aberto') return all.filter(t => t.status === 'aberto');
            if (tabFilter === 'andamento') return all.filter(t => t.status === 'andamento');
            if (tabFilter === 'resolvido') return all.filter(t => t.status === 'resolvido');

            return all.filter(t => t.status === tabFilter);
        }

        const catIcons = { corretiva: '🔧', preventiva: '🛡', instalacao: '🏗', higienizacao: '🫧', gas: '💨', pmoc: '📅', outros: '📌' };

        function renderCards() {
            const tickets = getTickets().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
            if (!tickets.length) {
                document.getElementById('ticketCards').innerHTML = `<div class="empty-state" style="padding:60px 0">
      <div style="font-size:3rem">🎉</div>
      <h4>Nenhum chamado encontrado</h4>
      <p>Tudo certo! Caso precise de suporte, abra um novo chamado.</p>
      <button class="btn btn-primary btn-sm" style="margin-top:12px" data-on-click="openNewTicketModal()">Abrir Chamado</button>
    </div>`;
                return;
            }

            document.getElementById('ticketCards').innerHTML = tickets.map(t => {
                const sla = calcSLA(t, t.contractType);
                const needsCsat = t.status === 'resolvido' && !t.csatRating;
                return `<div class="card" style="margin-bottom:12px;cursor:pointer" data-on-click="viewDetail('${t.id}')">
      <div style="display:flex;align-items:flex-start;gap:14px;justify-content:space-between">
        <div style="display:flex;align-items:flex-start;gap:12px;flex:1;min-width:0">
          <div style="font-size:1.6rem;margin-top:2px">${catIcons[t.category] || '🎫'}</div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">
              <span style="font-family:monospace;font-size:0.72rem;color:var(--text-muted)">${t.num}</span>
              ${badgeTicketStatus(t.status)} ${badgePriority(t.priority)}
            </div>
            <div style="font-weight:600;font-size:0.95rem;margin-bottom:4px">${t.title}</div>
            <div style="font-size:0.78rem;color:var(--text-secondary)">Aberto em ${fmt.datetime(t.createdAt)} · ${t.assignedName ? 'Técnico: ' + t.assignedName : 'Aguardando atribuição'}</div>
          </div>
        </div>
        <div style="flex-shrink:0;min-width:140px">
          ${['resolvido', 'fechado', 'cancelado'].includes(t.status) ? '' : `<div style="margin-bottom:8px">${renderSLABar(t)}</div>`}
          ${needsCsat ? `<button class="btn btn-orange btn-sm btn-full" data-on-click="event.stopPropagation();openCsat('${t.id}','${t.num}')">⭐ Avaliar atendimento</button>` : t.csatRating ? `<div style="text-align:center;font-size:0.75rem;color:var(--text-secondary)">${renderStars(t.csatRating, '0.9rem')}<div style="margin-top:2px">Avaliado</div></div>` : ''}
        </div>
      </div>
    </div>`;
            }).join('');
        }

        function viewDetail(id) {
            const t = db.find('tickets', id); if (!t) return;

            // V3: Check for expiration before rendering
            try {
                if (Proposals.checkExpiration(t)) {
                    return viewDetail(id);
                }
            } catch(e) { /* proposals.js not loaded yet, skip */ }

            document.getElementById('dtTitle').textContent = t.title;
            document.getElementById('dtNum').textContent = t.num + ' · Aberto em ' + fmt.datetime(t.createdAt);
            const comments = db.findBy('comments', 'ticketId', id).filter(function(c){ return !c.internal; }).sort(function(a,b){ return new Date(a.createdAt) - new Date(b.createdAt); });
            const parts = db.get('stock_movements').filter(function(m){ return m.ticketId === id; });

            // Pre-render parts list to avoid nested template literal issues
            const stMap = {
                pendente: { lbl: '⏳ Pendente', color: '#D29922', bg: 'rgba(210,153,34,.15)' },
                aprovado: { lbl: '✅ Aprovado', color: '#2EA043', bg: 'rgba(46,160,67,.15)' },
                reprovado: { lbl: '❌ Reprovado', color: '#DA3633', bg: 'rgba(218,54,51,.15)' },
                expirado: { lbl: '⚠️ Expirado', color: '#8B949E', bg: 'rgba(139,148,158,.15)' }
            };
            let partsHtml = '';
            if (parts.length) {
                parts.forEach(function(p) {
                    const isPending = p.status === 'pendente';
                    const st = stMap[p.status] || stMap.pendente;
                    const approveBtn = isPending
                        ? '<div style="display:flex;gap:4px"><button class="btn btn-primary btn-sm" style="padding:4px 10px;font-size:0.7rem" data-on-click="Proposals.approveItem(\'' + p.id + '\', session)">Aprovar</button><button class="btn btn-ghost btn-sm" style="padding:4px 10px;font-size:0.7rem;border-color:var(--danger);color:var(--danger)" data-on-click="rejectItemPrompt(\'' + p.id + '\')">Reprovar</button></div>'
                        : '';
                    partsHtml += '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;background:var(--bg-inset)">'
                        + '<div style="flex:1"><div style="font-size:0.9rem;font-weight:600">' + esc(p.productName) + '</div>'
                        + '<div style="font-size:0.75rem;color:var(--text-secondary)">Qtd: ' + Math.abs(p.quantity) + ' · Preço: ' + (function(){ var inv = db.find('inventory', p.productId); var price = p.unitPrice || (inv && (inv.salePrice || inv.sellPrice)) || 0; return fmt.currency(price); })() + '</div></div>'
                        + '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px">'
                        + '<span style="font-size:0.7rem;font-weight:700;padding:2px 8px;border-radius:12px;background:' + st.bg + ';color:' + st.color + '">' + st.lbl + '</span>'
                        + approveBtn + '</div></div>';
                });
                partsHtml = '<div id="clientPartsList" style="margin-bottom:20px">' + partsHtml + '</div>';
            } else {
                partsHtml = '<p style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:20px">Nenhuma peça solicitada.</p>';
            }

            // Pre-render comments
            let commentsHtml = '';
            if (comments.length) {
                comments.forEach(function(c) {
                    const attach = c.attachment ? '<div style="margin-top:8px"><img src="' + c.attachment + '" style="max-width:100%;max-height:300px;border-radius:8px;border:1px solid var(--border);cursor:pointer" data-on-click="window.open(\'' + c.attachment + '\')"></div>' : '';
                    commentsHtml += '<div class="timeline-item"><div class="timeline-dot" style="background:var(--bg-surface);font-size:.8rem">' + (c.authorRole === 'tecnico' ? '🔧' : '👤') + '</div><div class="timeline-content"><div class="timeline-meta">' + esc(c.authorName) + ' · ' + fmt.datetime(c.createdAt) + '</div><div class="timeline-text">' + esc(c.text) + attach + '</div></div></div>';
                });
                commentsHtml = '<div class="timeline">' + commentsHtml + '</div>';
            } else {
                commentsHtml = '<p style="font-size:0.82rem;color:var(--text-secondary)">Aguardando retorno da equipe técnica.</p>';
            }

            document.getElementById('dtBody').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 260px;gap:20px">
      <div>
        <div style="margin-bottom:16px">
          <h4 style="font-size:.8rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Descrição</h4>
          <p style="font-size:0.875rem;line-height:1.7;color:var(--text-secondary)">${esc(t.description) || '—'}</p>
        </div>
        <div>
          <h4 style="font-size:.8rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Peças e Insumos</h4>
          ${partsHtml}
        </div>
        <div>
          <h4 style="font-size:.8rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Histórico de Atualizações</h4>
          ${commentsHtml}
        </div>
        ${t.status === 'aguardando_aprovacao_pecas' ? renderProposalApproval(t) : ''}
        ${!['resolvido', 'fechado', 'cancelado', 'aguardando_aprovacao'].includes(t.status) ? `
        <div style="margin-top:20px">
          <h4 style="font-size:.8rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Adicionar Informação</h4>
          <textarea class="form-textarea" id="clientComment" placeholder="Adicione mais detalhes, fotos, informações que possam ajudar..." rows="3"></textarea>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
            <div>
              <label class="btn btn-ghost btn-sm" style="cursor:pointer;color:var(--blue);display:flex;align-items:center;gap:4px">
                📷 Anexar Evidência <input type="file" accept="image/*" style="display:none" data-on-change="attachEvidence(this)">
              </label>
              <div id="attachInfo" style="font-size:0.75rem;color:var(--text-secondary);margin-top:4px;display:none"></div>
            </div>
            <button class="btn btn-primary btn-sm" data-on-click="addClientComment('${id}')">Enviar</button>
          </div>
        </div>`: ''}
        ${t.status === 'resolvido' && !t.csatRating ? `<div style="margin-top:16px;padding:16px;background:linear-gradient(135deg,rgba(240,173,0,.12),rgba(255,107,0,.08));border:1px solid rgba(240,173,0,.3);border-radius:var(--radius-sm);text-align:center">
          <div style="font-size:1.5rem;margin-bottom:8px">⭐</div>
          <p style="font-size:0.85rem;font-weight:600;color:#F0AD00;margin-bottom:4px">Seu chamado foi resolvido!</p>
          <p style="font-size:0.78rem;color:var(--text-secondary);margin-bottom:12px">Avalie o atendimento do técnico — sua opinião é muito importante.</p>
          <button class="btn btn-sm" style="background:#F0AD00;color:#000;font-weight:700" data-on-click="openCsat('${id}','${t.num}')">Avaliar Atendimento</button>
        </div>` : ''}
      </div>
      <div>
        <h4 style="font-size:.8rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Detalhes</h4>
        ${[['Status', badgeTicketStatus(t.status)], ['Prioridade', badgePriority(t.priority)], ['Categoria', t.category || '—'], ['Técnico Responsável', t.assignedName || 'Aguardando'], ['Abertura', fmt.datetime(t.createdAt)], ['Última atualização', fmt.datetime(t.updatedAt)]].map(([l, v]) => `<div class="detail-meta"><span class="detail-label">${l}</span><span class="detail-val">${v}</span></div>`).join('')}
        ${!['resolvido', 'fechado', 'cancelado'].includes(t.status) ? `<div style="margin-top:14px">${renderSLABar(t)}<div style="font-size:.72rem;color:var(--text-secondary);margin-top:4px">Prazo: ${t.slaResolutionDeadline === 'cronograma' ? 'Conforme Cronograma' : fmt.datetime(t.slaResolutionDeadline)}</div></div>` : ''}
        ${t.csatRating ? `<div style="margin-top:14px;padding:10px;background:var(--bg-surface);border-radius:var(--radius-sm);text-align:center"><div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:6px">Sua avaliação</div>${renderStars(t.csatRating)}<div style="font-size:0.72rem;color:var(--text-muted);margin-top:4px">${t.csatComment || ''}</div></div>` : ''}
      </div>
    </div>`;
            openModal('modalDetail');
        }

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

        function addClientComment(tid) {
            const text = document.getElementById('clientComment')?.value?.trim();
            if (!text) { toast('Erro', 'Escreva uma mensagem.', 'error'); return; }
            db.insert('comments', { ticketId: tid, authorId: session.userId, authorName: session.name, authorRole: 'cliente', text, internal: false, attachment: pendingAttachment });
            toast('Informação enviada', 'Nossa equipe receberá sua mensagem.', 'success');
            clearAttachment();
            viewDetail(tid);
        }

        function openNewTicketModal() {
            document.getElementById('ntTitle').value = ''; document.getElementById('ntDesc').value = '';
            document.getElementById('ntPriority').value = 'media'; document.getElementById('ntCat').value = 'corretiva';

            if (session && session.role === 'cliente') {
                const grpUrgency = document.getElementById('grpUrgency');
                if (grpUrgency) grpUrgency.style.display = 'none';
            }
            openModal('modalNewTicket');
        }

        function submitTicket() {
            const title = document.getElementById('ntTitle').value.trim();
            const desc = document.getElementById('ntDesc').value.trim();
            if (!title || !desc) { toast('Obrigatório', 'Preencha o assunto e a descrição.', 'error'); return; }
            const t = db.insert('tickets', {
                num: nextTicketNum(), clientId, userId: session.userId, clientName: client?.fantasia || session.name,
                contractId: contract?.id || null, contractType: contract?.type || 'basico',
                title, category: document.getElementById('ntCat').value, priority: document.getElementById('ntPriority').value,
                status: 'aberto', assignedTo: null, assignedName: null, description: desc
            });
            toast('Chamado aberto!', t.num + ' — Nossa equipe entrará em contato.', 'success');
            closeModal('modalNewTicket'); renderCards();
            if (window.updateTicketBadge) window.updateTicketBadge();
        }

        // ─── CSAT ───
        let selectedStar = 0, csatTid = null;
        const starLbls = ['', '😤 Muito insatisfeito', '😕 Insatisfeito', '😐 Neutro', '😊 Satisfeito', '😍 Excelente!'];

        function openCsat(id, num) {
            csatTid = id;
            selectedStar = 0;
            document.getElementById('csatNum').textContent = num;
            document.getElementById('csatComment').value = '';
            document.querySelectorAll('.star').forEach(s => s.style.color = '#484F58');
            document.getElementById('starLabel').textContent = 'Toque para avaliar';
            openModal('modalCsat');
        }

        function selectStar(n) {
            selectedStar = n;
            document.querySelectorAll('#modalCsat .star').forEach((s, i) => s.style.color = i < n ? '#F0AD00' : '#484F58');
            document.getElementById('starLabel').textContent = starLbls[n] || '';
        }

        function submitCsat() {
            if (!selectedStar) { toast('Erro', 'Selecione uma avaliação de 1 a 5 estrelas.', 'error'); return; }
            const comment = document.getElementById('csatComment').value.trim();
            db.update('tickets', csatTid, { csatRating: selectedStar, csatComment: comment, awaitingCsat: false });
            db.insert('csat', { ticketId: csatTid, clientId, clientName: client?.fantasia || session.name, rating: selectedStar, comment });
            // Mark associated csat_request notifications as read
            db.get('notifications')
                .filter(n => n.type === 'csat_request' && n.ticketId === csatTid)
                .forEach(n => db.update('notifications', n.id, { read: true }));
            toast('Obrigado! ⭐', 'Sua avaliação foi registrada com sucesso.', 'success');
            closeModal('modalCsat');
            renderCards();
            renderCsatBanner();
        }

        // ─── CSAT Notification Banner ───
        function renderCsatBanner() {
            const pending = db.get('notifications').filter(n =>
                n.type === 'csat_request' && !n.read &&
                (n.targetClientId === clientId || n.targetUserId === session.userId)
            );
            const banner = document.getElementById('csatBanner');
            if (!pending.length) { banner.style.display = 'none'; return; }
            banner.style.display = 'flex';
            const plural = pending.length > 1
                ? `${pending.length} chamados aguardando avaliação`
                : `Um chamado aguardando sua avaliação`;
            document.getElementById('csatBannerMsg').textContent = plural;
            document.getElementById('csatBannerBtns').innerHTML = pending.map(n => {
                const t = db.find('tickets', n.ticketId);
                if (!t) return '';
                return `<button class="btn btn-sm" style="background:#F0AD00;color:#000;font-weight:700" data-on-click="openCsat('${t.id}','${t.num}')">Avaliar ${t.num}</button>`;
            }).join('');
        }

        // ─── Proposal Approval ───
        function renderProposalApproval(t) {
            const pendingParts = db.get('stock_movements').filter(m => m.ticketId === t.id && m.status === 'pendente');
            if (pendingParts.length === 0) return '';

            return `
            <div style="margin-top:20px; padding:20px; background:var(--bg-inset); border:1px solid var(--orange); border-radius:12px; animation: fadeInUp 0.3s ease">
                <div style="display:flex; align-items:center; gap:10px; margin-bottom:15px">
                    <span style="font-size:1.5rem">📄</span>
                    <div>
                        <h4 style="margin:0; font-size:1rem; color:var(--orange)">Aprovação de Peças Pendente</h4>
                        <p style="margin:0; font-size:0.75rem; color:var(--text-secondary)">Você tem itens aguardando sua autorização. Prazo de 10 dias.</p>
                    </div>
                </div>

                <div style="display:flex; gap:10px">
                    <button class="btn btn-primary" style="flex:2" data-on-click="Proposals.approveAll('${t.id}', session)">✅ Aprovar Todos os Itens</button>
                    <button class="btn btn-ghost" style="flex:1; border:1px solid var(--danger); color:var(--danger)" data-on-click="rejectBatchPrompt('${t.id}')">✕ Reprovar Todos</button>
                </div>
            </div>`;
        }

        function rejectItemPrompt(mid) {
            const reason = prompt('Por favor, informe o motivo da reprovação:');
            if (reason === null) return;
            Proposals.rejectItem(mid, session, reason);
        }

        function rejectBatchPrompt(id) {
            const reason = prompt('Por favor, informe o motivo da reprovação em lote:');
            if (reason === null) return;
            const parts = db.get('stock_movements').filter(m => m.ticketId === id && m.status === 'pendente');
            parts.forEach(p => Proposals.rejectItem(p.id, session, reason));
        }

        function rejectWithPrompt(id) {
            const reason = prompt('Por favor, informe o motivo da reprovação (mínimo 5 caracteres):');
            if (reason === null) return;
            Proposals.reject(id, session, reason);
        }

        initSidebar(); renderCards(); renderCsatBanner();
    
