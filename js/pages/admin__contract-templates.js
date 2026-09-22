/* Extraido de admin/contract-templates.html por tools/csp-migrate.py (CSP sem unsafe-inline). */
/* ── gerado por tools/csp-migrate.py: nomes liberados para os data-on-* desta pagina ── */
;(function () {
  var s = window.__cspScope || (window.__cspScope = {});
  function def(n, g, st) { Object.defineProperty(s, n, { configurable: true, enumerable: true, get: g, set: st }); }
  def('$', function () { return typeof $ !== 'undefined' ? $ : undefined; }, function (v) { $ = v; });
  def('_gerarSigners', function () { return typeof _gerarSigners !== 'undefined' ? _gerarSigners : undefined; }, function (v) { _gerarSigners = v; });
  def('addSigner', function () { return typeof addSigner !== 'undefined' ? addSigner : undefined; }, function (v) { addSigner = v; });
  def('closeGerarModal', function () { return typeof closeGerarModal !== 'undefined' ? closeGerarModal : undefined; }, function (v) { closeGerarModal = v; });
  def('closeModal', function () { return typeof closeModal !== 'undefined' ? closeModal : undefined; }, function (v) { closeModal = v; });
  def('duplicate', function () { return typeof duplicate !== 'undefined' ? duplicate : undefined; }, function (v) { duplicate = v; });
  def('g', function () { return typeof g !== 'undefined' ? g : undefined; }, function (v) { g = v; });
  def('i', function () { return typeof i !== 'undefined' ? i : undefined; }, function (v) { i = v; });
  def('openCreateModal', function () { return typeof openCreateModal !== 'undefined' ? openCreateModal : undefined; }, function (v) { openCreateModal = v; });
  def('openEditModal', function () { return typeof openEditModal !== 'undefined' ? openEditModal : undefined; }, function (v) { openEditModal = v; });
  def('openGeradosModal', function () { return typeof openGeradosModal !== 'undefined' ? openGeradosModal : undefined; }, function (v) { openGeradosModal = v; });
  def('openGerarModal', function () { return typeof openGerarModal !== 'undefined' ? openGerarModal : undefined; }, function (v) { openGerarModal = v; });
  def('openPreview', function () { return typeof openPreview !== 'undefined' ? openPreview : undefined; }, function (v) { openPreview = v; });
  def('remove', function () { return typeof remove !== 'undefined' ? remove : undefined; }, function (v) { remove = v; });
  def('removeSigner', function () { return typeof removeSigner !== 'undefined' ? removeSigner : undefined; }, function (v) { removeSigner = v; });
  def('render', function () { return typeof render !== 'undefined' ? render : undefined; }, function (v) { render = v; });
  def('saveTemplate', function () { return typeof saveTemplate !== 'undefined' ? saveTemplate : undefined; }, function (v) { saveTemplate = v; });
  def('seedDefaults', function () { return typeof seedDefaults !== 'undefined' ? seedDefaults : undefined; }, function (v) { seedDefaults = v; });
  def('submitGerar', function () { return typeof submitGerar !== 'undefined' ? submitGerar : undefined; }, function (v) { submitGerar = v; });
  def('syncStatus', function () { return typeof syncStatus !== 'undefined' ? syncStatus : undefined; }, function (v) { syncStatus = v; });
})();
/* ── fim do bloco gerado ── */

// ═══════════════════════════════════════════════════════════════════════
// ESTADO
// ═══════════════════════════════════════════════════════════════════════
const API = '/api/contract-templates';
let templates = [];
let currentEdit = null; // null = criando, id = editando
let currentTab = 'basic';

// ═══════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════
async function init() {
    const session = JSON.parse(sessionStorage.getItem('rcrm_session') || '{}');
    if (!session.userId) { window.location.href = '../index.html'; return; }
    if (!['admin', 'superadmin'].includes(session.role)) {
        alert('Acesso restrito a admin/superadmin');
        window.location.href = 'dashboard.html';
        return;
    }
    document.getElementById('authBadge').textContent = `${session.name} (${session.role})`;
    await load();
}

async function load() {
    try {
        // Inicializa como array vazio para evitar erro de .filter(undefined)
        templates = [];
        const r = await fetch(API, { headers: authHeader() });
        const d = await r.json();
        if (d && Array.isArray(d.data)) {
            templates = d.data;
        } else if (d && d.error) {
            console.warn('[Templates] API error:', d.error);
            toast('Aviso: ' + d.error, 'error');
        } else if (!r.ok) {
            console.warn('[Templates] HTTP ' + r.status);
            toast('Servidor retornou ' + r.status, 'error');
        }
        render();
    } catch (e) {
        console.error('[Templates] load error:', e);
        toast('Erro ao carregar templates: ' + (e.message || 'verifique conexão'), 'error');
        // Garante array vazio para o render() não quebrar
        templates = [];
        render();
    }
}

function authHeader() {
    const token = sessionStorage.getItem('rcrm_token') || '';
    return token ? { 'Authorization': `Bearer ${token}` } : {};
}

function render() {
    const search = (document.getElementById('search').value || '').toLowerCase();
    const cat = document.getElementById('filterCategoria').value;
    // Garante array — defensive coding
    const safe = Array.isArray(templates) ? templates : [];
    const filtered = safe.filter(t => {
        if (cat && t.categoria !== cat) return false;
        const nome = (t.nome || '').toLowerCase();
        const slug = (t.slug || '').toLowerCase();
        if (search && !nome.includes(search) && !slug.includes(search)) return false;
        return true;
    });

    const list = document.getElementById('templateList');
    if (filtered.length === 0) {
        list.innerHTML = `<div style="text-align:center; padding: 60px 20px; color: var(--text-muted); background: var(--bg-card); border-radius: 12px;">
            <h3 style="color: var(--text-secondary);">Nenhum template encontrado</h3>
            <p>Clique em "+ Novo template" para criar, ou em "Importar padrões" para começar.</p>
        </div>`;
        return;
    }
    list.innerHTML = filtered.map(t => `
        <div class="template-card ${t.ativo ? '' : 'inactive'}">
            <div class="info">
                <h3>${escapeHtml(t.nome)} <span class="category-tag">${t.categoria || 'geral'}</span>
                    <span class="status-tag ${t.ativo ? 'ativo' : 'inativo'}">${t.ativo ? 'ATIVO' : 'INATIVO'}</span>
                </h3>
                <div class="slug">${t.slug} <span style="color: var(--text-muted)">· v${t.versao}</span></div>
                <div class="meta">
                    <span>📦 ${(t.html_size / 1024).toFixed(1)} KB</span>
                    <span>📅 ${new Date(t.updated_at).toLocaleDateString('pt-BR')}</span>
                    ${t.tipo_contrato ? `<span>🏷️ ${escapeHtml(t.tipo_contrato)}</span>` : ''}
                </div>
                ${t.descricao ? `<p style="color: var(--text-secondary); font-size: .85rem; margin: 6px 0 0;">${escapeHtml(t.descricao)}</p>` : ''}
            </div>
            <div class="actions">
                <button class="btn btn-sm" data-on-click="openPreview('${t.id}')">👁️ Preview</button>
                <button class="btn btn-sm btn-secondary" data-on-click="openEditModal('${t.id}')">✏️ Editar</button>
                <button class="btn btn-sm btn-secondary" data-on-click="duplicate('${t.id}')">📋 Duplicar</button>
                <button class="btn btn-sm" style="background: linear-gradient(135deg, #10b981, #059669); color: white;" data-on-click="openGerarModal('${t.id}', '${escapeHtml(t.nome).replace(/'/g, "\\'")}')">📄 Gerar Contrato</button>
                <button class="btn btn-sm btn-danger" data-on-click="remove('${t.id}')">🗑️</button>
            </div>
        </div>
    `).join('');
}

function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ═══════════════════════════════════════════════════════════════════════
// MODAL
// ═══════════════════════════════════════════════════════════════════════
function openCreateModal() {
    currentEdit = null;
    document.getElementById('modalTitle').textContent = 'Novo Template';
    ['nome','slug','categoria','tipo','descricao','html','css'].forEach(id => {
        document.getElementById('tpl-'+id).value = '';
    });
    document.getElementById('tpl-categoria').value = 'geral';
    switchTab('basic');
    document.getElementById('editModal').classList.add('active');
}

async function openEditModal(id) {
    const tpl = templates.find(t => t.id === id);
    if (!tpl) return;
    currentEdit = id;
    document.getElementById('modalTitle').textContent = `Editar: ${tpl.nome}`;
    document.getElementById('tpl-nome').value = tpl.nome || '';
    document.getElementById('tpl-slug').value = tpl.slug || '';
    document.getElementById('tpl-categoria').value = tpl.categoria || 'geral';
    document.getElementById('tpl-tipo').value = tpl.tipo_contrato || '';
    document.getElementById('tpl-descricao').value = tpl.descricao || '';
    document.getElementById('tpl-html').value = tpl.html_content || '';
    document.getElementById('tpl-css').value = tpl.css_content || '';
    switchTab('basic');
    document.getElementById('editModal').classList.add('active');
    detectVars();
}

function closeModal() {
    document.getElementById('editModal').classList.remove('active');
    currentEdit = null;
}

// Tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});
function switchTab(name) {
    currentTab = name;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    if (name === 'vars') detectVars();
}

// Detecta variáveis no HTML
async function detectVars() {
    const html = document.getElementById('tpl-html').value;
    if (!html) {
        document.getElementById('varsList').textContent = 'Cole HTML na aba anterior para detectar variáveis.';
        return;
    }
    try {
        const r = await fetch(`${API}/extract-vars`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader() },
            body: JSON.stringify({ html }),
        });
        const d = await r.json();
        const vars = d.variables || [];
        if (vars.length === 0) {
            document.getElementById('varsList').innerHTML = '<em style="color: var(--text-muted)">Nenhuma variável detectada.</em>';
            return;
        }
        document.getElementById('varsList').innerHTML = `
            <strong style="color: var(--text-primary)">${vars.length} variáveis:</strong><br>
            ${vars.map(v => `<code>{{${v}}}</code>`).join(' ')}
            <hr style="border-color: var(--border); margin: 12px 0;">
            <em style="color: var(--text-muted)">Variáveis disponíveis no sistema:</em><br>
            <code>{{contrato.id}}</code> <code>{{contrato.titulo}}</code> <code>{{contrato.valor_mensal_fmt}}</code>
            <code>{{contrato.data_inicio_fmt}}</code> <code>{{contrato.data_fim_fmt}}</code> <code>{{dias_contrato}}</code>
            <code>{{cliente.nome}}</code> <code>{{cliente.email}}</code> <code>{{cliente.cnpj_cpf}}</code>
            <code>{{cliente.endereco}}</code> <code>{{empresa.nome}}</code> <code>{{empresa.cnpj}}</code>
            <code>{{hoje}}</code> <code>{{hoje_extenso}}</code> <code>{{valor_extenso}}</code>
        `;
    } catch (e) {
        document.getElementById('varsList').textContent = 'Erro: ' + e.message;
    }
}

// ═══════════════════════════════════════════════════════════════════════
// CRUD
// ═══════════════════════════════════════════════════════════════════════
async function saveTemplate() {
    const data = {
        nome: document.getElementById('tpl-nome').value.trim(),
        slug: document.getElementById('tpl-slug').value.trim(),
        categoria: document.getElementById('tpl-categoria').value,
        tipo_contrato: document.getElementById('tpl-tipo').value.trim() || null,
        descricao: document.getElementById('tpl-descricao').value.trim() || null,
        html_content: document.getElementById('tpl-html').value,
        css_content: document.getElementById('tpl-css').value || null,
    };

    if (!data.nome || !data.slug || !data.html_content) {
        toast('Preencha nome, slug e HTML', 'error');
        return;
    }

    try {
        let r;
        if (currentEdit) {
            r = await fetch(`${API}/${currentEdit}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', ...authHeader() },
                body: JSON.stringify(data),
            });
        } else {
            r = await fetch(API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeader() },
                body: JSON.stringify(data),
            });
        }
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Erro');
        toast(currentEdit ? 'Template atualizado!' : 'Template criado!', 'success');
        closeModal();
        await load();
    } catch (e) {
        toast('Erro: ' + e.message, 'error');
    }
}

async function duplicate(id) {
    if (!confirm('Duplicar este template?')) return;
    try {
        const r = await fetch(`${API}/${id}/duplicate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader() },
            body: JSON.stringify({}),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        toast('Duplicado: ' + d.template.slug, 'success');
        await load();
    } catch (e) {
        toast('Erro: ' + e.message, 'error');
    }
}

async function remove(id) {
    if (!confirm('Desativar este template? (soft delete)')) return;
    try {
        const r = await fetch(`${API}/${id}`, { method: 'DELETE', headers: authHeader() });
        if (!r.ok) { const d = await r.json(); throw new Error(d.error); }
        toast('Template desativado', 'success');
        await load();
    } catch (e) {
        toast('Erro: ' + e.message, 'error');
    }
}

// ═══════════════════════════════════════════════════════════════════════
// SPRINT 21 — GERAR CONTRATO + ENVIAR PARA AUTENTIQUE
// ═══════════════════════════════════════════════════════════════════════
let _gerarTemplateId = null;
let _gerarTemplateNome = null;
let _gerarClientes = [];
let _gerarContratos = [];
let _gerarSigners = [{ email: '', name: '' }];

async function openGerarModal(templateId, templateNome) {
    _gerarTemplateId = templateId;
    _gerarTemplateNome = templateNome;
    document.getElementById('gerar-subtitle').textContent = `Template: ${templateNome}`;
    document.getElementById('gerarModal').classList.add('active');
    document.getElementById('ger-result').style.display = 'none';
    _gerarSigners = [{ email: '', name: '' }];
    renderSigners();
    await Promise.all([loadGerarClientes(), loadGerarContratos()]);
}

function closeGerarModal() {
    document.getElementById('gerarModal').classList.remove('active');
    _gerarTemplateId = null;
}

async function loadGerarClientes() {
    try {
        const r = await fetch('/api/clientes?limit=200', { headers: authHeader() });
        const d = await r.json();
        _gerarClientes = Array.isArray(d.data) ? d.data : [];
        const sel = document.getElementById('ger-cliente');
        sel.innerHTML = '<option value="">Selecione...</option>' +
            _gerarClientes.map(c => `<option value="${c.id}">${escapeHtml(c.nome)} ${c.cnpj || c.cnpj_cpf ? '(' + (c.cnpj || c.cnpj_cpf) + ')' : ''}</option>`).join('');
    } catch (e) {
        console.error('Erro ao carregar clientes:', e);
    }
}

async function loadGerarContratos() {
    try {
        const r = await fetch('/api/contratos?limit=100', { headers: authHeader() });
        const d = await r.json();
        _gerarContratos = Array.isArray(d.data) ? d.data : [];
        const sel = document.getElementById('ger-contrato');
        sel.innerHTML = '<option value="">Sem contrato vinculado</option>' +
            _gerarContratos.map(c => `<option value="${c.id}">${escapeHtml(c.titulo || c.id)} - R$ ${(c.valor_mensal || 0).toFixed(2)}</option>`).join('');
    } catch (e) {
        console.error('Erro ao carregar contratos:', e);
    }
}

function renderSigners() {
    const container = document.getElementById('ger-signers');
    container.innerHTML = _gerarSigners.map((s, i) => `
        <div style="display: grid; grid-template-columns: 1fr 1fr auto; gap: 8px; align-items: center;">
            <input type="text" placeholder="Nome" value="${escapeHtml(s.name)}" data-on-input="_gerarSigners[${i}].name = this.value">
            <input type="email" placeholder="email@exemplo.com" value="${escapeHtml(s.email)}" data-on-input="_gerarSigners[${i}].email = this.value">
            <button class="btn btn-sm btn-danger" data-on-click="removeSigner(${i})" type="button" title="Remover">✕</button>
        </div>
    `).join('');
}

function addSigner() {
    _gerarSigners.push({ email: '', name: '' });
    renderSigners();
}

function removeSigner(i) {
    if (_gerarSigners.length > 1) {
        _gerarSigners.splice(i, 1);
        renderSigners();
    }
}

async function submitGerar() {
    if (!_gerarTemplateId) return;
    const clienteId = document.getElementById('ger-cliente').value;
    if (!clienteId) { toast('Selecione um cliente', 'error'); return; }

    const signers = _gerarSigners.filter(s => s.email && s.name);
    const enviarAutentique = document.getElementById('ger-enviar').checked;

    const btn = document.getElementById('ger-btn-submit');
    btn.disabled = true;
    btn.textContent = '⏳ Gerando...';

    try {
        const r = await fetch(`${API}/gerar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader() },
            body: JSON.stringify({
                template_id: _gerarTemplateId,
                cliente_id: clienteId,
                contrato_id: document.getElementById('ger-contrato').value || null,
                enviar_autentique: enviarAutentique,
                signers: signers,
            }),
        });
        const d = await r.json();
        if (!r.ok || !d.success) throw new Error(d.error || 'Erro ao gerar');

        // Mostrar resultado
        const resultDiv = document.getElementById('ger-result');
        resultDiv.style.display = 'block';
        let html = `<strong>✅ Contrato gerado: ${d.id}</strong><br>`;
        if (d.documento) {
            html += `Status: <strong>${d.documento.status}</strong><br>`;
        }
        if (d.autentique) {
            html += `Autentique: <a href="${d.autentique.short_url}" target="_blank">${d.autentique.short_url}</a><br>`;
            html += `Doc ID: ${d.autentique.id}<br>`;
        }
        if (d.aviso) html += `<span style="color: var(--orange)">⚠️ ${d.aviso}</span><br>`;
        resultDiv.innerHTML = html;
        toast('Contrato gerado com sucesso!', 'success');
        await load();
    } catch (e) {
        toast('Erro: ' + e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '📄 Gerar Contrato';
    }
}

async function openGeradosModal() {
    document.getElementById('geradosModal').classList.add('active');
    const list = document.getElementById('gerados-list');
    list.innerHTML = '<p style="text-align:center;color:var(--text-muted)">Carregando...</p>';
    try {
        const r = await fetch(`${API}/contratos-gerados?limit=50`, { headers: authHeader() });
        const d = await r.json();
        if (!d.success) throw new Error(d.error);
        const items = d.data || [];
        if (items.length === 0) {
            list.innerHTML = '<p style="text-align:center;padding:32px;color:var(--text-muted)">Nenhum contrato gerado ainda. Clique em "Gerar Contrato" em um template para começar.</p>';
            return;
        }
        const statusBadge = {
            'pendente': '⏳ Pendente',
            'enviado': '📤 Enviado',
            'assinado': '✅ Assinado',
            'rejeitado': '❌ Rejeitado',
            'cancelado': '🚫 Cancelado',
            'erro': '⚠️ Erro',
        };
        list.innerHTML = `
            <table style="width:100%;border-collapse:collapse;font-size:.85rem;">
                <thead>
                    <tr style="border-bottom:1px solid var(--border);text-align:left;">
                        <th style="padding:8px">ID</th>
                        <th style="padding:8px">Documento</th>
                        <th style="padding:8px">Cliente</th>
                        <th style="padding:8px">Status</th>
                        <th style="padding:8px">Enviado</th>
                        <th style="padding:8px">Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${items.map(cg => `
                        <tr style="border-bottom:1px solid var(--border);">
                            <td style="padding:8px;font-family:monospace;font-size:.75rem">${cg.id}</td>
                            <td style="padding:8px">${escapeHtml(cg.nome_documento)}</td>
                            <td style="padding:8px">${escapeHtml(cg.cliente_nome || '—')}</td>
                            <td style="padding:8px">${statusBadge[cg.status] || cg.status}</td>
                            <td style="padding:8px;font-size:.75rem;color:var(--text-muted)">${cg.data_envio ? new Date(cg.data_envio).toLocaleString('pt-BR') : '—'}</td>
                            <td style="padding:8px">
                                ${cg.autentique_short_url ? `<a href="${cg.autentique_short_url}" target="_blank" class="btn btn-sm">🔗 Abrir</a>` : ''}
                                <button class="btn btn-sm btn-secondary" data-on-click="syncStatus('${cg.id}')">🔄 Sync</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } catch (e) {
        list.innerHTML = `<p style="color:var(--orange)">Erro: ${e.message}</p>`;
    }
}

async function syncStatus(id) {
    try {
        const r = await fetch(`${API}/contratos-gerados/${id}/status`, { headers: authHeader() });
        const d = await r.json();
        if (d.success) {
            toast(`Status sincronizado: ${d.status}`, 'success');
            openGeradosModal(); // refresh
        } else {
            toast('Erro: ' + d.error, 'error');
        }
    } catch (e) {
        toast('Erro: ' + e.message, 'error');
    }
}

async function seedDefaults() {
    if (!confirm('Importar templates padrão (manutenção, PMOC)? Templates já existentes não serão sobrescritos.')) return;
    try {
        const r = await fetch(`${API}/seed`, { method: 'POST', headers: authHeader() });
        const d = await r.json();
        toast(`${d.results.filter(x => x.status === 'criado').length} templates criados`, 'success');
        await load();
    } catch (e) {
        toast('Erro: ' + e.message, 'error');
    }
}

// Preview
async function openPreview(id) {
    const tpl = templates.find(t => t.id === id);
    if (!tpl) return;
    // Pega primeiro cliente do banco (mock) — em prod, abrir seletor
    const sample = {
        contrato: { id: tpl.id, titulo: tpl.nome, valor_mensal: 350, data_inicio: '2026-09-01', data_fim: '2027-08-31' },
        cliente: { nome: 'Cliente Exemplo LTDA', email: 'cliente@exemplo.com', telefone: '(11) 99999-9999', cnpj_cpf: '12.345.678/0001-90', endereco: 'Rua Teste, 100', cidade: 'São Paulo', estado: 'SP' },
        empresa: { nome: 'Renostter Climatização', cnpj: '11.222.333/0001-44', endereco: 'Av. Brasil, 1000', cidade: 'São Paulo', estado: 'SP' },
    };

    // Abre janela com o HTML renderizado
    const w = window.open('', '_blank', 'width=900,height=800');
    w.document.write(`
<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Preview: ${tpl.nome}</title>
<style>body { font-family: 'Inter', sans-serif; padding: 0; margin: 0; background: #f5f5f5; }
.preview-header { background: #0a0e14; color: #fff; padding: 14px 24px; font-family: 'Inter', sans-serif; }
.preview-content { background: #fff; max-width: 800px; margin: 24px auto; padding: 40px; box-shadow: 0 4px 24px rgba(0,0,0,.1); }
</style></head><body>
<div class="preview-header">📄 Preview: ${tpl.nome} <span style="color:#aaa;font-size:.85em">v${tpl.versao}</span></div>
<div class="preview-content"><div id="content">Carregando...</div></div>
</body></html>`);
    w.document.close();

    try {
        const r = await fetch(`${API}/${id}/render`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader() },
            body: JSON.stringify({ data: sample }),
        });
        const d = await r.json();
        if (d.success) {
            w.document.getElementById('content').innerHTML = d.html;
        } else {
            w.document.getElementById('content').innerHTML = 'Erro: ' + d.error;
        }
    } catch (e) {
        w.document.getElementById('content').innerHTML = 'Erro: ' + e.message;
    }
}

function toast(msg, type = 'success') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = `toast show ${type}`;
    setTimeout(() => t.classList.remove('show'), 3000);
}

// Detecta vars automaticamente ao colar HTML
document.getElementById('tpl-html').addEventListener('input', () => {
    if (currentTab === 'vars') detectVars();
});

init();
