/* Extraido de client/dashboard.html por tools/csp-migrate.py (CSP sem unsafe-inline). */
/* ── gerado por tools/csp-migrate.py: nomes liberados para os data-on-* desta pagina ── */
;(function () {
  var s = window.__cspScope || (window.__cspScope = {});
  function def(n, g, st) { Object.defineProperty(s, n, { configurable: true, enumerable: true, get: g, set: st }); }
  def('auth', function () { return typeof auth !== 'undefined' ? auth : undefined; }, function (v) { auth = v; });
  def('baixarRelatorioPmoc', function () { return typeof baixarRelatorioPmoc !== 'undefined' ? baixarRelatorioPmoc : undefined; }, function (v) { baixarRelatorioPmoc = v; });
  def('clientId', function () { return typeof clientId !== 'undefined' ? clientId : undefined; }, function (v) { clientId = v; });
  def('closeModal', function () { return typeof closeModal !== 'undefined' ? closeModal : undefined; }, function (v) { closeModal = v; });
  def('selectStar', function () { return typeof selectStar !== 'undefined' ? selectStar : undefined; }, function (v) { selectStar = v; });
  def('submitCsat', function () { return typeof submitCsat !== 'undefined' ? submitCsat : undefined; }, function (v) { submitCsat = v; });
})();
/* ── fim do bloco gerado ── */

        const session = auth.protect(['cliente']);
        const clientId = session.clientId;
        const client = db.find('clients', clientId);

        document.getElementById('welcomeName').textContent = session.name.split(' ')[0];
        document.getElementById('welcomeCompany').textContent = (client?.fantasia || client?.razaoSocial || '') + ' — Renostter Climatização';

        const myTickets = db.get('tickets').filter(t =>
            (clientId && t.clientId === clientId) ||
            t.clientId === session.userId ||
            t.userId === session.userId
        );
        const myContracts = db.findBy('contracts', 'clientId', clientId).filter(c => c.status === 'ativo');
        const myOpen = myTickets.filter(t => !['resolvido', 'fechado', 'cancelado'].includes(t.status));
        const myClosed = myTickets.filter(t => ['resolvido', 'fechado'].includes(t.status));

        document.getElementById('openCount').textContent = myOpen.length;

        // KPIs
        document.getElementById('clientKpis').innerHTML = [
            { label: 'Total de Chamados', value: myTickets.length, icon: '📋', cls: 'blue' },
            { label: 'Resolvidos', value: myClosed.length, icon: '✅', cls: 'green' },
            { label: 'Contratos Ativos', value: myContracts.length, icon: '📄', cls: 'orange' },
        ].map(k => `<div class="kpi-card"><div class="kpi-info"><div class="kpi-label">${k.label}</div><div class="kpi-value">${k.value}</div></div><div class="kpi-icon ${k.cls}" style="font-size:1.3rem">${k.icon}</div></div>`).join('');

        // Active tickets
        const catIcons = { corretiva: '🔧', preventiva: '🛡', instalacao: '🏗', higienizacao: '🫧', gas: '💨', pmoc: '📅', outros: '📌' };
        document.getElementById('activeTicketsList').innerHTML = myOpen.length
            ? myOpen.sort((a, b) => { const p = { critica: 4, alta: 3, media: 2, baixa: 1 }; return p[b.priority] - p[a.priority]; }).map(t => `
    <div class="activity-item" style="cursor:pointer" data-on-click="location.href='tickets.html'">
      <div class="act-icon" style="background:var(--blue-dim);font-size:1rem">${catIcons[t.category] || '🎫'}</div>
      <div class="act-body">
        <div class="act-title">${t.num} — ${t.title}</div>
        <div class="act-meta" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          ${badgeTicketStatus(t.status)} · ${badgePriority(t.priority)} · ${fmt.relative(t.createdAt)}
        </div>
        <div style="margin-top:6px">${renderSLABar(t)}</div>
      </div>
    </div>`).join('')
            : `<div class="empty-state" style="padding:30px">
      <div style="font-size:2rem">🎉</div>
      <h4>Nenhum chamado em aberto!</h4>
      <p>Tudo resolvido. Caso precise de suporte, abra um novo chamado.</p>
      <a href="tickets.html" class="btn btn-primary btn-sm" style="margin-top:8px">Abrir Chamado</a>
    </div>`;

        // Contract info
        const contract = myContracts[0] || null;
        document.getElementById('contractInfo').innerHTML = contract
            ? `<div style="display:flex;flex-direction:column;gap:0">
      <div style="text-align:center;padding:20px 0 16px">${badgeContractType(contract.type)}</div>
      ${[['Vigência', `${fmt.date(contract.startDate)} → ${fmt.date(contract.endDate)}`],
            ['SLA Resposta', `${SLA_CONFIG[contract.type]?.responseH || '—'}h`],
            ['SLA Resolução', `${SLA_CONFIG[contract.type]?.resolutionH || '—'}h`],
            ['Serviços', (contract.servicos || []).join(', ') || '—'],
            ['Valor anual', fmt.currency(contract.value)]].map(([l, v]) => `
        <div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border);font-size:0.85rem">
          <span style="color:var(--text-secondary)">${l}</span>
          <span style="font-weight:500;max-width:60%;text-align:right">${v}</span>
        </div>`).join('')}
      <div style="margin-top:14px">
        <a href="contracts.html" class="btn btn-ghost btn-sm btn-full">Ver detalhes do contrato</a>
      </div>
    </div>`
            : `<div class="empty-state"><h4>Nenhum contrato ativo</h4><p>Entre em contato com a Renostter.</p></div>`;

        // Check for pending CSAT
        let csatTicketId = null;
        const pendingCsat = myTickets.find(t => t.status === 'resolvido' && !t.csatRating);
        if (pendingCsat) {
            csatTicketId = pendingCsat.id;
            document.getElementById('csatTicketTitle').textContent = pendingCsat.title;
            setTimeout(() => openModal('modalCsat'), 1200);
        }

        let selectedStar = 0;
        const starLabels = ['', '😤 Muito insatisfeito', '😕 Insatisfeito', '😐 Neutro', '😊 Satisfeito', '😍 Muito satisfeito'];
        function selectStar(n) {
            selectedStar = n;
            document.querySelectorAll('.star').forEach((s, i) => { s.style.color = i < n ? '#F0AD00' : '#484F58'; });
            document.getElementById('starLabel').textContent = starLabels[n] || '';
        }
        function submitCsat() {
            if (!selectedStar) { toast('Selecione uma avaliação', '', 'error'); return; }
            db.update('tickets', csatTicketId, { csatRating: selectedStar, csatComment: document.getElementById('csatComment').value.trim() });
            db.insert('csat', { ticketId: csatTicketId, clientId, clientName: client?.fantasia || session.name, rating: selectedStar, comment: document.getElementById('csatComment').value.trim() });
            toast('Obrigado pelo feedback!', 'Sua avaliação foi registrada.', 'success');
            closeModal('modalCsat');
        }

        // ── PMOC Section ──
        async function loadClientPmoc() {
            try {
                const [eqRes, pendentesRes] = await Promise.all([
                    fetch('/api/pmoc/cliente/' + clientId + '/equipamentos').then(r => r.json()),
                    fetch('/api/pmoc/pendentes').then(r => r.json())
                ]);

                const equipamentos = eqRes.data || [];
                const pmocEquip = equipamentos.filter(e => e.potencia_btu >= 75000);
                const pendentes = (pendentesRes.data || [])
                    .filter(p => p.cliente_id === clientId);

                // Render PMOC KPIs
                const pmocKpi = document.getElementById('clientPmocKpi');
                if (pmocKpi) {
                    pmocKpi.innerHTML = `
                        <div class="kpi-card"><div class="kpi-info"><div class="kpi-label">Equip. PMOC</div><div class="kpi-value">${pmocEquip.length}</div></div><div class="kpi-icon blue" style="font-size:1.3rem">❄️</div></div>
                        <div class="kpi-card"><div class="kpi-info"><div class="kpi-label">Manut. Pendentes</div><div class="kpi-value">${pendentes.length}</div></div><div class="kpi-icon orange" style="font-size:1.3rem">📅</div></div>
                        <div class="kpi-card"><div class="kpi-info"><div class="kpi-label">Total Equip.</div><div class="kpi-value">${equipamentos.length}</div></div><div class="kpi-icon green" style="font-size:1.3rem">🏢</div></div>`;
                }

                // Render PMOC list
                const pmocList = document.getElementById('clientPmocList');
                if (pmocList) {
                    if (!pmocEquip.length) {
                        pmocList.innerHTML = '<div class="empty-state"><h4>Nenhum equipamento com PMOC obrigatório</h4><p style="font-size:.82rem">Equipamentos ≥ 75.000 BTU exigem Plano de Manutenção conforme ABNT NBR 16020.</p></div>';
                    } else {
                        pmocList.innerHTML = pmocEquip.slice(0, 5).map(eq => {
                            const dias = eq.proxima_manut
                                ? Math.round((new Date(eq.proxima_manut) - new Date()) / 86400000)
                                : null;
                            const overdue = dias !== null && dias < 0;
                            const soon = dias !== null && dias >= 0 && dias <= 7;
                            const diasLabel = dias === null ? '–' : overdue ? `${Math.abs(dias)}d atrasada` : `${dias}d`;
                            const diasColor = overdue ? 'var(--red)' : soon ? 'var(--orange)' : 'var(--green)';
                            return `<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--border)">
                                <div>
                                    <div style="font-weight:600;font-size:.85rem">${fmt.esc(eq.marca || '')} ${fmt.esc(eq.modelo || '')}</div>
                                    <div style="font-size:.72rem;color:var(--text-muted)">${fmt.esc(eq.local_instalacao || '')} · ${Number(eq.potencia_btu).toLocaleString('pt-BR')} BTU</div>
                                </div>
                                <div style="text-align:right">
                                    <div style="font-weight:700;color:${diasColor};font-size:.83rem">${diasLabel}</div>
                                    ${eq.proxima_manut ? `<div style="font-size:.7rem;color:var(--text-muted)">${fmt.date(eq.proxima_manut)}</div>` : ''}
                                </div>
                            </div>`;
                        }).join('');
                        if (pmocEquip.length > 5) {
                            document.getElementById('clientPmocMore')?.style.removeProperty('display');
                        }
                    }
                }
            } catch(e) {
                console.warn('PMOC load error:', e);
                const pmocSection = document.getElementById('clientPmocSection');
                if (pmocSection) pmocSection.style.display = 'none';
            }
        }

        // ── Service History ──
        async function loadServiceHistory() {
            const el = document.getElementById('serviceHistoryList');
            if (!el) return;
            try {
                const r = await fetch(`/api/pmoc/cliente/${clientId}/manutencoes?status=Concluida&size=10`);
                const j = await r.json();
                const rows = j.data || [];
                if (!rows.length) {
                    el.innerHTML = '<div class="empty-state"><p>Nenhuma manutenção registrada.</p></div>';
                    return;
                }
                el.innerHTML = rows.map(m => `
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--border)">
                        <div>
                            <div style="font-weight:600;font-size:.85rem">${fmt.esc(m.marca || '')} ${fmt.esc(m.modelo || '')}</div>
                            <div style="font-size:.72rem;color:var(--text-muted)">${fmt.esc(m.tipo_manutencao || '')} · ${fmt.esc(m.local_instalacao || '')}</div>
                        </div>
                        <div style="text-align:right">
                            <span class="badge badge-green">✅ Concluída</span>
                            <div style="font-size:.7rem;color:var(--text-muted);margin-top:2px">${m.ultima_data ? fmt.date(m.ultima_data) : '–'}</div>
                        </div>
                    </div>`).join('');
            } catch(e) {
                el.innerHTML = '<div class="empty-state"><p>Histórico indisponível.</p></div>';
            }
        }

        // Extend fmt with escape
        fmt.esc = s => s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : '';

        // Baixar Relatório PMOC (chamado do link no dashboard)

        // ── Run on load ──
        setTimeout(() => { loadClientPmoc(); loadServiceHistory(); }, 500);
        setTimeout(() => Proposals.checkAndNotify(session, client), 2000);

        initSidebar();
    
