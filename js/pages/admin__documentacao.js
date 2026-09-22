/* Extraido de admin/documentacao.html por tools/csp-migrate.py (CSP sem unsafe-inline). */
/* ── gerado por tools/csp-migrate.py: nomes liberados para os data-on-* desta pagina ── */
;(function () {
  var s = window.__cspScope || (window.__cspScope = {});
  function def(n, g, st) { Object.defineProperty(s, n, { configurable: true, enumerable: true, get: g, set: st }); }
  def('auth', function () { return typeof auth !== 'undefined' ? auth : undefined; }, function (v) { auth = v; });
  def('closeModal', function () { return typeof closeModal !== 'undefined' ? closeModal : undefined; }, function (v) { closeModal = v; });
  def('deleteDoc', function () { return typeof deleteDoc !== 'undefined' ? deleteDoc : undefined; }, function (v) { deleteDoc = v; });
  def('downloadDoc', function () { return typeof downloadDoc !== 'undefined' ? downloadDoc : undefined; }, function (v) { downloadDoc = v; });
  def('exportDocHistory', function () { return typeof exportDocHistory !== 'undefined' ? exportDocHistory : undefined; }, function (v) { exportDocHistory = v; });
  def('loadDocs', function () { return typeof loadDocs !== 'undefined' ? loadDocs : undefined; }, function (v) { loadDocs = v; });
  def('openUploadDocModal', function () { return typeof openUploadDocModal !== 'undefined' ? openUploadDocModal : undefined; }, function (v) { openUploadDocModal = v; });
  def('submitUploadDoc', function () { return typeof submitUploadDoc !== 'undefined' ? submitUploadDoc : undefined; }, function (v) { submitUploadDoc = v; });
})();
/* ── fim do bloco gerado ── */

        // ─── Auth gate ───
        const session = auth.protect(['admin', 'superadmin']);
        initSidebar();

        // ─── Chart config helpers ───
        const CHART_OPTS = (indexAxis) => ({
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                [indexAxis === 'y' ? 'x' : 'y']: {
                    beginAtZero: true,
                    ticks: { color: '#8B949E', precision: 0 },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                },
                [indexAxis === 'y' ? 'y' : 'x']: {
                    ticks: { color: '#8B949E' },
                    grid: { display: false }
                }
            }
        });

        function fmtSize(bytes) {
            if (!bytes) return '—';
            if (bytes < 1024) return bytes + ' B';
            if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
            return (bytes / 1048576).toFixed(1) + ' MB';
        }

        // ─── Populate client dropdowns (once) ───
        let docClientsPopulated = false;
        function populateDocClients(clients) {
            if (docClientsPopulated) return;
            const selF = document.getElementById('docClientFilter');
            const selU = document.getElementById('updClient');
            if (!selF || !selU) return;
            const opts = clients.map(c => `<option value="${esc(c.id)}">${esc(c.fantasia || c.razaoSocial)}</option>`).join('');
            selF.innerHTML = '<option value="">Todos os clientes</option>' + opts;
            selU.innerHTML = '<option value="">Sem vínculo</option>' + opts;
            docClientsPopulated = true;
        }

        // ─── Render principal ───
        function loadDocs() {
            const allClients = db.get('clients');
            populateDocClients(allClients);

            const activeClients = allClients.filter(c => c.status === 'ativo');
            const allDocs = db.get('documents');
            const clientsWithDoc = new Set(allDocs.map(d => d.clientId).filter(Boolean));
            const withDoc = activeClients.filter(c => clientsWithDoc.has(c.id)).length;
            const withoutDoc = activeClients.filter(c => !clientsWithDoc.has(c.id));
            const coverage = activeClients.length ? Math.round(withDoc / activeClients.length * 100) : 0;

            // KPIs
            const kpis = [
                { label: 'Total de Documentos', value: allDocs.length, icon: '📎', cls: 'blue' },
                { label: 'Clientes c/ Documento', value: withDoc, icon: '✅', cls: 'green' },
                { label: 'Cobertura Digital', value: coverage + '%', icon: '📊', cls: coverage >= 80 ? 'green' : coverage >= 50 ? 'yellow' : 'red' },
                { label: 'Sem Documento', value: withoutDoc.length, icon: '⚠️', cls: 'red', title: 'Clientes ativos sem nenhum documento' },
            ];
            document.getElementById('docKpis').innerHTML = kpis.map(k => `
                <div class="kpi-card" ${k.title ? `title="${esc(k.title)}"` : ''}>
                    <div class="kpi-info">
                        <div class="kpi-label">${esc(k.label)}</div>
                        <div class="kpi-value">${k.value}</div>
                    </div>
                    <div class="kpi-icon ${k.cls}" style="font-size:1.3rem">${k.icon}</div>
                </div>`).join('');

            // Pending list
            document.getElementById('docPendingCount').textContent = `(${withoutDoc.length})`;
            const pendingEl = document.getElementById('docPendingList');
            pendingEl.innerHTML = withoutDoc.length ? withoutDoc.map(c => `
                <div class="pending-row">
                    <div style="flex:1">
                        <div style="font-weight:600;font-size:0.84rem">${esc(c.fantasia || c.razaoSocial)}</div>
                        <div style="font-size:0.73rem;color:var(--text-muted)">${esc(c.contato || '')} · ${esc(c.email || '')}</div>
                    </div>
                    <a href="clients.html" class="btn btn-ghost btn-sm" style="font-size:0.75rem">Ver cliente →</a>
                </div>`).join('') : '<p style="color:var(--text-secondary);padding:16px 0;font-size:0.85rem;text-align:center">✅ Todos os clientes ativos têm documentos!</p>';

            // Uploads chart
            const monthCounts = {};
            allDocs.forEach(d => {
                const m = d.createdAt ? d.createdAt.slice(0, 7) : 'Desconhecido';
                monthCounts[m] = (monthCounts[m] || 0) + 1;
            });
            const monthLabels = Object.keys(monthCounts).sort().slice(-6);
            const monthData = monthLabels.map(m => monthCounts[m]);
            if (window.chartDocUpInst) window.chartDocUpInst.destroy();
            const ctx = document.getElementById('chartDocUploads').getContext('2d');
            window.chartDocUpInst = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: monthLabels.map(m => {
                        const [y, mo] = m.split('-');
                        return new Date(+y, +mo - 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
                    }),
                    datasets: [{ data: monthData, backgroundColor: '#00AEEF', borderRadius: 6 }]
                },
                options: { ...CHART_OPTS('x'), plugins: { legend: { display: false } } }
            });

            // Tabela filtrada
            const search = (document.getElementById('docSearch').value || '').toLowerCase();
            const fClient = document.getElementById('docClientFilter').value;
            const fCat = document.getElementById('docCatFilter').value;
            const sDate = document.getElementById('docStart').value;
            const eDate = document.getElementById('docEnd').value;

            let filteredDocs = [...allDocs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            if (fClient) filteredDocs = filteredDocs.filter(d => d.clientId === fClient);
            if (fCat) filteredDocs = filteredDocs.filter(d => d.category === fCat);
            if (search) filteredDocs = filteredDocs.filter(d =>
                (d.name || '').toLowerCase().includes(search) ||
                (d.description || '').toLowerCase().includes(search)
            );
            if (sDate) {
                const sT = new Date(sDate + 'T00:00:00').getTime();
                filteredDocs = filteredDocs.filter(d => new Date(d.createdAt).getTime() >= sT);
            }
            if (eDate) {
                const eT = new Date(eDate + 'T23:59:59').getTime();
                filteredDocs = filteredDocs.filter(d => new Date(d.createdAt).getTime() <= eT);
            }

            const catColors = {
                'contrato': 'blue',
                'aditivo': 'orange',
                'projeto': 'yellow',
                'termo_aceite': 'green',
                'diversos': 'gray'
            };

            document.getElementById('docHistoryTable').innerHTML = filteredDocs.length ? filteredDocs.map(d => {
                const safeName = esc(d.name || '');
                const safeDesc = esc(d.description || '—');
                const safeClient = esc(d.clientName || '—');
                const safeCategory = esc((d.category || 'diversos').toUpperCase());
                const safeUploader = esc(d.uploadedByName || '—');
                const dt = new Date(d.createdAt);
                const dataStr = isNaN(dt.getTime()) ? '—' : fmt.date(d.createdAt);
                const horaStr = isNaN(dt.getTime()) ? '' : dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                const catCls = catColors[d.category || 'diversos'] || 'gray';

                return `
                <tr>
                    <td data-label="Arquivo">
                        <div style="font-weight:600;font-size:0.85rem;color:var(--text-primary)">${safeName}</div>
                        <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:2px;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${safeDesc}">${safeDesc}</div>
                    </td>
                    <td data-label="Cliente" style="font-size:0.82rem;font-weight:500">${safeClient}</td>
                    <td data-label="Categoria"><span class="badge badge-${catCls}" style="text-transform:uppercase">${safeCategory}</span></td>
                    <td data-label="Tamanho" class="td-muted">${fmtSize(d.sizeBytes)}</td>
                    <td data-label="Enviado por" class="td-muted" style="font-size:0.78rem">${safeUploader}</td>
                    <td data-label="Data / Hora" class="td-muted" style="font-size:0.8rem">
                        <div>${dataStr}</div>
                        <div style="font-size:0.7rem">${horaStr}</div>
                    </td>
                    <td data-label="Ações" style="text-align:right" class="td-actions">
                        <button class="btn btn-ghost btn-icon-sm" title="Download" data-on-click="downloadDoc('${esc(d.id)}')">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        </button>
                        <button class="btn btn-ghost btn-icon-sm" title="Excluir" data-on-click="deleteDoc('${esc(d.id)}')" style="color:var(--danger)">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                        </button>
                    </td>
                </tr>`;
            }).join('') : `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-secondary);font-size:0.85rem">Nenhum documento encontrado para os filtros aplicados.</td></tr>`;
        }

        // ─── Upload (base64 em localStorage — consistente com demais módulos) ───
        function openUploadDocModal() {
            // reset form
            document.getElementById('updFile').value = '';
            document.getElementById('updDesc').value = '';
            const selU = document.getElementById('updClient');
            if (selU) selU.value = '';
            document.getElementById('updCat').value = 'diversos';
            openModal('modalUploadDoc');
        }

        function submitUploadDoc() {
            const fileInput = document.getElementById('updFile');
            const desc = document.getElementById('updDesc').value.trim();
            const clientId = document.getElementById('updClient').value;
            const category = document.getElementById('updCat').value;

            if (!fileInput.files || !fileInput.files[0]) {
                toast('Arquivo obrigatório', 'Selecione um arquivo para enviar.', 'warning');
                return;
            }
            const file = fileInput.files[0];
            const reader = new FileReader();
            reader.onload = function (e) {
                const allClients = db.get('clients');
                const client = allClients.find(c => c.id === clientId);
                const docObj = {
                    id: db._uid(),
                    name: file.name,
                    description: desc,
                    type: file.type,
                    sizeBytes: file.size,
                    data: e.target.result,
                    clientId: clientId || null,
                    clientName: client ? (client.fantasia || client.razaoSocial) : null,
                    category: category,
                    uploadedBy: session.userId,
                    uploadedByName: session.name || 'Admin',
                    createdAt: new Date().toISOString()
                };

                const docs = db.get('documents');
                docs.push(docObj);
                db.set('documents', docs);
                logAudit('doc_upload', `Documento: ${file.name} (Cliente: ${client ? (client.fantasia || client.razaoSocial) : 'Nenhum'})`);

                closeModal('modalUploadDoc');
                toast('Sucesso', 'Documento adicionado à base.', 'success');
                loadDocs();
            };
            reader.readAsDataURL(file);
        }

        function downloadDoc(id) {
            const doc = db.get('documents').find(d => d.id === id);
            if (!doc) return toast('Erro', 'Documento não encontrado.', 'error');
            if (!doc.data) return toast('Indisponível', 'Este documento não possui arquivo anexado.', 'warning');

            const a = document.createElement('a');
            a.href = doc.data;
            a.download = doc.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }

        function deleteDoc(id) {
            if (session.role !== 'superadmin') return toast('Erro', 'Acesso negado', 'error');
            if (!confirm('Deseja realmente excluir este documento permanentemente?')) return;

            let docs = db.get('documents');
            const doc = docs.find(d => d.id === id);
            docs = docs.filter(d => d.id !== id);
            db.set('documents', docs);
            logAudit('doc_delete', `Excluiu doc: ${doc ? doc.name : id}`);
            toast('Excluído', 'Documento removido.', 'success');
            loadDocs();
        }

        function exportDocHistory() {
            const search = (document.getElementById('docSearch').value || '').toLowerCase();
            const fClient = document.getElementById('docClientFilter').value;
            const fCat = document.getElementById('docCatFilter').value;
            const sDate = document.getElementById('docStart').value;
            const eDate = document.getElementById('docEnd').value;

            let filteredDocs = [...db.get('documents')].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            if (fClient) filteredDocs = filteredDocs.filter(d => d.clientId === fClient);
            if (fCat) filteredDocs = filteredDocs.filter(d => d.category === fCat);
            if (search) filteredDocs = filteredDocs.filter(d =>
                (d.name || '').toLowerCase().includes(search) ||
                (d.description || '').toLowerCase().includes(search));
            if (sDate) filteredDocs = filteredDocs.filter(d => new Date(d.createdAt).getTime() >= new Date(sDate + 'T00:00:00').getTime());
            if (eDate) filteredDocs = filteredDocs.filter(d => new Date(d.createdAt).getTime() <= new Date(eDate + 'T23:59:59').getTime());

            const data = filteredDocs.map(d => ({
                arquivo: d.name,
                descricao: d.description || '',
                cliente: d.clientName || '',
                categoria: d.category || 'diversos',
                tamanho: fmtSize(d.sizeBytes),
                enviadoPor: d.uploadedByName || '',
                data: fmt.datetime(d.createdAt)
            }));
            exportCSV(data, 'documentos-filtrados-renostter.csv');
            toast('CSV exportado', 'Apenas os resultados visíveis foram baixados.', 'success');
        }

        // ─── Init ───
        document.addEventListener('DOMContentLoaded', () => {
            try { initSidebar(); } catch (e) { /* sidebar já inicializado pelo protect */ }
            loadDocs();
        });
    
