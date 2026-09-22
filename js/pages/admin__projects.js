/* Extraido de admin/projects.html por tools/csp-migrate.py (CSP sem unsafe-inline). */
/* ── gerado por tools/csp-migrate.py: nomes liberados para os data-on-* desta pagina ── */
;(function () {
  var s = window.__cspScope || (window.__cspScope = {});
  function def(n, g, st) { Object.defineProperty(s, n, { configurable: true, enumerable: true, get: g, set: st }); }
  def('allowDrop', function () { return typeof allowDrop !== 'undefined' ? allowDrop : undefined; }, function (v) { allowDrop = v; });
  def('auth', function () { return typeof auth !== 'undefined' ? auth : undefined; }, function (v) { auth = v; });
  def('drag', function () { return typeof drag !== 'undefined' ? drag : undefined; }, function (v) { drag = v; });
  def('drop', function () { return typeof drop !== 'undefined' ? drop : undefined; }, function (v) { drop = v; });
  def('renderKanban', function () { return typeof renderKanban !== 'undefined' ? renderKanban : undefined; }, function (v) { renderKanban = v; });
  def('switchView', function () { return typeof switchView !== 'undefined' ? switchView : undefined; }, function (v) { switchView = v; });
})();
/* ── fim do bloco gerado ── */

        const session = auth.protect(['admin', 'superadmin']);
        if (!session) throw new Error('Access denied');

        // Initialize técnicos filter with capacity info
        function initFilters() {
            const techs = db.get('users').filter(u => u.role === 'tecnico');
            const tickets = db.get('tickets');
            const sel = document.getElementById('fTech');

            techs.forEach(t => {
                const count = tickets.filter(tk => tk.assignedTo === t.id && !['resolvido', 'fechado', 'cancelado'].includes(tk.status)).length;
                const opt = document.createElement('option');
                opt.value = t.id;
                opt.textContent = `${t.name} (${count} ativos)`;
                sel.appendChild(opt);
            });
        }

        function switchView(view) {
            document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
            event.target.classList.add('active');
            document.getElementById('kanbanView').style.display = view === 'kanban' ? 'flex' : 'none';
            document.getElementById('timelineView').style.display = view === 'timeline' ? 'block' : 'none';
            document.getElementById('activityView').style.display = view === 'activity' ? 'block' : 'none';

            if (view === 'timeline') renderTimeline();
            if (view === 'activity') renderActivityFeed();
        }

        function renderActivityFeed() {
            const container = document.getElementById('activityList');
            const comments = db.get('comments');
            const transfers = db.get('transfers');
            const stock = db.get('stock_movements');
            const audit = db.get('auditlog');

            const feed = [
                ...comments.map(c => ({ date: c.createdAt, type: 'comment', icon: '💬', authorId: c.authorId, text: `<strong>${esc(c.authorName)}</strong> comentou no chamado <strong>#${c.ticketId.substring(1)}</strong>: "${esc(c.text.substring(0, 50))}..."` })),
                ...transfers.map(x => ({ date: x.createdAt, type: 'transfer', icon: '🔄', fromUserId: x.fromUserId, text: `<strong>${esc(x.fromUserName)}</strong> transferiu o chamado <strong>${x.ticketNum}</strong> para <strong>${esc(x.toUserName)}</strong>` })),
                ...stock.map(s => ({ date: s.createdAt, type: 'stock', icon: '📦', technicianId: s.technicianId, text: `<strong>${esc(s.technicianName || 'Admin')}</strong> registrou ${s.type} de <strong>${esc(s.productName)}</strong> para o chamado <strong>${s.ticketNum}</strong>` })),
                ...audit.filter(a => a.action === 'ticket_status_change').map(a => ({ date: a.createdAt, type: 'audit', icon: '⚡', authorId: a.userId, text: a.details }))
            ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 50);

            if (feed.length === 0) {
                container.innerHTML = '<p style="text-align:center;color:var(--text-secondary)">Nenhuma atividade recente.</p>';
                return;
            }

            container.innerHTML = feed.map(item => `
                <div style="display:flex;gap:16px;padding:16px;border-bottom:1px solid var(--border);border-left:4px solid var(--blue);background:var(--bg-surface);margin-bottom:8px;border-radius:0 8px 8px 0">
                    <div style="flex-shrink:0">${renderAvatar(item.authorId || item.fromUserId || item.technicianId, '32px', '0.8rem')}</div>
                    <div style="flex:1">
                        <div style="font-size:0.875rem;color:var(--text-primary)">${item.text}</div>
                        <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:4px">${new Date(item.date).toLocaleString()}</div>
                    </div>
                </div>
            `).join('');
        }

        function renderTimeline() {
            const tickets = db.get('tickets').sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            const container = document.getElementById('timelineView');

            if (tickets.length === 0) {
                container.innerHTML = '<p style="text-align:center;color:var(--text-secondary)">Nenhum projeto para exibir no cronograma.</p>';
                return;
            }

            let html = `
                <div style="overflow-x:auto">
                    <table style="width:100%;border-collapse:collapse;font-size:0.85rem">
                        <thead>
                            <tr style="border-bottom:2px solid var(--border)">
                                <th style="text-align:left;padding:12px;width:250px">Chamado / Projeto</th>
                                <th style="text-align:left;padding:12px">Distribuição Temporal (SLA vs Real)</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            tickets.forEach(t => {
                const sla = calcSLA(t, t.contractType || 'basico');
                const start = new Date(t.createdAt);
                const deadline = new Date(t.slaResolutionDeadline==='cronograma'? 0 : t.slaResolutionDeadline);
                const now = new Date();

                // Simple visualization logic: 
                // We'll show a bar representing the time from creation to deadline
                // And another bar for time elapsed
                html += `
                    <tr style="border-bottom:1px solid var(--border)">
                        <td style="padding:12px">
                            <div style="font-weight:600;color:var(--text-primary)">${esc(t.num)}: ${esc(t.title)}</div>
                            <div style="font-size:0.75rem;color:var(--text-secondary)">Cliente: ${esc(t.clientName)}</div>
                        </td>
                        <td style="padding:12px">
                            <div style="background:var(--bg-inset);height:24px;border-radius:12px;position:relative;overflow:hidden;border:1px solid var(--border)">
                                <div style="position:absolute;left:0;top:0;height:100%;width:${Math.min(sla.pct, 100)}%;background:${sla.state === 'danger' ? 'var(--danger)' : (sla.state === 'warning' ? 'var(--warning)' : 'var(--success)')};opacity:0.6" title="Progresso Real"></div>
                                <div style="position:absolute;left:0;top:0;height:100%;width:100%;display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:700;color:var(--text-primary);z-index:2">
                                    SLA: ${t.slaDeadline ? new Date(t.slaResolutionDeadline==='cronograma'? 0 : t.slaResolutionDeadline).toLocaleString() : 'N/A'}
                                </div>
                            </div>
                        </td>
                    </tr>
                `;
            });

            html += `
                        </tbody>
                    </table>
                </div>
            `;
            container.innerHTML = html;
        }

        function renderKanban() {
            const tickets = db.get('tickets');
            const searchQuery = document.getElementById('kanbanSearch').value.toLowerCase();
            const techFilter = document.getElementById('fTech').value;

            // Clear lists
            document.querySelectorAll('.card-list').forEach(l => l.innerHTML = '');

            const filtered = tickets.filter(t => {
                const matchesSearch = t.title.toLowerCase().includes(searchQuery) || t.num.includes(searchQuery);
                const matchesTech = !techFilter || t.assignedTo === techFilter;
                return matchesSearch && matchesTech;
            });

            const stats = { aberto: 0, andamento: 0, aguardando: 0, resolvido: 0 };

            filtered.forEach(t => {
                const column = document.querySelector(`.kanban-column[data-status="${t.status}"] .card-list`);
                if (column) {
                    stats[t.status]++;
                    column.innerHTML += createCard(t);
                }
            });

            // Update counts
            Object.keys(stats).forEach(k => {
                const el = document.getElementById(`count-${k}`);
                if (el) el.textContent = stats[k];
            });
        }

        function createCard(t) {
            const sla = calcSLA(t, t.contractType || 'basico');
            const priorityLabel = PRIORITY[t.priority]?.label || t.priority;
            const priorityClass = t.priority === 'critica' || t.priority === 'alta' ? 'badge-red' : (t.priority === 'media' ? 'badge-blue' : 'badge-gray');

            return `
                <div class="kanban-card" draggable="true" data-on-dragstart="drag(event)" id="${t.id}" data-on-click="window.location.href='tickets.html?id=${t.id}'">
                    <span class="card-priority ${priorityClass}">${priorityLabel}</span>
                    <div class="card-title">${esc(t.title)}</div>
                    <div class="card-client">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                        </svg>
                        ${esc(t.clientName)}
                    </div>
                    <div class="card-footer">
                        <div class="card-tech">
                            <div class="tech-avatar">${t.assignedName ? t.assignedName.charAt(0) : '?'}</div>
                            <span>${t.assignedName || 'Não atribuído'}</span>
                        </div>
                        <div class="card-sla" title="SLA: ${sla.label}">
                            <div class="sla-indicator sla-${sla.state}"></div>
                            <span>${sla.pct}%</span>
                        </div>
                    </div>
                </div>
            `;
        }

        // Drag and Drop Logic
        function drag(ev) {
            ev.dataTransfer.setData("text", ev.target.id);
            ev.target.classList.add('dragging');
        }

        function allowDrop(ev) {
            ev.preventDefault();
        }

        function drop(ev) {
            ev.preventDefault();
            const id = ev.dataTransfer.getData("text");
            const newStatus = ev.target.closest('.kanban-column').getAttribute('data-status');

            // Update storage
            const ticket = db.find('tickets', id);
            if (ticket && ticket.status !== newStatus) {
                db.update('tickets', id, { status: newStatus });
                logAudit('ticket_status_change', `Status do chamado ${ticket.num} alterado para ${newStatus} via Kanban por ${session.name}`);
                toast('Status atualizado', `Chamado movido para ${newStatus}`, 'success');
            }

            document.querySelectorAll('.kanban-card').forEach(c => c.classList.remove('dragging'));
            renderKanban();
        }

        function checkCriticalAlerts() {
            const tickets = db.get('tickets');
            const now = new Date();
            let alertsTriggered = 0;

            tickets.forEach(t => {
                if (['resolvido', 'fechado', 'cancelado'].includes(t.status)) return;

                // Priority Check
                if (t.priority === 'critica' && !t.criticaNotified) {
                    db.insert('notifications', {
                        type: 'critical_task',
                        title: '🔥 CHAMADO CRÍTICO',
                        text: `O chamado ${t.num} possui prioridade crítica e requer atenção imediata.`,
                        ticketId: t.id,
                        targetUserId: t.assignedTo || session.userId,
                        read: false
                    });
                    db.update('tickets', t.id, { criticaNotified: true });
                    alertsTriggered++;
                }

                // SLA Check
                const deadline = new Date(t.slaResolutionDeadline==='cronograma'? 0 : t.slaResolutionDeadline);
                if (deadline < now && !t.slaExpiredNotified) {
                    db.insert('notifications', {
                        type: 'sla_breach',
                        title: '⏰ SLA VENCIDO',
                        text: `O SLA do chamado ${t.num} venceu em ${deadline.toLocaleString()}.`,
                        ticketId: t.id,
                        targetUserId: t.assignedTo || session.userId,
                        read: false
                    });
                    db.update('tickets', t.id, { slaExpiredNotified: true });
                    alertsTriggered++;
                }
            });

            if (alertsTriggered > 0) {
                toast('Alertas disparados', `${alertsTriggered} notificações de incidentes críticos criadas.`, 'warning');
            }
        }

        document.addEventListener('DOMContentLoaded', () => {
            initSidebar();
            initFilters();
            renderKanban();
            checkCriticalAlerts();
        });
    
