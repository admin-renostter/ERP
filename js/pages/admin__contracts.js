/* Extraido de admin/contracts.html por tools/csp-migrate.py (CSP sem unsafe-inline). */
/* ── gerado por tools/csp-migrate.py: nomes liberados para os data-on-* desta pagina ── */
;(function () {
  var s = window.__cspScope || (window.__cspScope = {});
  function def(n, g, st) { Object.defineProperty(s, n, { configurable: true, enumerable: true, get: g, set: st }); }
  def('ativarContrato', function () { return typeof ativarContrato !== 'undefined' ? ativarContrato : undefined; }, function (v) { ativarContrato = v; });
  def('atualizarServicos', function () { return typeof atualizarServicos !== 'undefined' ? atualizarServicos : undefined; }, function (v) { atualizarServicos = v; });
  def('calcAnual', function () { return typeof calcAnual !== 'undefined' ? calcAnual : undefined; }, function (v) { calcAnual = v; });
  def('cancelarContrato', function () { return typeof cancelarContrato !== 'undefined' ? cancelarContrato : undefined; }, function (v) { cancelarContrato = v; });
  def('closeModal', function () { return typeof closeModal !== 'undefined' ? closeModal : undefined; }, function (v) { closeModal = v; });
  def('editContrato', function () { return typeof editContrato !== 'undefined' ? editContrato : undefined; }, function (v) { editContrato = v; });
  def('hideClienteDropdown', function () { return typeof hideClienteDropdown !== 'undefined' ? hideClienteDropdown : undefined; }, function (v) { hideClienteDropdown = v; });
  def('loadContratos', function () { return typeof loadContratos !== 'undefined' ? loadContratos : undefined; }, function (v) { loadContratos = v; });
  def('onClienteSearch', function () { return typeof onClienteSearch !== 'undefined' ? onClienteSearch : undefined; }, function (v) { onClienteSearch = v; });
  def('onTipoChange', function () { return typeof onTipoChange !== 'undefined' ? onTipoChange : undefined; }, function (v) { onTipoChange = v; });
  def('openContratoModal', function () { return typeof openContratoModal !== 'undefined' ? openContratoModal : undefined; }, function (v) { openContratoModal = v; });
  def('saveContrato', function () { return typeof saveContrato !== 'undefined' ? saveContrato : undefined; }, function (v) { saveContrato = v; });
  def('selecionarCliente', function () { return typeof selecionarCliente !== 'undefined' ? selecionarCliente : undefined; }, function (v) { selecionarCliente = v; });
  def('showClienteDropdown', function () { return typeof showClienteDropdown !== 'undefined' ? showClienteDropdown : undefined; }, function (v) { showClienteDropdown = v; });
  def('switchTab', function () { return typeof switchTab !== 'undefined' ? switchTab : undefined; }, function (v) { switchTab = v; });
  def('toggleRenovacao', function () { return typeof toggleRenovacao !== 'undefined' ? toggleRenovacao : undefined; }, function (v) { toggleRenovacao = v; });
  def('validarVigencia', function () { return typeof validarVigencia !== 'undefined' ? validarVigencia : undefined; }, function (v) { validarVigencia = v; });
})();
/* ── fim do bloco gerado ── */

const TIPOS = { basico: {label:'Básico', slaResposta:48, slaResolucao:120},
                empresarial: {label:'Empresarial', slaResposta:24, slaResolucao:72},
                premium: {label:'Premium', slaResposta:8, slaResolucao:24},
                pmoc: {label:'PMOC', slaResposta:24, slaResolucao:48},
                emergencial: {label:'Emergencial', slaResposta:2, slaResolucao:8} };
let currentTab = 'contratos';
let ctPage = 0;
let clientesCache = [];
let rmrData = null;
let chartPlano = null;
let chartMov = null;

document.addEventListener('DOMContentLoaded', () => {
  initSidebar();
  loadRmrKpis();
  loadClientesForFilter();
  loadContratos();
  loadVencendo();
  setInterval(loadRmrKpis, 120000);
  document.getElementById('lastRefresh').textContent = 'Atualizado: ' + new Date().toLocaleTimeString('pt-BR');
});

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.querySelector(`.tab-btn[data-on-click="switchTab('${tab}')"]`).classList.add('active');
  document.getElementById('tab-' + tab).classList.add('active');
  if (tab === 'rmr' && !chartPlano) setTimeout(loadRmrCharts, 100);
}

async function api(url, opts = {}) {
  // 1. Garante token (auto-login se não tiver)
  let token = localStorage.getItem('jwt');
  if (!token) {
    token = await ensureLoggedIn();
  }

  // 2. Headers padrão
  const headers = {
    'Content-Type': 'application/json',
    ...(opts.headers || {}),
  };
  if (token) headers['Authorization'] = 'Bearer ' + token;

  // 3. Fetch
  let r;
  try {
    r = await fetch(url, { ...opts, headers });
  } catch (networkErr) {
    throw new Error('Falha de rede — servidor offline? (verifique se a API está rodando em :3000)');
  }

  // 4. Parse JSON (pode falhar em 5xx HTML)
  let j;
  try { j = await r.json(); }
  catch { throw new Error('Resposta inválida do servidor (status ' + r.status + ')'); }

  // 5. Auto refresh se token expirou
  if (r.status === 401 && (j.code === 'TOKEN_EXPIRED' || j.code === 'INVALID_TOKEN')) {
    token = await refreshAccessToken();
    if (token) {
      r = await fetch(url, { ...opts, headers: { ...headers, 'Authorization': 'Bearer ' + token } });
      j = await r.json();
    }
  }

  if (!r.ok && !j.success) {
    // Se auth falhou e ainda não tentamos, redireciona para login
    if (r.status === 401 && !window._authRedirected) {
      window._authRedirected = true;
      const msg = j.error || 'Faça login em /crm/ primeiro';
      if (confirm(msg + '\n\nIr para a página de login agora?')) {
        window.location.href = '/crm/';
      }
    }
    throw new Error(j.error || 'Erro ' + r.status);
  }
  return j;
}

async function ensureLoggedIn() {
  // Tenta múltiplas combinações. Em dev/stage, sempre funciona com demo.
  const candidates = [
    { email: 'demo@renostter.com', password: 'senha123' },  // SQLite demo
    { email: localStorage.getItem('user_email') || '', password: localStorage.getItem('user_password') || '' },
  ].filter(c => c.email && c.password);

  for (const creds of candidates) {
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creds),
      });
      if (!r.ok) continue;
      const j = await r.json();
      if (j.accessToken) {
        localStorage.setItem('jwt', j.accessToken);
        localStorage.setItem('user_email', creds.email);
        localStorage.setItem('user_password', creds.password);
        if (j.refreshToken) localStorage.setItem('refresh', j.refreshToken);
        if (j.user) localStorage.setItem('user', JSON.stringify(j.user));
        console.log('[Auth] Auto-login OK como', creds.email);
        return j.accessToken;
      }
    } catch (_) {}
  }
  console.warn('[Auth] Auto-login falhou — abra /crm/ para fazer login manual');
  return null;
}

async function refreshAccessToken() {
  const refresh = localStorage.getItem('refresh');
  if (!refresh) return null;
  try {
    const r = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh })
    });
    if (!r.ok) return null;
    const j = await r.json();
    if (j.accessToken) {
      localStorage.setItem('jwt', j.accessToken);
      return j.accessToken;
    }
  } catch (_) {}
  return null;
}

// ─── KPIs RMR ───
async function loadRmrKpis() {
  try {
    const d = await api('/api/contratos/rmr');
    const m = d.data;
    rmrData = m;
    document.getElementById('kpiMrr').textContent = fmtCurrency(m.mrr);
    document.getElementById('kpiArr').textContent = fmtCurrency(m.arr);
    document.getElementById('kpiNrr').textContent = m.nrr + '%';
    document.getElementById('kpiChurn').textContent = m.churnRate + '%';
    document.getElementById('kpiAtivos').textContent = m.contratosAtivos;
    document.getElementById('kpiVencem').textContent = m.vencemEm30Dias;

    // Alert banners
    const alerts = document.getElementById('alertsArea');
    let html = '';
    if (m.vencemEm30Dias > 0)
      html += `<div class="alert-bar orange">⚠️ ${m.vencemEm30Dias} contrato(s) vencem em até 30 dias. Revise as renovações.</div>`;
    if (m.churnRate > 5)
      html += `<div class="alert-bar red">⚠️ Taxa de churn elevada: ${m.churnRate}%. Analise os cancelamentos.</div>`;
    alerts.innerHTML = html;

    document.getElementById('lastRefresh').textContent = 'Atualizado: ' + new Date().toLocaleTimeString('pt-BR');
  } catch(e) { console.error('RMR error:', e); }
}

// ─── Contratos ───
async function loadClientesForFilter() {
  try {
    const d = await api('/api/clientes');
    clientesCache = d.data || [];
    const opts = '<option value="">Todos clientes</option>' + clientesCache.map(c => `<option value="${c.id}">${escHtml(c.nome)}</option>`).join('');
    document.getElementById('filtroCliente').innerHTML = opts;
    document.getElementById('ctCliente').innerHTML = '<option value="">Selecione…</option>' + clientesCache.map(c => `<option value="${c.id}">${escHtml(c.nome)}</option>`).join('');
  } catch(e) { console.error('Clientes error:', e); }
}

async function loadContratos() {
  const search = document.getElementById('searchContrato')?.value || '';
  const status = document.getElementById('filtroStatus')?.value || '';
  const tipo = document.getElementById('filtroTipo')?.value || '';
  const clienteId = document.getElementById('filtroCliente')?.value || '';
  try {
    const params = new URLSearchParams({ page: ctPage, size: 20 });
    if (status) params.set('status', status);
    if (tipo) params.set('tipo', tipo);
    if (clienteId) params.set('clienteId', clienteId);
    const d = await api(`/api/contratos?${params}`);
    let rows = d.data || [];
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        (r.titulo || '').toLowerCase().includes(q) ||
        (r.cliente_nome || '').toLowerCase().includes(q)
      );
    }
    renderContratos(rows);
  } catch(e) { document.getElementById('tblContratosBody').innerHTML = `<tr><td colspan="8" class="empty-state"><div class="icon">⚠️</div><p>${escHtml(e.message)}</p></td></tr>`; }
}

function renderContratos(rows) {
  const tbody = document.getElementById('tblContratosBody');
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8">
      <div class="empty-state" style="padding:56px 24px">
        <div class="icon">📋</div>
        <p style="margin-bottom:16px">Nenhum contrato criado ainda.</p>
        <button class="btn btn-primary btn-sm" data-on-click="openContratoModal()" style="font-size:.88rem;padding:10px 20px">+ Criar primeiro contrato</button>
      </div>
    </td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(c => {
    const tipo = TIPOS[c.tipo_contrato] || { label: c.tipo_contrato };
    const tipoBadge = { basico:'bg-gray', empresarial:'bg-blue', premium:'bg-purple', pmoc:'bg-green', emergencial:'bg-orange' }[c.tipo_contrato] || 'bg-gray';
    const statusBadge = { Ativo:'bg-green', Pendente:'bg-orange', Cancelado:'bg-red' }[c.status] || 'bg-gray';
    const freq = { monthly:'Mensal', quarterly:'Trimestral', semiannual:'Semestral', annual:'Anual' }[c.frequencia_cobranca] || c.frequencia_cobranca;
    const vigencia = c.data_inicio ? `${fmtDate(c.data_inicio)} → ${fmtDate(c.data_fim) || '–'}` : '–';
    const renovIcon = c.renovacao_automatica ? '🔄' : '';
    return `<tr>
      <td><div style="font-weight:600;max-width:200px" class="ellipsis">${escHtml(c.titulo || '–')}</div><div style="font-size:.72rem;color:var(--text-muted)">${escHtml(c.cliente_nome || '–')}</div></td>
      <td><span class="badge ${tipoBadge}">${tipo.label}</span> ${renovIcon ? '<span style="font-size:.75rem">'+renovIcon+'</span>' : ''}</td>
      <td><strong style="color:var(--green)">${fmtCurrency(c.valor_mensal)}</strong></td>
      <td><span style="font-size:.78rem;color:var(--text-secondary)">${freq}</span></td>
      <td><span style="font-size:.78rem">${vigencia}</span></td>
      <td><span style="font-size:.72rem;color:var(--text-muted)">${c.sla_resposta_horas}h / ${c.sla_resolucao_horas}h</span></td>
      <td><span class="badge ${statusBadge}">${c.status}</span></td>
      <td class="actions">
        <button class="btn-sm" data-on-click="editContrato('${c.id}')" title="Editar">✏️</button>
        ${c.status === 'Ativo' ? `<button class="btn-sm orange" data-on-click="cancelarContrato('${c.id}')" title="Cancelar">✕</button>` : `<button class="btn-sm success" data-on-click="ativarContrato('${c.id}')" title="Ativar">✓</button>`}
      </td>
    </tr>`;
  }).join('');
}

// ─── Contrato CRUD (Sprint 20 — Pop-up com busca autocomplete) ───
let _contratoOptionsCache = null;   // tipos, frequencias, servicos
let _clienteSelecionado = null;     // {id, nome, cnpj_cpf, ...}
let _clienteSearchTimer = null;
let _clienteSearchResults = [];
let _servicosMarcados = new Set();

async function openContratoModal() {
  try {
    // 1. Buscar opções (tipos, frequências, serviços) do backend
    if (!_contratoOptionsCache) {
      _contratoOptionsCache = await api('/api/contratos/options/tipos');
    }
    const opts = _contratoOptionsCache.data;

    // Popular dropdown de tipos
    const tipoSel = document.getElementById('ctTipo');
    tipoSel.innerHTML = '<option value="">Selecione…</option>' +
      opts.tipos.map(t => `<option value="${t.value}" data-sla-resp="${t.slaPadrao.resposta}" data-sla-sol="${t.slaPadrao.resolucao}" data-valor="${t.valorPadrao}">${t.label}</option>`).join('');

    // Popular checklist de serviços
    const srvList = document.getElementById('ctServicosList');
    srvList.innerHTML = opts.servicos.map(s => `
      <label style="display:flex; align-items:center; gap:6px; font-size:.82rem; cursor:pointer">
        <input type="checkbox" value="${s.id}" data-srv data-on-change="atualizarServicos()">
        <span>${s.label}</span>
      </label>
    `).join('');

    // 2. Resetar campos
    const fields = {
      'ctId': '', 'ctCliente': '', 'ctClienteSearch': '', 'ctTitulo': '',
      'ctValor': '', 'ctValorAnual': '', 'ctEquipamentos': '0',
      'ctDataInicio': '', 'ctDataFim': '', 'ctDesconto': '0', 'ctObs': '',
    };
    Object.entries(fields).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el) el.value = val;
    });
    _clienteSelecionado = null;
    _servicosMarcados = new Set();
    document.getElementById('ctClienteSelecionado').style.display = 'none';
    document.getElementById('clienteDropdown').style.display = 'none';
    document.getElementById('ctAlertaConflito').style.display = 'none';
    document.getElementById('ctErroVigencia').style.display = 'none';
    document.getElementById('ctTipoHint').textContent = 'Sugerido com base no histórico';
    document.getElementById('ctValorHint').textContent = 'Sugerido com base na média histórica';

    // Defaults
    document.getElementById('ctFrequencia').value = 'monthly';
    document.getElementById('ctSlaResposta').value = '8';
    document.getElementById('ctSlaResolucao').value = '48';
    document.getElementById('ctRenovacaoAuto').value = '0';
    document.getElementById('toggleRenovacao').classList.remove('on');

    // 3. Gerar próximo número de contrato
    try {
      const nxt = await api('/api/contratos/next-numero');
      document.getElementById('ctNumero').textContent = nxt.data.numero;
    } catch (_) {}

    document.getElementById('modalContratoTitle').textContent = '✚ Novo Contrato';
    document.getElementById('btnSaveCt').textContent = '💾 Salvar Contrato';
    openModal('modalContrato');
    setTimeout(() => document.getElementById('ctClienteSearch').focus(), 100);
  } catch (e) {
    console.error('Erro ao abrir modal de contrato:', e);
    toast('error', 'Erro ao abrir formulário: ' + e.message);
  }
}
window.openContratoModal = openContratoModal;

// ─── Autocomplete de cliente ───
function onClienteSearch(query) {
  clearTimeout(_clienteSearchTimer);
  if (!query || query.length < 2) {
    document.getElementById('clienteDropdown').style.display = 'none';
    return;
  }
  _clienteSearchTimer = setTimeout(async () => {
    try {
      // Tenta endpoint específico de busca (se houver) ou filtra cache
      let results = [];
      try {
        const d = await api(`/api/clientes?search=${encodeURIComponent(query)}`);
        results = d.data || [];
      } catch (_) {
        results = (clientesCache || []).filter(c =>
          (c.nome || '').toLowerCase().includes(query.toLowerCase()) ||
          (c.cnpj_cpf || '').includes(query) ||
          (c.email || '').toLowerCase().includes(query.toLowerCase())
        );
      }
      _clienteSearchResults = results.slice(0, 8);
      renderClienteDropdown(_clienteSearchResults);
    } catch (e) {
      console.error('Cliente search error:', e);
    }
  }, 200);
}

function showClienteDropdown() {
  const q = document.getElementById('ctClienteSearch').value;
  if (q && q.length >= 2 && _clienteSearchResults.length > 0) {
    document.getElementById('clienteDropdown').style.display = 'block';
  }
}

function hideClienteDropdown() {
  document.getElementById('clienteDropdown').style.display = 'none';
}

function renderClienteDropdown(clientes) {
  const dd = document.getElementById('clienteDropdown');
  if (!clientes || clientes.length === 0) {
    dd.innerHTML = '<div class="autocomplete-empty">Nenhum cliente encontrado. <a href="clients.html" style="color:var(--blue)">Cadastrar novo</a></div>';
    dd.style.display = 'block';
    return;
  }
  dd.innerHTML = clientes.map(c => `
    <div class="autocomplete-item" data-on-mousedown="selecionarCliente('${c.id}')">
      <div style="flex:1">
        <div class="nome">${escHtml(c.nome)}</div>
        <div class="email">${escHtml(c.email || '')}</div>
      </div>
      <div class="doc">${escHtml(c.cnpj_cpf || '')}</div>
    </div>
  `).join('');
  dd.style.display = 'block';
}

async function selecionarCliente(clienteId) {
  hideClienteDropdown();
  try {
    // Buscar dados + histórico via endpoint dedicado
    const d = await api(`/api/contratos/cliente/${clienteId}/historico`);
    const { cliente, contratos, contrato_ativo, estatisticas, sugestoes } = d.data;

    _clienteSelecionado = cliente;
    document.getElementById('ctCliente').value = cliente.id;
    document.getElementById('ctClienteSearch').value = cliente.nome;

    // Mostrar card
    document.getElementById('ctClienteSelecionado').style.display = 'block';
    document.getElementById('ctCliNome').textContent = cliente.nome || '';
    document.getElementById('ctCliDoc').textContent = cliente.cnpj_cpf || '—';
    document.getElementById('ctCliStatus').textContent = (cliente.ativo === 0 || cliente.ativo === false) ? 'INATIVO' : 'ATIVO';
    document.getElementById('ctCliTel').textContent = cliente.telefone || cliente.celular || '—';
    document.getElementById('ctCliEmail').textContent = cliente.email || '—';
    document.getElementById('ctCliEnd').textContent = (cliente.logradouro || '') + (cliente.cidade ? `, ${cliente.cidade}` : '');

    // Histórico
    const hist = [];
    if (contratos.length > 0) {
      const ultimo = contratos[0];
      hist.push(`<strong>Último contrato:</strong> ${escHtml(ultimo.tipo_contrato || '')} - R$ ${parseFloat(ultimo.valor_mensal || 0).toFixed(2)} (${ultimo.status || 'N/A'})`);
      if (contratos.length > 1) {
        hist.push(`<strong>Total de contratos:</strong> ${contratos.length}`);
      }
      if (estatisticas.tipo_mais_comum) {
        hist.push(`<strong>Tipo mais comum:</strong> ${estatisticas.tipo_mais_comum}`);
      }
    } else {
      hist.push('<em>Sem histórico de contratos — este será o primeiro.</em>');
    }
    document.getElementById('ctCliHistorico').innerHTML = hist.join(' • ');

    // Alerta de contrato ativo
    const alerta = document.getElementById('ctAlertaConflito');
    if (contrato_ativo) {
      alerta.innerHTML = `⚠️ <strong>Cliente já possui contrato ativo</strong> (${escHtml(contrato_ativo.id)}) até ${contrato_ativo.data_fim}. Considere encerrar o anterior antes de criar um novo.`;
      alerta.style.display = 'flex';
    } else {
      alerta.style.display = 'none';
    }

    // Aplicar sugestões inteligentes
    if (sugestoes.tipo_contrato) {
      const tipoOpt = Array.from(document.getElementById('ctTipo').options).find(o => o.value === sugestoes.tipo_contrato);
      if (tipoOpt) {
        document.getElementById('ctTipo').value = sugestoes.tipo_contrato;
        document.getElementById('ctTipoHint').textContent = `✨ Sugerido: ${tipoOpt.textContent} (mais comum no histórico)`;
      }
    }
    if (sugestoes.valor_mensal) {
      document.getElementById('ctValor').value = sugestoes.valor_mensal;
      document.getElementById('ctValorHint').textContent = `✨ Sugerido: R$ ${parseFloat(sugestoes.valor_mensal).toFixed(2)} (baseado na média dos contratos anteriores)`;
    }
    if (sugestoes.sla_resposta_horas) document.getElementById('ctSlaResposta').value = String(sugestoes.sla_resposta_horas);
    if (sugestoes.sla_resolucao_horas) document.getElementById('ctSlaResolucao').value = String(sugestoes.sla_resolucao_horas);
    if (sugestoes.servicos_recomendados) {
      _servicosMarcados = new Set(sugestoes.servicos_recomendados);
      document.querySelectorAll('input[data-srv]').forEach(cb => {
        cb.checked = _servicosMarcados.has(cb.value);
      });
    }

    // Auto-título
    if (!document.getElementById('ctTitulo').value) {
      const tipoLabel = tipoOpt ? tipoOpt.textContent : 'Contrato';
      document.getElementById('ctTitulo').value = `${tipoLabel} - ${cliente.nome}`;
    }

    // Datas padrão se vazias: hoje + 1 ano
    if (!document.getElementById('ctDataInicio').value) {
      const hoje = new Date();
      document.getElementById('ctDataInicio').value = hoje.toISOString().split('T')[0];
      const fim = new Date(hoje);
      fim.setFullYear(fim.getFullYear() + 1);
      document.getElementById('ctDataFim').value = fim.toISOString().split('T')[0];
    }
    calcAnual();
  } catch (e) {
    toast('error', 'Erro ao carregar cliente: ' + e.message);
  }
}

function atualizarServicos() {
  _servicosMarcados = new Set();
  document.querySelectorAll('input[data-srv]:checked').forEach(cb => _servicosMarcados.add(cb.value));
}

function onTipoChange() {
  const opt = document.getElementById('ctTipo').selectedOptions[0];
  if (opt && opt.dataset.slaResp) {
    document.getElementById('ctSlaResposta').value = opt.dataset.slaResp;
    document.getElementById('ctSlaResolucao').value = opt.dataset.slaSol;
    if (!document.getElementById('ctValor').value) {
      document.getElementById('ctValor').value = opt.dataset.valor;
      calcAnual();
    }
  }
  const cli = _clienteSelecionado;
  if (cli && !document.getElementById('ctTitulo').value.match(cli.nome)) {
    const tipoLabel = opt ? opt.textContent : 'Contrato';
    document.getElementById('ctTitulo').value = `${tipoLabel} - ${cli.nome}`;
  }
}

function calcAnual() {
  const valor = parseFloat(document.getElementById('ctValor').value) || 0;
  const desconto = parseFloat(document.getElementById('ctDesconto').value) || 0;
  const freq = document.getElementById('ctFrequencia').value;
  const mult = { monthly: 12, quarterly: 4, semiannual: 2, annual: 1, unique: 1 }[freq] || 12;
  const anual = valor * mult * (1 - desconto / 100);
  document.getElementById('ctValorAnual').value = anual.toFixed(2);
}

function validarVigencia() {
  const ini = document.getElementById('ctDataInicio').value;
  const fim = document.getElementById('ctDataFim').value;
  const err = document.getElementById('ctErroVigencia');
  if (ini && fim && new Date(fim) <= new Date(ini)) {
    err.style.display = 'block';
    return false;
  }
  err.style.display = 'none';
  return true;
}

function toggleRenovacao() {
  const t = document.getElementById('toggleRenovacao');
  const hidden = document.getElementById('ctRenovacaoAuto');
  t.classList.toggle('on');
  hidden.value = t.classList.contains('on') ? '1' : '0';
}

async function saveContrato() {
  // Validações
  if (!_clienteSelecionado || !document.getElementById('ctCliente').value) {
    toast('error', 'Selecione um cliente antes de salvar.');
    document.getElementById('ctClienteSearch').focus();
    return;
  }
  if (!validarVigencia()) {
    toast('error', 'Data de término deve ser posterior à data de início.');
    return;
  }
  const valor = parseFloat(document.getElementById('ctValor').value);
  if (!valor || valor <= 0) {
    toast('error', 'Valor mensal deve ser maior que zero.');
    return;
  }
  if (!document.getElementById('ctDataInicio').value || !document.getElementById('ctDataFim').value) {
    toast('error', 'Informe as datas de início e término.');
    return;
  }
  if (!document.getElementById('ctTipo').value) {
    toast('error', 'Selecione o tipo de contrato.');
    return;
  }

  // Montar body
  const body = {
    cliente_id: _clienteSelecionado.id,
    titulo: document.getElementById('ctTitulo').value.trim() || null,
    tipo_contrato: document.getElementById('ctTipo').value,
    valor_mensal: valor,
    valor_anual: parseFloat(document.getElementById('ctValorAnual').value) || null,
    frequencia_cobranca: document.getElementById('ctFrequencia').value,
    data_inicio: document.getElementById('ctDataInicio').value,
    data_fim: document.getElementById('ctDataFim').value,
    sla_resposta_horas: parseInt(document.getElementById('ctSlaResposta').value) || 24,
    sla_resolucao_horas: parseInt(document.getElementById('ctSlaResolucao').value) || 72,
    qtd_equipamentos_inclusos: parseInt(document.getElementById('ctEquipamentos').value) || 0,
    percentual_desconto: parseFloat(document.getElementById('ctDesconto').value) || 0,
    renovacao_automatica: document.getElementById('ctRenovacaoAuto').value === '1',
    observacoes: document.getElementById('ctObs').value.trim() || null,
    servicos: Array.from(_servicosMarcados),
    notificar_time: true,
  };

  const btn = document.getElementById('btnSaveCt');
  btn.disabled = true; btn.textContent = 'Salvando…';
  try {
    const r = await fetch('/api/contratos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const j = await r.json();
    if (!r.ok || !j.success) {
      throw new Error(j.error || 'Erro ao salvar');
    }
    toast('success', `✅ Contrato ${j.id} criado!`);
    if (j.aviso_contrato_ativo) {
      setTimeout(() => toast('error', j.aviso_contrato_ativo), 500);
    }
    closeModal('modalContrato');
    loadRmrKpis();
    loadContratos();
    loadVencendo();
  } catch(e) { toast('error', e.message); }
  finally { btn.disabled = false; btn.textContent = '💾 Salvar Contrato'; }
}

async function editContrato(id) {
  try {
    const d = await api(`/api/contratos/${id}`);
    const c = d.data;
    document.getElementById('ctId').value = c.id;
    document.getElementById('ctCliente').value = c.cliente_id || '';
    document.getElementById('ctClienteSearch').value = c.cliente_nome || '';
    _clienteSelecionado = { id: c.cliente_id, nome: c.cliente_nome, cnpj_cpf: c.cnpj_cpf, email: c.cliente_email };
    document.getElementById('ctClienteSelecionado').style.display = 'block';
    document.getElementById('ctCliNome').textContent = c.cliente_nome || '';
    document.getElementById('ctCliDoc').textContent = c.cnpj_cpf || '—';
    document.getElementById('ctCliTel').textContent = c.cliente_telefone || '—';
    document.getElementById('ctCliEmail').textContent = c.cliente_email || '—';
    document.getElementById('ctCliEnd').textContent = '';
    document.getElementById('ctTitulo').value = c.titulo || '';
    document.getElementById('ctTipo').value = c.tipo_contrato || 'empresarial';
    document.getElementById('ctValor').value = c.valor_mensal || '';
    document.getElementById('ctValorAnual').value = c.valor_anual || '';
    document.getElementById('ctFrequencia').value = c.frequencia_cobranca || 'monthly';
    document.getElementById('ctEquipamentos').value = c.qtd_equipamentos_inclusos || '';
    document.getElementById('ctDataInicio').value = c.data_inicio ? c.data_inicio.split('T')[0] : '';
    document.getElementById('ctDataFim').value = c.data_fim ? c.data_fim.split('T')[0] : '';
    document.getElementById('ctSlaResposta').value = c.sla_resposta_horas || '8';
    document.getElementById('ctSlaResolucao').value = c.sla_resolucao_horas || '48';
    document.getElementById('ctDesconto').value = c.percentual_desconto || '';
    document.getElementById('ctRenovacaoAuto').value = c.renovacao_automatica ? '1' : '0';
    document.getElementById('toggleRenovacao').classList.toggle('on', !!c.renovacao_automatica);
    document.getElementById('ctObs').value = c.observacoes || '';
    document.getElementById('modalContratoTitle').textContent = '✏ Editar Contrato';
    document.getElementById('btnSaveCt').textContent = '💾 Salvar Alterações';
    document.getElementById('ctNumero').textContent = c.id;
    openModal('modalContrato');
  } catch(e) { toast('error', e.message); }
}

async function cancelarContrato(id) {
  if (!confirm('Cancelar este contrato?')) return;
  try {
    await api(`/api/contratos/${id}`, { method: 'DELETE' });
    toast('success', 'Contrato cancelado.');
    loadRmrKpis();
    loadContratos();
    loadVencendo();
  } catch(e) { toast('error', e.message); }
}

async function ativarContrato(id) {
  try {
    await api(`/api/contratos/${id}/ativar`, { method: 'POST' });
    toast('success', 'Contrato ativado!');
    loadRmrKpis();
    loadContratos();
    loadVencendo();
  } catch(e) { toast('error', e.message); }
}

// ─── Renovações ───
async function loadVencendo() {
  try {
    const d = await api('/api/contratos/vencendo');
    const rows = d.data || [];
    const tbody = document.getElementById('tblVencendo');
    if (!rows.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><div class="icon">🎉</div><p>Nenhum contrato vencendo nos próximos 60 dias.</p></td></tr>'; return; }
    tbody.innerHTML = rows.map(c => {
      const dias = c.dias_restantes;
      const color = dias < 0 ? 'var(--red)' : dias <= 7 ? 'var(--orange)' : 'var(--text-primary)';
      const renovBadge = c.renovacao_automatica ? '<span class="badge bg-green">🔄 Sim</span>' : '<span class="badge bg-gray">Não</span>';
      return `<tr>
        <td><div style="font-weight:600">${escHtml(c.titulo || '–')}</div><div style="font-size:.72rem;color:var(--text-muted)">${escHtml(c.cliente_nome || '–')}</div></td>
        <td>${escHtml(c.cliente_nome || '–')}</td>
        <td><strong style="color:var(--green)">${fmtCurrency(c.valor_mensal)}</strong></td>
        <td>${fmtDate(c.data_fim)}</td>
        <td><span style="font-weight:700;color:${color}">${dias < 0 ? 'Vencido há ' + Math.abs(dias) + 'd' : dias + 'd'}</span></td>
        <td>${renovBadge}</td>
        <td class="actions">
          <button class="btn-sm" data-on-click="editContrato('${c.id}')">✏️ Renovar</button>
        </td>
      </tr>`;
    }).join('');
  } catch(e) { document.getElementById('tblVencendo').innerHTML = `<tr><td colspan="7" class="empty-state"><div class="icon">⚠️</div><p>Erro: ${escHtml(e.message)}</p></td></tr>`; }
}

// ─── RMR Charts ───
async function loadRmrCharts() {
  if (!rmrData) await loadRmrKpis();
  try {
    const [porPlano, historico] = await Promise.all([
      api('/api/contratos/rmr/por-plano'),
      api('/api/contratos/rmr/historico')
    ]);

    // Por Plano chart
    const planos = porPlano.data || [];
    if (chartPlano) chartPlano.destroy();
    chartPlano = new Chart(document.getElementById('chartPorPlano'), {
      type: 'doughnut',
      data: {
        labels: planos.map(p => TIPOS[p.tipo_contrato]?.label || p.tipo_contrato),
        datasets: [{
          data: planos.map(p => p.mrr || 0),
          backgroundColor: ['#8B949E','#00AEEF','#8b5cf6','#22c55e','#f59e0b'],
          borderWidth: 0,
        }]
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { color: '#8B949E', padding: 16, font: { size: 12 } } }, tooltip: { callbacks: { label: ctx => ctx.label + ': R$ ' + ctx.parsed.toLocaleString('pt-BR') } } } }
    });

    // Movimentação chart
    const hist = historico.data || [];
    if (chartMov) chartMov.destroy();
    chartMov = new Chart(document.getElementById('chartMovimentacao'), {
      type: 'bar',
      data: {
        labels: hist.map(h => h.mes),
        datasets: [
          { label: 'Novos Contratos', data: hist.map(h => h.novos_contratos), backgroundColor: '#22c55e' },
          { label: 'MRR Novo', data: hist.map(h => h.mrr_novo), backgroundColor: '#00AEEF', yAxisID: 'y1' }
        ]
      },
      options: { responsive: true, plugins: { legend: { labels: { color: '#8B949E', font: { size: 12 } } } }, scales: { x: { ticks: { color: '#8B949E' }, grid: { color: 'rgba(255,255,255,0.05)' } }, y: { ticks: { color: '#8B949E' }, grid: { color: 'rgba(255,255,255,0.05)' } }, y1: { position: 'right', ticks: { color: '#00AEEF' }, grid: { display: false } } } }
    });

    // Update summary stats
    const mrr = rmrData?.mrr || 0;
    document.getElementById('rmrMrr').textContent = fmtCurrency(mrr);
    document.getElementById('rmrArr').textContent = fmtCurrency(mrr * 12);
    document.getElementById('rmrNovo').textContent = fmtCurrency(rmrData?.novoMes || 0);
    document.getElementById('rmrChurn').textContent = fmtCurrency(rmrData?.churnedMes || 0);
    document.getElementById('rmrNrr').textContent = (rmrData?.nrr || 100) + '%';
    const ticket = planos.length ? (mrr / planos.reduce((s, p) => s + p.quantidade, 0)).toFixed(2) : '–';
    document.getElementById('rmrTicket').textContent = 'R$ ' + (typeof ticket === 'number' ? ticket.toLocaleString('pt-BR') : ticket);

    // Por plano table
    const totalMrr = planos.reduce((s, p) => s + (p.mrr || 0), 0);
    document.getElementById('tblPorPlano').innerHTML = planos.map(p => {
      const pct = totalMrr > 0 ? ((p.mrr / totalMrr) * 100).toFixed(1) : '0';
      return `<tr>
        <td><span class="badge bg-blue">${TIPOS[p.tipo_contrato]?.label || p.tipo_contrato}</span></td>
        <td>${p.quantidade}</td>
        <td><strong style="color:var(--green)">${fmtCurrency(p.mrr)}</strong></td>
        <td>${fmtCurrency(p.ticket_medio)}</td>
        <td><div style="display:flex;align-items:center;gap:8px"><div style="flex:1;height:5px;background:var(--border);border-radius:3px"><div style="height:100%;width:${pct}%;background:var(--blue);border-radius:3px"></div></div><span style="font-size:.78rem;color:var(--text-muted)">${pct}%</span></div></td>
      </tr>`;
    }).join('');
  } catch(e) { console.error('Charts error:', e); }
}

// ─── Helpers ───
function toggleRenovacao() {
  const el = document.getElementById('toggleRenovacao');
  const val = document.getElementById('ctRenovacaoAuto');
  const isOn = el.classList.toggle('on');
  val.value = isOn ? '1' : '0';
}

function onTipoChange() {
  const tipo = document.getElementById('ctTipo').value;
  const cfg = TIPOS[tipo] || {};
  if (!document.getElementById('ctSlaResposta').value)
    document.getElementById('ctSlaResposta').value = cfg.slaResposta || 24;
  if (!document.getElementById('ctSlaResolucao').value)
    document.getElementById('ctSlaResolucao').value = cfg.slaResolucao || 72;
}

function calcAnual() {
  const v = parseFloat(document.getElementById('ctValor').value);
  document.getElementById('ctValorAnual').value = v ? (v * 12).toFixed(2) : '';
}

function escHtml(s) { return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : ''; }
function fmtCurrency(v) { return 'R$ ' + (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtDate(d) { if (!d) return '–'; try { return new Date(d).toLocaleDateString('pt-BR'); } catch { return '–'; } }
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
document.getElementById('hamburger')?.addEventListener('click', () => document.getElementById('sidebar')?.classList.toggle('collapsed'));
