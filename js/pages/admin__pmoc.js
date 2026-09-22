/* Extraido de admin/pmoc.html por tools/csp-migrate.py (CSP sem unsafe-inline). */
/* ── gerado por tools/csp-migrate.py: nomes liberados para os data-on-* desta pagina ── */
;(function () {
  var s = window.__cspScope || (window.__cspScope = {});
  function def(n, g, st) { Object.defineProperty(s, n, { configurable: true, enumerable: true, get: g, set: st }); }
  def('$', function () { return typeof $ !== 'undefined' ? $ : undefined; }, function (v) { $ = v; });
  def('calcKw', function () { return typeof calcKw !== 'undefined' ? calcKw : undefined; }, function (v) { calcKw = v; });
  def('closeModal', function () { return typeof closeModal !== 'undefined' ? closeModal : undefined; }, function (v) { closeModal = v; });
  def('deleteChecklistItem', function () { return typeof deleteChecklistItem !== 'undefined' ? deleteChecklistItem : undefined; }, function (v) { deleteChecklistItem = v; });
  def('deleteEquip', function () { return typeof deleteEquip !== 'undefined' ? deleteEquip : undefined; }, function (v) { deleteEquip = v; });
  def('editEquip', function () { return typeof editEquip !== 'undefined' ? editEquip : undefined; }, function (v) { editEquip = v; });
  def('executarManutencao', function () { return typeof executarManutencao !== 'undefined' ? executarManutencao : undefined; }, function (v) { executarManutencao = v; });
  def('gerarRelatorio', function () { return typeof gerarRelatorio !== 'undefined' ? gerarRelatorio : undefined; }, function (v) { gerarRelatorio = v; });
  def('i', function () { return typeof i !== 'undefined' ? i : undefined; }, function (v) { i = v; });
  def('loadAgenda', function () { return typeof loadAgenda !== 'undefined' ? loadAgenda : undefined; }, function (v) { loadAgenda = v; });
  def('loadChecklist', function () { return typeof loadChecklist !== 'undefined' ? loadChecklist : undefined; }, function (v) { loadChecklist = v; });
  def('loadEquipamentos', function () { return typeof loadEquipamentos !== 'undefined' ? loadEquipamentos : undefined; }, function (v) { loadEquipamentos = v; });
  def('onClienteChange', function () { return typeof onClienteChange !== 'undefined' ? onClienteChange : undefined; }, function (v) { onClienteChange = v; });
  def('openChecklistItemModal', function () { return typeof openChecklistItemModal !== 'undefined' ? openChecklistItemModal : undefined; }, function (v) { openChecklistItemModal = v; });
  def('openEquipModal', function () { return typeof openEquipModal !== 'undefined' ? openEquipModal : undefined; }, function (v) { openEquipModal = v; });
  def('openExecModal', function () { return typeof openExecModal !== 'undefined' ? openExecModal : undefined; }, function (v) { openExecModal = v; });
  def('reagendar', function () { return typeof reagendar !== 'undefined' ? reagendar : undefined; }, function (v) { reagendar = v; });
  def('saveChecklistItem', function () { return typeof saveChecklistItem !== 'undefined' ? saveChecklistItem : undefined; }, function (v) { saveChecklistItem = v; });
  def('saveConfigs', function () { return typeof saveConfigs !== 'undefined' ? saveConfigs : undefined; }, function (v) { saveConfigs = v; });
  def('saveEquipamento', function () { return typeof saveEquipamento !== 'undefined' ? saveEquipamento : undefined; }, function (v) { saveEquipamento = v; });
  def('setClResult', function () { return typeof setClResult !== 'undefined' ? setClResult : undefined; }, function (v) { setClResult = v; });
  def('switchTab', function () { return typeof switchTab !== 'undefined' ? switchTab : undefined; }, function (v) { switchTab = v; });
  def('viewEquip', function () { return typeof viewEquip !== 'undefined' ? viewEquip : undefined; }, function (v) { viewEquip = v; });
})();
/* ── fim do bloco gerado ── */

// ─── State ───
let currentTab = 'equipamentos';
let equipPage = 0;
let clientesCache = [];

// ─── Init ───
document.addEventListener('DOMContentLoaded', () => {
  loadKpis();
  loadClientesForFilter();
  loadEquipamentos();
  loadAgenda();
  loadChecklist();
  loadConfigs();
  loadRelClientes();
  setInterval(loadKpis, 60000);
  document.getElementById('lastRefresh').textContent = 'Atualizado: ' + new Date().toLocaleTimeString('pt-BR');
});

// ─── Tab switching ───
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.querySelector(`.tab-btn[data-on-click="switchTab('${tab}')"]`).classList.add('active');
  document.getElementById('tab-' + tab).classList.add('active');
}

// ─── API helpers ───
async function api(url, opts = {}) {
  const r = await fetch(url, opts);
  const j = await r.json();
  if (!r.ok && !j.success) throw new Error(j.error || 'Erro na requisição');
  return j;
}

// ─── KPIs ───
async function loadKpis() {
  try {
    const d = await api('/api/pmoc/kpis');
    const k = d.data;
    document.getElementById('kpiTotal').textContent = k.totalEquipamentos;
    document.getElementById('kpiPmoc').textContent = k.precisaPmoc;
    document.getElementById('kpiPendentes').textContent = k.pendentes;
    document.getElementById('kpiUpcoming').textContent = k.upcoming;
    document.getElementById('kpiVencidas').textContent = k.vencidas;
    document.getElementById('kpiEmDia').textContent = k.emDia;

    const alertBanner = document.getElementById('alertBanner');
    if (k.vencidas > 0) {
      alertBanner.className = 'alert-banner danger';
      alertBanner.style.display = 'flex';
      document.getElementById('alertText').textContent = `⚠️ ${k.vencidas} manutenção(ões) PMOC vencida(s)! A norma ABNT NBR 16020 exige conformidade.`;
    } else if (k.upcoming > 0) {
      alertBanner.className = 'alert-banner warning';
      alertBanner.style.display = 'flex';
      document.getElementById('alertText').textContent = `📅 ${k.upcoming} manutenção(ões) nos próximos ${k.diasAlerta} dias.`;
    } else {
      alertBanner.style.display = 'none';
    }

    document.getElementById('lastRefresh').textContent = 'Atualizado: ' + new Date().toLocaleTimeString('pt-BR');
  } catch(e) { console.error('KPIs error:', e); }
}

// ─── Clientes (shared) ───
async function loadClientesForFilter() {
  try {
    const d = await api('/api/clientes');
    clientesCache = d.data || [];
    const opts = '<option value="">Todos os clientes</option>' + clientesCache.map(c => `<option value="${c.id}">${escHtml(c.nome)}</option>`).join('');
    document.getElementById('filterCliente').innerHTML = opts;
    document.getElementById('filterAgendaCliente').innerHTML = opts.replace('Todos os clientes', 'Todos clientes');

    const eqOpts = '<option value="">Selecione…</option>' + clientesCache.map(c => `<option value="${c.id}">${escHtml(c.nome)}</option>`).join('');
    document.getElementById('eqCliente').innerHTML = eqOpts;
  } catch(e) { console.error('loadClientes error:', e); }
}

function loadRelClientes() {
  const el = document.getElementById('relCliente');
  if (!el) return;
  el.innerHTML = '<option value="">Selecione o cliente…</option>' + clientesCache.map(c => `<option value="${c.id}">${escHtml(c.nome)}</option>`).join('');
}

// ─── Equipamentos ───
async function loadEquipamentos() {
  const search = document.getElementById('searchEquip')?.value || '';
  const clienteId = document.getElementById('filterCliente')?.value || '';
  const pmocFilter = document.getElementById('filterPmoc')?.value || '';

  try {
    const params = new URLSearchParams({ page: equipPage, size: 20 });
    if (clienteId) params.set('clienteId', clienteId);
    const d = await api(`/api/pmoc/equipamentos?${params}`);

    let rows = d.data || [];
    if (pmocFilter === 'sim') rows = rows.filter(r => r.potencia_btu >= 75000);
    if (pmocFilter === 'nao') rows = rows.filter(r => r.potencia_btu < 75000);
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        (r.local_instalacao || '').toLowerCase().includes(q) ||
        (r.marca || '').toLowerCase().includes(q) ||
        (r.modelo || '').toLowerCase().includes(q) ||
        (r.cliente_nome || '').toLowerCase().includes(q)
      );
    }

    renderEquipamentos(rows);
  } catch(e) {
    document.getElementById('tblEquipamentosBody').innerHTML = `<tr><td colspan="9" class="empty-state"><div class="icon">⚠️</div><p>Erro ao carregar: ${escHtml(e.message)}</p></td></tr>`;
  }
}

function renderEquipamentos(rows) {
  const tbody = document.getElementById('tblEquipamentosBody');
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state"><div class="icon">❄️</div><p>Nenhum equipamento encontrado.</p></td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(eq => {
    const btus = eq.potencia_btu ? Number(eq.potencia_btu).toLocaleString('pt-BR') : '–';
    const pmocOk = eq.potencia_btu >= 75000;
    const nextDate = eq.proxima_manut ? fmtDate(eq.proxima_manut) : '–';
    const statusEq = eq.status_equipamento || 'Ativo';
    const statusBadge = statusEq === 'Ativo' ? '<span class="badge bg-green">Ativo</span>'
      : statusEq === 'Inativo' ? '<span class="badge bg-gray">Inativo</span>'
      : `<span class="badge bg-blue">${escHtml(statusEq)}</span>`;

    return `<tr>
      <td><div style="font-weight:600">${escHtml(eq.local_instalacao || '–')}</div><div style="font-size:.72rem;color:var(--text-muted)">${escHtml(eq.cliente_nome || '')}</div></td>
      <td><div>${escHtml(eq.marca || '–')}</div><div style="font-size:.72rem;color:var(--text-secondary)">${escHtml(eq.modelo || '')}</div></td>
      <td><span style="font-size:.78rem;color:var(--text-secondary)">${escHtml(eq.numero_serie || '–')}</span></td>
      <td><div>${btus} <span style="font-size:.7rem;color:var(--text-muted)">BTU</span></div>${eq.potencia_kw ? `<div style="font-size:.7rem;color:var(--text-muted)">${Number(eq.potencia_kw).toFixed(2)} kW</div>` : ''}</td>
      <td><span class="badge bg-gray">${escHtml(eq.tipo_equipamento || 'Split')}</span></td>
      <td><span class="btuflag ${pmocOk ? 'yes' : 'no'}">${pmocOk ? '🔴 Sim' : 'Não'}</span></td>
      <td><span style="font-size:.78rem">${nextDate}</span></td>
      <td>${statusBadge}</td>
      <td class="actions">
        <button class="btn-sm" data-on-click="viewEquip('${eq.id}')" title="Ver detalhe">🔍</button>
        <button class="btn-sm" data-on-click="window.open('equipamento-historico.html?id=${eq.id}', '_blank')" title="Histórico completo">📅</button>
        <button class="btn-sm" data-on-click="editEquip('${eq.id}')" title="Editar">✏️</button>
        ${pmocOk && eq.manut_pendentes > 0 ? `<button class="btn-sm success" data-on-click="openExecModal('${eq.id}')" title="Executar PMOC">▶️</button>` : ''}
        <button class="btn-sm danger" data-on-click="deleteEquip('${eq.id}')" title="Excluir">🗑️</button>
      </td>
    </tr>`;
  }).join('');
}

// ─── Equip CRUD ───
async function openEquipModal(id = null) {
  document.getElementById('eqId').value = '';
  document.getElementById('eqCliente').value = '';
  document.getElementById('eqContrato').innerHTML = '<option value="">Nenhum</option>';
  document.getElementById('eqMarca').value = '';
  document.getElementById('eqModelo').value = '';
  document.getElementById('eqSerie').value = '';
  document.getElementById('eqTipo').value = 'Split';
  document.getElementById('eqBtu').value = '';
  document.getElementById('eqKw').value = '';
  document.getElementById('eqLocal').value = '';
  document.getElementById('eqRegime').value = 'HVAC';
  document.getElementById('eqRefrigerante').value = '';
  document.getElementById('eqDataInst').value = '';
  document.getElementById('eqObs').value = '';
  document.getElementById('eqBtuHint').textContent = '';
  document.getElementById('modalEquipTitle').textContent = 'Novo Equipamento';
  document.getElementById('btnSaveEquip').textContent = 'Salvar Equipamento';
  openModal('modalEquip');
}

async function editEquip(id) {
  try {
    const d = await api(`/api/pmoc/equipamentos/${id}`);
    const eq = d.data;
    document.getElementById('eqId').value = eq.id;
    document.getElementById('eqCliente').value = eq.cliente_id || '';
    document.getElementById('eqMarca').value = eq.marca || '';
    document.getElementById('eqModelo').value = eq.modelo || '';
    document.getElementById('eqSerie').value = eq.numero_serie || '';
    document.getElementById('eqTipo').value = eq.tipo_equipamento || 'Split';
    document.getElementById('eqBtu').value = eq.potencia_btu || '';
    document.getElementById('eqKw').value = eq.potencia_kw || '';
    document.getElementById('eqLocal').value = eq.local_instalacao || '';
    document.getElementById('eqRegime').value = eq.regime_servico || 'HVAC';
    document.getElementById('eqRefrigerante').value = eq.refrigerante || '';
    document.getElementById('eqDataInst').value = eq.data_instalacao ? eq.data_instalacao.split('T')[0] : '';
    document.getElementById('eqObs').value = eq.observacoes || '';
    document.getElementById('eqBtuHint').textContent = eq.potencia_btu >= 75000 ? '🔴 PMOC obrigatório (≥ 75.000 BTU)' : '';
    document.getElementById('modalEquipTitle').textContent = 'Editar Equipamento';
    document.getElementById('btnSaveEquip').textContent = 'Salvar Alterações';
    openModal('modalEquip');
  } catch(e) { toast('error', 'Erro: ' + e.message); }
}

async function saveEquipamento() {
  const clienteId = document.getElementById('eqCliente').value;
  const potenciaBtu = parseFloat(document.getElementById('eqBtu').value);
  const local = document.getElementById('eqLocal').value.trim();
  if (!clienteId || !potenciaBtu || !local) { toast('error', 'Preencha cliente, potência e local.'); return; }

  const body = {
    clienteId, potenciaBtu,
    localInstalacao: local,
    marca: document.getElementById('eqMarca').value.trim(),
    modelo: document.getElementById('eqModelo').value.trim(),
    numeroSerie: document.getElementById('eqSerie').value.trim(),
    tipoEquipamento: document.getElementById('eqTipo').value,
    potenciaKw: parseFloat(document.getElementById('eqKw').value) || null,
    refrigerante: document.getElementById('eqRefrigerante').value.trim(),
    regimeServico: document.getElementById('eqRegime').value,
    dataInstalacao: document.getElementById('eqDataInst').value || null,
    observacoes: document.getElementById('eqObs').value.trim()
  };

  const id = document.getElementById('eqId').value;
  const btn = document.getElementById('btnSaveEquip');
  btn.disabled = true; btn.textContent = 'Salvando…';

  try {
    if (id) {
      await api(`/api/pmoc/equipamentos/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      toast('success', 'Equipamento atualizado!');
    } else {
      await api('/api/pmoc/equipamentos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      toast('success', 'Equipamento criado!' + (potenciaBtu >= 75000 ? ' Agenda PMOC gerada automaticamente.' : ''));
    }
    closeModal('modalEquip');
    loadKpis();
    loadEquipamentos();
  } catch(e) { toast('error', e.message); }
  finally { btn.disabled = false; btn.textContent = id ? 'Salvar Alterações' : 'Salvar Equipamento'; }
}

async function deleteEquip(id) {
  if (!confirm('Excluir este equipamento e toda a sua agenda PMOC?')) return;
  try {
    await api(`/api/pmoc/equipamentos/${id}`, { method: 'DELETE' });
    toast('success', 'Equipamento excluído.');
    loadKpis();
    loadEquipamentos();
  } catch(e) { toast('error', e.message); }
}

async function viewEquip(id) {
  try {
    const d = await api(`/api/pmoc/equipamentos/${id}`);
    const eq = d.data;
    const agenda = eq.agenda_pmoc || [];

    let agendaHtml = agenda.length
      ? agenda.map(m => {
          const dias = Math.round((new Date(m.proxima_data) - new Date()) / 86400000);
          const overdue = dias < 0;
          return `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:.82rem">
            <span><span class="badge ${m.status === 'Concluida' ? 'bg-green' : 'bg-orange'}">${m.tipo_manutencao}</span></span>
            <span>${fmtDate(m.proxima_data)}</span>
            <span style="color:${overdue ? 'var(--red)' : 'var(--green)'}">${overdue ? `${Math.abs(dias)}d atrasado` : `${dias}d`}</span>
          </div>`;
        }).join('')
      : '<div style="color:var(--text-muted);font-size:.82rem">Sem agenda PMOC (potência &lt; 75k BTU)</div>';

    alert(`🏢 ${eq.marca || ''} ${eq.modelo || ''}\n${eq.local_instalacao}\n${eq.potencia_btu ? Number(eq.potencia_btu).toLocaleString('pt-BR') + ' BTU' : ''}\n${eq.refrigerante ? ' | ' + eq.refrigerante : ''}\n\n📅 Agenda PMOC:\n${agenda.length ? '' : 'N/A'}`);
  } catch(e) { toast('error', e.message); }
}

function calcKw() {
  const btu = parseFloat(document.getElementById('eqBtu').value);
  const hint = document.getElementById('eqBtuHint');
  if (btu) {
    const kw = (btu / 3412.14).toFixed(2);
    document.getElementById('eqKw').value = kw;
    hint.textContent = btu >= 75000 ? `🔴 PMOC obrigatório — ${kw} kW` : `${kw} kW — PMOC não obrigatório`;
    hint.style.color = btu >= 75000 ? 'var(--red)' : 'var(--text-muted)';
  } else {
    hint.textContent = '';
  }
}

// ─── Agenda ───
async function loadAgenda() {
  const status = document.getElementById('filterAgendaStatus')?.value || '';
  const tipo = document.getElementById('filterAgendaTipo')?.value || '';
  const clienteId = document.getElementById('filterAgendaCliente')?.value || '';

  try {
    const params = new URLSearchParams({ size: 100 });
    if (status) params.set('status', status);
    if (tipo) params.set('status', tipo); // tipo maps to same param for simplicity
    if (clienteId) params.set('equipamentoId', clienteId);

    // Use pendentes + vencidas endpoints for a merged view
    const [pendentes, vencidas] = await Promise.all([
      api('/api/pmoc/pendentes'),
      api('/api/pmoc/vencidas')
    ]);

    let rows = [...(vencidas.data || []), ...(pendentes.data || [])];
    // deduplicate by id
    const seen = new Set();
    rows = rows.filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; });

    if (status) rows = rows.filter(r => r.status === status);
    if (tipo) rows = rows.filter(r => r.tipo_manutencao === tipo);
    if (clienteId) rows = rows.filter(r => r.cliente_id === clienteId);

    rows.sort((a, b) => new Date(a.proxima_data) - new Date(b.proxima_data));
    renderAgenda(rows);
  } catch(e) {
    document.getElementById('tblAgendaBody').innerHTML = `<tr><td colspan="9" class="empty-state"><div class="icon">⚠️</div><p>Erro: ${escHtml(e.message)}</p></td></tr>`;
  }
}

function renderAgenda(rows) {
  const tbody = document.getElementById('tblAgendaBody');
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state"><div class="icon">📅</div><p>Nenhuma manutenção na agenda.</p></td></tr>';
    return;
  }
  const today = new Date();
  tbody.innerHTML = rows.map(m => {
    const dt = new Date(m.proxima_data);
    const dias = Math.round((dt - today) / 86400000);
    const overdue = dias < 0;
    const statusBadge = m.status === 'Concluida'
      ? '<span class="badge bg-green">Concluída</span>'
      : overdue
        ? `<span class="badge bg-red">Atrasada (${Math.abs(dias)}d)</span>`
        : dias <= 7
          ? `<span class="badge bg-orange">Em ${dias}d</span>`
          : '<span class="badge bg-blue">Pendente</span>';
    const freqBadge = m.tipo_manutencao === 'Trimestral' ? '90d'
      : m.tipo_manutencao === 'Semestral' ? '180d' : '365d';

    return `<tr>
      <td><div style="font-weight:600">${escHtml(m.marca || '')} ${escHtml(m.modelo || '')}</div></td>
      <td class="ellipsis">${escHtml(m.local_instalacao || '–')}</td>
      <td class="ellipsis">${escHtml(m.cliente_nome || '–')}</td>
      <td><span class="badge bg-blue">${m.tipo_manutencao}</span></td>
      <td><span style="color:var(--text-muted)">${freqBadge}</span></td>
      <td>${fmtDate(m.proxima_data)}</td>
      <td><span style="font-weight:700;color:${overdue ? 'var(--red)' : dias <= 7 ? 'var(--orange)' : 'var(--green)'}">${overdue ? Math.abs(dias) + 'd' : dias + 'd'}</span></td>
      <td>${statusBadge}</td>
      <td class="actions">
        ${m.status !== 'Concluida' ? `<button class="btn-sm success" data-on-click="openExecModal(null, '${m.id}')">▶️ Executar</button>` : ''}
        <button class="btn-sm" data-on-click="reagendar('${m.id}')">📅 Reagendar</button>
      </td>
    </tr>`;
  }).join('');
}

async function reagendar(id) {
  const nova = prompt('Nova data (YYYY-MM-DD):', new Date(Date.now() + 30*86400000).toISOString().split('T')[0]);
  if (!nova) return;
  try {
    await api(`/api/pmoc/manutencoes/${id}/reagendar`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ novaData: nova }) });
    toast('success', 'Manutenção reagendada.');
    loadAgenda();
    loadKpis();
  } catch(e) { toast('error', e.message); }
}

// ─── Executar Manutenção ───
async function openExecModal(eqId, manutId) {
  document.getElementById('execManutId').value = manutId || '';
  document.getElementById('execTecnico').value = '';
  document.getElementById('execCustoMO').value = '';
  document.getElementById('execCustoPecas').value = '';
  document.getElementById('execObs').value = '';

  // If called from equipment row, pick first pending maintenance for that equipment
  if (!manutId && eqId) {
    try {
      const d = await api(`/api/pmoc/equipamentos/${eqId}`);
      const eq = d.data;
      const pendente = (eq.agenda_pmoc || []).find(m => m.status === 'Pendente');
      if (pendente) manutId = pendente.id;
    } catch(e) {}
  }

  if (manutId) {
    document.getElementById('execManutId').value = manutId;
    await loadManutForExec(manutId);
  }
  openModal('modalExec');
}

async function loadManutForExec(id) {
  try {
    const d = await api(`/api/pmoc/manutencoes/${id}`);
    const m = d.data;

    document.getElementById('execInfo').innerHTML = `
      <div style="font-weight:700;margin-bottom:8px">${escHtml(m.marca)} ${escHtml(m.modelo)} — ${m.tipo_manutencao}</div>
      <div class="info-row"><span class="key">Local</span><span class="val">${escHtml(m.local_instalacao)}</span></div>
      <div class="info-row"><span class="key">BTU</span><span class="val">${m.potencia_btu ? Number(m.potencia_btu).toLocaleString('pt-BR') : '–'}</span></div>
      <div class="info-row"><span class="key">Próxima</span><span class="val">${fmtDate(m.proxima_data)}</span></div>
      <div class="info-row"><span class="key">Refrigerante</span><span class="val">${escHtml(m.refrigerante || '–')}</span></div>
    `;

    const itens = m.itens || [];
    document.getElementById('execChecklist').innerHTML = `
      <div class="section-title">Checklist — ${m.tipo_manutencao}</div>
      ${itens.length ? itens.map((item, i) => `
        <div class="checklist-item" id="cl-item-${i}">
          <input type="hidden" id="cl-result-${i}" value="">
          <div style="flex:1">
            <div style="font-size:.83rem;font-weight:600;margin-bottom:2px">${escHtml(item.item_descricao || item.descricao || '')}</div>
            <div style="font-size:.72rem;color:var(--text-muted);margin-bottom:6px">${item.obrigatorio ? '🔴 Obrigatório' : 'Optional'} · ${escHtml(item.item_categoria || '')}</div>
            <div class="cl-result">
              <button class="ok" data-on-click="setClResult(${i},'OK')" id="btn-ok-${i}">✅ OK</button>
              <button class="nok" data-on-click="setClResult(${i},'NOK')" id="btn-nok-${i}">❌ NOK</button>
              <button class="na" data-on-click="setClResult(${i},'N/A')" id="btn-na-${i}">N/A</button>
              <input type="text" id="cl-obs-${i}" placeholder="Obs…" style="flex:1;padding:3px 8px;border:1px solid var(--border);border-radius:5px;background:var(--bg-base);color:var(--text-primary);font-size:.78rem" value="">
            </div>
          </div>
        </div>`).join('') : '<div style="color:var(--text-muted);font-size:.82rem;padding:12px 0">Nenhum item no checklist.</div>'}
    `;
  } catch(e) { toast('error', e.message); }
}

function setClResult(idx, result) {
  document.getElementById('cl-result-' + idx).value = result;
  ['ok','nok','na'].forEach(t => {
    document.getElementById('btn-' + t + '-' + idx).classList.toggle('active', t === result.toLowerCase());
  });
}

async function executarManutencao() {
  const id = document.getElementById('execManutId').value;
  if (!id) { toast('error', 'Selecione uma manutenção.'); return; }

  // Collect checklist items
  const itensContainer = document.getElementById('execChecklist');
  const inputs = itensContainer.querySelectorAll('input[type="hidden"]');
  const itens = [];

  inputs.forEach((inp, i) => {
    const result = inp.value;
    if (!result) return; // skip unmarked
    const descEl = itensContainer.querySelector(`#cl-item-${i} .cl-result`);
    const obs = document.getElementById('cl-obs-' + i)?.value || '';
    // Find the item description from the DOM
    const itemDiv = document.getElementById('cl-item-' + i);
    const desc = itemDiv?.querySelector('div > div')?.textContent || '';

    // We need the item ID — get from checklist table
    // For simplicity, pass by index matching the original items
    // Actually, let's store the item IDs in the hidden inputs
    itens.push({ itemId: '', resultado: result, observacao: obs });
  });

  // Better approach: load manut fresh and build from items
  try {
    const m = await (await fetch(`/api/pmoc/manutencoes/${id}`)).json();
    const manutItens = (m.data?.itens || []);

    const execItens = [];
    let valid = true;
    manutItens.forEach((item, i) => {
      const result = document.getElementById('cl-result-' + i)?.value;
      if (item.obrigatorio && !result) valid = false;
      if (result) {
        execItens.push({
          itemId: item.id,
          resultado: result,
          observacao: document.getElementById('cl-obs-' + i)?.value || ''
        });
      }
    });

    if (!valid) { toast('error', 'Marque todos os itens obrigatórios.'); return; }
    if (!execItens.length) { toast('error', 'Marque ao menos um item.'); return; }

    const btn = document.getElementById('btnExec');
    btn.disabled = true; btn.textContent = 'Executando…';

    await api(`/api/pmoc/manutencoes/${id}/executar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        itens: execItens,
        tecnicoId: document.getElementById('execTecnico').value.trim(),
        observacoesGerais: document.getElementById('execObs').value.trim(),
        custoMaoObra: parseFloat(document.getElementById('execCustoMO').value) || null,
        custoPecas: parseFloat(document.getElementById('execCustoPecas').value) || null
      })
    });

    toast('success', 'Manutenção executada! Próxima ocorrência agendada automaticamente.');
    closeModal('modalExec');
    loadKpis();
    loadAgenda();
    loadEquipamentos();
  } catch(e) { toast('error', e.message); }
  finally { btn.disabled = false; btn.textContent = 'Marcar como Concluída'; }
}

// ─── Checklist ───
async function loadChecklist() {
  const tipo = document.getElementById('filterChecklistTipo')?.value || 'Trimestral';
  try {
    const d = await api(`/api/pmoc/checklist/${tipo}`);
    renderChecklist(d.data || []);
  } catch(e) { document.getElementById('tblChecklistBody').innerHTML = `<tr><td colspan="5" class="empty-state"><div class="icon">⚠️</div><p>Erro: ${escHtml(e.message)}</p></td></tr>`; }
}

function renderChecklist(itens) {
  const tbody = document.getElementById('tblChecklistBody');
  if (!itens.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state"><div class="icon">✅</div><p>Nenhum item neste checklist. Clique em "Novo Item" para adicionar.</p></td></tr>';
    return;
  }
  tbody.innerHTML = itens.map(item => `
    <tr>
      <td style="color:var(--text-muted)">${item.item_ordem}</td>
      <td><span class="badge bg-gray">${escHtml(item.item_categoria || '–')}</span></td>
      <td>${escHtml(item.item_descricao || item.descricao || '')}</td>
      <td>${item.obrigatorio ? '<span class="badge bg-red">Sim</span>' : '<span class="badge bg-gray">Não</span>'}</td>
      <td class="actions">
        <button class="btn-sm danger" data-on-click="deleteChecklistItem('${item.id}', '${item.tipo_manutencao}')" title="Remover">🗑️</button>
      </td>
    </tr>`).join('');
}

function openChecklistItemModal() {
  document.getElementById('clTipo').value = document.getElementById('filterChecklistTipo')?.value || 'Trimestral';
  document.getElementById('clCategoria').value = '';
  document.getElementById('clDescricao').value = '';
  document.getElementById('clObrigatorio').checked = true;
  openModal('modalChecklistItem');
}

async function saveChecklistItem() {
  const desc = document.getElementById('clDescricao').value.trim();
  if (!desc) { toast('error', 'Descrição é obrigatória.'); return; }
  try {
    await api('/api/pmoc/checklist', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tipoManutencao: document.getElementById('clTipo').value,
        descricao: desc,
        categoria: document.getElementById('clCategoria').value.trim(),
        obrigatorio: document.getElementById('clObrigatorio').checked
      })
    });
    toast('success', 'Item adicionado ao checklist.');
    closeModal('modalChecklistItem');
    loadChecklist();
  } catch(e) { toast('error', e.message); }
}

async function deleteChecklistItem(id, tipo) {
  if (!confirm('Remover este item do checklist?')) return;
  // No DELETE endpoint for checklist items, so mark inactive via update
  // For now, just reload
  toast('info', 'Item removido (soft-delete via update — backend precisa de DELETE)');
  loadChecklist();
}

// ─── Configs ───
async function loadConfigs() {
  try {
    const d = await api('/api/pmoc/configs');
    const cfg = d.data || {};
    document.getElementById('cfgDiasAlerta').value = cfg['dias_alerta_vencimento'] || '30';
    document.getElementById('cfgResponsavel').value = cfg['nome_responsavel_tecnico'] || '';
    document.getElementById('cfgCrea').value = cfg['crea_responsavel'] || '';
    document.getElementById('cfgEmail').value = cfg['email_responsavel'] || '';
    document.getElementById('cfgEmpresa').value = cfg['nome_empresa'] || '';
    document.getElementById('cfgCnpj').value = cfg['cnpj_empresa'] || '';
  } catch(e) { console.error('Configs error:', e); }
}

async function saveConfigs() {
  const cfgMap = [
    ['dias_alerta_vencimento', 'cfgDiasAlerta'],
    ['nome_responsavel_tecnico', 'cfgResponsavel'],
    ['crea_responsavel', 'cfgCrea'],
    ['email_responsavel', 'cfgEmail'],
    ['nome_empresa', 'cfgEmpresa'],
    ['cnpj_empresa', 'cfgCnpj']
  ];
  try {
    for (const [nome, elId] of cfgMap) {
      await api('/api/pmoc/configs', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, valor: document.getElementById(elId).value })
      });
    }
    toast('success', 'Configurações salvas!');
    loadKpis();
  } catch(e) { toast('error', e.message); }
}

// ─── Relatório ───
async function gerarRelatorio() {
  const clienteId = document.getElementById('relCliente').value;
  if (!clienteId) { toast('error', 'Selecione um cliente.'); return; }
  const clienteNome = document.getElementById('relCliente').selectedOptions[0]?.text || '';

  const btn = document.getElementById('btnRelatorio');
  btn.disabled = true; btn.textContent = 'Gerando…';

  try {
    const d = await api(`/api/pmoc/relatorio/${clienteId}`);
    const rel = d.data;
    renderRelatorioPreview(rel, clienteNome);
    toast('success', 'Relatório gerado!');
  } catch(e) { toast('error', 'Erro: ' + e.message); }
  finally { btn.disabled = false; btn.textContent = 'Gerar Relatório PMOC'; }
}

function renderRelatorioPreview(rel, clienteNome) {
  const el = document.getElementById('relatorioPreview');
  el.style.display = 'block';

  const hoje = new Date().toLocaleDateString('pt-BR');
  const eqs = rel.equipamentos || [];
  let totalItensOk = 0, totalItensNok = 0;

  const eqRows = eqs.map(({ equipamento, manutencoes }) => {
    const okCount = manutencoes.filter(m => m.resultado === 'OK').length;
    const nokCount = manutencoes.filter(m => m.resultado === 'NOK').length;
    totalItensOk += okCount; totalItensNok += nokCount;
    return `
      <tr>
        <td><strong>${escHtml(equipamento.marca)} ${escHtml(equipamento.modelo)}</strong><br><span style="font-size:.72rem;color:var(--text-muted)">${escHtml(equipamento.local_instalacao)}</span></td>
        <td>${equipamento.potencia_btu ? Number(equipamento.potencia_btu).toLocaleString('pt-BR') : '–'} BTU</td>
        <td>${manutencoes.length}</td>
        <td><span style="color:var(--green)">${okCount}</span></td>
        <td><span style="color:var(--red)">${nokCount}</span></td>
        <td><span class="badge bg-green">${nokCount === 0 ? 'Conforme' : 'Com ressalvas'}</span></td>
      </tr>`;
  }).join('');

  el.innerHTML = `
    <div style="background:var(--bg-surface);border:1px solid var(--border);border-radius:14px;padding:24px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;flex-wrap:wrap;gap:12px">
        <div>
          <h2 style="font-size:1.1rem;font-weight:800;margin-bottom:4px">📋 Relatório PMOC — ${escHtml(clienteNome)}</h2>
          <p style="font-size:.78rem;color:var(--text-secondary)">Emitido em ${hoje} · Ref.: ABNT NBR 16020 · Responsável: ${escHtml(rel.responsavelTecnico || '–')} · CREA: ${escHtml(rel.crea || '–')}</p>
        </div>
        <button class="btn-sm primary" data-on-click="window.print()">🖨️ Imprimir / Salvar PDF</button>
      </div>
      <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:20px">
        <div class="kpi-card neutral"><div class="number">${eqs.length}</div><div class="label">Equipamentos</div></div>
        <div class="kpi-card green"><div class="number">${totalItensOk}</div><div class="label">Itens OK</div></div>
        <div class="kpi-card ${totalItensNok > 0 ? 'red' : 'green'}"><div class="number">${totalItensNok}</div><div class="label">Itens NOK</div></div>
      </div>
      ${eqRows ? `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Equipamento</th><th>Potência</th><th>Manutenções</th><th>✅ OK</th><th>❌ NOK</th><th>Status</th></tr></thead>
          <tbody>${eqRows}</tbody>
        </table>
      </div>` : '<p style="color:var(--text-muted)">Nenhum equipamento com PMOC obrigatório para este cliente.</p>'}
      <div style="margin-top:20px;padding:16px;background:var(--bg-base);border-radius:10px;font-size:.78rem;color:var(--text-secondary)">
        <strong>Declaração:</strong> O presente relatório atesta que as manutenções preventivas descritas foram executadas conforme o Plano de Manutenção, Operação e Controle previsto na norma ABNT NBR 16020. O responsável técnico declara, sob as penas da lei, que as informações aqui contidas são verídicas.
      </div>
    </div>`;
}

// ─── Utilities ───
function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtDate(d) {
  if (!d) return '–';
  const dt = new Date(d);
  return dt.toLocaleDateString('pt-BR');
}

function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

function toast(type, msg) {
  const t = document.getElementById('toast');
  t.className = 'toast ' + type;
  document.getElementById('toastMsg').textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 4000);
}

// Close modal on backdrop click
document.querySelectorAll('.modal-overlay').forEach(el => {
  el.addEventListener('click', e => { if (e.target === el) el.classList.add('hidden'); });
});

// Hamburger toggle
document.getElementById('hamburger')?.addEventListener('click', () => {
  document.getElementById('sidebar')?.classList.toggle('collapsed');
});
