/* Extraido de admin/garantia.html por tools/csp-migrate.py (CSP sem unsafe-inline). */
/* ── gerado por tools/csp-migrate.py: nomes liberados para os data-on-* desta pagina ── */
;(function () {
  var s = window.__cspScope || (window.__cspScope = {});
  function def(n, g, st) { Object.defineProperty(s, n, { configurable: true, enumerable: true, get: g, set: st }); }
  def('abrirConfig', function () { return typeof abrirConfig !== 'undefined' ? abrirConfig : undefined; }, function (v) { abrirConfig = v; });
  def('abrirReabrir', function () { return typeof abrirReabrir !== 'undefined' ? abrirReabrir : undefined; }, function (v) { abrirReabrir = v; });
  def('confirmarReabrir', function () { return typeof confirmarReabrir !== 'undefined' ? confirmarReabrir : undefined; }, function (v) { confirmarReabrir = v; });
  def('exportarRelatorio', function () { return typeof exportarRelatorio !== 'undefined' ? exportarRelatorio : undefined; }, function (v) { exportarRelatorio = v; });
  def('fecharModal', function () { return typeof fecharModal !== 'undefined' ? fecharModal : undefined; }, function (v) { fecharModal = v; });
  def('salvarConfig', function () { return typeof salvarConfig !== 'undefined' ? salvarConfig : undefined; }, function (v) { salvarConfig = v; });
  def('showTab', function () { return typeof showTab !== 'undefined' ? showTab : undefined; }, function (v) { showTab = v; });
  def('verDetalhe', function () { return typeof verDetalhe !== 'undefined' ? verDetalhe : undefined; }, function (v) { verDetalhe = v; });
})();
/* ── fim do bloco gerado ── */

const API = ''; // mesma origem (/api/...)
let currentChamado = null;

document.addEventListener('DOMContentLoaded', () => {
    loadSidebar('admin/garantia.html');
    loadKPIs();
    loadGarantias();
    loadVencendo();
    loadVencidas();
    loadConfigs();
});

async function garantiaApi(method, path, body) {
    const opts = {
        method,
        headers: { 'Content-Type': 'application/json', 'x-user-id': 'admin', 'x-user-name': 'Administrador' }
    };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(API + path, opts);
    const j = await r.json();
    if (!j.success) throw new Error(j.error);
    return j;
}

async function loadKPIs() {
    try {
        const { data } = await garantiaApi('GET', '/api/chamados/kpis');
        document.getElementById('kpi-garantia').textContent = data.emGarantia;
        document.getElementById('kpi-vencendo').textContent = data.vencendo7dias;
        document.getElementById('kpi-reabertos').textContent = data.reabertos;
        document.getElementById('kpi-limite').textContent = data.limiteAtingido;
    } catch (e) { console.error(e); }
}

async function loadGarantias() {
    try {
        const { data } = await garantiaApi('GET', '/api/chamados?status=Fechado&size=200');
        renderTable('tbody-garantias', data.data || [], 'garantia');
    } catch (e) { document.getElementById('tbody-garantias').innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:20px">Nenhum chamado em garantia</td></tr>'; }
}

async function loadVencendo() {
    try {
        const { data } = await garantiaApi('GET', '/api/chamados/alertas');
        renderTable('tbody-vencendo', data || [], 'vencendo');
    } catch (e) { document.getElementById('tbody-vencendo').innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:20px">Nenhuma garantia vencendo</td></tr>'; }
}

async function loadVencidas() {
    try {
        const { data } = await garantiaApi('GET', '/api/chamados/vencidas');
        renderTable('tbody-vencidas', data || [], 'vencida');
    } catch (e) { document.getElementById('tbody-vencidas').innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:20px">Nenhuma garantia vencida</td></tr>'; }
}

function renderTable(tbodyId, rows, modo) {
    const el = document.getElementById(tbodyId);
    if (!rows.length) { el.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:20px">Nenhum registro</td></tr>`; return; }
    el.innerHTML = rows.map(c => {
        const dias = c.diasRestantes ?? 0;
        const emGarantia = dias > 0;
        const barColor = dias > 30 ? 'var(--green)' : dias > 7 ? 'var(--orange)' : 'var(--red)';
        const diasPct = Math.min(100, Math.max(0, (dias / 90) * 100));
        const statusBadge = modo === 'garantia'
            ? `<span class="badge ${emGarantia ? 'badge-green' : 'badge-red'}">${emGarantia ? 'Em Garantia' : 'Vencida'}</span>`
            : modo === 'vencendo'
            ? `<span class="badge badge-orange">Vence em ${dias}d</span>`
            : `<span class="badge badge-red">Vencida</span>`;
        return `<tr>
            <td><code style="font-size:.78rem">#${c.id}</code></td>
            <td>${c.cliente_id || '—'}</td>
            <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${c.titulo}">${c.titulo}</td>
            <td>${c.data_conclusao ? new Date(c.data_conclusao).toLocaleDateString('pt-BR') : '—'}</td>
            <td>${c.data_garantia_fim ? new Date(c.data_garantia_fim).toLocaleDateString('pt-BR') : '—'}</td>
            <td>
                <div class="garantia-bar">
                    <div class="bar"><div class="bar-fill" style="width:${diasPct}%;background:${barColor}"></div></div>
                    <span class="dias" style="color:${barColor}">${dias}d</span>
                </div>
            </td>
            <td>${c.qtd_reaberturas || 0}</td>
            <td>
                <div class="actions">
                    <button class="btn-sm" data-on-click="verDetalhe('${c.id}')">Ver</button>
                    <button class="btn-sm primary" data-on-click="abrirReabrir('${c.id}')">Reabrir</button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

async function abrirReabrir(id) {
    try {
        const { data } = await garantiaApi('GET', `/api/chamados/${id}/can-reopen`);
        currentChamado = { id, ...data };
        const c = currentChamado;
        document.getElementById('reabrir-info').innerHTML = `
            <div class="row"><span class="key">Chamado</span><span class="val">#${id}</span></div>
            <div class="row"><span class="key">Fim Garantia</span><span class="val" style="color:${data.emGarantia ? 'var(--green)' : 'var(--orange)'}">${c.data_garantia_fim ? new Date(c.data_garantia_fim).toLocaleDateString('pt-BR') : '—'}</span></div>
            <div class="row"><span class="key">Dias Restantes</span><span class="val">${c.diasRestantes ?? '—'}</span></div>
            <div class="row"><span class="key">Reaberturas</span><span class="val">${c.qtd_reaberturas || 0} / ${data.configs?.max_reaberturas_garantia || 3}</span></div>
            ${!data.allowed ? `<div style="color:var(--red);margin-top:8px;font-weight:600">⚠️ ${data.reason}</div>` : ''}
        `;
        document.getElementById('reabrir-info').style.display = 'block';
        document.getElementById('modal-reabrir').classList.remove('hidden');
    } catch (e) { alert('Erro: ' + e.message); }
}

async function confirmarReabrir() {
    const motivo = document.querySelector('input[name="motivo"]:checked')?.value;
    const desc = document.getElementById('reabrir-desc').value;
    if (!motivo) { alert('Selecione um motivo'); return; }
    try {
        await garantiaApi('POST', `/api/chamados/${currentChamado.id}/reopen`, { motivo, descricaoProblema: desc });
        fecharModal('modal-reabrir');
        loadKPIs(); loadGarantias();
    } catch (e) { alert('Erro: ' + e.message); }
}

async function verDetalhe(id) {
    try {
        const { data } = await garantiaApi('GET', `/api/chamados/${id}`);
        alert(`#${id}\nCliente: ${data.cliente_id}\nStatus: ${data.status}\nGarantia: ${data.garantia?.emGarantia ? 'SIM' : 'NãO'} (${data.garantia?.diasRestantes}d restantes)\nReaberturas: ${data.qtd_reaberturas || 0}`);
    } catch (e) { alert('Erro: ' + e.message); }
}

async function loadConfigs() {
    try {
        const { data } = await garantiaApi('GET', '/api/chamados/configs');
        document.getElementById('cfg-dias').value = data['dias_padrao_garantia'] || 90;
        document.getElementById('cfg-alerta').value = data['dias_alerta_reabertura'] || 7;
        document.getElementById('cfg-max').value = data['max_reaberturas_garantia'] || 3;
        document.getElementById('cfg-permite').value = data['permite_reabertura_apos_garantia'] || 'false';
    } catch (e) { console.error(e); }
}

async function salvarConfig() {
    const maps = [
        ['dias_padrao_garantia', 'cfg-dias'],
        ['dias_alerta_reabertura', 'cfg-alerta'],
        ['max_reaberturas_garantia', 'cfg-max'],
        ['permite_reabertura_apos_garantia', 'cfg-permite']
    ];
    try {
        for (const [nome, elId] of maps) {
            await garantiaApi('PATCH', '/api/chamados/configs', { nome, valor: document.getElementById(elId).value });
        }
        fecharModal('modal-config');
        loadKPIs();
    } catch (e) { alert('Erro: ' + e.message); }
}

function abrirConfig() { document.getElementById('modal-config').classList.remove('hidden'); }
function fecharModal(id) { document.getElementById(id).classList.add('hidden'); }
function showTab(name) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    document.getElementById('tab-' + name).classList.add('active');
    event.target.classList.add('active');
}
function exportarRelatorio() { alert('Exportar: CSV com KPIs de garantia (a implementar)'); }
function loadSidebar(activePage) {
    fetch('../js/utils.js').then(r => r.text()).then(() => {
        if (typeof renderSidebar === 'function') renderSidebar('admin/garantia.html');
        else document.getElementById('sidebar').innerHTML = '<p style="padding:20px;color:var(--text-muted)">Sidebar não disponível</p>';
    }).catch(() => {});
}
