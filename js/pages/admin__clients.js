/* Extraido de admin/clients.html por tools/csp-migrate.py (CSP sem unsafe-inline). */
/* ── gerado por tools/csp-migrate.py: nomes liberados para os data-on-* desta pagina ── */
;(function () {
  var s = window.__cspScope || (window.__cspScope = {});
  function def(n, g, st) { Object.defineProperty(s, n, { configurable: true, enumerable: true, get: g, set: st }); }
  def('$', function () { return typeof $ !== 'undefined' ? $ : undefined; }, function (v) { $ = v; });
  def('auth', function () { return typeof auth !== 'undefined' ? auth : undefined; }, function (v) { auth = v; });
  def('closeModal', function () { return typeof closeModal !== 'undefined' ? closeModal : undefined; }, function (v) { closeModal = v; });
  def('currentPage', function () { return typeof currentPage !== 'undefined' ? currentPage : undefined; }, function (v) { currentPage = v; });
  def('deleteClient', function () { return typeof deleteClient !== 'undefined' ? deleteClient : undefined; }, function (v) { deleteClient = v; });
  def('deleteDoc', function () { return typeof deleteDoc !== 'undefined' ? deleteDoc : undefined; }, function (v) { deleteDoc = v; });
  def('downloadDoc', function () { return typeof downloadDoc !== 'undefined' ? downloadDoc : undefined; }, function (v) { downloadDoc = v; });
  def('editClient', function () { return typeof editClient !== 'undefined' ? editClient : undefined; }, function (v) { editClient = v; });
  def('exportClients', function () { return typeof exportClients !== 'undefined' ? exportClients : undefined; }, function (v) { exportClients = v; });
  def('handleDocDrop', function () { return typeof handleDocDrop !== 'undefined' ? handleDocDrop : undefined; }, function (v) { handleDocDrop = v; });
  def('handleDocFileSelect', function () { return typeof handleDocFileSelect !== 'undefined' ? handleDocFileSelect : undefined; }, function (v) { handleDocFileSelect = v; });
  def('i', function () { return typeof i !== 'undefined' ? i : undefined; }, function (v) { i = v; });
  def('openNewClient', function () { return typeof openNewClient !== 'undefined' ? openNewClient : undefined; }, function (v) { openNewClient = v; });
  def('pendingDocs', function () { return typeof pendingDocs !== 'undefined' ? pendingDocs : undefined; }, function (v) { pendingDocs = v; });
  def('removePending', function () { return typeof removePending !== 'undefined' ? removePending : undefined; }, function (v) { removePending = v; });
  def('renderTable', function () { return typeof renderTable !== 'undefined' ? renderTable : undefined; }, function (v) { renderTable = v; });
  def('saveClient', function () { return typeof saveClient !== 'undefined' ? saveClient : undefined; }, function (v) { saveClient = v; });
  def('startReplaceDoc', function () { return typeof startReplaceDoc !== 'undefined' ? startReplaceDoc : undefined; }, function (v) { startReplaceDoc = v; });
  def('switchTab', function () { return typeof switchTab !== 'undefined' ? switchTab : undefined; }, function (v) { switchTab = v; });
  def('toggleStatus', function () { return typeof toggleStatus !== 'undefined' ? toggleStatus : undefined; }, function (v) { toggleStatus = v; });
  def('viewDetail', function () { return typeof viewDetail !== 'undefined' ? viewDetail : undefined; }, function (v) { viewDetail = v; });
})();
/* ── fim do bloco gerado ── */

        const session = auth.protect(['admin', 'superadmin']);

        let editingId = null;
        let currentPage = 1;
        const PER_PAGE = 10;
        const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB
        const ALLOWED_TYPES = ['application/pdf', 'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.oasis.opendocument.text',
            'image/jpeg', 'image/png'];
        const SERVICOS_LIST = ['Instalação', 'Manutenção Preventiva', 'Manutenção Corretiva',
            'Higienização', 'Recarga de Gás', 'PMOC', 'Remoção/Reinstalação', 'Contrato de Manutenção'];

        // Pending uploads queue [ { file, name, description, base64 } ]
        let pendingDocs = [];

        // Build servicos checkboxes
        document.getElementById('servicosCheckboxes').innerHTML = SERVICOS_LIST.map(s =>
            `<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:0.85rem">
      <input type="checkbox" class="svc-check" value="${s}" style="cursor:pointer"> ${s}
    </label>`).join('');

        /* ─── File icon helper ─── */
        function fileIcon(type) {
            if (type === 'application/pdf') return '📄';
            if (type?.includes('image')) return '🖼️';
            if (type?.includes('word') || type?.includes('odt')) return '📝';
            return '📎';
        }

        /* ─── Format file size ─── */
        function fmtSize(bytes) {
            if (!bytes) return '—';
            if (bytes < 1024) return bytes + ' B';
            if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
            return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        }

        /* ─── KPIs ─── */
        function loadKpis() {
            const clients = db.get('clients');
            const docs = db.get('documents');
            const clientsWithDoc = new Set(docs.map(d => d.clientId));
            const activeClients = clients.filter(c => c.status === 'ativo');
            const withoutDoc = activeClients.filter(c => !clientsWithDoc.has(c.id)).length;
            document.getElementById('clientKpis').innerHTML = [
                { label: 'Total Clientes', value: clients.length, icon: '👥', cls: 'blue' },
                { label: 'Ativos', value: activeClients.length, icon: '✅', cls: 'green' },
                { label: 'Inativos', value: clients.filter(c => c.status === 'inativo').length, icon: '⏸', cls: 'gray' },
                { label: 'Sem doc. digital', value: withoutDoc, icon: '⚠️', cls: 'yellow', title: 'Clientes ativos sem contrato digitalizado' },
            ].map(k => `<div class="kpi-card" ${k.title ? `title="${k.title}"` : ''}>
      <div class="kpi-info"><div class="kpi-label">${k.label}</div><div class="kpi-value">${k.value}</div></div>
      <div class="kpi-icon ${k.cls}" style="font-size:1.3rem">${k.icon}</div></div>`).join('');
        }

        /* ─── Filtered list ─── */
        function getFiltered() {
            const q = document.getElementById('searchInput').value.toLowerCase();
            const st = document.getElementById('fFilterStatus').value;
            const docFilter = document.getElementById('fFilterDoc').value;
            const docs = db.get('documents');
            const clientsWithDoc = new Set(docs.map(d => d.clientId));
            return db.get('clients').filter(c => {
                const matchQ = !q || (c.razaoSocial?.toLowerCase().includes(q) || c.fantasia?.toLowerCase().includes(q) || c.cnpj?.toLowerCase().includes(q) || c.contato?.toLowerCase().includes(q));
                const matchS = !st || c.status === st;
                const hasDoc = clientsWithDoc.has(c.id);
                const matchD = !docFilter || (docFilter === 'com' ? hasDoc : !hasDoc);
                return matchQ && matchS && matchD;
            });
        }

        /* ─── Render table ─── */
        function renderTable() {
            const data = getFiltered();
            const start = (currentPage - 1) * PER_PAGE;
            const page = data.slice(start, start + PER_PAGE);
            const docs = db.get('documents');
            const clientsWithDoc = new Set(docs.map(d => d.clientId));

            document.getElementById('clientsTable').innerHTML = page.length ? page.map(c => {
                const hasDoc = clientsWithDoc.has(c.id);
                const docCount = docs.filter(d => d.clientId === c.id).length;
                const docBadge = hasDoc
                    ? `<span class="doc-badge" data-on-click="viewDetail('${c.id}');event.stopPropagation()" title="Ver documentos">📎 ${docCount}</span>`
                    : `<span class="doc-badge-none" title="Sem contrato digitalizado">⚠️</span>`;
                return `<tr data-on-click="viewDetail('${c.id}')" style="cursor:pointer">
          <td><div style="font-weight:600">${esc(c.fantasia || c.razaoSocial)}</div><div style="font-size:0.72rem;color:var(--text-secondary)">${esc(c.razaoSocial)}</div></td>
          <td class="td-muted">${esc(c.cnpj || '—')}</td>
          <td><div>${esc(c.contato || '—')}</div><div style="font-size:0.72rem;color:var(--text-secondary)">${esc(c.email || '')}</div></td>
          <td class="td-muted" style="font-size:0.75rem;max-width:140px">${(c.servicos || []).slice(0, 2).map(s => `<span class="badge badge-gray" style="font-size:0.65rem;margin:1px">${esc(s)}</span>`).join('') || '—'}${(c.servicos || []).length > 2 ? `<span style="color:var(--text-muted);font-size:0.72rem"> +${c.servicos.length - 2}</span>` : ''}</td>
          <td>${docBadge}</td>
          <td>${badgeClientStatus(c.status)}</td>
          <td class="td-muted">${fmt.date(c.createdAt)}</td>
          <td><div class="td-actions" data-on-click="event.stopPropagation()">
            <button class="btn btn-ghost btn-sm btn-icon" title="Editar" data-on-click="editClient('${c.id}')">✏️</button>
            <button class="btn btn-ghost btn-sm btn-icon" title="${c.status === 'ativo' ? 'Inativar' : 'Reativar'}" data-on-click="toggleStatus('${c.id}','${c.status}')">${c.status === 'ativo' ? '⏸' : '▶️'}</button>
            <button class="btn btn-danger btn-sm btn-icon" title="Excluir" data-on-click="deleteClient('${c.id}')">🗑</button>
          </div></td>
        </tr>`;
            }).join('') : `<tr><td colspan="8"><div class="empty-state"><h4>Nenhum cliente encontrado</h4><p>Tente ajustar os filtros ou cadastre um novo cliente.</p></div></td></tr>`;

            const pages = Math.ceil(data.length / PER_PAGE);
            document.getElementById('paginInfo').textContent = data.length ? `${Math.min(start + 1, data.length)}–${Math.min(start + PER_PAGE, data.length)} de ${data.length}` : '';
            document.getElementById('paginBtns').innerHTML = Array.from({ length: pages }, (_, i) =>
                `<button class="page-btn ${i + 1 === currentPage ? 'active' : ''}" data-on-click="currentPage=${i + 1};renderTable()">${i + 1}</button>`).join('');
        }

        /* ─── Open New Client ─── */
        function openNewClient() {
            editingId = null;
            pendingDocs = [];
            resetForm();
            renderPendingDocList();
            document.getElementById('docSavedSection').style.display = 'none';
            openModal('modalClient');
        }

        /* ─── Reset Form ─── */
        function resetForm() {
            ['fRazao', 'fFantasia', 'fCnpj', 'fEmail', 'fTelefone', 'fCelular', 'fContato', 'fCargo', 'fSituacao', 'fCep', 'fLogradouro', 'fNumero', 'fCompl', 'fBairro', 'fCidade', 'fObs'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
            document.getElementById('fStatus').value = 'ativo';
            document.getElementById('fUf').value = 'SP';
            document.querySelectorAll('.svc-check').forEach(cb => cb.checked = false);
            switchTab('tabBasico', document.querySelector('.tab-btn'));
            document.getElementById('modalClientTitle').textContent = 'Novo Cliente';
            document.getElementById('tabDocCount').textContent = '';
            document.getElementById('docFileInput').value = '';
        }

        /* ─── Edit Client ─── */
        function editClient(id) {
            editingId = id;
            pendingDocs = [];
            const c = db.find('clients', id); if (!c) return;
            document.getElementById('modalClientTitle').textContent = 'Editar Cliente';
            const map = { fRazao: 'razaoSocial', fFantasia: 'fantasia', fCnpj: 'cnpj', fEmail: 'email', fTelefone: 'telefone', fCelular: 'celular', fContato: 'contato', fCargo: 'cargo', fSituacao: 'situacaoCadastral', fCep: 'cep', fLogradouro: 'logradouro', fNumero: 'numero', fCompl: 'complemento', fBairro: 'bairro', fCidade: 'cidade', fObs: 'observacoes' };
            Object.entries(map).forEach(([id, field]) => { const el = document.getElementById(id); if (el) el.value = c[field] || ''; });
            document.getElementById('fStatus').value = c.status || 'ativo';
            document.getElementById('fUf').value = c.uf || 'SP';
            document.querySelectorAll('.svc-check').forEach(cb => { cb.checked = (c.servicos || []).includes(cb.value); });
            // Load saved docs
            renderSavedDocsInModal(id);
            renderPendingDocList();
            openModal('modalClient');
        }

        /* ─── Render saved docs inside edit modal ─── */
        function renderSavedDocsInModal(clientId) {
            const docs = db.get('documents').filter(d => d.clientId === clientId);
            const section = document.getElementById('docSavedSection');
            const list = document.getElementById('docSavedList');
            section.style.display = docs.length ? '' : 'none';
            document.getElementById('tabDocCount').textContent = docs.length ? `(${docs.length})` : '';
            list.innerHTML = docs.map(d => `
      <div class="doc-saved-item" id="saved-${d.id}">
        <div class="doc-icon">${fileIcon(d.type)}</div>
        <div class="doc-meta">
          <div class="doc-filename" title="${esc(d.name)}">${esc(d.name)}</div>
          <div class="doc-desc-label">${esc(d.description || '—')}</div>
          <div class="doc-sub">${fmtSize(d.sizeBytes)} · ${fmt.datetime(d.createdAt)} · ${esc(d.uploadedByName || '')}</div>
          ${!d.data ? '<div class="doc-seed-notice">📌 Documento demo — sem arquivo real para download</div>' : ''}
        </div>
        <div class="doc-saved-actions">
          ${d.data ? `<button class="btn btn-ghost btn-sm" data-on-click="downloadDoc('${d.id}')" title="Baixar">⬇️</button>` : ''}
          <button class="btn btn-ghost btn-sm" data-on-click="startReplaceDoc('${d.id}','${esc(d.clientId)}')" title="Substituir">🔄</button>
          <button class="btn btn-danger btn-sm" data-on-click="deleteDoc('${d.id}','${esc(d.clientId)}')" title="Excluir">🗑</button>
        </div>
      </div>`).join('') || '<div class="doc-empty"><div class="doc-empty-icon">📂</div>Nenhum documento salvo.</div>';
        }

        /* ─── Handle file select ─── */
        function handleDocFileSelect(files) {
            Array.from(files).forEach(file => addToPendingList(file));
            document.getElementById('docFileInput').value = '';
        }

        function handleDocDrop(e) {
            e.preventDefault();
            document.getElementById('docDropZone').classList.remove('drag-over');
            Array.from(e.dataTransfer.files).forEach(file => addToPendingList(file));
        }

        function addToPendingList(file) {
            if (!ALLOWED_TYPES.includes(file.type)) {
                toast('Tipo não permitido', `"${file.name}" — use PDF, DOC, DOCX, ODT, JPG ou PNG.`, 'error');
                return;
            }
            if (file.size > MAX_FILE_BYTES) {
                toast('Arquivo muito grande', `"${file.name}" excede 5MB. Reduza o tamanho ou use compressão.`, 'error');
                return;
            }
            const entry = { file, name: file.name, description: '', base64: null, progress: 0 };
            pendingDocs.push(entry);
            // Start reading
            const reader = new FileReader();
            reader.onprogress = (e) => { if (e.lengthComputable) { entry.progress = Math.round(e.loaded / e.total * 100); renderPendingDocList(); } };
            reader.onload = (e) => { entry.base64 = e.target.result; entry.progress = 100; renderPendingDocList(); };
            reader.onerror = () => { toast('Erro de leitura', `Não foi possível ler "${file.name}".`, 'error'); pendingDocs = pendingDocs.filter(p => p !== entry); renderPendingDocList(); };
            reader.readAsDataURL(file);
            renderPendingDocList();
        }

        function renderPendingDocList() {
            const list = document.getElementById('docPendingList');
            list.innerHTML = pendingDocs.map((p, i) => `
      <li class="doc-pending-item">
        <div class="doc-icon">${fileIcon(p.file.type)}</div>
        <div class="doc-info">
          <div class="doc-name" title="${esc(p.name)}">${esc(p.name)}</div>
          <div class="doc-size">${fmtSize(p.file.size)}</div>
          ${p.progress < 100 ? `<div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:${p.progress}%"></div></div>` : ''}
        </div>
        <input class="doc-desc" placeholder="Descrição (ex: Contrato 2025)" value="${esc(p.description)}"
          data-on-input="pendingDocs[${i}].description = this.value" />
        <button class="btn btn-ghost btn-sm btn-icon btn-remove" data-on-click="removePending(${i})" title="Remover">✕</button>
      </li>`).join('');
            // Update tab badge
            const total = pendingDocs.length + (editingId ? db.get('documents').filter(d => d.clientId === editingId).length : 0);
            document.getElementById('tabDocCount').textContent = total ? `(${total})` : '';
        }

        function removePending(i) { pendingDocs.splice(i, 1); renderPendingDocList(); }

        /* ─── Save Client ─── */
        function saveClient() {
            const razao = document.getElementById('fRazao').value.trim();
            const email = document.getElementById('fEmail').value.trim();
            const cnpj = document.getElementById('fCnpj').value.trim();
            const contato = document.getElementById('fContato').value.trim();
            if (!razao || !email || !cnpj || !contato) { toast('Campos obrigatórios', 'Preencha Razão Social, CNPJ, E-mail e Contato.', 'error'); return; }

            // Check if any files are still reading
            if (pendingDocs.some(p => p.base64 === null)) { toast('Aguarde', 'Arquivos ainda sendo processados...', 'warning'); return; }

            const servicos = [...document.querySelectorAll('.svc-check:checked')].map(cb => cb.value);
            const data = {
                razaoSocial: razao, fantasia: document.getElementById('fFantasia').value.trim(),
                cnpj, email, telefone: document.getElementById('fTelefone').value.trim(),
                celular: document.getElementById('fCelular').value.trim(), contato, cargo: document.getElementById('fCargo').value.trim(),
                situacaoCadastral: document.getElementById('fSituacao').value.trim(),
                status: document.getElementById('fStatus').value, cep: document.getElementById('fCep').value.trim(),
                logradouro: document.getElementById('fLogradouro').value.trim(), numero: document.getElementById('fNumero').value.trim(),
                complemento: document.getElementById('fCompl').value.trim(), bairro: document.getElementById('fBairro').value.trim(),
                cidade: document.getElementById('fCidade').value.trim(), uf: document.getElementById('fUf').value,
                observacoes: document.getElementById('fObs').value.trim(), servicos
            };

            let clientId;
            if (editingId) {
                db.update('clients', editingId, data);
                clientId = editingId;
                toast('Cliente atualizado', 'Dados salvos com sucesso.', 'success');
            } else {
                const inserted = db.insert('clients', data);
                clientId = inserted.id;
                toast('Cliente cadastrado', 'Novo cliente adicionado.', 'success');
            }

            // Save pending documents
            pendingDocs.forEach(p => {
                const clientName = data.fantasia || data.razaoSocial;
                db.insert('documents', {
                    clientId, clientName,
                    name: p.name,
                    description: p.description.trim(),
                    type: p.file.type,
                    sizeBytes: p.file.size,
                    data: p.base64,
                    uploadedBy: session.userId,
                    uploadedByName: session.name,
                    updatedAt: new Date().toISOString()
                });
                logAudit('doc_upload', `Upload de "${p.name}" para cliente "${clientName}" (${clientId})`);
            });

            if (pendingDocs.length > 0) {
                toast(`${pendingDocs.length} documento${pendingDocs.length > 1 ? 's' : ''} salvo${pendingDocs.length > 1 ? 's' : ''}`, '', 'success');
            }

            pendingDocs = [];
            closeModal('modalClient');
            loadKpis(); renderTable(); editingId = null;
        }

        /* ─── Download doc ─── */
        function downloadDoc(docId) {
            const d = db.find('documents', docId);
            if (!d || !d.data) { toast('Sem arquivo', 'Este documento demo não possui arquivo real para download.', 'warning'); return; }
            const a = document.createElement('a');
            a.href = d.data;
            a.download = d.name;
            a.click();
            logAudit('doc_download', `Download de "${d.name}" do cliente "${d.clientName}"`);
        }

        /* ─── Replace doc ─── */
        let replacingDocId = null, replacingClientId = null;
        function startReplaceDoc(docId, clientId) {
            replacingDocId = docId;
            replacingClientId = clientId;
            document.getElementById('replaceFileInput').click();
        }
        document.getElementById('replaceFileInput').addEventListener('change', function () {
            const file = this.files[0];
            if (!file) return;
            if (!ALLOWED_TYPES.includes(file.type)) { toast('Tipo não permitido', 'Use PDF, DOC, DOCX, ODT, JPG ou PNG.', 'error'); return; }
            if (file.size > MAX_FILE_BYTES) { toast('Arquivo muito grande', 'Máximo de 5MB.', 'error'); return; }
            const d = db.find('documents', replacingDocId);
            const reader = new FileReader();
            reader.onload = (e) => {
                db.update('documents', replacingDocId, {
                    name: file.name, type: file.type, sizeBytes: file.size,
                    data: e.target.result, uploadedBy: session.userId,
                    uploadedByName: session.name,
                    updatedAt: new Date().toISOString()
                });
                logAudit('doc_replace', `Substituiu "${d?.name}" por "${file.name}" no cliente "${d?.clientName}"`);
                toast('Documento substituído', file.name, 'success');
                renderSavedDocsInModal(replacingClientId);
                loadKpis(); renderTable();
            };
            reader.readAsDataURL(file);
            this.value = '';
        });

        /* ─── Delete saved doc ─── */
        function deleteDoc(docId, clientId) {
            const d = db.find('documents', docId);
            document.getElementById('confirmIcon').textContent = '🗑';
            document.getElementById('confirmTitle').textContent = 'Excluir Documento?';
            document.getElementById('confirmText').textContent = `"${d?.name}" será excluído permanentemente. Esta ação não pode ser desfeita.`;
            document.getElementById('confirmBtn').textContent = 'Excluir';
            document.getElementById('confirmBtn').onclick = () => {
                db.delete('documents', docId);
                logAudit('doc_delete', `Excluiu "${d?.name}" do cliente "${d?.clientName}"`);
                toast('Documento excluído', '', 'success');
                closeModal('modalConfirm');
                renderSavedDocsInModal(clientId);
                loadKpis(); renderTable();
            };
            openModal('modalConfirm');
        }

        /* ─── View Client Detail ─── */
        function viewDetail(id) {
            const c = db.find('clients', id); if (!c) return;
            const contracts = db.findBy('contracts', 'clientId', id);
            const tickets = db.findBy('tickets', 'clientId', id);
            const docs = db.get('documents').filter(d => d.clientId === id);

            document.getElementById('detailTitle').textContent = c.fantasia || c.razaoSocial;
            document.getElementById('detailBody').innerHTML = `
    <div class="tabs">
      <button class="tab-btn active" data-on-click="switchTab('dtInfo',this)">Informações</button>
      <button class="tab-btn" data-on-click="switchTab('dtContratos',this)">Contratos (${contracts.length})</button>
      <button class="tab-btn" data-on-click="switchTab('dtChamados',this)">Chamados (${tickets.length})</button>
      <button class="tab-btn" data-on-click="switchTab('dtFinanceiro',this)">Financeiro</button>
      <button class="tab-btn" data-on-click="switchTab('dtDocs',this)">📎 Documentos (${docs.length})</button>
    </div>
    <div class="tab-panel active" id="dtInfo">
      <div class="form-grid" style="margin-top:8px">
        ${[['Razão Social', c.razaoSocial], ['Situação Cadastral', c.situacaoCadastral || '—'], ['CNPJ/CPF', c.cnpj], ['E-mail', c.email], ['Telefone', c.telefone || '—'], ['Celular', c.celular || '—'], ['Contato', c.contato], ['Cargo', c.cargo || '—'], ['Endereço', [c.logradouro, c.numero, c.bairro, c.cidade, c.uf].filter(Boolean).join(', ') || '—'], ['Serviços', (c.servicos || []).join(', ') || '—'], ['Observações', c.observacoes || '—']].map(([l, v]) => `
          <div class="form-group"><label class="form-label">${l}</label><div style="font-size:0.875rem;padding:8px 0;border-bottom:1px solid var(--border)">${esc(v)}</div></div>`).join('')}
      </div>
      <div style="display:flex;gap:8px;margin-top:16px">
        <button class="btn btn-ghost btn-sm" data-on-click="closeModal('modalDetail');editClient('${id}')">✏️ Editar</button>
        <button class="btn btn-ghost btn-sm" data-on-click="closeModal('modalDetail');toggleStatus('${id}','${c.status}')">${c.status === 'ativo' ? '⏸ Inativar' : '▶️ Reativar'}</button>
      </div>
    </div>
    <div class="tab-panel" id="dtContratos">
      ${contracts.length ? contracts.map(ct => `
        <div class="alert-row" style="margin-top:10px">
          <div class="alert-info">
            <div class="alert-id">${ct.type?.toUpperCase()} · SLA ${ct.slaH}h</div>
            <div class="alert-name">${ct.description || 'Contrato'}</div>
            <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:4px">${fmt.date(ct.startDate)} → ${fmt.date(ct.endDate)} · ${fmt.currency(ct.value)}/ano</div>
          </div>
          ${badgeContractType(ct.type)}
        </div>`).join('') : '<p style="color:var(--text-secondary);padding:20px 0">Nenhum contrato vinculado.</p>'}
    </div>
    <div class="tab-panel" id="dtChamados">
      ${tickets.length ? tickets.map(t => `
        <div class="alert-row" style="margin-top:10px;cursor:pointer" data-on-click="location.href='tickets.html'">
          <div class="alert-info">
            <div class="alert-id">${t.num}</div>
            <div class="alert-name">${esc(t.title)}</div>
            <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:4px">${fmt.relative(t.createdAt)}</div>
          </div>
          ${badgeTicketStatus(t.status)}
        </div>`).join('') : '<p style="color:var(--text-secondary);padding:20px 0">Nenhum chamado registrado.</p>'}
    </div>
    <div class="tab-panel" id="dtFinanceiro">
      <div style="margin-top:10px">
        ${(function () {
                    const trans = db.get('financial_transactions').filter(t => t.clientId === id);
                    if (!trans.length) return '<p style="color:var(--text-secondary);padding:20px 0">Nenhuma movimentação financeira.</p>';
                    return `
            <div class="table-wrapper">
              <table style="font-size:0.85rem">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Descrição</th>
                    <th>Status</th>
                    <th style="text-align:right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  ${trans.map(t => `
                    <tr>
                      <td class="td-muted">${fmt.date(t.payDate || t.dueDate)}</td>
                      <td>${esc(t.description)}</td>
                      <td><span class="badge ${t.status === 'pago' ? 'badge-green' : (t.status === 'vencido' ? 'badge-red' : 'badge-yellow')}">${t.status}</span></td>
                      <td style="text-align:right; font-weight:600; color:${t.type === 'receita' ? 'var(--green)' : 'var(--red)'}">
                        ${t.type === 'receita' ? '+' : '-'} ${fmt.currency(t.value)}
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
              <div style="margin-top:10px; text-align:right">
                <a href="financeiro.html" class="btn btn-ghost btn-sm">Ir para Financeiro →</a>
              </div>
            </div>`;
                })()}
      </div>
    </div>
    <div class="tab-panel" id="dtDocs">
      <div style="display:flex;justify-content:space-between;align-items:center;margin:12px 0 16px">
        <span style="font-size:0.82rem;color:var(--text-secondary)">${docs.length} documento${docs.length !== 1 ? 's' : ''} anexado${docs.length !== 1 ? 's' : ''}</span>
        <button class="btn btn-primary btn-sm" data-on-click="closeModal('modalDetail');editClient('${id}');setTimeout(()=>document.querySelector('[data-on-click*=tabDocs]')?.click(),200)">+ Adicionar Documento</button>
      </div>
      ${docs.length ? `<div class="doc-saved-list">${docs.map(d => `
        <div class="doc-saved-item">
          <div class="doc-icon">${fileIcon(d.type)}</div>
          <div class="doc-meta">
            <div class="doc-filename" title="${esc(d.name)}">${esc(d.name)}</div>
            <div class="doc-desc-label">${esc(d.description || '—')}</div>
            <div class="doc-sub">${fmtSize(d.sizeBytes)} · ${fmt.datetime(d.createdAt)} · por ${esc(d.uploadedByName || '—')}</div>
            ${!d.data ? '<div class="doc-seed-notice">📌 Documento demo — sem arquivo real</div>' : ''}
          </div>
          <div class="doc-saved-actions">
            ${d.data ? `<button class="btn btn-ghost btn-sm" data-on-click="downloadDoc('${d.id}')" title="Download">⬇️ Baixar</button>` : ''}
            <button class="btn btn-danger btn-sm" data-on-click="deleteDoc('${d.id}','${id}')" title="Excluir">🗑</button>
          </div>
        </div>`).join('')}
      </div>` : '<div class="doc-empty"><div class="doc-empty-icon">📂</div><p>Nenhum documento anexado.</p><p style="font-size:0.78rem;color:var(--text-muted);margin-top:4px">Clique em "+ Adicionar Documento" para salvar o contrato digitalizado.</p></div>'}
    </div>`;
            openModal('modalDetail');
        }

        /* ─── Toggle Status ─── */
        function toggleStatus(id, current) {
            const newStatus = current === 'ativo' ? 'inativo' : 'ativo';
            const client = db.find('clients', id);
            document.getElementById('confirmIcon').textContent = newStatus === 'inativo' ? '⏸' : '▶️';
            document.getElementById('confirmTitle').textContent = newStatus === 'inativo' ? 'Inativar Cliente' : 'Reativar Cliente';
            document.getElementById('confirmText').textContent = `Deseja ${newStatus === 'inativo' ? 'inativar' : 'reativar'} "${client?.fantasia || client?.razaoSocial}"? Os dados e documentos serão preservados.`;
            document.getElementById('confirmBtn').textContent = newStatus === 'inativo' ? 'Inativar' : 'Reativar';
            document.getElementById('confirmBtn').onclick = () => {
                db.update('clients', id, { status: newStatus });
                toast(newStatus === 'inativo' ? 'Cliente inativado' : 'Cliente reativado', '', 'success');
                closeModal('modalConfirm'); loadKpis(); renderTable();
            };
            openModal('modalConfirm');
        }

        /* ─── Delete Client ─── */
        function deleteClient(id) {
            const c = db.find('clients', id);
            const docCount = db.get('documents').filter(d => d.clientId === id).length;
            document.getElementById('confirmIcon').textContent = '🗑';
            document.getElementById('confirmTitle').textContent = 'Excluir Cliente';
            document.getElementById('confirmText').textContent = `Tem certeza que deseja excluir "${c?.fantasia || c?.razaoSocial}"?${docCount ? ` ${docCount} documento(s) serão também excluídos.` : ''} Esta ação não pode ser desfeita.`;
            document.getElementById('confirmBtn').textContent = 'Excluir permanentemente';
            document.getElementById('confirmBtn').onclick = () => {
                // Remove attached docs
                db.get('documents').filter(d => d.clientId === id).forEach(d => db.delete('documents', d.id));
                db.delete('clients', id);
                logAudit('client_delete', `Excluiu cliente "${c?.fantasia || c?.razaoSocial}" e ${docCount} documento(s).`);
                toast('Cliente excluído', '', 'success');
                closeModal('modalConfirm'); loadKpis(); renderTable();
            };
            openModal('modalConfirm');
        }

        /* ─── Export CSV ─── */
        function exportClients() {
            const docs = db.get('documents');
            const clientsWithDoc = new Set(docs.map(d => d.clientId));
            const data = getFiltered().map(c => ({
                razaoSocial: c.razaoSocial, fantasia: c.fantasia || '', cnpj: c.cnpj,
                email: c.email, contato: c.contato, status: c.status,
                cidade: c.cidade || '', cadastro: fmt.date(c.createdAt),
                documentos: clientsWithDoc.has(c.id) ? 'Sim' : 'Não'
            }));
            exportCSV(data, 'clientes-renostter.csv');
            toast('CSV exportado', 'Arquivo salvo na pasta de downloads.', 'success');
        }

        /* ─── Tab switching ─── */
        function switchTab(panelId, btn) {
            const parent = btn?.parentElement;
            parent?.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn?.classList.add('active');
            const container = document.getElementById(panelId)?.parentElement;
            container?.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            document.getElementById(panelId)?.classList.add('active');
        }

        /* ─── BrasilAPI Listeners ─── */
        function initApiLookups() {
            const cnpjInput = document.getElementById('fCnpj');
            const cepInput = document.getElementById('fCep');

            if (cnpjInput) {
                cnpjInput.addEventListener('input', debounce(async (e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    if (val.length === 14) {
                        // Check duplication
                        const existing = db.get('clients').find(c => c.cnpj?.replace(/\D/g, '') === val && c.id !== editingId);
                        if (existing) {
                            toast('CNPJ já cadastrado', `O cliente "${existing.fantasia || existing.razaoSocial}" já possui este CNPJ.`, 'warning');
                            return;
                        }

                        cnpjInput.parentElement.classList.add('api-loading');
                        const data = await api.getCNPJ(val);
                        cnpjInput.parentElement.classList.remove('api-loading');

                        if (data) {
                            // Address from CNPJ
                            const fallback = "";
                            document.getElementById('fRazao').value = data.razao_social || fallback;
                            document.getElementById('fFantasia').value = data.nome_fantasia || fallback;
                            document.getElementById('fEmail').value = data.email || document.getElementById('fEmail').value || fallback;
                            document.getElementById('fTelefone').value = data.ddd_telefone_1 ? `(${data.ddd_telefone_1.substring(0, 2)}) ${data.ddd_telefone_1.substring(2)}` : (document.getElementById('fTelefone').value || fallback);
                            document.getElementById('fSituacao').value = data.descricao_situacao_cadastral || fallback;

                            document.getElementById('fCep').value = fmt.cep(data.cep);
                            document.getElementById('fLogradouro').value = data.logradouro || fallback;
                            document.getElementById('fNumero').value = data.numero || fallback;
                            document.getElementById('fCompl').value = data.complemento || fallback;
                            document.getElementById('fBairro').value = data.bairro || fallback;
                            document.getElementById('fCidade').value = data.municipio || fallback;
                            document.getElementById('fUf').value = data.uf || 'SP';

                            toast('Dados importados', 'Informações da empresa carregadas via BrasilAPI.', 'success');
                            logAudit('api_lookup', `Consulta CNPJ: ${val} (${data.razao_social})`);

                            // Highlight fields
                            ['fRazao', 'fFantasia', 'fLogradouro', 'fCidade'].forEach(id => {
                                document.getElementById(id).classList.add('field-highlight');
                                setTimeout(() => document.getElementById(id).classList.remove('field-highlight'), 2000);
                            });

                            if (data.descricao_situacao_cadastral !== 'ATIVA') {
                                toast('Atenção: Situação ' + data.descricao_situacao_cadastral, 'Esta empresa não está com situação ATIVA na Receita.', 'warning');
                                logAudit('api_warning', `CNPJ ${val} com situação: ${data.descricao_situacao_cadastral}`);
                            }
                        } else {
                            toast('CNPJ não encontrado', 'Verifique o número ou preencha manualmente.', 'info');
                        }
                    }
                }, 600));
            }

            if (cepInput) {
                // Sanitization on blur
                cepInput.addEventListener('blur', (e) => {
                    e.target.value = e.target.value.replace(/\D/g, '').substring(0, 8);
                });

                cepInput.addEventListener('input', debounce(async (e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    if (val.length === 8) {
                        cepInput.parentElement.classList.add('api-loading');
                        const data = await api.getCEP(val);
                        cepInput.parentElement.classList.remove('api-loading');

                        if (data) {
                            const fallback = "";
                            document.getElementById('fCep').value = fmt.cep(val);
                            document.getElementById('fLogradouro').value = data.street || fallback;
                            document.getElementById('fBairro').value = data.neighborhood || fallback;
                            document.getElementById('fCidade').value = data.city || fallback;
                            document.getElementById('fUf').value = data.state || 'SP';

                            toast('Endereço encontrado', '', 'success');
                            logAudit('api_lookup', `Consulta CEP: ${val} (${data.city})`);
                            ['fLogradouro', 'fBairro', 'fCidade', 'fUf'].forEach(id => {
                                document.getElementById(id).classList.add('field-highlight');
                                setTimeout(() => document.getElementById(id).classList.remove('field-highlight'), 2000);
                            });
                        } else {
                            toast('CEP não encontrado', 'Verifique o número ou preencha manualmente.', 'info');
                        }
                    }
                }, 500));
            }
        }

        initSidebar(); loadKpis(); renderTable(); initApiLookups();
    
