/* Extraido de admin/leads.html por tools/csp-migrate.py (CSP sem unsafe-inline). */
/* ── gerado por tools/csp-migrate.py: nomes liberados para os data-on-* desta pagina ── */
;(function () {
  var s = window.__cspScope || (window.__cspScope = {});
  function def(n, g, st) { Object.defineProperty(s, n, { configurable: true, enumerable: true, get: g, set: st }); }
  def('closeModal', function () { return typeof closeModal !== 'undefined' ? closeModal : undefined; }, function (v) { closeModal = v; });
  def('convertLead', function () { return typeof convertLead !== 'undefined' ? convertLead : undefined; }, function (v) { convertLead = v; });
  def('deleteLead', function () { return typeof deleteLead !== 'undefined' ? deleteLead : undefined; }, function (v) { deleteLead = v; });
  def('editLead', function () { return typeof editLead !== 'undefined' ? editLead : undefined; }, function (v) { editLead = v; });
  def('exportLeads', function () { return typeof exportLeads !== 'undefined' ? exportLeads : undefined; }, function (v) { exportLeads = v; });
  def('loadLeads', function () { return typeof loadLeads !== 'undefined' ? loadLeads : undefined; }, function (v) { loadLeads = v; });
  def('openLeadModal', function () { return typeof openLeadModal !== 'undefined' ? openLeadModal : undefined; }, function (v) { openLeadModal = v; });
  def('saveLead', function () { return typeof saveLead !== 'undefined' ? saveLead : undefined; }, function (v) { saveLead = v; });
  def('switchTab', function () { return typeof switchTab !== 'undefined' ? switchTab : undefined; }, function (v) { switchTab = v; });
  def('updateScorePreview', function () { return typeof updateScorePreview !== 'undefined' ? updateScorePreview : undefined; }, function (v) { updateScorePreview = v; });
})();
/* ── fim do bloco gerado ── */

const ORIGIN_COLORS = {
    site_form:'#00AEEF', whatsapp:'#25D366', instagram:'#E1306C', telefone:'#8B949E',
    recomendado:'#22c55e', feira:'#f59e0b', google_ads:'#4285F4', linkedin:'#0A66C2',
    email_mkt:'#8b5cf6', manual:'#8B949E', visita:'#f59e0b', orcamento:'#00AEEF'
};
const STATUS_COLORS = { novo:'#8B949E', qualificado:'#00AEEF', proposta:'#f59e0b', negociacao:'#8b5cf6', convertido:'#22c55e', perdido:'#ef4444' };
const ORIGIN_LABELS = {
    site_form:'Site', whatsapp:'WhatsApp', instagram:'Instagram', telefone:'Telefone',
    recomendado:'Recomendado', feira:'Feira', google_ads:'Google Ads', linkedin:'LinkedIn',
    email_mkt:'E-mail Mkt', manual:'Manual', visita:'Visita', orcamento:'Orçamento'
};

let currentTab = 'leads';
let allLeads = [];
let statsData = {};

document.addEventListener('DOMContentLoaded', () => {
  initSidebar();
  loadStats();
  loadLeads();
  loadOrigens();
  setInterval(loadStats, 120000);
});

function initSidebar() {
  document.getElementById('hamburger')?.addEventListener('click', () => document.getElementById('sidebar')?.classList.toggle('collapsed'));
}

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.querySelector(`.tab-btn[data-on-click="switchTab('${tab}')"]`).classList.add('active');
  document.getElementById('tab-' + tab).classList.add('active');
  if (tab === 'origem') renderOrigem();
  if (tab === 'score') renderScore();
}

async function api(url, opts = {}) {
  const r = await fetch(url, opts);
  const j = await r.json();
  if (!r.ok && !j.success) throw new Error(j.error || 'Erro');
  return j;
}

async function loadStats() {
  try {
    const d = await api('/api/leads/stats');
    statsData = d.data;
    document.getElementById('kpiTotal').textContent = statsData.total || 0;
    document.getElementById('kpiNovo').textContent = statsData.novo || 0;
    document.getElementById('kpiQualif').textContent = statsData.qualificado || 0;
    document.getElementById('kpiConv').textContent = statsData.convertido || 0;
    document.getElementById('kpiTaxa').textContent = (statsData.taxaConversao || 0) + '%';
    document.getElementById('kpiMes').textContent = statsData.thisMonth || 0;
    // Funnel
    document.getElementById('fnNovo').textContent = statsData.novo || 0;
    document.getElementById('fnQualif').textContent = statsData.qualificado || 0;
    document.getElementById('fnProposta').textContent = statsData.proposta || 0;
    document.getElementById('fnNegoc').textContent = (statsData.negociacao || 0);
    document.getElementById('fnConv').textContent = statsData.convertido || 0;
    document.getElementById('lastRefresh').textContent = 'Atualizado: ' + new Date().toLocaleTimeString('pt-BR');
  } catch(e) { console.error('Stats error:', e); }
}

async function loadOrigens() {
  try {
    const d = await api('/api/leads/origins');
    const opts = '<option value="">Todas origens</option>' + d.data.map(o => `<option value="${o.value}">${o.label}</option>`).join('');
    document.getElementById('filtroOrigem').innerHTML = opts;
  } catch(e) {}
}

async function loadLeads() {
  const search = document.getElementById('searchLead')?.value || '';
  const status = document.getElementById('filtroStatus')?.value || '';
  const origem = document.getElementById('filtroOrigem')?.value || '';
  try {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (origem) params.set('origem', origem);
    if (search) params.set('search', search);
    params.set('limit', 100);
    const d = await api(`/api/leads?${params}`);
    allLeads = d.data || [];
    renderLeads(allLeads);
  } catch(e) {
    document.getElementById('tblLeadsBody').innerHTML = `<tr><td colspan="7" class="empty-state"><div class="icon">⚠️</div><p>${e.message}</p></td></tr>`;
  }
}

function renderLeads(leads) {
  const tbody = document.getElementById('tblLeadsBody');
  if (!leads.length) {
    tbody.innerHTML = `<tr><td colspan="7">
      <div class="empty-state">
        <div class="icon">🎯</div>
        <p style="margin-bottom:16px">Nenhum lead encontrado.</p>
        <button class="btn btn-primary btn-sm" data-on-click="openLeadModal()" style="font-size:.88rem;padding:10px 20px">+ Capturar primeiro lead</button>
      </div>
    </td></tr>`;
    return;
  }
  tbody.innerHTML = leads.map(l => {
    const scoreColor = l.pontuacao >= 60 ? 'var(--green)' : l.pontuacao >= 30 ? 'var(--orange)' : 'var(--text-muted)';
    const scorePct = l.pontuacao || 0;
    const scBarColor = scorePct >= 60 ? 'var(--green)' : scorePct >= 30 ? 'var(--orange)' : 'var(--red)';
    const statusBg = STATUS_COLORS[l.status] || '#8B949E';
    const statusBgClass = { novo:'bg-gray', qualificado:'bg-blue', proposta:'bg-orange', negociacao:'bg-purple', convertido:'bg-green', perdido:'bg-red' }[l.status] || 'bg-gray';
    const origColor = ORIGIN_COLORS[l.origem] || '#8B949E';
    const origLabel = ORIGIN_LABELS[l.origem] || l.origem || '–';
    const contato = [l.telefone, l.email].filter(Boolean).join(' · ') || '–';
    const criado = l.created_at ? new Date(l.created_at).toLocaleDateString('pt-BR') : '–';
    return `<tr>
      <td>
        <div style="font-weight:600;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(l.nome)}</div>
        <div style="font-size:.72rem;color:var(--text-muted)">${escHtml(l.empresa || '–')}</div>
      </td>
      <td>
        <span style="display:inline-flex;align-items:center;gap:5px;font-size:.76rem;color:${origColor};font-weight:600">
          <span class="origem-dot" style="background:${origColor}"></span>${origLabel}
        </span>
      </td>
      <td style="font-size:.78rem;color:var(--text-secondary);max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(contato)}</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-weight:800;font-size:.9rem;color:${scoreColor}">${scorePct}</span>
          <div style="flex:1;height:5px;background:var(--bg-base);border-radius:3px">
            <div style="height:100%;width:${scorePct}%;background:${scBarColor};border-radius:3px;transition:width .4s"></div>
          </div>
        </div>
      </td>
      <td><span class="badge ${statusBgClass}">${capitalize(l.status)}</span></td>
      <td style="font-size:.76rem;color:var(--text-secondary)">${criado}</td>
      <td class="actions">
        <button class="btn-sm" data-on-click="editLead('${l.id}')" title="Editar">✏️</button>
        ${l.status !== 'convertido' ? `<button class="btn-sm success" data-on-click="convertLead('${l.id}')" title="Converter">✓</button>` : ''}
        <button class="btn-sm danger" data-on-click="deleteLead('${l.id}')" title="Excluir">🗑</button>
      </td>
    </tr>`;
  }).join('');
}

function renderOrigem() {
  const tbody = document.getElementById('tblOrigem');
  const porOrigem = statsData.porOrigem || [];
  if (!porOrigem.length) { tbody.innerHTML = '<tr><td colspan="5" class="empty-state"><div class="icon">📡</div><p>Sem dados por origem.</p></td></tr>'; return; }
  const total = porOrigem.reduce((s, r) => s + r.quantidade, 0);
  tbody.innerHTML = porOrigem.map(r => {
    const pct = total > 0 ? ((r.quantidade / total) * 100).toFixed(1) : 0;
    const color = ORIGIN_COLORS[r.origem] || '#8B949E';
    const label = ORIGIN_LABELS[r.origem] || r.origem;
    return `<tr>
      <td><span style="display:inline-flex;align-items:center;gap:6px;font-weight:600"><span class="origem-dot" style="background:${color}"></span>${label}</span></td>
      <td>${r.quantidade}</td>
      <td><span style="font-weight:700;color:${r.avg_score >= 50 ? 'var(--green)' : 'var(--orange)'}">${r.avg_score}</span></td>
      <td><span style="font-size:.78rem;color:var(--text-secondary)">${pct}%</span></td>
      <td><div style="display:flex;align-items:center;gap:8px"><div style="flex:1;height:6px;background:var(--bg-base);border-radius:3px"><div style="height:100%;width:${pct}%;background:${color};border-radius:3px"></div></div></div></td>
    </tr>`;
  }).join('');
}

function renderScore() {
  const tbody = document.getElementById('tblScore');
  const sorted = [...allLeads].sort((a, b) => b.pontuacao - a.pontuacao).slice(0, 50);
  if (!sorted.length) { tbody.innerHTML = '<tr><td colspan="5" class="empty-state"><div class="icon">📊</div><p>Carregue os leads primeiro.</p></td></tr>'; return; }
  tbody.innerHTML = sorted.map(l => {
    const color = l.pontuacao >= 60 ? 'var(--green)' : l.pontuacao >= 30 ? 'var(--orange)' : 'var(--red)';
    const statusBgClass = { novo:'bg-gray', qualificado:'bg-blue', proposta:'bg-orange', negociacao:'bg-purple', convertido:'bg-green', perdido:'bg-red' }[l.status] || 'bg-gray';
    return `<tr>
      <td style="font-weight:600">${escHtml(l.nome)}</td>
      <td style="color:var(--text-secondary);font-size:.78rem">${escHtml(l.empresa || '–')}</td>
      <td><span class="badge ${statusBgClass}">${capitalize(l.status)}</span></td>
      <td><span style="font-weight:800;font-size:1.1rem;color:${color}">${l.pontuacao}</span></td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="flex:1;height:8px;background:var(--bg-base);border-radius:4px">
            <div style="height:100%;width:${l.pontuacao}%;background:${color};border-radius:4px"></div>
          </div>
        </div>
      </td>
    </tr>`;
  }).join('');
}

// ─── Lead CRUD ───
function openLeadModal() {
  try {
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    setVal('leadId', '');
    setVal('leadNome', '');
    setVal('leadOrigem', 'manual');
    setVal('leadEmail', '');
    setVal('leadTelefone', '');
    setVal('leadEmpresa', '');
    setVal('leadStatus', 'novo');
    setVal('leadObs', '');

    const scorePreview = document.getElementById('scorePreview');
    if (scorePreview) scorePreview.style.display = 'none';

    const title = document.getElementById('modalLeadTitle');
    if (title) title.textContent = 'Novo Lead';
    const btnSave = document.getElementById('btnSaveLead');
    if (btnSave) btnSave.textContent = 'Capturar Lead';

    openModal('modalLead');
  } catch (e) {
    console.error('Erro ao abrir modal de lead:', e);
    alert('Erro ao abrir formulário: ' + e.message);
  }
}
window.openLeadModal = openLeadModal;

async function editLead(id) {
  try {
    const d = await api(`/api/leads/${id}`);
    const l = d.data;
    document.getElementById('leadId').value = l.id;
    document.getElementById('leadNome').value = l.nome || '';
    document.getElementById('leadOrigem').value = l.origem || 'manual';
    document.getElementById('leadEmail').value = l.email || '';
    document.getElementById('leadTelefone').value = l.telefone || '';
    document.getElementById('leadEmpresa').value = l.empresa || '';
    document.getElementById('leadStatus').value = l.status || 'novo';
    document.getElementById('leadObs').value = l.observacoes || '';
    updateScorePreview();
    document.getElementById('modalLeadTitle').textContent = 'Editar Lead';
    document.getElementById('btnSaveLead').textContent = 'Salvar Alterações';
    openModal('modalLead');
  } catch(e) { toast('error', e.message); }
}

async function saveLead() {
  const nome = document.getElementById('leadNome').value.trim();
  if (!nome) { toast('error', 'Informe o nome do lead.'); return; }
  const body = {
    nome,
    email:    document.getElementById('leadEmail').value.trim() || null,
    telefone: document.getElementById('leadTelefone').value.trim() || null,
    empresa:  document.getElementById('leadEmpresa').value.trim() || null,
    origem:   document.getElementById('leadOrigem').value,
    status:   document.getElementById('leadStatus').value,
    observacoes: document.getElementById('leadObs').value.trim() || null,
  };
  const id = document.getElementById('leadId').value;
  const btn = document.getElementById('btnSaveLead');
  btn.disabled = true; btn.textContent = 'Salvando…';
  try {
    if (id) {
      await api(`/api/leads/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      toast('success', 'Lead atualizado!');
    } else {
      await api('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      toast('success', 'Lead capturado!');
    }
    closeModal('modalLead');
    loadStats();
    loadLeads();
  } catch(e) { toast('error', e.message); }
  finally { btn.disabled = false; btn.textContent = id ? 'Salvar Alterações' : 'Capturar Lead'; }
}

async function deleteLead(id) {
  if (!confirm('Excluir este lead?')) return;
  try {
    await api(`/api/leads/${id}`, { method: 'DELETE' });
    toast('success', 'Lead excluído.');
    loadStats();
    loadLeads();
  } catch(e) { toast('error', e.message); }
}

async function convertLead(id) {
  const clienteId = prompt('Informe o ID do cliente criado para este lead (deixe vazio se ainda não criou):');
  try {
    await api(`/api/leads/${id}/convert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clienteId: clienteId || null })
    });
    toast('success', 'Lead convertido em cliente!');
    loadStats();
    loadLeads();
  } catch(e) { toast('error', e.message); }
}

function updateScorePreview() {
  const data = {
    origem: document.getElementById('leadOrigem').value,
    email: document.getElementById('leadEmail').value,
    telefone: document.getElementById('leadTelefone').value,
    empresa: document.getElementById('leadEmpresa').value,
    observacoes: document.getElementById('leadObs').value,
  };
  // Calculate locally for preview (same as server)
  const ORIGIN_SCORE = { site_form:20, whatsapp:25, instagram:15, telefone:10, recomendado:30, feira:15, google_ads:20, linkedin:15, email_mkt:10, manual:5, visita:10, orcamento:15 };
  let score = ORIGIN_SCORE[data.origem] || 0;
  if (data.email) score += 10;
  if (data.telefone) score += 10;
  if (data.empresa) score += 15;
  if (data.observacoes) score += 5;
  score = Math.min(100, score);
  const status = score >= 60 ? 'Qualificado' : score >= 30 ? 'Novo' : 'Novo';
  const color = score >= 60 ? 'var(--green)' : score >= 30 ? 'var(--orange)' : 'var(--red)';
  const barColor = score >= 60 ? 'var(--green)' : score >= 30 ? 'var(--orange)' : 'var(--red)';
  document.getElementById('scorePreview').style.display = 'flex';
  document.getElementById('scorePreviewNum').textContent = score;
  document.getElementById('scorePreviewNum').style.color = color;
  document.getElementById('scorePreviewLabel').textContent = 'Pontuação automática';
  document.getElementById('scorePreviewStatus').textContent = `Status provável: ${status}`;
  document.getElementById('scorePreviewBar').style.width = score + '%';
  document.getElementById('scorePreviewBar').style.background = barColor;
}

function exportLeads() {
  if (!allLeads.length) { toast('error', 'Nenhum lead para exportar.'); return; }
  const headers = ['Nome', 'E-mail', 'Telefone', 'Empresa', 'Origem', 'Score', 'Status', 'Criado em'];
  const rows = allLeads.map(l => [
    l.nome, l.email || '', l.telefone || '', l.empresa || '',
    ORIGIN_LABELS[l.origem] || l.origem || '', l.pontuacao, l.status,
    l.created_at ? new Date(l.created_at).toLocaleDateString('pt-BR') : ''
  ]);
  const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'leads-renostter.csv'; a.click();
  URL.revokeObjectURL(url);
  toast('success', `Exportados ${allLeads.length} leads.`);
}

// ─── Helpers ───
function escHtml(s) { return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : ''; }
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
function openModal(id) {
  const el = document.getElementById(id);
  if (!el) { console.error('Modal não encontrado:', id); return; }
  el.classList.remove('hidden');
  el.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('hidden');
  el.style.display = '';
  document.body.style.overflow = '';
}
function toast(type, msg) { const t = document.getElementById('toast'); t.className = 'toast ' + type; document.getElementById('toastMsg').textContent = msg; t.classList.remove('hidden'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.add('hidden'), 4000); }
document.querySelectorAll('.modal-overlay').forEach(el => el.addEventListener('click', e => { if (e.target === el) el.classList.add('hidden'); }));
