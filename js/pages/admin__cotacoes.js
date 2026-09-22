/* Extraido de admin/cotacoes.html por tools/csp-migrate.py (CSP sem unsafe-inline). */
/* ── gerado por tools/csp-migrate.py: nomes liberados para os data-on-* desta pagina ── */
;(function () {
  var s = window.__cspScope || (window.__cspScope = {});
  function def(n, g, st) { Object.defineProperty(s, n, { configurable: true, enumerable: true, get: g, set: st }); }
  def('aprovarCotacao', function () { return typeof aprovarCotacao !== 'undefined' ? aprovarCotacao : undefined; }, function (v) { aprovarCotacao = v; });
  def('autoCalcular', function () { return typeof autoCalcular !== 'undefined' ? autoCalcular : undefined; }, function (v) { autoCalcular = v; });
  def('closeModal', function () { return typeof closeModal !== 'undefined' ? closeModal : undefined; }, function (v) { closeModal = v; });
  def('imprimirCotacao', function () { return typeof imprimirCotacao !== 'undefined' ? imprimirCotacao : undefined; }, function (v) { imprimirCotacao = v; });
  def('loadCotacoes', function () { return typeof loadCotacoes !== 'undefined' ? loadCotacoes : undefined; }, function (v) { loadCotacoes = v; });
  def('openNovaCotacao', function () { return typeof openNovaCotacao !== 'undefined' ? openNovaCotacao : undefined; }, function (v) { openNovaCotacao = v; });
  def('preencherContato', function () { return typeof preencherContato !== 'undefined' ? preencherContato : undefined; }, function (v) { preencherContato = v; });
  def('salvarCotacao', function () { return typeof salvarCotacao !== 'undefined' ? salvarCotacao : undefined; }, function (v) { salvarCotacao = v; });
  def('verCotacao', function () { return typeof verCotacao !== 'undefined' ? verCotacao : undefined; }, function (v) { verCotacao = v; });
  def('wizardProximo', function () { return typeof wizardProximo !== 'undefined' ? wizardProximo : undefined; }, function (v) { wizardProximo = v; });
  def('wizardVoltar', function () { return typeof wizardVoltar !== 'undefined' ? wizardVoltar : undefined; }, function (v) { wizardVoltar = v; });
})();
/* ── fim do bloco gerado ── */

const BASE = '/api';
let currentStep = 1;
let calcResult = null;
let allClientes = [];
let allLeads = [];
let editingId = null;

document.addEventListener('DOMContentLoaded', async () => {
  initSidebar();
  await Promise.all([loadClientes(), loadLeads()]);
  await Promise.all([loadCotacoes(), loadStats()]);
});

function initSidebar() {
  const hamburger = document.getElementById('hamburger');
  const sidebar = document.getElementById('sidebar');
  hamburger?.addEventListener('click', () => sidebar?.classList.toggle('collapsed'));
}

async function loadClientes() {
  try {
    const r = await fetch(BASE + '/clientes');
    const j = await r.json();
    if (j.success) {
      allClientes = j.data || [];
      const sel = document.getElementById('w_cliente');
      sel.innerHTML = '<option value="">— Nenhum —</option>' + allClientes.map(c => `<option value="${c.id}">${esc(c.fantasia || c.nome)}</option>`).join('');
    }
  } catch (e) { console.error('clientes:', e); }
}

async function loadLeads() {
  try {
    const r = await fetch(BASE + '/leads?limit=200');
    const j = await r.json();
    if (j.success) {
      allLeads = (j.data || []).filter(l => l.status === 'qualificado' || l.status === 'proposta' || l.status === 'negociacao');
      const sel = document.getElementById('w_lead');
      sel.innerHTML = '<option value="">— Nenhum —</option>' + allLeads.map(l => `<option value="${l.id}">${esc(l.nome)} (${l.pontuacao || 0}pts)</option>`).join('');
    }
  } catch (e) { console.error('leads:', e); }
}

function preencherContato(tipo) {
  if (tipo === 'cliente') {
    const id = document.getElementById('w_cliente').value;
    if (id) {
      const c = allClientes.find(x => x.id === id);
      if (c) {
        document.getElementById('w_contato_nome').value = c.contato || c.nome || '';
        document.getElementById('w_contato_email').value = c.email || '';
        document.getElementById('w_contato_telefone').value = c.celular || c.telefone || '';
        document.getElementById('w_endereco').value = [c.logradouro, c.numero, c.bairro, c.cidade].filter(Boolean).join(', ');
      }
    }
  } else if (tipo === 'lead') {
    const id = document.getElementById('w_lead').value;
    if (id) {
      const l = allLeads.find(x => x.id === id);
      if (l) {
        document.getElementById('w_contato_nome').value = l.nome || '';
        document.getElementById('w_contato_email').value = l.email || '';
        document.getElementById('w_contato_telefone').value = l.telefone || '';
      }
    }
  }
}

function openNovaCotacao() {
  editingId = null;
  document.getElementById('tab-list').style.display = 'none';
  document.getElementById('tab-wizard').style.display = 'block';
  currentStep = 1;
  updateWizardUI();
}

function cancelarWizard() {
  editingId = null;
  document.getElementById('tab-wizard').style.display = 'none';
  document.getElementById('tab-list').style.display = 'block';
}

function wizardProximo() {
  if (currentStep === 1) {
    const cliente = document.getElementById('w_cliente').value;
    const lead = document.getElementById('w_lead').value;
    if (!cliente && !lead) {
      alert('Selecione um cliente ou lead (ou preencha o contato manualmente)');
      return;
    }
  }
  if (currentStep === 2) {
    if (!document.getElementById('w_area_m2').value || parseFloat(document.getElementById('w_area_m2').value) <= 0) {
      alert('Informe a área do ambiente (m²)');
      return;
    }
    autoCalcular();
  }
  if (currentStep === 3) {
    autoCalcular();
    if (!calcResult) { alert('Calcule primeiro'); return; }
  }
  if (currentStep < 4) {
    currentStep++;
    updateWizardUI();
  }
}

function wizardVoltar() {
  if (currentStep > 1) {
    currentStep--;
    updateWizardUI();
  } else {
    cancelarWizard();
  }
}

function updateWizardUI() {
  document.querySelectorAll('.wizard-step').forEach(el => {
    const step = parseInt(el.dataset.step);
    el.classList.remove('active', 'done');
    if (step === currentStep) el.classList.add('active');
    else if (step < currentStep) el.classList.add('done');
  });
  document.querySelectorAll('.wizard-step-pane').forEach(el => {
    el.classList.toggle('active', parseInt(el.dataset.step) === currentStep);
  });
  document.getElementById('btnVoltar').style.display = currentStep === 1 ? 'inline-flex' : 'inline-flex';
  document.getElementById('btnProximo').style.display = currentStep === 4 ? 'none' : 'inline-flex';
  document.getElementById('btnSalvar').style.display = currentStep === 4 ? 'inline-flex' : 'none';

  if (currentStep === 4) renderResumo();
}

let calcDebounce = null;
function autoCalcular() {
  clearTimeout(calcDebounce);
  calcDebounce = setTimeout(executarCalculo, 300);
}

async function executarCalculo() {
  const payload = {
    ambiente_tipo: document.getElementById('w_ambiente_tipo').value,
    area_m2: parseFloat(document.getElementById('w_area_m2').value) || 0,
    pe_direito_m: parseFloat(document.getElementById('w_pe_direito').value) || 2.8,
    num_pessoas: parseInt(document.getElementById('w_num_pessoas').value) || 0,
    num_equipamentos_eletricos: parseInt(document.getElementById('w_num_equipamentos').value) || 0,
    num_janelas: parseInt(document.getElementById('w_num_janelas').value) || 0,
    orientacao_solar: document.getElementById('w_orientacao').value,
    insolacao: document.getElementById('w_insolacao').value,
    tipo_uso: document.getElementById('w_tipo_uso').value,
    refrigerante: document.getElementById('w_refrigerante').value,
    custo_instalacao: parseFloat(document.getElementById('w_custo_inst').value) || 0,
    custo_equipamento: parseFloat(document.getElementById('w_custo_equip').value) || 0,
    margem_lucro_percent: parseFloat(document.getElementById('w_margem').value) || 30
  };

  if (payload.area_m2 <= 0) return;

  try {
    const r = await fetch(BASE + '/cotacoes/calcular', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const j = await r.json();
    if (j.success) {
      calcResult = j.data;
      renderCalcResult(calcResult);
    } else {
      console.error('calc error:', j.error);
    }
  } catch (e) { console.error('calc fetch error:', e); }
}

function renderCalcResult(d) {
  const c = d.calculo;
  document.getElementById('r_btu_calc').textContent = c.btu_calculado.toLocaleString('pt-BR') + ' BTU';
  document.getElementById('r_btu_recom').textContent = c.btu_recomendado.toLocaleString('pt-BR') + ' BTU';
  document.getElementById('r_potencia').textContent = c.potencia_kw + ' kW';

  if (d.equipamento) {
    document.getElementById('r_equip').innerHTML = `${esc(d.equipamento.marca || '')}<br>${esc(d.equipamento.modelo || '')}`;
    document.getElementById('r_equip_sub').textContent = `R$ ${(d.equipamento.preco_venda || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    document.getElementById('w_custo_equip').value = d.equipamento.preco_venda || 0;
  } else {
    document.getElementById('r_equip').textContent = 'Nenhum compatível no estoque';
    document.getElementById('r_equip_sub').textContent = '—';
  }

  // Custos
  const ct = d.custos;
  document.getElementById('b_equip').textContent = fmtCurrency(ct.custo_equipamento);
  document.getElementById('b_inst').textContent = fmtCurrency(ct.custo_instalacao);
  document.getElementById('b_obra').textContent = fmtCurrency(ct.custo_mao_obra);
  document.getElementById('b_sub').textContent = fmtCurrency(ct.subtotal);
  document.getElementById('b_margem_pct').textContent = ct.margem_lucro_percent;
  document.getElementById('b_lucro').textContent = fmtCurrency(ct.lucro);
  document.getElementById('b_total').textContent = fmtCurrency(ct.custo_total);
}

function renderResumo() {
  if (!calcResult) return;
  const c = calcResult.calculo;
  const ct = calcResult.custos;
  const equip = calcResult.equipamento;
  const clienteNome = allClientes.find(x => x.id === document.getElementById('w_cliente').value)?.fantasia
    || allLeads.find(x => x.id === document.getElementById('w_lead').value)?.nome
    || document.getElementById('w_contato_nome').value || '—';
  document.getElementById('resumo').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;font-size:0.85rem">
      <div><strong style="color:var(--text-secondary);font-size:0.72rem;text-transform:uppercase">Cliente/Lead</strong><br>${esc(clienteNome)}</div>
      <div><strong style="color:var(--text-secondary);font-size:0.72rem;text-transform:uppercase">BTU Recomendado</strong><br><span style="color:var(--blue);font-weight:700">${c.btu_recomendado.toLocaleString('pt-BR')} BTU</span></div>
      <div><strong style="color:var(--text-secondary);font-size:0.72rem;text-transform:uppercase">Equipamento</strong><br>${equip ? esc(equip.marca + ' ' + equip.modelo) : '—'}</div>
      <div><strong style="color:var(--text-secondary);font-size:0.72rem;text-transform:uppercase">Validade</strong><br>${document.getElementById('w_validade').value} dias</div>
      <div style="grid-column:1/-1;padding-top:10px;border-top:1px solid var(--border)"><strong style="color:var(--text-secondary);font-size:0.72rem;text-transform:uppercase">Total</strong><br><span style="color:var(--blue);font-size:1.4rem;font-weight:800">${fmtCurrency(ct.custo_total)}</span></div>
    </div>
  `;
}

async function salvarCotacao() {
  if (!calcResult) { alert('Calcule primeiro'); return; }
  const payload = {
    cliente_id: document.getElementById('w_cliente').value || null,
    lead_id: document.getElementById('w_lead').value || null,
    titulo: document.getElementById('w_titulo').value || null,
    contato_nome: document.getElementById('w_contato_nome').value || null,
    contato_email: document.getElementById('w_contato_email').value || null,
    contato_telefone: document.getElementById('w_contato_telefone').value || null,
    endereco_obra: document.getElementById('w_endereco').value || null,
    ambiente_tipo: document.getElementById('w_ambiente_tipo').value,
    area_m2: parseFloat(document.getElementById('w_area_m2').value),
    pe_direito_m: parseFloat(document.getElementById('w_pe_direito').value) || 2.8,
    num_janelas: parseInt(document.getElementById('w_num_janelas').value) || 0,
    orientacao_solar: document.getElementById('w_orientacao').value,
    insolacao: document.getElementById('w_insolacao').value,
    num_pessoas: parseInt(document.getElementById('w_num_pessoas').value) || 0,
    num_equipamentos_eletricos: parseInt(document.getElementById('w_num_equipamentos').value) || 0,
    tipo_uso: document.getElementById('w_tipo_uso').value,
    refrigerante: document.getElementById('w_refrigerante').value,
    custo_instalacao: parseFloat(document.getElementById('w_custo_inst').value) || 0,
    custo_equipamento: parseFloat(document.getElementById('w_custo_equip').value) || 0,
    margem_lucro_percent: parseFloat(document.getElementById('w_margem').value) || 30,
    validade_dias: parseInt(document.getElementById('w_validade').value) || 15,
    observacoes: document.getElementById('w_obs').value || null,
    status: 'rascunho'
  };

  try {
    const r = await fetch(BASE + '/cotacoes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const j = await r.json();
    if (j.success) {
      alert('✓ Cotação criada com sucesso!');
      cancelarWizard();
      loadCotacoes();
      loadStats();
    } else {
      alert('Erro: ' + j.error);
    }
  } catch (e) { alert('Erro de rede: ' + e.message); }
}

async function loadCotacoes() {
  const search = document.getElementById('searchInput')?.value || '';
  const status = document.getElementById('filtroStatus')?.value || '';
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (status) params.set('status', status);
  params.set('limite', '100');

  try {
    const r = await fetch(BASE + '/cotacoes?' + params);
    const j = await r.json();
    if (j.success) renderCotacoes(j.data || []);
  } catch (e) { console.error('loadCotacoes:', e); }
}

function renderCotacoes(rows) {
  const tbody = document.getElementById('tblCotacoesBody');
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:40px"><div style="opacity:0.6">Nenhuma cotação encontrada</div></td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(c => {
    const statusCls = { rascunho: 'badge-gray', enviada: 'badge-blue', aprovada: 'badge-green', rejeitada: 'badge-red', convertida: 'badge-green', vencida: 'badge-orange' }[c.status] || 'badge-gray';
    const statusLabel = { rascunho: 'Rascunho', enviada: 'Enviada', aprovada: 'Aprovada', rejeitada: 'Rejeitada', convertida: 'Convertida', vencida: 'Vencida' }[c.status] || c.status;
    const destinatario = c.cliente_fantasia || c.cliente_nome || c.lead_nome || c.contato_nome || '—';
    const equip = c.equipamento_sugerido_nome || '—';
    return `
      <tr style="cursor:pointer" data-on-click="verCotacao('${c.id}')">
        <td><div style="font-weight:600;font-size:0.82rem">${esc(c.titulo || 'Cotação')}</div><div style="font-size:0.7rem;color:var(--text-muted)">${formatDate(c.created_at)}</div></td>
        <td>${esc(destinatario)}</td>
        <td><span style="font-weight:600;color:var(--blue)">${c.btu_calculado ? c.btu_calculado.toLocaleString('pt-BR') : '—'}</span></td>
        <td>${c.potencia_kw || '—'}</td>
        <td><span class="badge badge-gray">${esc(c.ambiente_tipo || '—')}</span></td>
        <td style="font-size:0.78rem">${esc(equip)}</td>
        <td style="font-weight:700">${fmtCurrency(c.custo_total)}</td>
        <td><span class="badge ${statusCls}">${statusLabel}</span></td>
        <td data-on-click="event.stopPropagation()">
          <button class="btn btn-ghost btn-sm" data-on-click="aprovarCotacao('${c.id}')" title="Aprovar">✓</button>
          <button class="btn btn-ghost btn-sm" data-on-click="verCotacao('${c.id}')" title="Ver detalhes">👁</button>
          <button class="btn btn-ghost btn-sm" data-on-click="imprimirCotacao('${c.id}')" title="Baixar PDF">📄</button>
        </td>
      </tr>`;
  }).join('');
}

async function aprovarCotacao(id) {
  if (!confirm('Aprovar esta cotação?')) return;
  const r = await fetch(`${BASE}/cotacoes/${id}/aprovar`, { method: 'POST' });
  const j = await r.json();
  if (j.success) { alert('✓ Aprovada'); loadCotacoes(); loadStats(); }
  else alert('Erro: ' + j.error);
}

async function verCotacao(id) {
  const r = await fetch(`${BASE}/cotacoes/${id}`);
  const j = await r.json();
  if (!j.success) { alert('Erro: ' + (j.error || 'desconhecido')); return; }
  const c = j.data;
  const itens = c.itens || [];
  const itensHtml = itens.length
    ? `<table class="data-table" style="width:100%;font-size:0.8rem;margin-top:8px">
        <thead><tr><th>Item</th><th>Tipo</th><th>Qtd</th><th>Unit.</th><th>Subtotal</th></tr></thead>
        <tbody>${itens.map(i => `<tr>
          <td>${esc(i.nome || i.descricao || '—')}</td>
          <td><span class="badge badge-gray">${esc(i.tipo || 'material')}</span></td>
          <td>${i.quantidade}</td>
          <td>${fmtCurrency(i.preco_unitario)}</td>
          <td style="font-weight:600">${fmtCurrency(i.subtotal)}</td>
        </tr>`).join('')}</tbody>
      </table>`
    : '<div style="opacity:0.6;padding:12px;text-align:center">Sem itens</div>';
  showModal({
    title: 'Cotação ' + (c.codigo || '#' + c.id),
    body: `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:0.85rem;margin-bottom:14px">
        <div><b>Cliente:</b><br>${esc(c.cliente_fantasia || c.cliente_nome || c.lead_nome || '—')}</div>
        <div><b>Status:</b><br><span class="badge badge-blue">${esc(c.status)}</span></div>
        <div><b>Ambiente:</b><br>${esc(c.ambiente_tipo || '—')} · ${c.area_m2 || '—'} m²</div>
        <div><b>Validade:</b><br>${formatDate(c.validade_em)}</div>
        <div><b>BTU calculado:</b><br>${c.btu_calculado ? c.btu_calculado.toLocaleString('pt-BR') : '—'}</div>
        <div><b>Equipamento:</b><br>${esc(c.equipamento_sugerido_nome || '—')}</div>
        <div style="grid-column:1/-1;padding:10px;background:var(--bg-hover);border-radius:6px;text-align:right">
          <span style="opacity:0.7">Total: </span>
          <span style="font-size:1.3rem;font-weight:700;color:var(--blue)">${fmtCurrency(c.custo_total)}</span>
        </div>
      </div>
      <h4 style="margin:8px 0 4px">BOM (Bill of Materials)</h4>
      ${itensHtml}`,
    actions: [
      { label: 'Fechar', class: 'btn-ghost', onclick: 'closeModal()' },
      { label: '📄 Baixar PDF', class: 'btn-primary', onclick: `imprimirCotacao('${c.id}'); closeModal();` }
    ]
  });
}

function imprimirCotacao(id) {
  // Abre a rota /api/cotacoes/:id/pdf?format=pdf em nova aba — o server devolve o PDF binário (Playwright/Chromium)
  window.open(`${BASE}/cotacoes/${id}/pdf?format=pdf`, '_blank');
}

async function loadStats() {
  try {
    const r = await fetch(BASE + '/cotacoes/stats?since=30');
    const j = await r.json();
    if (j.success) {
      const s = j.data;
      document.getElementById('kpiTotal').textContent = s.total;
      document.getElementById('kpiAprovadas').textContent = (s.por_status?.aprovada || 0) + (s.por_status?.convertida || 0);
      document.getElementById('kpiConversao').textContent = s.taxa_conversao + '%';
      document.getElementById('kpiTicket').textContent = fmtCurrency(s.ticket_medio_aprovado);
      document.getElementById('kpiVencidas').textContent = s.vencidas;
    }
  } catch (e) { console.error('stats:', e); }
}

function esc(s) { return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : ''; }
function formatDate(iso) { if (!iso) return '—'; try { return new Date(iso).toLocaleDateString('pt-BR'); } catch { return '—'; } }
function fmtCurrency(v) { return 'R$ ' + (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

// ===== Modal genérico =====
function showModal({ title = '', body = '', actions = [] }) {
  closeModal();
  const overlay = document.createElement('div');
  overlay.id = 'modalOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  const actionsHtml = actions.map((a, i) => `<button class="btn ${a.class || 'btn-ghost'}" data-idx="${i}">${a.label}</button>`).join('');
  overlay.innerHTML = `
    <div style="background:var(--bg-card);border-radius:10px;max-width:680px;width:100%;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.4)">
      <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
        <h3 style="margin:0;font-size:1.05rem">${esc(title)}</h3>
        <button data-on-click="closeModal()" style="background:none;border:none;color:var(--text-muted);font-size:1.4rem;cursor:pointer;padding:0 6px">&times;</button>
      </div>
      <div style="padding:20px;overflow-y:auto;flex:1">${body}</div>
      <div style="padding:12px 20px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end">${actionsHtml}</div>
    </div>`;
  document.body.appendChild(overlay);
  actions.forEach((a, i) => {
    overlay.querySelector(`[data-idx="${i}"]`).onclick = () => {
      try { (new Function('return (' + a.onclick + ')()'))(); } catch (e) { console.error('modal action:', e); }
    };
  });
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
}
function closeModal() {
  const m = document.getElementById('modalOverlay');
  if (m) m.remove();
}
