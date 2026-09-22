/* Extraido de portal/index.html por tools/csp-migrate.py (CSP sem unsafe-inline). */
/* ── gerado por tools/csp-migrate.py: nomes liberados para os data-on-* desta pagina ── */
;(function () {
  var s = window.__cspScope || (window.__cspScope = {});
  function def(n, g, st) { Object.defineProperty(s, n, { configurable: true, enumerable: true, get: g, set: st }); }
  def('closeNewTicketModal', function () { return typeof closeNewTicketModal !== 'undefined' ? closeNewTicketModal : undefined; }, function (v) { closeNewTicketModal = v; });
  def('closeTicketLocationModal', function () { return typeof closeTicketLocationModal !== 'undefined' ? closeTicketLocationModal : undefined; }, function (v) { closeTicketLocationModal = v; });
  def('filterBills', function () { return typeof filterBills !== 'undefined' ? filterBills : undefined; }, function (v) { filterBills = v; });
  def('logout', function () { return typeof logout !== 'undefined' ? logout : undefined; }, function (v) { logout = v; });
  def('openNewTicketModal', function () { return typeof openNewTicketModal !== 'undefined' ? openNewTicketModal : undefined; }, function (v) { openNewTicketModal = v; });
  def('openTicketLocation', function () { return typeof openTicketLocation !== 'undefined' ? openTicketLocation : undefined; }, function (v) { openTicketLocation = v; });
  def('showForgot', function () { return typeof showForgot !== 'undefined' ? showForgot : undefined; }, function (v) { showForgot = v; });
  def('showLogin', function () { return typeof showLogin !== 'undefined' ? showLogin : undefined; }, function (v) { showLogin = v; });
  def('showTab', function () { return typeof showTab !== 'undefined' ? showTab : undefined; }, function (v) { showTab = v; });
})();
/* ── fim do bloco gerado ── */

const API = '/api/portal';
let authToken = localStorage.getItem('portal_token') || null;
let portalUser = JSON.parse(localStorage.getItem('portal_user') || 'null');
let cliente = JSON.parse(localStorage.getItem('portal_cliente') || 'null');
let currentBillsFilter = '';

function showNotification(msg, type = 'info') {
  const n = document.getElementById('notification');
  n.textContent = msg;
  n.className = `notification show ${type}`;
  setTimeout(() => n.classList.remove('show'), 3500);
}

function showError(elId, msg) {
  const el = document.getElementById(elId);
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 5000);
}

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  const res = await fetch(`${API}${path}`, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function boot() {
  if (authToken) {
    showApp();
  } else {
    showLogin();
  }
}

function showLogin() {
  document.getElementById('loginPage').style.display = 'flex';
  document.getElementById('forgotPage').style.display = 'none';
  document.getElementById('appPage').classList.remove('active');
}
function showForgot() {
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('forgotPage').style.display = 'flex';
  document.getElementById('appPage').classList.remove('active');
}
function showApp() {
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('forgotPage').style.display = 'none';
  document.getElementById('appPage').classList.add('active');
  document.getElementById('userName').textContent = portalUser?.nome || portalUser?.email || '--';
  loadAllTabs();
}

// Login
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  const btn = document.getElementById('loginBtn');
  btn.disabled = true;
  btn.textContent = 'Entrando…';
  try {
    const r = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    authToken = r.accessToken;
    portalUser = r.portalUser;
    cliente = r.cliente;
    localStorage.setItem('portal_token', authToken);
    localStorage.setItem('portal_user', JSON.stringify(portalUser));
    localStorage.setItem('portal_cliente', JSON.stringify(cliente));
    showApp();
  } catch (err) {
    showError('loginError', err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
});

document.getElementById('forgotForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('forgotEmail').value;
  const successEl = document.getElementById('forgotSuccess');
  successEl.style.display = 'none';
  try {
    const r = await api('/auth/forgot', { method: 'POST', body: JSON.stringify({ email }) });
    successEl.textContent = r.message;
    successEl.style.display = 'block';
  } catch (err) {
    showError('forgotError', err.message);
  }
});

async function logout() {
  try { await api('/auth/logout', { method: 'POST' }); } catch (_) {}
  authToken = null; portalUser = null; cliente = null;
  localStorage.removeItem('portal_token');
  localStorage.removeItem('portal_user');
  localStorage.removeItem('portal_cliente');
  showLogin();
}

// Tabs
function showTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');
}

function fmtCurrency(v) { return 'R$ ' + (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtDate(d) { if (!d) return '—'; return new Date(d).toLocaleDateString('pt-BR'); }
function escapeHtml(s) { return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function statusBadge(status) {
  const map = { PAID: 'green', PAGO: 'green', OVERDUE: 'red', VENCIDO: 'red', PENDING: 'orange', PENDENTE: 'orange', OPEN: 'orange', Aberto: 'blue', 'Resolvido': 'green', Fechado: 'gray', Cancelado: 'gray', Ativo: 'green', Inativo: 'gray' };
  const cls = map[status] || 'gray';
  return `<span class="badge ${cls}">${escapeHtml(status)}</span>`;
}

// Carrega todas as abas
async function loadAllTabs() {
  loadDashboard();
  loadContracts();
  loadBills();
  loadTickets();
  loadEquipment();
  loadProfile();
}

// Dashboard
async function loadDashboard() {
  try {
    const [bills, tickets, contracts] = await Promise.all([
      api('/bills?limit=5'),
      api('/tickets?limit=5'),
      api('/contracts'),
    ]);
    const pendentes = bills.data.filter(b => ['PENDING', 'OPEN', 'OVERDUE'].includes(b.status));
    const totalPendente = pendentes.reduce((s, b) => s + (b.valor || 0), 0);
    const totalPago = bills.data.filter(b => b.status === 'PAID').reduce((s, b) => s + (b.valor || 0), 0);
    const contratosAtivos = contracts.data.filter(c => c.status === 'Ativo').length;
    const ticketsAbertos = tickets.data.filter(t => !['Resolvido', 'Fechado', 'Cancelado'].includes(t.status)).length;

    document.getElementById('statGrid').innerHTML = `
      <div class="stat-card">
        <div class="label">A pagar</div>
        <div class="value ${totalPendente > 0 ? 'orange' : 'green'}">${fmtCurrency(totalPendente)}</div>
        <div class="sub">${pendentes.length} cobrança(s) pendente(s)</div>
      </div>
      <div class="stat-card">
        <div class="label">Pago no total</div>
        <div class="value green">${fmtCurrency(totalPago)}</div>
      </div>
      <div class="stat-card">
        <div class="label">Contratos ativos</div>
        <div class="value primary">${contratosAtivos}</div>
      </div>
      <div class="stat-card">
        <div class="label">Chamados abertos</div>
        <div class="value ${ticketsAbertos > 0 ? 'orange' : 'green'}">${ticketsAbertos}</div>
      </div>
    `;
    document.getElementById('dashBills').innerHTML = renderBillsTable(bills.data.slice(0, 5));
    document.getElementById('dashTickets').innerHTML = renderTicketsTable(tickets.data.slice(0, 5), false);
  } catch (e) {
    document.getElementById('statGrid').innerHTML = `<div class="empty">Erro: ${escapeHtml(e.message)}</div>`;
  }
}

function renderBillsTable(bills) {
  if (!bills.length) return '<div class="empty">Nenhuma cobrança encontrada.</div>';
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Valor</th><th>Vencimento</th><th>Status</th></tr></thead><tbody>${
    bills.map(b => `<tr>
      <td><strong>${fmtCurrency(b.valor)}</strong></td>
      <td>${fmtDate(b.data_vencimento)}</td>
      <td>${statusBadge(b.status)}</td>
    </tr>`).join('')
  }</tbody></table></div>`;
}

function renderTicketsTable(tickets, withActions = true) {
  if (!tickets.length) return '<div class="empty">Nenhum chamado encontrado.</div>';
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Título</th><th>Status</th><th>Data</th>${withActions ? '<th></th>' : ''}</tr></thead><tbody>${
    tickets.map(t => `<tr>
      <td>${escapeHtml(t.titulo)}</td>
      <td>${statusBadge(t.status)}</td>
      <td>${fmtDate(t.data_abertura)}</td>
      ${withActions ? `<td>${t.status === 'Em Andamento' ? `<button class="btn btn-sm btn-secondary" data-on-click="openTicketLocation('${t.id}')">📍 Técnico</button>` : ''}</td>` : ''}
    </tr>`).join('')
  }</tbody></table></div>`;
}

// Localização do técnico designado ao chamado (Fase 1.2 do plano de ativação)
async function openTicketLocation(ticketId) {
  const body = document.getElementById('ticketLocationBody');
  body.innerHTML = '<div class="empty">Carregando…</div>';
  document.getElementById('ticketLocationModal').classList.add('active');
  try {
    const r = await api(`/tickets/${ticketId}/location`);
    const d = r.data;
    if (!d.available) {
      const msgs = {
        NOT_IN_PROGRESS: 'Este chamado não está em andamento no momento.',
        NO_TECHNICIAN: 'Ainda não há um técnico designado para este chamado.',
        NO_LOCATION_YET: 'O técnico ainda não enviou a localização.',
        STALE: 'A última localização do técnico é antiga — provavelmente ele está sem sinal.',
        NOT_FOUND: 'Chamado não encontrado.',
      };
      body.innerHTML = `<div class="empty">${escapeHtml(msgs[d.reason] || 'Localização indisponível no momento.')}</div>`;
      return;
    }
    const mapsUrl = `https://www.google.com/maps?q=${d.latitude},${d.longitude}`;
    const minutesAgo = Math.max(0, Math.round((Date.now() - new Date(d.recorded_at).getTime()) / 60000));
    body.innerHTML = `
      <p style="margin:0 0 16px;color:var(--text-secondary);font-size:.88rem">Última posição registrada ${minutesAgo <= 1 ? 'agora mesmo' : `há ${minutesAgo} min`}${d.precisao ? ` (precisão ~${Math.round(d.precisao)}m)` : ''}.</p>
      <a class="btn" href="${mapsUrl}" target="_blank" rel="noopener">Abrir no Google Maps</a>
    `;
  } catch (e) {
    body.innerHTML = `<div class="empty">Erro: ${escapeHtml(e.message)}</div>`;
  }
}
function closeTicketLocationModal() { document.getElementById('ticketLocationModal').classList.remove('active'); }

async function loadContracts() {
  const el = document.getElementById('contractsContent');
  try {
    const r = await api('/contracts');
    if (!r.data.length) { el.innerHTML = '<div class="empty">Você não tem contratos ativos.</div>'; return; }
    el.innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Tipo</th><th>Status</th><th>Valor Mensal</th><th>Início</th><th>Próximo Fim</th></tr></thead><tbody>${
      r.data.map(c => `<tr>
        <td>${escapeHtml(c.tipo_contrato || c.titulo || '—')}</td>
        <td>${statusBadge(c.status)}</td>
        <td><strong>${fmtCurrency(c.valor_mensal)}</strong></td>
        <td>${fmtDate(c.data_inicio)}</td>
        <td>${fmtDate(c.data_fim)}</td>
      </tr>`).join('')
    }</tbody></table></div>`;
  } catch (e) { el.innerHTML = `<div class="empty">Erro: ${escapeHtml(e.message)}</div>`; }
}

async function loadBills() {
  const el = document.getElementById('billsContent');
  try {
    const qs = currentBillsFilter ? `?status=${currentBillsFilter}` : '';
    const r = await api(`/bills${qs}`);
    el.innerHTML = renderBillsTable(r.data);
  } catch (e) { el.innerHTML = `<div class="empty">Erro: ${escapeHtml(e.message)}</div>`; }
}

function filterBills(status) {
  currentBillsFilter = status;
  loadBills();
}

async function loadTickets() {
  const el = document.getElementById('ticketsContent');
  try {
    const r = await api('/tickets');
    el.innerHTML = renderTicketsTable(r.data);
  } catch (e) { el.innerHTML = `<div class="empty">Erro: ${escapeHtml(e.message)}</div>`; }
}

async function loadEquipment() {
  const el = document.getElementById('equipmentContent');
  try {
    const r = await api('/equipment');
    if (!r.data.length) { el.innerHTML = '<div class="empty">Nenhum equipamento cadastrado.</div>'; return; }
    el.innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Local</th><th>Marca / Modelo</th><th>BTU</th><th>Status</th></tr></thead><tbody>${
      r.data.map(eq => `<tr>
        <td>${escapeHtml(eq.local_instalacao || '—')}</td>
        <td>${escapeHtml((eq.marca || '') + ' ' + (eq.modelo || ''))}</td>
        <td>${eq.potencia_btu ? eq.potencia_btu.toLocaleString('pt-BR') : '—'}</td>
        <td>${escapeHtml(eq.status_equipamento || '—')}</td>
      </tr>`).join('')
    }</tbody></table></div>`;
  } catch (e) { el.innerHTML = `<div class="empty">Erro: ${escapeHtml(e.message)}</div>`; }
}

async function loadProfile() {
  try {
    const r = await api('/me');
    document.getElementById('profileNome').value = r.portalUser.nome || '';
    document.getElementById('profileEmail').value = r.portalUser.email || '';
    document.getElementById('profileTelefone').value = r.portalUser.telefone || '';
  } catch (e) { /* silent */ }
}

document.getElementById('profileForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/profile', { method: 'PUT', body: JSON.stringify({
      nome: document.getElementById('profileNome').value,
      email: document.getElementById('profileEmail').value,
      telefone: document.getElementById('profileTelefone').value,
    }) });
    showNotification('Perfil atualizado!', 'success');
  } catch (err) { showNotification(err.message, 'error'); }
});

// Novo chamado
function openNewTicketModal() { document.getElementById('newTicketModal').classList.add('active'); }
function closeNewTicketModal() { document.getElementById('newTicketModal').classList.remove('active'); document.getElementById('newTicketForm').reset(); }

document.getElementById('newTicketForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/tickets', { method: 'POST', body: JSON.stringify({
      titulo: document.getElementById('newTicketTitulo').value,
      descricao: document.getElementById('newTicketDescricao').value,
      categoria: document.getElementById('newTicketCategoria').value,
      prioridade: document.getElementById('newTicketPrioridade').value,
    }) });
    closeNewTicketModal();
    showNotification('Chamado aberto com sucesso!', 'success');
    loadTickets();
    loadDashboard();
  } catch (err) { showNotification(err.message, 'error'); }
});

boot();
