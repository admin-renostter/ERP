/* Extraido de tech/dashboard.html por tools/csp-migrate.py (CSP sem unsafe-inline). */
/* ── gerado por tools/csp-migrate.py: nomes liberados para os data-on-* desta pagina ── */
;(function () {
  var s = window.__cspScope || (window.__cspScope = {});
  function def(n, g, st) { Object.defineProperty(s, n, { configurable: true, enumerable: true, get: g, set: st }); }
  def('auth', function () { return typeof auth !== 'undefined' ? auth : undefined; }, function (v) { auth = v; });
})();
/* ── fim do bloco gerado ── */

        const session = auth.protect(['tecnico']);


        document.getElementById('greetName').textContent = session.name.split(' ')[0];
        document.getElementById('greetDate').textContent = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

        const myTickets = db.get('tickets').filter(t => t.assignedTo === session.userId || t.assignedName === session.name);
        const myOpen = myTickets.filter(t => !['resolvido', 'fechado', 'cancelado'].includes(t.status));
        const myClosed = myTickets.filter(t => ['resolvido', 'fechado'].includes(t.status));

        document.getElementById('greetOpenCount').textContent = myOpen.length;

        // KPIs
        document.getElementById('techKpis').innerHTML = [
            { label: 'Atribuídos', value: myTickets.length, icon: '📋', cls: 'blue' },
            { label: 'Em Aberto', value: myOpen.length, icon: '🔵', cls: 'orange' },
            { label: 'Resolvidos', value: myClosed.length, icon: '✅', cls: 'green' },
            { label: 'Críticos', value: myOpen.filter(t => t.priority === 'critica').length, icon: '🔴', cls: 'red' },
        ].map(k => `<div class="kpi-card"><div class="kpi-info"><div class="kpi-label">${k.label}</div><div class="kpi-value">${k.value}</div></div><div class="kpi-icon ${k.cls}" style="font-size:1.3rem">${k.icon}</div></div>`).join('');

        // My active tickets table
        const sorted = myOpen.sort((a, b) => { const p = { critica: 4, alta: 3, media: 2, baixa: 1 }; return p[b.priority] - p[a.priority]; });
        document.getElementById('myTickets').innerHTML = sorted.length
            ? sorted.map(t => `<tr style="cursor:pointer" data-on-click="location.href='tickets.html'">
      <td style="font-family:monospace;font-size:0.78rem;color:var(--text-secondary)">${t.num}</td>
      <td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500">${t.title}</td>
      <td class="td-muted">${t.clientName}</td>
      <td>${badgeTicketStatus(t.status)}</td>
      <td>${renderSLABar(t)}</td>
    </tr>`).join('')
            : `<tr><td colspan="5"><div class="empty-state"><h4>Nenhum chamado ativo 🎉</h4><p>Todos os chamados estão resolvidos!</p></div></td></tr>`;

        // Critical list
        const critical = myOpen.filter(t => t.priority === 'critica' || calcSLA(t, t.contractType).state === 'danger');
        document.getElementById('criticalList').innerHTML = critical.length
            ? critical.map(t => {
                const sla = calcSLA(t, t.contractType); return `
    <div class="alert-row critical" style="cursor:pointer" data-on-click="location.href='tickets.html'">
      <div class="alert-info"><div class="alert-id">${t.num} · ${t.clientName}</div><div class="alert-name">${t.title}</div></div>
      <div class="alert-time ${sla.isExpired ? 'red' : 'warn'}">${sla.label}</div>
    </div>`;
            }).join('')
            : `<p style="color:var(--text-secondary);font-size:0.85rem;padding:20px;text-align:center">✅ Nenhum chamado crítico</p>`;

        initSidebar();

        // Transferred-to-me card
        const myTransfers = db.get('transfers')
            .filter(x => x.toUserId === session.userId)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 5);
        document.getElementById('transferredToMe').innerHTML = myTransfers.length
            ? myTransfers.map(x => {
                const t = db.find('tickets', x.ticketId) || {};
                return `<div class="activity-item" style="cursor:pointer" data-on-click="location.href='tickets.html'">
      <div class="act-icon" style="background:rgba(0,174,239,.12);color:var(--blue)">🔄</div>
      <div class="act-body">
        <div class="act-title">${esc(x.ticketNum)} — ${esc(x.ticketTitle || t.title || '—')}</div>
        <div class="act-meta">De: <strong>${esc(x.fromUserName)}</strong> · ${fmt.relative(x.createdAt)}</div>
        <div class="act-meta" style="font-style:italic">${esc(x.reason?.slice(0, 60) || '')}${(x.reason?.length || 0) > 60 ? '...' : ''}</div>
      </div>
    </div>`;
            }).join('')
            : '<p style="color:var(--text-secondary);font-size:0.85rem;padding:20px;text-align:center">Nenhum chamado transferido para você ainda.</p>';
    
