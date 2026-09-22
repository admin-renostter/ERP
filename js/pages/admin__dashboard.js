/* Extraido de admin/dashboard.html por tools/csp-migrate.py (CSP sem unsafe-inline). */
/* ── gerado por tools/csp-migrate.py: nomes liberados para os data-on-* desta pagina ── */
;(function () {
  var s = window.__cspScope || (window.__cspScope = {});
  function def(n, g, st) { Object.defineProperty(s, n, { configurable: true, enumerable: true, get: g, set: st }); }
  def('auth', function () { return typeof auth !== 'undefined' ? auth : undefined; }, function (v) { auth = v; });
  def('switchVol', function () { return typeof switchVol !== 'undefined' ? switchVol : undefined; }, function (v) { switchVol = v; });
})();
/* ── fim do bloco gerado ── */

        const session = auth.protect(['admin', 'superadmin']);
        if (session) {
            // Check for proposals
            setTimeout(() => Proposals.checkAndNotify(session), 2500);


            document.getElementById('todayDate').textContent = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

            function loadDashboard() {
                const tickets = db.get('tickets');
                const clients = db.get('clients');
                const contracts = db.get('contracts');
                const csat = db.get('csat');

                const open = tickets.filter(t => t.status === 'aberto').length;
                const ongoing = tickets.filter(t => t.status === 'andamento').length;
                const closed = tickets.filter(t => ['resolvido', 'fechado'].includes(t.status)).length;
                const waiting = tickets.filter(t => t.status === 'aguardando').length;
                const activeC = clients.filter(c => c.status === 'ativo').length;
                const activeCt = contracts.filter(c => c.status === 'ativo').length;
                const avgCsat = csat.length ? (csat.reduce((s, r) => s + r.rating, 0) / csat.length).toFixed(1) : '—';

                // KPIs
                const kpis = [
                    { label: 'Chamados Abertos', value: open + ongoing, icon: '🎫', cls: 'blue', change: `${waiting} aguardando` },
                    { label: 'Resolvidos (total)', value: closed, icon: '✅', cls: 'green', change: 'Todas as categorias' },
                    { label: 'Contratos Ativos', value: activeCt, icon: '📋', cls: 'orange', change: `${activeC} clientes ativos` },
                    { label: 'CSAT Médio', value: avgCsat + '★', icon: '⭐', cls: 'yellow', change: `${csat.length} avaliações` },
                ];

                document.getElementById('kpiGrid').innerHTML = kpis.map(k => `
    <div class="kpi-card fade-in-up">
      <div class="kpi-info">
        <div class="kpi-label">${k.label}</div>
        <div class="kpi-value">${k.value}</div>
        <div class="kpi-change">${k.change}</div>
      </div>
      <div class="kpi-icon ${k.cls}" style="font-size:1.3rem">${k.icon}</div>
    </div>`).join('');

                // ─── Volume chart (switchable: 30d / year) ───
                let volChart = null, volMode = '30d';

                function buildVolChart() {
                    if (volChart) volChart.destroy();
                    const canvas = document.getElementById('chartVolume');
                    let labels, datasets;

                    if (volMode === '30d') {
                        const days = Array.from({ length: 30 }, (_, i) => {
                            const d = new Date(); d.setDate(d.getDate() - (29 - i)); return d;
                        });
                        // Show every 5th day label to avoid clutter
                        labels = days.map((d, i) => i % 5 === 0 || i === 29
                            ? d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
                            : '');
                        const counts = days.map(d => {
                            const ds = d.toISOString().split('T')[0];
                            return tickets.filter(t => t.createdAt?.split('T')[0] === ds).length;
                        });
                        datasets = [{
                            label: 'Abertos', data: counts,
                            backgroundColor: 'rgba(0,174,239,0.45)', borderColor: '#00AEEF',
                            borderWidth: 2, borderRadius: 4
                        }];
                    } else {
                        const year = new Date().getFullYear();
                        const months = Array.from({ length: 12 }, (_, i) => i);
                        labels = months.map(m => new Date(year, m, 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''));
                        const opened = months.map(m =>
                            tickets.filter(t => {
                                const d = new Date(t.createdAt);
                                return d.getFullYear() === year && d.getMonth() === m;
                            }).length);
                        const resolved = months.map(m =>
                            tickets.filter(t => {
                                const d = new Date(t.updatedAt || t.createdAt);
                                return ['resolvido', 'fechado'].includes(t.status) && d.getFullYear() === year && d.getMonth() === m;
                            }).length);
                        datasets = [
                            { label: 'Abertos', data: opened, backgroundColor: 'rgba(0,174,239,0.5)', borderColor: '#00AEEF', borderWidth: 2, borderRadius: 4 },
                            { label: 'Resolvidos', data: resolved, backgroundColor: 'rgba(46,160,67,0.5)', borderColor: '#2EA043', borderWidth: 2, borderRadius: 4 }
                        ];
                    }

                    volChart = new Chart(canvas, {
                        type: 'bar',
                        data: { labels, datasets },
                        options: {
                            responsive: true, maintainAspectRatio: false,
                            plugins: { legend: { display: volMode === 'year', labels: { color: '#8B949E', font: { size: 11 } } } },
                            scales: {
                                y: { beginAtZero: true, ticks: { stepSize: 1, color: '#8B949E' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                                x: { ticks: { color: '#8B949E', maxRotation: 0 }, grid: { display: false } }
                            }
                        }
                    });
                }

                function switchVol(mode) {
                    volMode = mode;
                    document.getElementById('btnV30').style.background = mode === '30d' ? 'var(--blue)' : 'transparent';
                    document.getElementById('btnV30').style.color = mode === '30d' ? '#fff' : 'var(--text-secondary)';
                    document.getElementById('btnVYear').style.background = mode === 'year' ? 'var(--blue)' : 'transparent';
                    document.getElementById('btnVYear').style.color = mode === 'year' ? '#fff' : 'var(--text-secondary)';
                    buildVolChart();
                }

                buildVolChart();

                // ─── Annual chart (standalone card - always year view) ───
                const anoAtual = new Date().getFullYear();
                document.getElementById('anoLabel').textContent = anoAtual;
                const meses = Array.from({ length: 12 }, (_, i) => i);
                const mesesLabels = meses.map(m => new Date(anoAtual, m, 1).toLocaleDateString('pt-BR', { month: 'short', year: undefined }).replace('.', ''));
                const anoAbertos = meses.map(m => tickets.filter(t => { const d = new Date(t.createdAt); return d.getFullYear() === anoAtual && d.getMonth() === m; }).length);
                const anoResolvidos = meses.map(m => tickets.filter(t => { const d = new Date(t.updatedAt || t.createdAt); return ['resolvido', 'fechado'].includes(t.status) && d.getFullYear() === anoAtual && d.getMonth() === m; }).length);
                const totalAno = anoAbertos.reduce((a, b) => a + b, 0);
                document.getElementById('anoTotal').textContent = `${totalAno} chamados em ${anoAtual}`;

                new Chart(document.getElementById('chartAnual'), {
                    type: 'bar',
                    data: {
                        labels: mesesLabels,
                        datasets: [
                            { label: 'Abertos', data: anoAbertos, backgroundColor: 'rgba(0,174,239,0.5)', borderColor: '#00AEEF', borderWidth: 2, borderRadius: 5 },
                            { label: 'Resolvidos', data: anoResolvidos, backgroundColor: 'rgba(46,160,67,0.5)', borderColor: '#2EA043', borderWidth: 2, borderRadius: 5 }
                        ]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        plugins: { legend: { display: true, labels: { color: '#8B949E', font: { size: 11 } } } },
                        scales: {
                            y: { beginAtZero: true, ticks: { stepSize: 1, color: '#8B949E' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                            x: { ticks: { color: '#8B949E' }, grid: { display: false } }
                        }
                    }
                });

                // Status pie
                const statusData = [
                    { label: 'Aberto', count: open, color: '#388BFD' },
                    { label: 'Em Andamento', count: ongoing, color: '#D29922' },
                    { label: 'Aguardando', count: waiting, color: '#8B949E' },
                    { label: 'Resolvido/F.', count: closed, color: '#2EA043' },
                ].filter(s => s.count > 0);

                new Chart(document.getElementById('chartStatus'), {
                    type: 'doughnut',
                    data: {
                        labels: statusData.map(s => s.label), datasets: [{
                            data: statusData.map(s => s.count),
                            backgroundColor: statusData.map(s => s.color), borderWidth: 0, hoverOffset: 4
                        }]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false, cutout: '70%',
                        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => `${c.label}: ${c.raw}` } } }
                    }
                });

                document.getElementById('statusLegend').innerHTML = statusData.map(s => `
    <div style="display:flex;align-items:center;justify-content:space-between;font-size:0.78rem">
      <div style="display:flex;align-items:center;gap:6px">
        <span style="width:8px;height:8px;border-radius:50%;background:${s.color};flex-shrink:0"></span>
        ${s.label}</div>
      <strong>${s.count}</strong>
    </div>`).join('');

                // SLA Alerts
                const now = Date.now();
                const alerts = tickets
                    .filter(t => !['resolvido', 'fechado', 'cancelado'].includes(t.status))
                    .map(t => {
                        const dl = t.slaResolutionDeadline && t.slaResolutionDeadline!=='cronograma' ? new Date(t.slaResolutionDeadline).getTime() : (new Date(t.createdAt).getTime() + 72 * 3600_000);
                        return { ...t, remaining: dl - now };
                    })
                    .filter(t => t.remaining < 8 * 3600_000)
                    .sort((a, b) => a.remaining - b.remaining)
                    .slice(0, 5);

                document.getElementById('slaAlerts').innerHTML = alerts.length
                    ? alerts.map(t => {
                        const rem = t.remaining;
                        const cls = rem <= 0 ? 'critical' : 'warning';
                        const timeStr = rem <= 0 ? 'VENCIDO' : formatDuration(rem);
                        return `<div class="alert-row ${cls}" style="cursor:pointer" data-on-click="location.href='tickets.html'">
          <div class="alert-info"><div class="alert-id">${esc(t.num)}</div><div class="alert-name">${esc(t.title)}</div></div>
          <div class="alert-time ${rem <= 0 ? 'red' : 'warn'}">${timeStr}</div>
        </div>`;
                    }).join('')
                    : '<p style="color:var(--text-secondary);font-size:0.85rem;padding:20px 0;text-align:center">✅ Nenhum SLA em risco</p>';

                // Recent tickets
                const recent = [...tickets].sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)).slice(0, 6);
                document.getElementById('recentTickets').innerHTML = recent.map(t => `
    <tr style="cursor:pointer" data-on-click="location.href='tickets.html'">
      <td class="td-muted" style="font-family:monospace">${esc(t.num)}</td>
      <td style="max-width:260px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.title)}</td>
      <td class="td-muted">${esc(t.clientName)}</td>
      <td>${badgeTicketStatus(t.status)}</td>
      <td>${badgePriority(t.priority)}</td>
      <td>${renderSLABar(t)}</td>
    </tr>`).join('');

                // CSAT
                const recentCsat = [...csat].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 4);
                document.getElementById('csatList').innerHTML = recentCsat.length
                    ? recentCsat.map(c => `
        <div class="activity-item">
          <div class="act-icon" style="background:var(--warning-dim);color:var(--warning);font-size:0.9rem">⭐</div>
          <div class="act-body">
            <div class="act-title">${esc(c.clientName)} — ${renderStars(c.rating, '0.9rem')}</div>
            <div class="act-meta">${esc(c.comment || 'Sem comentário')} · ${fmt.relative(c.createdAt)}</div>
          </div>
        </div>`).join('')
                    : '<p style="color:var(--text-secondary);font-size:0.85rem;padding:20px;text-align:center">Nenhuma avaliação ainda</p>';

                // Top clients
                const clientTicketCount = {};
                tickets.forEach(t => { if (t.clientName) clientTicketCount[t.clientName] = (clientTicketCount[t.clientName] || 0) + 1; });
                const topClientsArr = Object.entries(clientTicketCount).sort((a, b) => b[1] - a[1]).slice(0, 4);
                document.getElementById('topClients').innerHTML = topClientsArr.map(([name, count], i) => `
    <div class="activity-item">
      <div class="act-icon" style="background:var(--blue-dim);color:var(--blue);font-weight:700;font-size:0.8rem">${i + 1}°</div>
      <div class="act-body">
        <div class="act-title">${esc(name)}</div>
        <div class="act-meta">${count} chamado${count > 1 ? 's' : ''}</div>
      </div>
    </div>`).join('');

                loadStockAlerts();
            }

            function loadStockAlerts() {
                const inv = db.get('inventory');
                const low = inv.filter(p => p.status === 'ativo' && p.currentStock <= p.minStock);
                if (low.length) {
                    document.getElementById('stockAlertCard').style.display = 'block';
                    document.getElementById('stockAlertList').innerHTML = low.slice(0, 4).map(p => `
                        <div class="activity-item" style="border-bottom: 1px solid rgba(218,54,51,.1)">
                            <div class="act-icon" style="background:rgba(218,54,51,.15);color:#DA3633">⚠️</div>
                            <div class="act-body">
                                <div class="act-title">${esc(p.name)}</div>
                                <div class="act-meta">Estoque atual: <strong>${p.currentStock}</strong> (Mínimo: ${p.minStock})</div>
                            </div>
                            <button class="btn btn-ghost btn-sm" data-on-click="location.href='inventory.html'">Ajustar</button>
                        </div>
                    `).join('') + (low.length > 4 ? `<div style="padding:10px;text-align:center"><a href="inventory.html" style="font-size:.75rem;color:var(--text-secondary)">+ ${low.length - 4} outros itens em alerta</a></div>` : '');
                } else {
                    document.getElementById('stockAlertCard').style.display = 'none';
                }
            }

            loadDashboard();

            // Resumo Financeiro Cora (Semana 4)
            setTimeout(async () => {
                try {
                    const [extrato, kpis] = await Promise.all([
                        CoraIntegration.getExtrato(),
                        CoraIntegration.getKPIs()
                    ]);

                    if (extrato.success && kpis.success) {
                        const financialSection = document.createElement('div');
                        financialSection.style.marginTop = '24px';
                        financialSection.innerHTML = `
                            <div class="nav-section-label" style="margin-bottom:12px;display:flex;align-items:center;gap:8px">
                                🏦 Resumo Financeiro (Cora)
                                <span style="font-size:.65rem;background:var(--blue-dim);color:var(--blue);padding:2px 6px;border-radius:4px;text-transform:uppercase">Tempo Real</span>
                            </div>
                            <div class="kpi-grid">
                                <div class="kpi-card fade-in-up">
                                    <div class="kpi-info">
                                        <div class="kpi-label">Saldo em Conta</div>
                                        <div class="kpi-value" style="color:#2EA043">${fmt.currency(extrato.data.balance)}</div>
                                        <div class="kpi-change">Disponível para saque</div>
                                    </div>
                                    <div class="kpi-icon green">💰</div>
                                </div>
                                <div class="kpi-card fade-in-up" style="cursor:pointer" data-on-click="location.href='cobrancas.html?status=OVERDUE'">
                                    <div class="kpi-info">
                                        <div class="kpi-label">Inadimplência</div>
                                        <div class="kpi-value" style="color:#EF4444">${fmt.currency(kpis.data.vencido.valor)}</div>
                                        <div class="kpi-change">${kpis.data.vencido.qtd} boleto(s) vencido(s)</div>
                                    </div>
                                    <div class="kpi-icon red">⚠️</div>
                                </div>
                                <div class="kpi-card fade-in-up" style="cursor:pointer" data-on-click="location.href='cobrancas.html?status=PENDING'">
                                    <div class="kpi-info">
                                        <div class="kpi-label">A Receber</div>
                                        <div class="kpi-value" style="color:var(--blue)">${fmt.currency(kpis.data.pendente.valor)}</div>
                                        <div class="kpi-change">${kpis.data.pendente.qtd} boleto(s) em aberto</div>
                                    </div>
                                    <div class="kpi-icon blue">⏳</div>
                                </div>
                                <div class="kpi-card fade-in-up">
                                    <div class="kpi-info">
                                        <div class="kpi-label">Recebido (Mês)</div>
                                        <div class="kpi-value">${fmt.currency(kpis.data.pago.valor)}</div>
                                        <div class="kpi-change">${kpis.data.pago.qtd} recebimento(s)</div>
                                    </div>
                                    <div class="kpi-icon green">✅</div>
                                </div>
                            </div>
                        `;
                        // Inserir antes dos chamados recentes ou após os KPIs principais
                        document.getElementById('kpiGrid').after(financialSection);
                    }
                } catch(e) { console.error('[Dashboard Cora]', e); }
            }, 600);

            // Recent Transfers card (loaded after main dashboard)
            const transfers = db.get('transfers').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
            document.getElementById('recentTransfers').innerHTML = transfers.length ? transfers.map(x => `
    <div class="activity-item">
      <div class="act-icon" style="background:rgba(0,174,239,.15);color:var(--blue)">🔄</div>
      <div class="act-body">
        <div class="act-title">${esc(x.ticketNum)} — ${esc(x.fromUserName)} → <strong>${esc(x.toUserName)}</strong></div>
        <div class="act-meta" style="font-style:italic">${esc(x.reason?.slice(0, 60) || '')}${x.reason?.length > 60 ? '...' : ''}</div>
        <div class="act-meta">${fmt.relative(x.createdAt)}</div>
      </div>
    </div>`).join('') : '<p style="color:var(--text-secondary);font-size:0.85rem;padding:20px;text-align:center">Nenhuma transferência ainda</p>';

            // Superadmin: show audit snippet
            if (session.role === 'superadmin') {
                document.getElementById('auditCard').style.display = '';
                const auditLogs = db.get('auditlog').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
                const ACTION_ICONS = { login: '🔐', logout: '🚪', transfer: '🔄', password_change: '🔑', create_ticket: '🎫' };
                document.getElementById('auditSnippet').innerHTML = auditLogs.length ? auditLogs.map(l => `
    <div class="activity-item">
      <div class="act-icon" style="background:var(--bg-hover);font-size:0.9rem">${ACTION_ICONS[l.action] || '📋'}</div>
      <div class="act-body">
        <div class="act-title">${esc(l.userName)} <span style="font-weight:400;color:var(--text-muted)">· ${l.action}</span></div>
        <div class="act-meta">${esc(l.details?.slice(0, 70) || '')}${(l.details?.length || 0) > 70 ? '...' : ''}</div>
        <div class="act-meta">${fmt.relative(l.createdAt)}</div>
      </div>
    </div>`).join('') : '<p style="color:var(--text-secondary);font-size:0.85rem;padding:20px;text-align:center">Sem registros</p>';
            }

            initSidebar();
        } // end if (session)
    
