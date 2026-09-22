/* Extraido de admin/bi.html por tools/csp-migrate.py (CSP sem unsafe-inline). */
/* ── gerado por tools/csp-migrate.py: nomes liberados para os data-on-* desta pagina ── */
;(function () {
  var s = window.__cspScope || (window.__cspScope = {});
  function def(n, g, st) { Object.defineProperty(s, n, { configurable: true, enumerable: true, get: g, set: st }); }
  def('closeDrillModal', function () { return typeof closeDrillModal !== 'undefined' ? closeDrillModal : undefined; }, function (v) { closeDrillModal = v; });
  def('exportDrillCSV', function () { return typeof exportDrillCSV !== 'undefined' ? exportDrillCSV : undefined; }, function (v) { exportDrillCSV = v; });
  def('loadAll', function () { return typeof loadAll !== 'undefined' ? loadAll : undefined; }, function (v) { loadAll = v; });
  def('setPeriod', function () { return typeof setPeriod !== 'undefined' ? setPeriod : undefined; }, function (v) { setPeriod = v; });
})();
/* ── fim do bloco gerado ── */

const BASE = '/api';
let currentPeriod = '12m';
let chartReceita, chartTickets, chartCobranca, chartTicketStatus, chartCotacoes, chartLeadsOrigem;

document.addEventListener('DOMContentLoaded', () => { initSidebar(); loadAll(); setupDrillClickHandlers(); loadAnomalies(); loadCohort(); setInterval(() => { loadAll(); loadAnomalies(); }, 300000); });

function setPeriod(p) {
  currentPeriod = p;
  document.querySelectorAll('.period-btn').forEach(b => b.classList.toggle('active', b.dataset.p === p));
  loadAll();
}

function initSidebar() {
  const hamburger = document.getElementById('hamburger');
  const sidebar = document.getElementById('sidebar');
  hamburger?.addEventListener('click', () => sidebar?.classList.toggle('collapsed'));
  // Active nav
  const path = location.pathname.split('/').pop();
  document.querySelectorAll('.nav-item[href]').forEach(a => { if (a.getAttribute('href').includes(path)) a.classList.add('active'); });
}

async function api(path) {
  const r = await fetch(BASE + path);
  const j = await r.json();
  if (!j.success) throw new Error(j.error);
  return j.data;
}

// ════════════════════════════════════════════════════════════════
// Sprint 14.8 — Drill-down, Export, Cohort, Anomalias
// ════════════════════════════════════════════════════════════════

let currentDrillMetric = null;
let currentDrillStatus = null;

function setupDrillClickHandlers() {
  document.querySelectorAll('[data-metric]').forEach(el => {
    el.addEventListener('click', () => {
      const metric = el.getAttribute('data-metric');
      const status = el.getAttribute('data-status') || null;
      openDrillModal(metric, status);
    });
  });
}

async function openDrillModal(metric, status) {
  currentDrillMetric = metric;
  currentDrillStatus = status;
  document.getElementById('drillTitle').textContent = `Drill-down: ${metric}${status ? ' (' + status + ')' : ''}`;
  document.getElementById('drillContent').innerHTML = '<div class="skeleton" style="height:200px"></div>';
  document.getElementById('drillModal').style.display = 'flex';
  try {
    let qs = `?period=${currentPeriod}&limit=100`;
    if (status) qs += `&status=${status}`;
    const data = await api(`/bi/drill/${metric}${qs}`);
    renderDrillTable(data);
  } catch (e) {
    document.getElementById('drillContent').innerHTML = `<div class="empty">Erro: ${esc(e.message)}</div>`;
  }
}

function closeDrillModal() {
  document.getElementById('drillModal').style.display = 'none';
}

function renderDrillTable(data) {
  if (!data.data || data.data.length === 0) {
    document.getElementById('drillContent').innerHTML = '<div class="empty">Nenhum registro encontrado para o período.</div>';
    return;
  }
  const headers = Object.keys(data.data[0]);
  let html = `<div style="margin-bottom:12px;color:var(--text-secondary);font-size:.85rem">Total: <strong style="color:var(--blue)">${data.total}</strong> registros (limit: ${data.limit})</div>`;
  html += '<div class="tbl-wrap"><table class="data-table"><thead><tr>';
  headers.forEach(h => { html += `<th>${esc(h)}</th>`; });
  html += '</tr></thead><tbody>';
  data.data.forEach(row => {
    html += '<tr>';
    headers.forEach(h => {
      const v = row[h];
      const s = v == null ? '' : String(v).substring(0, 80);
      html += `<td style="font-size:.78rem">${esc(s)}</td>`;
    });
    html += '</tr>';
  });
  html += '</tbody></table></div>';
  document.getElementById('drillContent').innerHTML = html;
}

function exportDrillCSV() {
  if (!currentDrillMetric) return;
  const token = localStorage.getItem('jwt') || '';
  const qs = `?period=${currentPeriod}&limit=10000`;
  fetch(`${BASE}/bi/export/${currentDrillMetric}${qs}`, { headers: { 'Authorization': `Bearer ${token}` } })
    .then(r => r.blob())
    .then(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `renostter_${currentDrillMetric}_${new Date().toISOString().substring(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    });
}

async function loadAnomalies() {
  const el = document.getElementById('anomaliesContent');
  const section = document.getElementById('anomaliesSection');
  try {
    const data = await api('/bi/anomalies');
    if (!data.anomalies || data.anomalies.length === 0) {
      section.style.display = 'none';
      return;
    }
    section.style.display = 'block';
    let html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">';
    data.anomalies.forEach(a => {
      const sevColor = a.severity === 'high' ? 'var(--red)' : a.severity === 'medium' ? 'var(--orange)' : 'var(--blue)';
      const arrow = a.direction === 'up' ? '▲' : '▼';
      html += `<div style="background:var(--bg-card);border:1px solid var(--border);border-left:3px solid ${sevColor};border-radius:8px;padding:12px">
        <div style="font-size:.7rem;color:var(--text-muted);text-transform:uppercase">${esc(a.metric)} · ${esc(a.mes)}</div>
        <div style="font-size:1.2rem;font-weight:700;margin:4px 0">${arrow} ${esc(a.name)}</div>
        <div style="font-size:.85rem;color:var(--text-secondary)">Atual: <strong style="color:var(--text-primary)">${a.valor_atual}</strong> · Média: ${a.media_historica}</div>
        <div style="font-size:.78rem;color:${sevColor};margin-top:4px">z-score: ${a.z_score} (${a.severity})</div>
      </div>`;
    });
    html += '</div>';
    el.innerHTML = html;
  } catch (e) {
    el.innerHTML = `<div class="empty">Erro: ${esc(e.message)}</div>`;
  }
}

async function loadCohort() {
  const el = document.getElementById('cohortContent');
  try {
    const data = await api('/bi/cohort?meses=6');
    if (!data.cohorts || data.cohorts.length === 0) {
      el.innerHTML = '<div class="empty">Sem dados de coorte ainda.</div>';
      return;
    }
    const summary = data.summary || {};
    let html = `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px">
      <div class="stat-card"><div class="label">Retenção M1</div><div class="value">${summary.retencao_media_m1 ?? '–'}${summary.retencao_media_m1 != null ? '%' : ''}</div></div>
      <div class="stat-card"><div class="label">Retenção M3</div><div class="value">${summary.retencao_media_m3 ?? '–'}${summary.retencao_media_m3 != null ? '%' : ''}</div></div>
      <div class="stat-card"><div class="label">Retenção M6</div><div class="value">${summary.retencao_media_m6 ?? '–'}${summary.retencao_media_m6 != null ? '%' : ''}</div></div>
    </div>`;
    html += '<div class="tbl-wrap"><table class="data-table"><thead><tr><th>Coorte</th><th>Clientes</th><th>M0</th><th>M1</th><th>M2</th><th>M3</th><th>M4</th><th>M5</th></tr></thead><tbody>';
    data.cohorts.forEach(c => {
      html += `<tr><td>${esc(c.mes)}</td><td>${c.total}</td>`;
      for (let i = 0; i < 6; i++) {
        const r = c.retencao[i];
        const pct = r == null ? '–' : r + '%';
        const color = r == null ? 'var(--text-muted)' : r >= 80 ? 'var(--green)' : r >= 50 ? 'var(--orange)' : 'var(--red)';
        html += `<td style="color:${color}">${pct}</td>`;
      }
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    el.innerHTML = html;
  } catch (e) {
    el.innerHTML = `<div class="empty">Erro: ${esc(e.message)}</div>`;
  }
}

async function loadAll() {
  try {
    const d = await api('/bi/overview?period=' + currentPeriod);
    renderAll(d);
    const lu = document.getElementById('lastUpdated');
    lu.textContent = 'Atualizado: ' + new Date().toLocaleTimeString('pt-BR');
    lu.classList.remove('error');
  } catch(e) {
    console.error('BI load error:', e);
    const el = document.getElementById('lastUpdated');
    el.textContent = 'Erro ao carregar. Tente novamente.';
    el.classList.add('error');
  }
}

function renderAll(d) {
  // Labels com período dinâmico
  const periodLabel = { '7d':'7 dias', '30d':'30 dias', '90d':'90 dias', '12m':'12 meses' }[d.period] || '12 meses';
  document.getElementById('lblReceita').textContent = `Receita Recebida (${periodLabel})`;
  document.getElementById('lblCotacoes').textContent = `Pipeline Cotações (${periodLabel})`;
  document.getElementById('lblLeads').textContent = `Leads Captados (${periodLabel})`;

  // ── KPIs ──
  const c = d.cobrancas;
  document.getElementById('kpiReceita').textContent = fmtCurrency(c.totalRecebido);
  document.getElementById('kpiVencido').textContent = fmtCurrency(c.totalVencido);

  // Deltas (▲ verde / ▼ vermelho / = cinza)
  const deltas = d.deltas || {};
  const setDelta = (id, v) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (v == null || v === 0) { el.textContent = '–'; el.className = 'delta delta-neutral'; return; }
    const up = v > 0;
    el.textContent = (up ? '▲ +' : '▼ ') + v + '%';
    el.className = 'delta ' + (up ? 'delta-up' : 'delta-down');
  };
  setDelta('deltaReceita', deltas.receita);
  setDelta('deltaChamados', deltas.chamados);
  setDelta('deltaCotacoes', deltas.cotacoes);
  setDelta('deltaLeads', deltas.leads);

  const rmr = d.rmr || {};
  document.getElementById('kpiMr').textContent = fmtCurrency(rmr.mrr || 0);

  const pmoc = d.pmoc || {};
  document.getElementById('kpiPmocPct').textContent = (pmoc.taxaConformidade || 0) + '%';

  const tickets = d.tickets || {};
  document.getElementById('kpiSla').textContent = (tickets.taxaResolucao || 0) + '%';
  document.getElementById('kpiContratos').textContent = rmr.contratosAtivos || 0;

  // PMOC details
  document.getElementById('pmocTotal').textContent = pmoc.total || 0;
  document.getElementById('pmocConcluidas').textContent = pmoc.concluidas || 0;
  document.getElementById('pmocVencidas').textContent = pmoc.vencidas || 0;
  document.getElementById('pmocPendentes').textContent = pmoc.pendentes || 0;

  // PMOC progress bar
  const pct = pmoc.total > 0 ? Math.round((pmoc.concluidas / pmoc.total) * 100) : 100;
  const color = pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--orange)' : 'var(--red)';
  document.getElementById('pmocBar').innerHTML = `
    <div style="padding:12px 16px">
      <div style="display:flex;justify-content:space-between;font-size:.8rem;margin-bottom:6px">
        <span style="color:var(--text-secondary)">Conformidade Geral</span>
        <span style="font-weight:700;color:${color}">${pct}%</span>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${color}"></div></div>
    </div>`;

  // ── Charts ──
  renderReceitaChart(d.monthlyRevenue || []);
  renderCotacoesChart(d.cotacoesTrend || []);
  renderTicketsChart(d.ticketsTrend || []);
  renderCobrancaDonut(c);
  renderTicketStatusDonut(tickets);
  renderLeadsOrigemChart(d.leadsPorOrigem || []);

  // ── KPIs ROW 2 — Cotações / Leads / Estoque ──
  const cot = d.cotacoes || {};
  const leads = d.leads || {};
  const est = d.estoque || {};
  document.getElementById('kpiCotacoesValor').textContent = fmtCurrency(cot.valorTotal || 0);
  document.getElementById('kpiTicketMedioCot').textContent = fmtCurrency(cot.ticketMedio || 0);
  document.getElementById('kpiTaxaConvCot').textContent = (cot.taxaConversao || 0) + '%';
  document.getElementById('kpiLeads').textContent = leads.total || 0;
  document.getElementById('kpiLeadsScore').textContent = (leads.scoreMedio || 0) + ' pts';
  document.getElementById('kpiEstoque').textContent = fmtCurrency(est.valorVenda || 0);

  // ── Funil de Vendas ──
  document.getElementById('funilLeads').textContent = leads.total || 0;
  document.getElementById('funilQualificados').textContent = leads.qualificados || 0;
  document.getElementById('funilCotacoes').textContent = cot.total || 0;
  document.getElementById('funilAprovadas').textContent = (cot.aprovadas || 0) + (cot.convertidas || 0);
  document.getElementById('funilReceita').textContent = fmtCurrency(cot.valorTotal || 0);

  // ── Estoque detalhado ──
  document.getElementById('estItens').textContent = est.totalItens || 0;
  document.getElementById('estEquipamentos').textContent = est.totalEquipamentos || 0;
  document.getElementById('estBaixo').textContent = est.baixoEstoque || 0;
  const margem = (est.valorCusto || 0) > 0 ? Math.round(((est.valorVenda - est.valorCusto) / est.valorCusto) * 100) : 0;
  document.getElementById('estMargem').textContent = margem + '%';

  // ── Mix Equipamentos ──
  renderMixEquipamentos(d.mixEquipamentos || []);

  // ── Top Clientes ──
  renderTopClientes(d.topClientes || []);

  // ── Performance Técnicos ──
  renderTecnicos(d.tecnicoPerformance || []);

  // ── Monthly table ──
  renderMonthlyTable(d.monthlyRevenue || []);

  // ── RMR table ──
  loadRmrTable();
}

function renderTopClientes(rows) {
  const tbody = document.getElementById('tblTopClientes');
  if (!rows.length) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-secondary);opacity:.6">Nenhum cliente com receita no período.</td></tr>'; return; }
  const maxReceita = Math.max(...rows.map(r => r.receita_paga || 0), 1);
  tbody.innerHTML = rows.map((r, i) => {
    const pct = Math.round(((r.receita_paga || 0) / maxReceita) * 100);
    const status = (r.valor_vencido || 0) > 0
      ? '<span class="badge bg-red">⚠ ' + r.valor_vencido.toLocaleString('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:0}) + '</span>'
      : '<span class="badge bg-green">Em dia</span>';
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '<span style="color:var(--text-muted)">' + (i+1) + '</span>';
    return `<tr>
      <td style="font-size:1.1rem;text-align:center">${medal}</td>
      <td><strong>${esc(r.nome || '—')}</strong></td>
      <td>${r.qtd_cobrancas || 0}</td>
      <td><strong style="color:var(--green)">${fmtCurrency(r.receita_paga || 0)}</strong></td>
      <td style="color:${(r.valor_vencido||0)>0?'var(--red)':'var(--text-muted)'}">${fmtCurrency(r.valor_vencido || 0)}</td>
      <td>${r.qtd_chamados || 0}</td>
      <td>${status}</td>
    </tr>`;
  }).join('');
}

function renderTecnicos(rows) {
  const tbody = document.getElementById('tblTecnicos');
  if (!rows.length) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-secondary);opacity:.6">Nenhum técnico ativo.</td></tr>'; return; }
  tbody.innerHTML = rows.map((r, i) => {
    const total = r.total_chamados || 0;
    const resolv = r.resolvidos || 0;
    const taxa = total > 0 ? Math.round((resolv / total) * 100) : 0;
    const corBarra = taxa >= 80 ? 'var(--green)' : taxa >= 50 ? 'var(--orange)' : 'var(--red)';
    return `<tr>
      <td style="text-align:center;color:var(--text-muted)">${i+1}</td>
      <td><strong>${esc(r.nome || '—')}</strong></td>
      <td><span class="badge bg-blue">${total}</span></td>
      <td><span class="badge bg-green">${resolv}</span></td>
      <td><span class="badge bg-orange">${r.em_aberto || 0}</span></td>
      <td><strong style="color:${corBarra}">${taxa}%</strong></td>
      <td><div style="display:flex;align-items:center;gap:6px"><div style="flex:1;height:5px;background:var(--bg-base);border-radius:3px;min-width:60px"><div style="height:100%;width:${taxa}%;background:${corBarra};border-radius:3px"></div></div></div></td>
    </tr>`;
  }).join('');
}

async function loadRmrTable() {
  try {
    const [porPlano, rmr] = await Promise.all([api('/contratos/rmr/por-plano'), api('/contratos/rmr')]);
    const rows = porPlano || [];
    const totalMrr = rmr?.mrr || 0;
    document.getElementById('tblRmrBody').innerHTML = rows.length ? rows.map(p => {
      const pct = totalMrr > 0 ? ((p.mrr / totalMrr) * 100).toFixed(1) : 0;
      const tipoLabel = { basico:'Básico', empresarial:'Empresarial', premium:'Premium', pmoc:'PMOC', emergencial:'Emergencial' }[p.tipo_contrato] || p.tipo_contrato;
      const color = { basico:'var(--text-secondary)', empresarial:'var(--blue)', premium:'var(--purple)', pmoc:'var(--green)', emergencial:'var(--orange)' }[p.tipo_contrato] || 'var(--text2)';
      return `<tr>
        <td><span class="badge" style="background:${color}22;color:${color}">${tipoLabel}</span></td>
        <td>${p.quantidade}</td>
        <td><strong style="color:var(--green)">${fmtCurrency(p.mrr)}</strong></td>
        <td>${fmtCurrency(p.ticket_medio)}</td>
        <td><div style="display:flex;align-items:center;gap:8px"><div style="flex:1;height:5px;background:var(--bg-base);border-radius:3px"><div style="height:100%;width:${pct}%;background:${color};border-radius:3px"></div></div><span style="font-size:.78rem;color:var(--text-muted)">${pct}%</span></div></td>
        <td><span class="badge bg-gray">${(p.mrr / (p.quantidade || 1)).toFixed(0)}x</span></td>
      </tr>`;
    }).join('') : '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-secondary)"><span style="opacity:.5">Nenhum contrato registrado.</span></td></tr>';
  } catch(e) {
    document.getElementById('tblRmrBody').innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--red)">Erro ao carregar RMR.</td></tr>';
  }
}

function renderReceitaChart(data) {
  const ctx = document.getElementById('chartReceita');
  if (chartReceita) chartReceita.destroy();
  chartReceita = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(d => d.mes),
      datasets: [
        { label: 'Receita Paga', data: data.map(d => d.receita), backgroundColor: '#22c55e', borderRadius: 4 },
        { label: 'Vencido', data: data.map(d => d.vencido), backgroundColor: '#ef4444', borderRadius: 4 }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: '#8B949E', font: { size: 12 } } },
        tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': R$ ' + (ctx.parsed.y || 0).toLocaleString('pt-BR') } }
      },
      scales: {
        x: { ticks: { color: '#8B949E', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: {
          ticks: { color: '#8B949E', font: { size: 11 }, callback: v => 'R$ ' + (v/1000).toFixed(0) + 'k' },
          grid: { color: 'rgba(255,255,255,0.04)' }
        }
      }
    }
  });
}

function renderTicketsChart(data) {
  const ctx = document.getElementById('chartTickets');
  if (chartTickets) chartTickets.destroy();
  chartTickets = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(d => d.mes),
      datasets: [
        { label: 'Criados', data: data.map(d => d.criados), borderColor: '#00AEEF', backgroundColor: 'rgba(0,174,239,.1)', fill: true, tension: .4 },
        { label: 'Resolvidos', data: data.map(d => d.resolvidos), borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,.1)', fill: true, tension: .4 }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: '#8B949E', font: { size: 12 } } } },
      scales: {
        x: { ticks: { color: '#8B949E', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { ticks: { color: '#8B949E', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } }
      }
    }
  });
}

function renderCobrancaDonut(c) {
  const ctx = document.getElementById('chartCobranca');
  if (chartCobranca) chartCobranca.destroy();
  chartCobranca = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Recebido', 'Vencido', 'Pendente'],
      datasets: [{
        data: [c.totalRecebido || 0, c.totalVencido || 0, c.totalPendente || 0],
        backgroundColor: ['#22c55e', '#ef4444', '#f59e0b'],
        borderWidth: 0,
      }]
    },
    options: {
      responsive: true,
      cutout: '65%',
      plugins: {
        legend: { position: 'bottom', labels: { color: '#8B949E', padding: 14, font: { size: 12 } } },
        tooltip: { callbacks: { label: ctx => ctx.label + ': R$ ' + (ctx.parsed || 0).toLocaleString('pt-BR') } }
      }
    }
  });
}

function renderTicketStatusDonut(t) {
  const ctx = document.getElementById('chartTicketStatus');
  if (chartTicketStatus) chartTicketStatus.destroy();
  chartTicketStatus = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Em Aberto', 'Fechados'],
      datasets: [{
        data: [t.emAberto || 0, t.fechados || 0],
        backgroundColor: ['#f59e0b', '#22c55e'],
        borderWidth: 0,
      }]
    },
    options: {
      responsive: true,
      cutout: '65%',
      plugins: {
        legend: { position: 'bottom', labels: { color: '#8B949E', padding: 14, font: { size: 12 } } }
      }
    }
  });
}

function renderMonthlyTable(data) {
  const tbody = document.getElementById('tblMonthly');
  tbody.innerHTML = data.length ? data.map(d => {
    const taxa = d.qtd > 0 ? Math.round((d.receita / (d.receita + d.vencido || 1)) * 100) : 0;
    const cor = taxa >= 80 ? 'var(--green)' : taxa >= 50 ? 'var(--orange)' : 'var(--red)';
    return `<tr>
      <td><strong>${d.mes}</strong></td>
      <td>${d.qtd}</td>
      <td><strong style="color:var(--green)">${fmtCurrency(d.receita)}</strong></td>
      <td><span style="color:${d.vencido > 0 ? 'var(--red)' : 'var(--text-muted)'}">${fmtCurrency(d.vencido)}</span></td>
      <td><div style="display:flex;align-items:center;gap:8px"><div style="flex:1;height:5px;background:var(--bg-base);border-radius:3px"><div style="height:100%;width:${taxa}%;background:${cor};border-radius:3px"></div></div><span style="font-size:.78rem;color:${cor}">${taxa}%</span></div></td>
    </tr>`;
  }).join('') : '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-secondary)"><span style="opacity:.5">Nenhum dado disponível.</span></td></tr>';
}

function fmtCurrency(v) { return 'R$ ' + (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function renderCotacoesChart(data) {
  const ctx = document.getElementById('chartCotacoes');
  if (!ctx) return;
  if (chartCotacoes) chartCotacoes.destroy();
  chartCotacoes = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(d => d.mes),
      datasets: [
        { label: 'Criadas', data: data.map(d => d.criadas), backgroundColor: '#00AEEF', borderRadius: 4 },
        { label: 'Convertidas', data: data.map(d => d.convertidas), backgroundColor: '#22c55e', borderRadius: 4 }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: '#8B949E', font: { size: 12 } } } },
      scales: {
        x: { ticks: { color: '#8B949E', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
        y: { ticks: { color: '#8B949E', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' }, beginAtZero: true }
      }
    }
  });
}

function renderLeadsOrigemChart(origens) {
  const ctx = document.getElementById('chartLeadsOrigem');
  if (!ctx) return;
  if (chartLeadsOrigem) chartLeadsOrigem.destroy();
  const colors = ['#00AEEF', '#22c55e', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#6b7280'];
  chartLeadsOrigem = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: origens.map(o => o.origem || 'outros'),
      datasets: [
        { label: 'Total', data: origens.map(o => o.total), backgroundColor: '#00AEEF', borderRadius: 4 },
        { label: 'Convertidos', data: origens.map(o => o.convertidos), backgroundColor: '#22c55e', borderRadius: 4 }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: { legend: { labels: { color: '#8B949E', font: { size: 12 } } } },
      scales: {
        x: { ticks: { color: '#8B949E', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' }, beginAtZero: true },
        y: { ticks: { color: '#8B949E', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } }
      }
    }
  });
}

function renderMixEquipamentos(items) {
  const tbody = document.getElementById('tblMixEquip');
  const valorTotal = items.reduce((s, i) => s + (i.valor_total || 0), 0);
  tbody.innerHTML = items.length ? items.map((i, idx) => {
    const pct = valorTotal > 0 ? ((i.valor_total / valorTotal) * 100).toFixed(1) : 0;
    const color = idx === 0 ? 'var(--green)' : idx < 3 ? 'var(--blue)' : 'var(--text-secondary)';
    return `<tr>
      <td><code style="background:var(--bg-surface);padding:2px 6px;border-radius:4px;font-size:.78rem">${esc(i.sku)}</code></td>
      <td>${esc(i.descricao)}</td>
      <td><strong>${i.vezes_cotado}x</strong></td>
      <td>${i.qtd_total || 0}</td>
      <td><strong style="color:var(--green)">${fmtCurrency(i.valor_total)}</strong></td>
      <td><div style="display:flex;align-items:center;gap:8px"><div style="flex:1;height:5px;background:var(--bg-base);border-radius:3px"><div style="height:100%;width:${pct}%;background:${color};border-radius:3px"></div></div><span style="font-size:.78rem;color:${color}">${pct}%</span></div></td>
    </tr>`;
  }).join('') : '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-secondary)"><span style="opacity:.5">Nenhuma cotação com equipamento registrada.</span></td></tr>';
}

function esc(s) { return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
