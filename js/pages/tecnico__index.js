/* Extraido de tecnico/index.html por tools/csp-migrate.py (CSP sem unsafe-inline). */
/* ── gerado por tools/csp-migrate.py: nomes liberados para os data-on-* desta pagina ── */
;(function () {
  var s = window.__cspScope || (window.__cspScope = {});
  function def(n, g, st) { Object.defineProperty(s, n, { configurable: true, enumerable: true, get: g, set: st }); }
  def('$', function () { return typeof $ !== 'undefined' ? $ : undefined; }, function (v) { $ = v; });
  def('closeModal', function () { return typeof closeModal !== 'undefined' ? closeModal : undefined; }, function (v) { closeModal = v; });
  def('handleLogin', function () { return typeof handleLogin !== 'undefined' ? handleLogin : undefined; }, function (v) { handleLogin = v; });
  def('i', function () { return typeof i !== 'undefined' ? i : undefined; }, function (v) { i = v; });
  def('loadTarefas', function () { return typeof loadTarefas !== 'undefined' ? loadTarefas : undefined; }, function (v) { loadTarefas = v; });
  def('openExecModal', function () { return typeof openExecModal !== 'undefined' ? openExecModal : undefined; }, function (v) { openExecModal = v; });
  def('setClResult', function () { return typeof setClResult !== 'undefined' ? setClResult : undefined; }, function (v) { setClResult = v; });
  def('submitExec', function () { return typeof submitExec !== 'undefined' ? submitExec : undefined; }, function (v) { submitExec = v; });
  def('switchPage', function () { return typeof switchPage !== 'undefined' ? switchPage : undefined; }, function (v) { switchPage = v; });
  def('syncNow', function () { return typeof syncNow !== 'undefined' ? syncNow : undefined; }, function (v) { syncNow = v; });
})();
/* ── fim do bloco gerado ── */

// ─── State ───
const tecnicoId = localStorage.getItem('tecnicoId') || '';
const BASE = '/api';
let currentPage = 'tarefas';
let currentManut = null;
let isOnline = navigator.onLine;
let geoWatchId = null;
let lastGeoSync = null;
let pendingGeoQueue = []; // fila de localizações pendentes (offline)

// ─── Init ───
document.addEventListener('DOMContentLoaded', () => {
  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js')
      .then(reg => console.log('[PWA] SW registered'))
      .catch(e => console.warn('[PWA] SW registration failed:', e));
  }

  // Online/offline listeners
  window.addEventListener('online', () => { isOnline = true; updateOnlineStatus(); syncNow(); flushGeoQueue(); });
  window.addEventListener('offline', () => { isOnline = false; updateOnlineStatus(); });

  // Carrega fila pendente do localStorage
  try {
    const saved = localStorage.getItem('geoQueue');
    if (saved) pendingGeoQueue = JSON.parse(saved);
  } catch (_) { pendingGeoQueue = []; }

  // Resume session
  if (tecnicoId) {
    showApp(tecnicoId);
  } else {
    showLogin();
  }
});

// ─── Auth ───
function handleLogin() {
  const id = document.getElementById('tecnicoId').value.trim();
  if (!id) { toast('error', 'Informe seu nome ou ID'); return; }
  localStorage.setItem('tecnicoId', id);
  showApp(id);
}

function showLogin() {
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('appScreen').style.display = 'none';
}

function showApp(id) {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appScreen').style.display = 'block';
  document.getElementById('tecnicoName').textContent = id;
  updateOnlineStatus();
  loadTarefas();
  loadHistorico();
  updatePendingCount();
  startGeolocation();
  // Flush qualquer fila pendente
  if (isOnline) flushGeoQueue();
}

// ─── Geolocalização ───
function startGeolocation() {
  if (!('geolocation' in navigator)) {
    console.warn('[Geo] API de geolocalização indisponível');
    updateGeoStatus('Indisponível');
    return;
  }

  // Permissão (silenciosa — PWA já foi autorizado no install)
  if (navigator.permissions && navigator.permissions.query) {
    navigator.permissions.query({ name: 'geolocation' }).then(r => {
      if (r.state === 'denied') {
        updateGeoStatus('Permissão negada');
        console.warn('[Geo] Permissão negada pelo usuário');
      }
    }).catch(() => {});
  }

  // Watch position — high accuracy, atualiza a cada ~30s ou 50m
  geoWatchId = navigator.geolocation.watchPosition(
    onGeoSuccess,
    onGeoError,
    {
      enableHighAccuracy: true,
      timeout: 30000,
      maximumAge: 15000,
      distanceFilter: 25 // re-envia se moveu mais de 25m
    }
  );

  // Backup: reenvia a cada 60s mesmo parado (heartbeat de "ainda em campo")
  setInterval(sendHeartbeatGeo, 60000);
  updateGeoStatus('Rastreando...');
}

function onGeoSuccess(pos) {
  const data = {
    tecnicoId: localStorage.getItem('tecnicoId'),
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    precisao: pos.coords.accuracy,
    speed: pos.coords.speed,
    heading: pos.coords.heading,
    batteryLevel: null, // preenchido depois
    appVersion: '1.0.0'
  };

  // Pega bateria (nem todos os browsers suportam)
  if (navigator.getBattery) {
    navigator.getBattery().then(b => {
      data.batteryLevel = Math.round(b.level * 100);
      sendGeoToServer(data);
    }).catch(() => sendGeoToServer(data));
  } else {
    sendGeoToServer(data);
  }

  // Geocoding reverso opcional (se o backend suportar)
  // Pega nome da rua/bairro via API leve (deixar para depois)
}

function onGeoError(err) {
  console.warn('[Geo] Erro:', err.message);
  if (err.code === 1) updateGeoStatus('Permissão negada');
  else if (err.code === 2) updateGeoStatus('Sem sinal GPS');
  else if (err.code === 3) updateGeoStatus('Timeout');
}

function sendHeartbeatGeo() {
  if (!('geolocation' in navigator)) return;
  navigator.geolocation.getCurrentPosition(
    pos => onGeoSuccess(pos),
    () => {},
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 30000 }
  );
}

async function sendGeoToServer(data) {
  if (!data.tecnicoId) return;
  if (!isOnline) {
    pendingGeoQueue.push({ ...data, _ts: Date.now() });
    saveGeoQueue();
    return;
  }
  try {
    await api('/tecnico/localizacao', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    lastGeoSync = Date.now();
    updateGeoStatus('✓ Sincronizado ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
  } catch (e) {
    console.warn('[Geo] Falhou ao enviar, enfileirando:', e.message);
    pendingGeoQueue.push({ ...data, _ts: Date.now() });
    saveGeoQueue();
  }
}

function flushGeoQueue() {
  if (!pendingGeoQueue.length || !isOnline) return;
  const queue = [...pendingGeoQueue];
  pendingGeoQueue = [];
  saveGeoQueue();
  Promise.allSettled(queue.map(d => api('/tecnico/localizacao', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(d)
  }))).then(results => {
    const failed = results.filter(r => r.status === 'rejected').length;
    if (failed > 0) {
      // Recoloca na fila só os que falharam
      results.forEach((r, i) => {
        if (r.status === 'rejected') pendingGeoQueue.push(queue[i]);
      });
      saveGeoQueue();
    } else {
      lastGeoSync = Date.now();
      updateGeoStatus('✓ ' + pendingGeoQueue.length + ' localizações sincronizadas');
    }
  });
}

function saveGeoQueue() {
  // Limita a 500 pontos para não estourar localStorage
  if (pendingGeoQueue.length > 500) {
    pendingGeoQueue = pendingGeoQueue.slice(-500);
  }
  try { localStorage.setItem('geoQueue', JSON.stringify(pendingGeoQueue)); } catch (_) {}
}

function updateGeoStatus(msg) {
  const el = document.getElementById('geoStatus');
  if (el) el.textContent = msg;
}

// ─── Online status ───
function updateOnlineStatus() {
  const badge = document.getElementById('onlineBadge');
  const label = document.getElementById('onlineLabel');
  if (isOnline) {
    badge.className = 'online-badge on';
    label.textContent = 'Online';
  } else {
    badge.className = 'online-badge off';
    label.textContent = 'Offline';
  }
}

// ─── Navigation ───
function switchPage(page) {
  currentPage = page;
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  event?.currentTarget?.classList.add('active');
  document.querySelectorAll('[id^="page-"]').forEach(p => p.style.display = 'none');
  document.getElementById('page-' + page).style.display = 'block';
  if (page === 'tarefas') loadTarefas();
  if (page === 'agenda') loadAgenda();
  if (page === 'historico') loadHistorico();
}

// ─── API ───
async function api(path, opts = {}) {
  const r = await fetch(BASE + path, opts);
  const j = await r.json();
  if (!r.ok && !j.success) throw new Error(j.error || 'Erro');
  return j;
}

// ─── Load Tarefas ───
async function loadTarefas() {
  const tid = localStorage.getItem('tecnicoId');
  try {
    const [pendentesRes, todasRes] = await Promise.all([
      api('/api/pmoc/pendentes'),
      api('/api/pmoc/manutencoes?status=Pendente&size=50')
    ]);

    const pendentes = pendentesRes.data || [];
    const todas = todasRes.data || [];

    const kpiPmoc = pendentes.filter(p => isToday(p.proxima_data)).length;
    const kpiPend = pendentes.length;
    document.getElementById('kpiPmoc').textContent = kpiPmoc || pendentes.slice(0,1).length;
    document.getElementById('kpiPendentes').textContent = kpiPend;
    document.getElementById('kpiConcluidas').textContent = '–';

    // PMOC List
    if (!todas.length) {
      document.getElementById('pmocList').innerHTML = '<div class="empty-state"><div class="icon">🎉</div><p>Nenhuma manutenção pendente. Bom trabalho!</p></div>';
    } else {
      document.getElementById('pmocList').innerHTML = todas.map(m => {
        const dias = Math.round((new Date(m.proxima_data) - new Date()) / 86400000);
        const overdue = dias < 0;
        const color = overdue ? 'var(--red)' : dias <= 3 ? 'var(--orange)' : 'var(--text2)';
        return `<div class="card" data-on-click="openExecModal('${m.id}')">
          <div class="card-header">
            <div class="card-title">${escHtml(m.marca || '')} ${escHtml(m.modelo || '')}</div>
            <span class="badge ${overdue ? 'bg-red' : dias <= 3 ? 'bg-orange' : 'bg-blue'}">${m.tipo_manutencao}</span>
          </div>
          <div class="card-meta">
            <span>${escHtml(m.local_instalacao || '–')}</span>
            <span style="color:${color}">${overdue ? Math.abs(dias)+'d atrasada' : dias+'d'}</span>
          </div>
          <div class="card-footer">
            <span style="font-size:.72rem;color:var(--text2)">${fmtDate(m.proxima_data)}</span>
            <span class="badge bg-green">▶ Executar</span>
          </div>
        </div>`;
      }).join('');
    }

    // Tickets (placeholder — from local storage)
    const myTickets = JSON.parse(localStorage.getItem('tecnico_tickets') || '[]');
    document.getElementById('ticketsList').innerHTML = myTickets.length
      ? myTickets.map(t => `<div class="card">
          <div class="card-header">
            <div class="card-title">${escHtml(t.title || t.num || '')}</div>
            <span class="badge bg-orange">${escHtml(t.status || 'Aberto')}</span>
          </div>
          <div class="card-meta"><span>${escHtml(t.cliente || '')}</span></div>
        </div>`).join('')
      : '<div class="empty-state"><div class="icon">🎫</div><p>Use o admin para criar chamados.</p></div>';

  } catch(e) {
    console.warn('Load error (offline?):', e.message);
    document.getElementById('pmocList').innerHTML = '<div class="empty-state"><div class="icon">📵</div><p>Sem conexão. Carregue a página online ao menos uma vez.</p></div>';
    document.getElementById('ticketsList').innerHTML = '<div class="empty-state"><div class="icon">📵</div><p>Sem conexão.</p></div>';
  }
}

// ─── Load Agenda ───
async function loadAgenda() {
  try {
    const d = await api('/api/pmoc/manutencoes?status=Pendente&size=30');
    const rows = d.data || [];
    if (!rows.length) { document.getElementById('agendaList').innerHTML = '<div class="empty-state"><div class="icon">📅</div><p>Nada agendado.</p></div>'; return; }
    document.getElementById('agendaList').innerHTML = rows.map(m => {
      const dt = new Date(m.proxima_data);
      const dia = dt.toLocaleDateString('pt-BR', { weekday:'short', day:'numeric', month:'short' });
      return `<div class="card" data-on-click="openExecModal('${m.id}')">
        <div class="card-header">
          <div class="card-title">${escHtml(m.marca || '')} ${escHtml(m.modelo || '')} — ${m.tipo_manutencao}</div>
        </div>
        <div class="card-meta"><span>${dia}</span><span>${escHtml(m.local_instalacao || '')}</span></div>
        <div class="card-footer"><span class="badge bg-orange">⏰ Pendente</span><span class="badge bg-green">▶</span></div>
      </div>`;
    }).join('');
  } catch(e) {
    document.getElementById('agendaList').innerHTML = '<div class="empty-state"><div class="icon">📵</div><p>Sem conexão.</p></div>';
  }
}

// ─── Load Histórico ───
async function loadHistorico() {
  try {
    const tid = localStorage.getItem('tecnicoId');
    // Load from IndexedDB first
    const localDone = await loadLocalExecucoes();
    if (localDone.length) {
      document.getElementById('historicoList').innerHTML = localDone.map(m => `
        <div class="card">
          <div class="card-header">
            <div class="card-title">${escHtml(m.marca || '')} ${escHtml(m.modelo || '')}</div>
            <span class="badge ${m.synced ? 'bg-green' : 'bg-orange'}">${m.synced ? '✅ Sincronizado' : '⏳ Pendente'}</span>
          </div>
          <div class="card-meta"><span>${escHtml(m.tipo_manutencao || '')}</span><span>${fmtDate(m.executedAt)}</span></div>
        </div>`).join('');
      return;
    }
    document.getElementById('historicoList').innerHTML = '<div class="empty-state"><div class="icon">✅</div><p>Nenhuma manutenção concluída ainda.</p></div>';
  } catch(e) {
    document.getElementById('historicoList').innerHTML = '<div class="empty-state"><div class="icon">📵</div><p>Sem conexão.</p></div>';
  }
}

// ─── Execute Modal ───
async function openExecModal(manutId) {
  currentManut = manutId;
  document.getElementById('execObs').value = '';
  document.getElementById('execCustoMO').value = '';
  document.getElementById('execCustoPecas').value = '';
  document.getElementById('execChecklist').innerHTML = '<div class="empty-state"><div class="icon">⏳</div><p>Carregando checklist…</p></div>';

  try {
    const d = await api('/api/pmoc/manutencoes/' + manutId);
    const m = d.data;

    document.getElementById('execInfo').innerHTML = `
      <strong>${escHtml(m.marca)} ${escHtml(m.modelo)}</strong><br>
      <span style="color:var(--text2)">${escHtml(m.local_instalacao)}</span><br>
      <span class="badge bg-blue" style="margin-top:4px;display:inline-block">${m.tipo_manutencao}</span>
    `;

    const itens = m.itens || [];
    document.getElementById('execChecklist').innerHTML = `<div class="section-title" style="margin-bottom:10px">Checklist — ${m.tipo_manutencao}</div>` +
      (itens.length ? itens.map((item, i) => `
        <div class="cl-item">
          <div class="cl-body">
            <div class="cl-desc">${escHtml(item.item_descricao || item.descricao || '')}</div>
            <div class="cl-cat">${item.obrigatorio ? '🔴 Obrigatório' : 'Optional'} · ${escHtml(item.item_categoria || '')}</div>
            <input type="hidden" id="cl-res-${i}" value="">
            <div class="cl-btns">
              <button class="cl-btn ok" data-on-click="setClResult(${i},'OK')" id="cl-ok-${i}">✅ OK</button>
              <button class="cl-btn nok" data-on-click="setClResult(${i},'NOK')" id="cl-nok-${i}">❌ NOK</button>
              <button class="cl-btn na" data-on-click="setClResult(${i},'N/A')" id="cl-na-${i}">N/A</button>
            </div>
            <input type="text" class="obs-input" id="cl-obs-${i}" placeholder="Observação (opcional)">
          </div>
        </div>`).join('') : '<p style="color:var(--text2);font-size:.82rem">Nenhum item no checklist.</p>');

    // Store items for submission
    window._execItens = itens;

  } catch(e) {
    document.getElementById('execChecklist').innerHTML = '<div class="empty-state"><div class="icon">📵</div><p>Sem conexão. Checklist não disponível offline.</p></div>';
  }

  openModal('modalExec');
}

function setClResult(idx, result) {
  document.getElementById('cl-res-' + idx).value = result;
  ['ok','nok','na'].forEach(t => document.getElementById('cl-' + t + '-' + idx)?.classList.remove('active'));
  document.getElementById('cl-' + result.toLowerCase() + '-' + idx)?.classList.add('active');
}

// ─── Submit Execution ───
async function submitExec() {
  if (!currentManut || !window._execItens) return;

  const tid = localStorage.getItem('tecnicoId');
  const itensExec = [];
  let valid = true;

  window._execItens.forEach((item, i) => {
    const result = document.getElementById('cl-res-' + i)?.value;
    if (item.obrigatorio && !result) valid = false;
    if (result) {
      itensExec.push({
        itemId: item.id,
        resultado: result,
        observacao: document.getElementById('cl-obs-' + i)?.value || ''
      });
    }
  });

  if (!valid) { toast('error', 'Marque todos os itens obrigatórios.'); return; }
  if (!itensExec.length) { toast('error', 'Marque ao menos um item.'); return; }

  const payload = {
    itens: itensExec,
    tecnicoId: tid,
    observacoesGerais: document.getElementById('execObs').value,
    custoMaoObra: parseFloat(document.getElementById('execCustoMO').value) || null,
    custoPecas: parseFloat(document.getElementById('execCustoPecas').value) || null
  };

  if (isOnline) {
    try {
      await api(`/api/pmoc/manutencoes/${currentManut}/executar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      toast('success', 'Manutenção registrada!');
      closeModal('modalExec');
      loadTarefas();
      loadHistorico();
      return;
    } catch(e) {
      console.warn('Online submit failed, queuing offline:', e);
    }
  }

  // Offline: save to IndexedDB
  await saveOfflineExecucao(currentManut, payload);
  toast('success', 'Salvo offline! Será sincronizado quando online.');
  closeModal('modalExec');
  loadTarefas();
  loadHistorico();
  updatePendingCount();
}

// ─── Offline DB ───
function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('RenostterTec', 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('execucoes')) {
        db.createObjectStore('execucoes', { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveOfflineExecucao(manutId, payload) {
  const db = await openIDB();
  const tx = db.transaction('execucoes', 'readwrite');
  tx.objectStore('execucoes').add({ manutId, payload, synced: false, createdAt: new Date().toISOString() });
}

async function loadLocalExecucoes() {
  try {
    const db = await openIDB();
    const tx = db.transaction('execucoes', 'readonly');
    return new Promise((resolve, reject) => {
      const req = tx.objectStore('execucoes').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch { return []; }
}

async function updatePendingCount() {
  try {
    const items = await loadLocalExecucoes();
    const pending = items.filter(i => !i.synced).length;
    const el = document.getElementById('pendingCount');
    if (el) el.textContent = pending > 0 ? `${pending} pendente${pending > 1 ? 's' : ''}` : '';
    const syncBar = document.getElementById('syncBar');
    if (syncBar) syncBar.classList.toggle('hidden', pending === 0);
  } catch {}
}

async function syncNow() {
  if (!isOnline) { toast('error', 'Sem conexão.'); return; }
  try {
    const items = await loadLocalExecucoes();
    let synced = 0;
    for (const item of items) {
      if (item.synced) continue;
      try {
        await api(`/api/pmoc/manutencoes/${item.manutId}/executar`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.payload)
        });
        // Mark as synced
        const db = await openIDB();
        const tx = db.transaction('execucoes', 'readwrite');
        const store = tx.objectStore('execucoes');
        item.synced = true;
        store.put(item);
        synced++;
      } catch(e) { console.warn('Sync failed for', item.id, e); }
    }
    if (synced > 0) {
      toast('success', `${synced} registro(s) sincronizado(s)!`);
      loadTarefas();
      loadHistorico();
    } else {
      toast('success', 'Tudo em dia!');
    }
    updatePendingCount();
  } catch(e) { toast('error', 'Erro na sincronização.'); }
}

// ─── Utils ───
function escHtml(s) { return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') : ''; }
function fmtDate(d) { if (!d) return '–'; try { return new Date(d).toLocaleDateString('pt-BR'); } catch { return '–'; } }
function isToday(d) { if (!d) return false; const t = new Date(d); const now = new Date(); return t.toDateString() === now.toDateString(); }
function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function toast(type, msg) {
  const t = document.getElementById('toast');
  t.className = 'toast ' + type + ' hidden';
  document.getElementById('toastMsg').textContent = msg;
  setTimeout(() => t.classList.remove('hidden'), 10);
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.add('hidden'), 4000);
}

// Message from service worker
if (navigator.serviceWorker) {
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data?.type === 'SYNC_SUCCESS') {
      toast('success', 'Manutenção sincronizada!');
      updatePendingCount();
      loadHistorico();
    }
  });
}
