/* Extraido de client/contracts.html por tools/csp-migrate.py (CSP sem unsafe-inline). */
/* ── gerado por tools/csp-migrate.py: nomes liberados para os data-on-* desta pagina ── */
;(function () {
  var s = window.__cspScope || (window.__cspScope = {});
  function def(n, g, st) { Object.defineProperty(s, n, { configurable: true, enumerable: true, get: g, set: st }); }
  def('auth', function () { return typeof auth !== 'undefined' ? auth : undefined; }, function (v) { auth = v; });
  def('baixarRelatorioPmoc', function () { return typeof baixarRelatorioPmoc !== 'undefined' ? baixarRelatorioPmoc : undefined; }, function (v) { baixarRelatorioPmoc = v; });
})();
/* ── fim do bloco gerado ── */

    const session = auth.protect(['cliente']);
    const clientId = session.clientId;
    const contracts = db.findBy('contracts', 'clientId', clientId);

    function renderContracts() {
      if (!contracts.length) {
        document.getElementById('contractsBody').innerHTML = `<div class="empty-state" style="padding:80px 0"><div style="font-size:3rem">📋</div><h4>Nenhum contrato encontrado</h4><p>Entre em contato com a Renostter para mais informações.</p><a href="tickets.html" class="btn btn-primary btn-sm" style="margin-top:12px">Abrir Chamado</a></div>`;
        return;
      }

      document.getElementById('contractsBody').innerHTML = contracts.map(c => {
        const sla = SLA_CONFIG[c.type] || {};
        const now = new Date();
        const end = new Date(c.endDate);
        const daysLeft = Math.ceil((end - now) / (1000 * 3600 * 24));
        const isExpired = daysLeft < 0;
        const expiresIn30 = !isExpired && daysLeft <= 30;

        return `<div class="card" style="margin-bottom:20px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:20px">
        <div>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">${badgeContractType(c.type)} ${isExpired ? '<span class="badge badge-red">Encerrado</span>' : expiresIn30 ? `<span class="badge badge-yellow">⚠️ Vence em ${daysLeft}d</span>` : ''}</div>
          <h3 style="font-size:1.05rem;font-weight:700">${sla.label || c.type} — Plano de Manutenção</h3>
          <p style="font-size:0.82rem;color:var(--text-secondary);margin-top:4px">${c.description || ''}</p>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:1.6rem;font-weight:800;color:var(--blue)">${fmt.currency(c.value)}</div>
          <div style="font-size:0.72rem;color:var(--text-secondary)">por ano</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:20px">
        <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px;text-align:center">
          <div style="font-size:1.5rem;font-weight:800;color:var(--blue)">${sla.responseH || '—'}h</div>
          <div style="font-size:0.72rem;color:var(--text-secondary);font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-top:2px">SLA Resposta</div>
        </div>
        <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px;text-align:center">
          <div style="font-size:1.5rem;font-weight:800;color:var(--orange)">${sla.resolutionH || '—'}h</div>
          <div style="font-size:0.72rem;color:var(--text-secondary);font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-top:2px">SLA Resolução</div>
        </div>
        <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px;text-align:center">
          <div style="font-size:1.5rem;font-weight:800;color:var(--success)">${c.visits || '—'}</div>
          <div style="font-size:0.72rem;color:var(--text-secondary);font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-top:2px">Visitas/Ano</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
        <div>
          <div style="font-size:0.75rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Vigência</div>
          <div style="font-size:0.875rem">${fmt.date(c.startDate)} → ${fmt.date(c.endDate)}</div>
          <div style="margin-top:6px">
            <div style="height:5px;background:var(--border);border-radius:50px;overflow:hidden">
              <div style="height:100%;border-radius:50px;background:${isExpired ? 'var(--danger)' : expiresIn30 ? 'var(--warning)' : 'var(--success)'};width:${isExpired ? 100 : Math.min(100, Math.round((new Date() - new Date(c.startDate)) / (new Date(c.endDate) - new Date(c.startDate)) * 100))}%"></div>
            </div>
            <div style="font-size:0.72rem;color:var(--text-secondary);margin-top:4px">${isExpired ? 'Contrato encerrado' : daysLeft + ' dias restantes'}</div>
          </div>
        </div>
        <div>
          <div style="font-size:0.75rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Serviços Incluídos</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px">
            ${(c.servicos || []).map(s => `<span class="badge badge-gray">${s}</span>`).join('') || '<span style="font-size:0.82rem;color:var(--text-secondary)">—</span>'}
          </div>
        </div>
      </div>

      <div style="padding-top:16px;border-top:1px solid var(--border);display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" data-on-click="baixarRelatorioPmoc('${c.clientId || clientId}')" id="btnPmoc-${c.clientId || clientId}">📥 Baixar Relatório PMOC</button>
        <a href="tickets.html" class="btn btn-primary btn-sm">🎫 Abrir Chamado</a>
        <a href="https://wa.me/5511952730593?text=Olá!%20Preciso%20de%20suporte%20sobre%20meu%20contrato." target="_blank" class="btn btn-ghost btn-sm">💬 Falar com Suporte</a>
      </div>
    </div>`;
      }).join('');
    }

    initSidebar(); renderContracts();
  
