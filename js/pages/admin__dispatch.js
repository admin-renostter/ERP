/* Extraido de admin/dispatch.html por tools/csp-migrate.py (CSP sem unsafe-inline). */
/* ── gerado por tools/csp-migrate.py: nomes liberados para os data-on-* desta pagina ── */
;(function () {
  var s = window.__cspScope || (window.__cspScope = {});
  function def(n, g, st) { Object.defineProperty(s, n, { configurable: true, enumerable: true, get: g, set: st }); }
  def('focusTecnico', function () { return typeof focusTecnico !== 'undefined' ? focusTecnico : undefined; }, function (v) { focusTecnico = v; });
  def('loadAll', function () { return typeof loadAll !== 'undefined' ? loadAll : undefined; }, function (v) { loadAll = v; });
  def('renderList', function () { return typeof renderList !== 'undefined' ? renderList : undefined; }, function (v) { renderList = v; });
})();
/* ── fim do bloco gerado ── */

const BASE = '/api';
let allLocations = [];
let map = null;
let markers = {};
let selectedTecnico = null;
let refreshInterval = null;

document.addEventListener('DOMContentLoaded', () => {
  initSidebar();
  initMap();
  loadAll();
  // Auto-refresh a cada 30s
  refreshInterval = setInterval(loadAll, 30000);
});

function initSidebar() {
  const hamburger = document.getElementById('hamburger');
  const sidebar = document.getElementById('sidebar');
  hamburger?.addEventListener('click', () => sidebar?.classList.toggle('collapsed'));
}

function initMap() {
  // Centro padrão: São Paulo (pode ser ajustado depois)
  map = L.map('map', { zoomControl: true, attributionControl: true })
    .setView([-23.5505, -46.6333], 11);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(map);

  // Tenta ajustar bounds quando tem localizações
}

async function loadAll() {
  try {
    const r = await fetch(BASE + '/tecnico/localizacao?since=120');
    const j = await r.json();
    if (!j.success) throw new Error(j.error);

    allLocations = j.data || [];
    renderList();
    renderMap();
    updateStats();

    const now = new Date();
    document.getElementById('lastSync').textContent = 'Atualizado: ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch (e) {
    console.error('Dispatch load error:', e);
    document.getElementById('lastSync').textContent = 'Erro ao sincronizar';
  }
}

function getStatus(loc) {
  if (!loc.recorded_at) return 'offline';
  const age = Date.now() - new Date(loc.recorded_at).getTime();
  if (age < 15 * 60 * 1000) return 'online';   // < 15 min
  if (age < 60 * 60 * 1000) return 'stale';     // < 1h
  return 'offline';
}

function formatAge(isoDate) {
  if (!isoDate) return '—';
  const ms = Date.now() - new Date(isoDate).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}

function renderList() {
  const filter = document.getElementById('filterStatus').value;
  const filtered = filter === 'all' ? allLocations : allLocations.filter(l => getStatus(l) === filter);

  document.getElementById('techCount').textContent = `(${allLocations.length})`;

  const html = filtered.length ? filtered.map(loc => {
    const status = getStatus(loc);
    const initials = (loc.tecnico_nome || loc.tecnico_id || '??').split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();
    return `
    <div class="dispatch-tech ${selectedTecnico === loc.tecnico_id ? 'active' : ''}" data-on-click="focusTecnico('${loc.tecnico_id}')">
      <div class="dispatch-tech-row">
        <div class="dispatch-avatar">${initials}</div>
        <div class="dispatch-info">
          <div style="display:flex;align-items:center;gap:6px">
            <div class="dispatch-status ${status}"></div>
            <div class="dispatch-name">${esc(loc.tecnico_nome || loc.tecnico_id)}</div>
          </div>
          <div class="dispatch-meta">
            <span class="dispatch-meta-item">📍 ${formatAge(loc.recorded_at)}</span>
            ${loc.battery_level != null ? `<span class="dispatch-meta-item">🔋 ${loc.battery_level}%</span>` : ''}
            ${loc.precisao ? `<span class="dispatch-meta-item">🎯 ±${Math.round(loc.precisao)}m</span>` : ''}
          </div>
        </div>
      </div>
    </div>`;
  }).join('') : `<div class="dispatch-empty"><div>Nenhum técnico com sync nos últimos 2h</div></div>`;

  document.getElementById('techList').innerHTML = html;
}

function renderMap() {
  // Limpa markers antigos
  Object.values(markers).forEach(m => map.removeLayer(m));
  markers = {};

  if (!allLocations.length) return;

  const online = allLocations.filter(l => getStatus(l) === 'online');
  const bounds = [];

  online.forEach(loc => {
    if (!loc.latitude || !loc.longitude) return;
    const status = getStatus(loc);
    const color = status === 'online' ? '#22c55e' : status === 'stale' ? '#f59e0b' : '#ef4444';
    const initials = (loc.tecnico_nome || loc.tecnico_id || '??').split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();

    const icon = L.divIcon({
      className: 'tech-marker',
      html: `<div style="
        width:36px;height:36px;border-radius:50%;
        background:${color};border:3px solid #fff;
        box-shadow:0 0 12px ${color};
        display:flex;align-items:center;justify-content:center;
        color:#fff;font-weight:700;font-size:0.78rem;
        font-family:Inter,sans-serif;
      ">${initials}</div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18]
    });

    const marker = L.marker([loc.latitude, loc.longitude], { icon })
      .bindPopup(`
        <div class="tech-popup">
          <div class="tech-popup-name">${esc(loc.tecnico_nome || loc.tecnico_id)}</div>
          <div class="tech-popup-meta">
            📍 ${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}<br>
            🕐 ${formatAge(loc.recorded_at)}<br>
            ${loc.battery_level != null ? `🔋 ${loc.battery_level}%<br>` : ''}
            ${loc.precisao ? `🎯 Precisão: ±${Math.round(loc.precisao)}m<br>` : ''}
            ${loc.speed ? `💨 ${(loc.speed * 3.6).toFixed(0)} km/h` : ''}
          </div>
          <div class="tech-popup-actions">
            <a href="https://www.google.com/maps?q=${loc.latitude},${loc.longitude}" target="_blank">Ver no Maps</a>
          </div>
        </div>
      `)
      .addTo(map);

    markers[loc.tecnico_id] = marker;
    bounds.push([loc.latitude, loc.longitude]);
  });

  // Ajusta bounds se tem pelo menos 1 ponto
  if (bounds.length === 1) {
    map.setView(bounds[0], 14);
  } else if (bounds.length > 1) {
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
  }
}

function updateStats() {
  const online = allLocations.filter(l => getStatus(l) === 'online').length;
  const stale = allLocations.filter(l => getStatus(l) === 'stale').length;
  const offline = allLocations.filter(l => getStatus(l) === 'offline').length;

  document.getElementById('statOnline').textContent = online;
  document.getElementById('statStale').textContent = stale;
  document.getElementById('statOffline').textContent = offline;

  // Calcula área de cobertura
  const validLocs = allLocations.filter(l => l.latitude && l.longitude);
  if (validLocs.length >= 2) {
    const lats = validLocs.map(l => l.latitude);
    const lons = validLocs.map(l => l.longitude);
    const dLat = (Math.max(...lats) - Math.min(...lats)) * 111;
    const dLon = (Math.max(...lons) - Math.min(...lons)) * 111 * Math.cos(lats[0] * Math.PI / 180);
    const area = Math.abs(dLat * dLon);
    document.getElementById('statArea').textContent = area < 1 ? `${(area * 100).toFixed(0)} km²` : `${area.toFixed(0)} km²`;
  } else {
    document.getElementById('statArea').textContent = '—';
  }
}

function focusTecnico(id) {
  selectedTecnico = id;
  document.querySelectorAll('.dispatch-tech').forEach(el => el.classList.remove('active'));
  event?.currentTarget?.classList.add('active');
  const marker = markers[id];
  if (marker) {
    map.setView(marker.getLatLng(), 15, { animate: true });
    marker.openPopup();
  }
}

function esc(s) { return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') : ''; }
