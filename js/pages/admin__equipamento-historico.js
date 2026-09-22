/* Extraido de admin/equipamento-historico.html por tools/csp-migrate.py (CSP sem unsafe-inline). */
const BASE = '/api';
const urlParams = new URLSearchParams(window.location.search);
const equipId = urlParams.get('id');

document.addEventListener('DOMContentLoaded', () => {
  initSidebar();
  if (!equipId) {
    document.getElementById('loadingState').innerHTML = '<div style="color:var(--red)">❌ ID do equipamento não informado. Use ?id=EQUIP_ID</div>';
    return;
  }
  loadHistorico();
});

function initSidebar() {
  const hamburger = document.getElementById('hamburger');
  const sidebar = document.getElementById('sidebar');
  hamburger?.addEventListener('click', () => sidebar?.classList.toggle('collapsed'));
}

async function loadHistorico() {
  try {
    const r = await fetch(`${BASE}/equipamentos/${equipId}/historico`);
    const j = await r.json();
    if (!j.success) throw new Error(j.error);

    const d = j.data;
    renderEquipamento(d.equipamento);
    renderStats(d.stats);
    renderTimeline(d.eventos);
    renderPecas(d.pecas_usadas, d.custo_pecas_total);
    renderGarantia(d.garantia);
    renderManutFuturas(d.manutencoes);

    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('content').style.display = 'block';
  } catch (e) {
    console.error('Erro:', e);
    document.getElementById('loadingState').innerHTML = `<div style="color:var(--red)">❌ ${e.message}</div>`;
  }
}

function renderEquipamento(eq) {
  const statusClass = (eq.status_equipamento || 'Operacional').toLowerCase()
    .replace('ç', 'c').replace('ã', 'a').replace('é', 'e').replace('ó', 'o');
  document.getElementById('eqTitle').innerHTML = `❄️ ${esc(eq.marca || '—')} ${esc(eq.modelo || '—')}`;

  const local = eq.local_instalacao ? `📍 ${eq.local_instalacao}` : '';
  const cliente = eq.cliente_fantasia || eq.cliente_nome || '—';
  document.getElementById('eqSubtitle').textContent = `Cliente: ${cliente} • ${local}`;

  const statusEl = document.getElementById('eqStatus');
  statusEl.className = `eq-status ${statusClass}`;
  statusEl.textContent = eq.status_equipamento || '—';

  const meta = [];
  if (eq.numero_serie) meta.push(`<span class="eq-meta-item">🔢 Série: <strong>${esc(eq.numero_serie)}</strong></span>`);
  if (eq.potencia_btu) meta.push(`<span class="eq-meta-item">⚡ <strong>${eq.potencia_btu.toLocaleString('pt-BR')} BTU</strong></span>`);
  if (eq.regime_servico) meta.push(`<span class="eq-meta-item">🔧 <strong>${esc(eq.regime_servico)}</strong></span>`);
  if (eq.data_instalacao) meta.push(`<span class="eq-meta-item">📅 Instalado: <strong>${formatDate(eq.data_instalacao)}</strong></span>`);
  document.getElementById('eqMeta').innerHTML = meta.join('');
}

function renderStats(s) {
  const cards = [
    { label: 'Manutenções', value: s.total_manutencoes, sub: `${s.manutencoes_concluidas} concluídas`, cls: 'blue', icon: '🔧' },
    { label: 'Pendentes', value: s.manutencoes_pendentes, sub: s.proxima_manutencao ? `próxima: ${formatDate(s.proxima_manutencao)}` : '—', cls: 'orange', icon: '⏳' },
    { label: 'Chamados/OS', value: s.total_chamados, sub: `${s.chamados_abertos} abertos`, cls: 'red', icon: '🎫' },
    { label: 'Custo Peças', value: fmtCurrency(s.custo_total_pecas), sub: 'total histórico', cls: 'green', icon: '💰' },
    { label: 'Idade', value: s.idade_anos != null ? `${s.idade_anos}a` : '—', sub: s.data_instalacao ? formatDate(s.data_instalacao) : 'sem data', cls: 'purple', icon: '📆' },
    { label: 'Intervalo Médio', value: s.intervalo_medio_dias != null ? `${s.intervalo_medio_dias}d` : '—', sub: 'entre manutenções', cls: 'blue', icon: '🔁' }
  ];
  document.getElementById('statsGrid').innerHTML = cards.map(c => `
    <div class="stat-card ${c.cls}">
      <div class="label">${c.icon} ${c.label}</div>
      <div class="value">${c.value}</div>
      <div class="sub">${c.sub}</div>
    </div>`).join('');
}

function renderTimeline(eventos) {
  if (!eventos.length) {
    document.getElementById('timeline').innerHTML = '<div class="empty-state" style="padding:30px 0">Nenhum evento registrado ainda</div>';
    return;
  }
  document.getElementById('timeline').innerHTML = eventos.map(e => {
    const tipoLabel = e.tipo === 'manutencao' ? 'Manutenção' : e.tipo === 'chamado' ? 'Chamado' : 'Garantia';
    return `
    <div class="tl-item ${e.tipo}">
      <div class="tl-item-header">
        <div>
          <span class="tl-tipo-badge ${e.tipo}">${tipoLabel}</span>
          <span class="tl-item-title" style="margin-left:8px">${esc(e.titulo)}</span>
        </div>
        <span class="tl-item-date">${formatDateTime(e.data)}</span>
      </div>
      <div class="tl-item-meta">
        ${e.status ? `<span class="badge ${getStatusClass(e.status)}">${esc(e.status)}</span>` : ''}
        ${e.tecnico ? `<span style="font-size:0.72rem;color:var(--text-muted)">👤 ${esc(e.tecnico)}</span>` : ''}
        ${e.meta?.num ? `<span style="font-size:0.72rem;color:var(--text-muted)">#${esc(e.meta.num)}</span>` : ''}
        ${e.meta?.total_checklist != null ? `<span style="font-size:0.72rem;color:var(--text-muted)">✓ ${e.meta.checklist_ok}/${e.meta.total_checklist} checklist</span>` : ''}
      </div>
      ${e.detalhe ? `<div class="tl-item-detail">${esc(e.detalhe)}</div>` : ''}
    </div>`;
  }).join('');
}

function renderPecas(pecas, total) {
  if (!pecas.length) {
    document.getElementById('pecasList').innerHTML = '<div class="empty-state" style="padding:20px 0">Nenhuma peça registrada</div>';
    return;
  }
  const html = pecas.map(p => `
    <div class="side-card-item">
      <div style="display:flex;justify-content:space-between;align-items:start;gap:8px">
        <div>
          <div style="font-weight:600">${esc(p.peca_nome || '—')}</div>
          <div class="meta">SKU: ${esc(p.peca_sku || '—')} • Qtd: ${p.qtd || 0}</div>
        </div>
        <div style="font-weight:700;color:var(--text-primary);font-size:0.85rem">${fmtCurrency(p.custo_total)}</div>
      </div>
    </div>
  `).join('');
  document.getElementById('pecasList').innerHTML = html +
    `<div class="side-card-item" style="background:var(--blue-dim);border-color:var(--blue)">
      <div style="display:flex;justify-content:space-between;font-weight:700">
        <span>Total investido</span>
        <span style="color:var(--blue)">${fmtCurrency(total)}</span>
      </div>
    </div>`;
}

function renderGarantia(garantia) {
  if (!garantia.length) {
    document.getElementById('garantiaList').innerHTML = '<div class="empty-state" style="padding:20px 0">Nenhuma garantia registrada</div>';
    return;
  }
  document.getElementById('garantiaList').innerHTML = garantia.map(g => `
    <div class="side-card-item">
      <div style="font-weight:600">${esc(g.evento || g.tipo_evento || 'Evento de garantia')}</div>
      <div class="meta">📅 ${formatDate(g.created_at)}${g.chamado_num ? ' • #' + esc(g.chamado_num) : ''}</div>
      ${g.observacoes ? `<div class="meta" style="margin-top:4px">${esc(g.observacoes)}</div>` : ''}
    </div>
  `).join('');
}

function renderManutFuturas(manuts) {
  const futuras = manuts.filter(m => m.status === 'Pendente').slice(0, 5);
  if (!futuras.length) {
    document.getElementById('manutList').innerHTML = '<div class="empty-state" style="padding:20px 0">Nenhuma manutenção pendente</div>';
    return;
  }
  document.getElementById('manutList').innerHTML = futuras.map(m => `
    <div class="side-card-item">
      <div style="display:flex;justify-content:space-between;align-items:start;gap:8px">
        <div>
          <div style="font-weight:600">${esc(m.tipo || 'Manutenção')}</div>
          <div class="meta">📅 ${formatDate(m.data_programada || m.proxima_data)}</div>
        </div>
        <span class="badge ${getStatusClass(m.status)}">${esc(m.status)}</span>
      </div>
    </div>
  `).join('');
}

function getStatusClass(s) {
  if (!s) return 'badge-gray';
  const l = s.toLowerCase();
  if (['concluida', 'concluido', 'concluída', 'resolvido', 'fechado', 'pago', 'ativo', 'operacional'].includes(l)) return 'badge-green';
  if (['pendente', 'aberto', 'aguardando', 'andamento'].includes(l)) return 'badge-orange';
  if (['cancelado', 'parado', 'vencido', 'inativo'].includes(l)) return 'badge-red';
  return 'badge-gray';
}

function formatDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('pt-BR'); } catch { return '—'; }
}
function formatDateTime(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); } catch { return '—'; }
}
function fmtCurrency(v) {
  return 'R$ ' + (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function esc(s) { return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') : ''; }
