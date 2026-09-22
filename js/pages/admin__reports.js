/* Extraido de admin/reports.html por tools/csp-migrate.py (CSP sem unsafe-inline). */
/* ── gerado por tools/csp-migrate.py: nomes liberados para os data-on-* desta pagina ── */
;(function () {
  var s = window.__cspScope || (window.__cspScope = {});
  function def(n, g, st) { Object.defineProperty(s, n, { configurable: true, enumerable: true, get: g, set: st }); }
  def('$', function () { return typeof $ !== 'undefined' ? $ : undefined; }, function (v) { $ = v; });
  def('auditCurrentPage', function () { return typeof auditCurrentPage !== 'undefined' ? auditCurrentPage : undefined; }, function (v) { auditCurrentPage = v; });
  def('auth', function () { return typeof auth !== 'undefined' ? auth : undefined; }, function (v) { auth = v; });
  def('closeModal', function () { return typeof closeModal !== 'undefined' ? closeModal : undefined; }, function (v) { closeModal = v; });
  def('deleteDoc', function () { return typeof deleteDoc !== 'undefined' ? deleteDoc : undefined; }, function (v) { deleteDoc = v; });
  def('exportAll', function () { return typeof exportAll !== 'undefined' ? exportAll : undefined; }, function (v) { exportAll = v; });
  def('exportAudit', function () { return typeof exportAudit !== 'undefined' ? exportAudit : undefined; }, function (v) { exportAudit = v; });
  def('exportDocHistory', function () { return typeof exportDocHistory !== 'undefined' ? exportDocHistory : undefined; }, function (v) { exportDocHistory = v; });
  def('exportMasterInventory', function () { return typeof exportMasterInventory !== 'undefined' ? exportMasterInventory : undefined; }, function (v) { exportMasterInventory = v; });
  def('exportTechPerf', function () { return typeof exportTechPerf !== 'undefined' ? exportTechPerf : undefined; }, function (v) { exportTechPerf = v; });
  def('loadDocs', function () { return typeof loadDocs !== 'undefined' ? loadDocs : undefined; }, function (v) { loadDocs = v; });
  def('loadInventoryReport', function () { return typeof loadInventoryReport !== 'undefined' ? loadInventoryReport : undefined; }, function (v) { loadInventoryReport = v; });
  def('openMovimentarEstoqueModal', function () { return typeof openMovimentarEstoqueModal !== 'undefined' ? openMovimentarEstoqueModal : undefined; }, function (v) { openMovimentarEstoqueModal = v; });
  def('openTechFeedbacks', function () { return typeof openTechFeedbacks !== 'undefined' ? openTechFeedbacks : undefined; }, function (v) { openTechFeedbacks = v; });
  def('openUploadDocModal', function () { return typeof openUploadDocModal !== 'undefined' ? openUploadDocModal : undefined; }, function (v) { openUploadDocModal = v; });
  def('renderAudit', function () { return typeof renderAudit !== 'undefined' ? renderAudit : undefined; }, function (v) { renderAudit = v; });
  def('renderTechPerf', function () { return typeof renderTechPerf !== 'undefined' ? renderTechPerf : undefined; }, function (v) { renderTechPerf = v; });
  def('submitMovimentarEstoque', function () { return typeof submitMovimentarEstoque !== 'undefined' ? submitMovimentarEstoque : undefined; }, function (v) { submitMovimentarEstoque = v; });
  def('submitUploadDoc', function () { return typeof submitUploadDoc !== 'undefined' ? submitUploadDoc : undefined; }, function (v) { submitUploadDoc = v; });
  def('switchTab', function () { return typeof switchTab !== 'undefined' ? switchTab : undefined; }, function (v) { switchTab = v; });
  def('totalPages', function () { return typeof totalPages !== 'undefined' ? totalPages : undefined; }, function (v) { totalPages = v; });
})();
/* ── fim do bloco gerado ── */

        const session = auth.protect(['admin', 'superadmin']);
        const isSuperadmin = session.role === 'superadmin';
        if (isSuperadmin) document.getElementById('auditTabBtn').style.display = '';

        // ─── Tab switcher ───
        let activeTab = 'dashboard';
        let chartsInit = {};

        const tabNames = {
            'dashboard': 'Dashboard Principal',
            'kpi': 'KPIs',
            'tech-perf': 'Desempenho Técnicos',
            'clients': 'Clientes',
            'transfers': 'Transferências',
            'docs': 'Documentação',
            'inventory': 'Estoque',
            'audit': 'Auditoria'
        };

        function switchTab(tab) {
            if (tab === 'dashboard') {
                window.location.href = 'dashboard.html';
                return;
            }
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            document.querySelectorAll('.rtab').forEach(b => b.classList.remove('active'));
            
            const pane = document.getElementById('tab-' + tab);
            if (pane) pane.classList.add('active');
            
            document.querySelectorAll('.rtab').forEach(b => { 
                if (b.getAttribute('data-on-click').includes(`'${tab}'`)) b.classList.add('active'); 
            });
            
            // Dynamic page title
            const titleEl = document.getElementById('pageTitleText');
            if (titleEl) {
                titleEl.textContent = `Relatórios & Analytics — ${tabNames[tab] || 'Métricas'}`;
            }

            activeTab = tab;
            if (!chartsInit[tab]) { chartsInit[tab] = true; initTab(tab); }
        }

        function initTab(tab) {
            if (tab === 'kpi') loadKPI();
            if (tab === 'tech-perf') loadTechPerf();
            if (tab === 'clients') loadClients();
            if (tab === 'transfers') loadTransfers();
            if (tab === 'audit') { populateAuditUsers(); renderAudit(); }
            if (tab === 'docs') loadDocs();
            if (tab === 'inventory') loadInventoryReport();
        }

        // ─── Inventory tab ───
        function loadInventoryReport() {
            const products = db.get('inventory');
            const movements = db.get('stock_movements');
            const importLogs = db.get('import_logs') || [];

            const totalItems = products.length;
            const totalValue = products.reduce((s, p) => s + (p.currentStock * (p.costPrice || 0)), 0);
            const critical = products.filter(p => p.currentStock <= p.minStock).length;
            const recentMovements = movements.filter(m => new Date(m.createdAt) > new Date(Date.now() - 30 * 86400000)).length;

            document.getElementById('invKpis').innerHTML = [
                { label: 'Itens no Catálogo', value: totalItems, icon: '📦', cls: 'blue' },
                { label: 'Valor Total em Estoque', value: fmt.currency(totalValue), icon: '💰', cls: 'green' },
                { label: 'Itens c/ Estoque Crítico', value: critical, icon: '⚠️', cls: 'red' },
                { label: 'Movimentações (30 dias)', value: recentMovements, icon: '🔄', cls: 'orange' },
            ].map(k => `<div class="kpi-card">
      <div class="kpi-info"><div class="kpi-label">${k.label}</div><div class="kpi-value" style="font-size:1.4rem">${k.value}</div></div>
      <div class="kpi-icon ${k.cls}" style="font-size:1.3rem">${k.icon}</div></div>`).join('');

            // Chart: Curva ABC (Top 10 por Valor em Estoque)
            const abcData = [...products].map(p => ({ name: p.name, val: p.currentStock * (p.costPrice || 0) }))
                .sort((a, b) => b.val - a.val).slice(0, 10);
            mkBarChart('chartABC', abcData.map(x => x.name), abcData.map(x => x.val), ['rgba(0,174,239,.6)'], { indexAxis: 'y' });

            // Chart: Movimentação Mensal
            const months = {};
            movements.forEach(m => {
                const mo = (m.createdAt || '').slice(0, 7);
                if (!months[mo]) months[mo] = { in: 0, out: 0 };
                if (m.quantity > 0) months[mo].in += m.quantity;
                else months[mo].out += Math.abs(m.quantity);
            });
            const mLabels = Object.keys(months).sort().slice(-6);
            new Chart(document.getElementById('chartInvMovements'), {
                type: 'line',
                data: {
                    labels: mLabels,
                    datasets: [
                        { label: 'Entradas', data: mLabels.map(l => months[l].in), borderColor: '#2EA043', backgroundColor: 'rgba(46,160,67,.1)', fill: true, tension: 0.4 },
                        { label: 'Saídas', data: mLabels.map(l => months[l].out), borderColor: '#DA3633', backgroundColor: 'rgba(218,54,51,.1)', fill: true, tension: 0.4 }
                    ]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#8B949E' } } }, scales: { y: { beginAtZero: true, ticks: { color: '#8B949E' } }, x: { ticks: { color: '#8B949E' } } } }
            });

            // Populate Filter dropdowns
            let catSet = new Set(), locSet = new Set();
            products.forEach(p => { 
                if(p.category) catSet.add(p.category); 
                if(p.location) locSet.add(p.location); 
            });
            const selCat = document.getElementById('invCatFilter');
            const selLoc = document.getElementById('invLocFilter');
            if (selCat.options.length <= 1) {
                selCat.innerHTML = '<option value="">Todas</option>' + [...catSet].sort().map(c => `<option value="${c}">${esc(c)}</option>`).join('');
            }
            if (selLoc.options.length <= 1) {
                selLoc.innerHTML = '<option value="">Todas</option>' + [...locSet].sort().map(c => `<option value="${c}">${esc(c)}</option>`).join('');
            }

            // ─── Filter Master Table ───
            const search = document.getElementById('invSearch').value.toLowerCase();
            const fStatus = document.getElementById('invStatusFilter').value;
            const fCat = document.getElementById('invCatFilter').value;
            const fLoc = document.getElementById('invLocFilter').value;

            let fProds = [...products];
            if (fStatus === 'critical') fProds = fProds.filter(p => p.currentStock <= p.minStock);
            else if (fStatus === 'ok') fProds = fProds.filter(p => p.currentStock > p.minStock);
            
            if (fCat) fProds = fProds.filter(p => p.category === fCat);
            if (fLoc) fProds = fProds.filter(p => p.location === fLoc);
            if (search) fProds = fProds.filter(p => (p.name||'').toLowerCase().includes(search) || (p.sku||'').toLowerCase().includes(search));

            document.getElementById('inventoryMasterTable').innerHTML = fProds.length ? fProds.map(p => {
                const isCrit = p.currentStock <= p.minStock;
                const lastMov = movements.filter(m => m.productId === p.id).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))[0];
                return `<tr>
                    <td data-label="Cód. (SKU)"><div style="font-weight:600;font-size:0.8rem">${esc(p.sku || p.id.slice(0,8))}</div></td>
                    <td data-label="Descrição | Nome"><div style="font-weight:500;color:var(--text-primary)">${esc(p.name)}</div>
                        <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px">${esc(p.category || 'Sem Categoria')}</div>
                    </td>
                    <td data-label="Qtd. Atual" style="text-align:right;font-weight:600;color:${isCrit ? 'var(--danger)' : 'var(--text-primary)'}">
                        ${p.currentStock} ${isCrit ? '<span title="Estoque Crítico">⚠️</span>' : ''}
                    </td>
                    <td data-label="Qtd. Mínima" style="text-align:right" class="td-muted">${p.minStock}</td>
                    <td data-label="Localização"><span class="badge badge-gray">${esc(p.location || 'N/A')}</span></td>
                    <td data-label="Última Movimentação" class="td-muted" style="font-size:0.8rem">${lastMov ? fmt.date(lastMov.createdAt) : '—'}</td>
                    <td data-label="Ações" style="text-align:right" class="td-actions">
                       <button class="btn btn-ghost btn-sm btn-icon" title="Editar" data-on-click="window.location.href='inventory.html'"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
                       <button class="btn btn-ghost btn-sm btn-icon" title="Ajuste Rápido" data-on-click="openMovimentarEstoqueModal('${p.id}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"></polyline><polyline points="23 20 23 14 17 14"></polyline><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path></svg></button>
                    </td>
                </tr>`;
            }).join('') : '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:32px">Nenhum item de estoque encontrado nos filtros atuais.</td></tr>';
        }

        function openMovimentarEstoqueModal(preselectId = '') {
            const products = db.get('inventory').sort((a,b) => a.name.localeCompare(b.name));
            const sel = document.getElementById('movProduct');
            sel.innerHTML = '<option value="">Selecione um produto...</option>' + products.map(p => 
                `<option value="${p.id}">${esc(p.sku || p.id.slice(0,6))} - ${esc(p.name)} (Qtd: ${p.currentStock})</option>`
            ).join('');
            if(preselectId) sel.value = preselectId;
            
            document.getElementById('movQty').value = 1;
            document.getElementById('movObs').value = '';
            document.getElementById('movType').value = 'in';
            
            openModal('modalMovimentarEstoque');
        }

        function submitMovimentarEstoque() {
            if (!isSuperadmin && session.role !== 'admin') return toast('Erro', 'Apenas gestores podem movimentar estoque logístico.', 'error');
            
            const prodId = document.getElementById('movProduct').value;
            const type = document.getElementById('movType').value;
            const qtyStr = document.getElementById('movQty').value;
            const obs = document.getElementById('movObs').value.trim();

            if (!prodId) return toast('Erro', 'Selecione um produto para movimentar.', 'error');
            const qty = parseInt(qtyStr, 10);
            if (isNaN(qty) || qty <= 0) return toast('Erro', 'A quantidade deve ser maior que zero.', 'error');

            let inv = db.get('inventory');
            const prodIdx = inv.findIndex(p => p.id === prodId);
            if(prodIdx === -1) return toast('Erro', 'Produto não encontrado.', 'error');

            const prod = inv[prodIdx];
            if (type === 'out' && prod.currentStock < qty) {
                return toast('Estoque Insuficiente', `Saldo atual de ${prod.currentStock}. Impossível remover ${qty}.`, 'error');
            }

            const change = type === 'in' ? qty : -qty;
            inv[prodIdx].currentStock += change;
            db.set('inventory', inv);

            // Register Stock Movement Log
            const movs = db.get('stock_movements');
            movs.push({
                id: utils.generateId(),
                productId: prod.id,
                quantity: change, // (+) for in, (-) for out
                type: 'manual',
                status: 'aprovado',
                reason: obs || (type === 'in' ? 'Entrada Avulsa' : 'Saída Avulsa'),
                createdAt: new Date().toISOString(),
                createdBy: session.userId,
                userName: session.name
            });
            db.set('stock_movements', movs);

            // Register Audit
            logAudit('inventory_move', `Mestre: Movimentou [${type==='in'?'+':'-'}${qty}] em ${prod.name}`);
            
            closeModal('modalMovimentarEstoque');
            toast('Movimentação Registrada', `O saldo do produto ${prod.name} foi atualizado.`, 'success');
            loadInventoryReport();
        }

        function exportMasterInventory() {
            const search = document.getElementById('invSearch').value.toLowerCase();
            const fStatus = document.getElementById('invStatusFilter').value;
            const fCat = document.getElementById('invCatFilter').value;
            const fLoc = document.getElementById('invLocFilter').value;
            
            let fProds = db.get('inventory');
            if (fStatus === 'critical') fProds = fProds.filter(p => p.currentStock <= p.minStock);
            else if (fStatus === 'ok') fProds = fProds.filter(p => p.currentStock > p.minStock);
            if (fCat) fProds = fProds.filter(p => p.category === fCat);
            if (fLoc) fProds = fProds.filter(p => p.location === fLoc);
            if (search) fProds = fProds.filter(p => (p.name||'').toLowerCase().includes(search) || (p.sku||'').toLowerCase().includes(search));

            const data = fProds.map(p => ({ sku: p.sku||'N/A', nome: p.name, estoqueAtual: p.currentStock, estoqueMinimo: p.minStock, status: p.currentStock <= p.minStock ? 'CRITICO' : 'OK', precoCusto: p.costPrice||0, totalCusto: (p.currentStock * (p.costPrice||0)), categoria: p.category||'', localizacao: p.location||'' }));
            exportCSV(data, 'relatorio-almoxarifado-renostter.csv');
            toast('Mestre Estoque', 'O inventário filtrado foi exportado.', 'success');
        }

        // ─── Docs tab ───
        function fmtSize(bytes) {
            if (!bytes) return '—';
            if (bytes < 1024) return bytes + ' B';
            if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
            return (bytes / 1048576).toFixed(1) + ' MB';
        }

        let docClientsPopulated = false;
        function populateDocClients(clients) {
            if(docClientsPopulated) return;
            const selF = document.getElementById('docClientFilter');
            const selU = document.getElementById('updClient');
            const opts = clients.map(c => `<option value="${c.id}">${esc(c.fantasia || c.razaoSocial)}</option>`).join('');
            selF.innerHTML = '<option value="">Todos os clientes</option>' + opts;
            selU.innerHTML = '<option value="">Sem vínculo</option>' + opts;
            docClientsPopulated = true;
        }

        function loadDocs() {
            const allClients = db.get('clients');
            populateDocClients(allClients); // load dropdowns
            const activeClients = allClients.filter(c => c.status === 'ativo');
            const allDocs = db.get('documents');
            const clientsWithDoc = new Set(allDocs.map(d => d.clientId));
            const withDoc = activeClients.filter(c => clientsWithDoc.has(c.id)).length;
            const withoutDoc = activeClients.filter(c => !clientsWithDoc.has(c.id));
            const coverage = activeClients.length ? Math.round(withDoc / activeClients.length * 100) : 0;

            // KPIs
            document.getElementById('docKpis').innerHTML = [
                { label: 'Total de Documentos', value: allDocs.length, icon: '📎', cls: 'blue' },
                { label: 'Clientes c/ Documento', value: withDoc, icon: '✅', cls: 'green' },
                { label: 'Cobertura Digital', value: coverage + '%', icon: '📊', cls: coverage >= 80 ? 'green' : coverage >= 50 ? 'yellow' : 'red' },
                { label: 'Sem Documento', value: withoutDoc.length, icon: '⚠️', cls: 'red', title: 'Clientes ativos sem nenhum documento' },
            ].map(k => `<div class="kpi-card" ${k.title ? `title="${k.title}"` : ''}>
      <div class="kpi-info"><div class="kpi-label">${k.label}</div><div class="kpi-value">${k.value}</div></div>
      <div class="kpi-icon ${k.cls}" style="font-size:1.3rem">${k.icon}</div></div>`).join('');

            // Pending clients list
            const pendingEl = document.getElementById('docPendingList');
            document.getElementById('docPendingCount').textContent = `(${withoutDoc.length})`;
            pendingEl.innerHTML = withoutDoc.length ? withoutDoc.map(c => `
      <div class="rank-row">
        <div style="flex:1">
          <div style="font-weight:600;font-size:0.84rem">${esc(c.fantasia || c.razaoSocial)}</div>
          <div style="font-size:0.73rem;color:var(--text-muted)">${esc(c.contato || '')} · ${esc(c.email || '')}</div>
        </div>
        <a href="clients.html" class="btn btn-ghost btn-sm" style="font-size:0.75rem">Ver cliente →</a>
      </div>`).join('') : '<p style="color:var(--text-secondary);padding:16px 0;font-size:0.85rem;text-align:center">✅ Todos têm documentos!</p>';

            // Uploads chart — group by month
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
                    labels: monthLabels.map(m => { const [y, mo] = m.split('-'); return new Date(+y, +mo - 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }); }),
                    datasets: [{ data: monthData, backgroundColor: '#00AEEF', borderRadius: 6 }]
                },
                options: { ...CHART_OPTS('x'), plugins: { legend: { display: false } } }
            });

            // ─── Filtered Table ───
            const search = document.getElementById('docSearch').value.toLowerCase();
            const fClient = document.getElementById('docClientFilter').value;
            const fCat = document.getElementById('docCatFilter').value;
            const sDate = document.getElementById('docStart').value;
            const eDate = document.getElementById('docEnd').value;
            
            let filteredDocs = allDocs.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
            if (fClient) filteredDocs = filteredDocs.filter(d => d.clientId === fClient);
            if (fCat) filteredDocs = filteredDocs.filter(d => d.category === fCat);
            if (search) filteredDocs = filteredDocs.filter(d => 
                (d.name||'').toLowerCase().includes(search) || 
                (d.description||'').toLowerCase().includes(search)
            );
            if (sDate) {
                const sT = new Date(sDate + 'T00:00:00').getTime();
                filteredDocs = filteredDocs.filter(d => new Date(d.createdAt).getTime() >= sT);
            }
            if (eDate) {
                const eT = new Date(eDate + 'T23:59:59').getTime();
                filteredDocs = filteredDocs.filter(d => new Date(d.createdAt).getTime() <= eT);
            }

            const catColors = { 'contrato': 'blue', 'aditivo': 'orange', 'projeto': 'yellow', 'termo_aceite': 'green', 'diversos': 'gray' };

            document.getElementById('docHistoryTable').innerHTML = filteredDocs.length ? filteredDocs.map(d => `
      <tr>
        <td data-label="Arquivo">
          <div style="font-weight:600;font-size:0.85rem;color:var(--text-primary)">${esc(d.name)}</div>
          <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:2px;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(d.description||'')}">${esc(d.description || '—')}</div>
        </td>
        <td data-label="Cliente" style="font-size:0.82rem;font-weight:500">${esc(d.clientName || '—')}</td>
        <td data-label="Categoria"><span class="badge badge-${catColors[d.category||'diversos']||'gray'}" style="text-transform:uppercase">${esc(d.category || 'DIVERSOS')}</span></td>
        <td data-label="Tamanho" class="td-muted">${fmtSize(d.sizeBytes)}</td>
        <td data-label="Enviado por" class="td-muted" style="font-size:0.78rem">${esc(d.uploadedByName || '—')}</td>
        <td data-label="Data / Hora" class="td-muted" style="font-size:0.8rem">
           <div>${fmt.date(d.createdAt)}</div>
           <div style="font-size:0.7rem">${new Date(d.createdAt).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}</div>
        </td>
        <td data-label="Ações" style="text-align:right" class="td-actions">
           <button class="btn btn-ghost btn-sm btn-icon" title="Baixar" data-on-click="alert('Funcionalidade de Download. Arquivo Base64 indisponível no mock.')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg></button>
           ${isSuperadmin ? `<button class="btn btn-ghost btn-sm btn-icon" style="color:var(--danger)" data-on-click="deleteDoc('${d.id}')" title="Excluir"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>` : ''}
        </td>
      </tr>`).join('') : '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:32px">Nenhum documento encontrado nos filtros selecionados.</td></tr>';
        }

        function openUploadDocModal() {
            document.getElementById('updFile').value = '';
            document.getElementById('updDesc').value = '';
            openModal('modalUploadDoc');
        }

        function submitUploadDoc() {
            const fileInput = document.getElementById('updFile');
            const desc = document.getElementById('updDesc').value.trim();
            const clientId = document.getElementById('updClient').value;
            const category = document.getElementById('updCat').value;

            if (!fileInput.files.length) return toast('Erro', 'Selecione um arquivo.', 'error');
            const file = fileInput.files[0];

            let clientName = '';
            if (clientId) {
                const c = db.get('clients').find(x => x.id === clientId);
                if (c) clientName = c.fantasia || c.razaoSocial;
            }

            const docObj = {
                id: utils.generateId(),
                name: file.name,
                description: desc,
                clientId: clientId || null,
                clientName: clientName || null,
                category: category || 'diversos',
                sizeBytes: file.size,
                uploadedByName: session.name || 'Admin',
                createdAt: new Date().toISOString()
            };

            const docs = db.get('documents');
            docs.push(docObj);
            db.set('documents', docs);

            // Audit
            logAudit('doc_upload', `Documento: ${file.name} (Cliente: ${clientName || 'Nenhum'})`);
            
            closeModal('modalUploadDoc');
            toast('Sucesso', 'Documento adicionado à base.', 'success');
            loadDocs();
        }

        function deleteDoc(id) {
            if (!isSuperadmin) return toast('Erro', 'Acesso negado', 'error');
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
            // Respect current filters
            const search = document.getElementById('docSearch').value.toLowerCase();
            const fClient = document.getElementById('docClientFilter').value;
            const fCat = document.getElementById('docCatFilter').value;
            const sDate = document.getElementById('docStart').value;
            const eDate = document.getElementById('docEnd').value;
            
            let filteredDocs = db.get('documents').sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
            if (fClient) filteredDocs = filteredDocs.filter(d => d.clientId === fClient);
            if (fCat) filteredDocs = filteredDocs.filter(d => d.category === fCat);
            if (search) filteredDocs = filteredDocs.filter(d => (d.name||'').toLowerCase().includes(search) || (d.description||'').toLowerCase().includes(search));
            if (sDate) filteredDocs = filteredDocs.filter(d => new Date(d.createdAt).getTime() >= new Date(sDate + 'T00:00:00').getTime());
            if (eDate) filteredDocs = filteredDocs.filter(d => new Date(d.createdAt).getTime() <= new Date(eDate + 'T23:59:59').getTime());

            const data = filteredDocs.map(d => ({ arquivo: d.name, descricao: d.description || '', cliente: d.clientName || '', categoria: d.category || 'diversos', tamanho: fmtSize(d.sizeBytes), enviadoPor: d.uploadedByName || '', data: fmt.datetime(d.createdAt) }));
            exportCSV(data, 'documentos-filtrados-renostter.csv');
            toast('CSV exportado', 'Apenas os resultados visíveis foram baixados.', 'success');
        }


        // ─── Helpers ───
        const CHART_COLORS = ['#00AEEF', '#FF6B00', '#2EA043', '#D29922', '#DA3633', '#388BFD', '#8B949E', '#F0AD00'];
        const CHART_OPTS = (indexAxis) => ({
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                [indexAxis === 'y' ? 'x' : 'y']: { beginAtZero: true, ticks: { color: '#8B949E' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                [indexAxis === 'y' ? 'y' : 'x']: { ticks: { color: '#8B949E' }, grid: { display: false } }
            }
        });

        function mkBarChart(id, labels, data, colors, opts = {}) {
            return new Chart(document.getElementById(id), {
                type: 'bar',
                data: { labels, datasets: [{ data, backgroundColor: colors || CHART_COLORS.slice(0, labels.length), borderRadius: 6 }] },
                options: { ...CHART_OPTS(opts.indexAxis || 'x'), ...(opts.extra || {}) }
            });
        }

        // ─── TAB: KPI ───
        function loadKPI() {
            const tickets = db.get('tickets');
            const csat = db.get('csat');
            const closed = tickets.filter(t => t.closedAt);
            const total = tickets.length;
            const nowMs = Date.now();

            const avgCsat = csat.length ? (csat.reduce((s, r) => s + r.rating, 0) / csat.length).toFixed(1) : '—';
            let avgResH = '—';
            if (closed.length) {
                const avgMs = closed.reduce((s, t) => s + (new Date(t.closedAt) - new Date(t.createdAt)), 0) / closed.length;
                avgResH = (avgMs / 3600_000).toFixed(1) + 'h';
            }
            const slaViolations = closed.filter(t => t.closedAt && t.slaResolutionDeadline !== 'cronograma' && new Date(t.closedAt) > new Date(t.slaResolutionDeadline)).length;
            const slaCompliance = closed.length ? Math.round(((closed.length - slaViolations) / closed.length) * 100) : null;
            const expiredOpen = tickets.filter(t => !['resolvido', 'fechado', 'cancelado'].includes(t.status) && new Date((t.slaResolutionDeadline==='cronograma' ? 0 : t.slaResolutionDeadline) || 0).getTime() < nowMs).length;

            document.getElementById('advKpis').innerHTML = [
                { label: 'Total de Chamados', value: total, icon: '🎫', cls: 'blue' },
                { label: 'Taxa de Resolução', value: total ? Math.round(closed.length / total * 100) + '%' : '—', icon: '✅', cls: 'green' },
                { label: 'Tempo Médio Resolução', value: avgResH, icon: '⏱', cls: 'orange' },
                { label: 'SLA Compliance', value: slaCompliance !== null ? slaCompliance + '%' : '—', icon: '📊', cls: slaCompliance >= 90 ? 'green' : 'yellow' },
                { label: 'CSAT Médio', value: avgCsat !== '—' ? avgCsat + '★' : '—', icon: '⭐', cls: 'yellow' },
                { label: 'SLAs Vencidos (ativos)', value: expiredOpen, icon: '🔴', cls: expiredOpen > 0 ? 'red' : 'green' },
            ].map(k => `<div class="kpi-card"><div class="kpi-info"><div class="kpi-label">${k.label}</div><div class="kpi-value" style="font-size:1.6rem">${k.value}</div></div><div class="kpi-icon ${k.cls}" style="font-size:1.2rem">${k.icon}</div></div>`).join('');

            // Chart: categories
            const catMap = {};
            tickets.forEach(t => { catMap[t.category || 'outros'] = (catMap[t.category || 'outros'] || 0) + 1; });
            mkBarChart('chartCat', Object.keys(catMap), Object.values(catMap), CHART_COLORS, { indexAxis: 'y' });

            // Chart: resolution time by category (hours avg)
            const resMap = {};
            closed.forEach(t => {
                const cat = t.category || 'outros';
                const h = (new Date(t.closedAt) - new Date(t.createdAt)) / 3600_000;
                if (!resMap[cat]) resMap[cat] = { sum: 0, n: 0 };
                resMap[cat].sum += h; resMap[cat].n++;
            });
            const rL = Object.keys(resMap);
            mkBarChart('chartResol', rL, rL.map(k => (resMap[k].sum / resMap[k].n).toFixed(1)), ['rgba(255,107,0,.5)']);

            // Chart: CSAT distribution
            const dist = [1, 2, 3, 4, 5].map(r => csat.filter(c => c.rating === r).length);
            new Chart(document.getElementById('chartCsat'), {
                type: 'bar',
                data: { labels: ['1★', '2★', '3★', '4★', '5★'], datasets: [{ data: dist, backgroundColor: ['#DA3633', '#D29922', '#388BFD', '#2EA043', '#F0AD00'], borderRadius: 6 }] },
                options: CHART_OPTS('x')
            });

            // Chart: tech performance
            const techMap = {};
            tickets.filter(t => t.assignedName).forEach(t => {
                if (!techMap[t.assignedName]) techMap[t.assignedName] = { total: 0, closed: 0 };
                techMap[t.assignedName].total++;
                if (t.closedAt) techMap[t.assignedName].closed++;
            });
            const tL = Object.keys(techMap);
            new Chart(document.getElementById('chartTech'), {
                type: 'bar',
                data: {
                    labels: tL,
                    datasets: [
                        { label: 'Total', data: tL.map(k => techMap[k].total), backgroundColor: 'rgba(0,174,239,.35)', borderColor: '#00AEEF', borderWidth: 2, borderRadius: 6 },
                        { label: 'Resolvidos', data: tL.map(k => techMap[k].closed), backgroundColor: 'rgba(46,160,67,.45)', borderColor: '#2EA043', borderWidth: 2, borderRadius: 6 }
                    ]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#8B949E' } } }, scales: { y: { beginAtZero: true, ticks: { color: '#8B949E' }, grid: { color: 'rgba(255,255,255,.05)' } }, x: { ticks: { color: '#8B949E' }, grid: { display: false } } } }
            });

            // CSAT table
            const sortedCsat = [...csat].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            document.getElementById('csatTable').innerHTML = sortedCsat.length ? sortedCsat.map(c => {
                const t = db.find('tickets', c.ticketId) || {};
                return `<tr><td>${esc(c.clientName)}</td><td class="td-muted">${t.num || '—'}</td><td>${esc(t.assignedName || '—')}</td><td>${renderStars(c.rating)}</td><td style="font-size:0.82rem;color:var(--text-secondary)">${esc(c.comment || '—')}</td><td class="td-muted">${fmt.date(c.createdAt)}</td></tr>`;
            }).join('') : `<tr><td colspan="6"><div class="empty-state"><h4>Nenhuma avaliação ainda</h4></div></td></tr>`;
        }

        // ─── TAB: Clients ───
        function loadClients() {
            const clients = db.get('clients');
            const contracts = db.get('contracts');
            const tickets = db.get('tickets');

            const activos = clients.filter(c => c.status === 'ativo').length;
            const inativos = clients.filter(c => c.status !== 'ativo').length;
            const contrAtivos = contracts.filter(c => c.status === 'ativo').length;
            const contrInativos = contracts.filter(c => c.status !== 'ativo').length;

            document.getElementById('clientKpis').innerHTML = [
                { label: 'Clientes Ativos', value: activos, icon: '🟢', cls: 'green' },
                { label: 'Clientes Inativos', value: inativos, icon: '⭐', cls: 'gray' },
                { label: 'Contratos Ativos', value: contrAtivos, icon: '📄', cls: 'blue' },
                { label: 'Contratos Encerrados', value: contrInativos, icon: '📁', cls: 'gray' },
            ].map(k => `<div class="kpi-card"><div class="kpi-info"><div class="kpi-label">${k.label}</div><div class="kpi-value">${k.value}</div></div><div class="kpi-icon ${k.cls}" style="font-size:1.3rem">${k.icon}</div></div>`).join('');

            // Client volume chart
            const volMap = {};
            tickets.forEach(t => { volMap[t.clientName] = (volMap[t.clientName] || 0) + 1; });
            const sortedVol = Object.entries(volMap).sort((a, b) => b[1] - a[1]).slice(0, 8);
            mkBarChart('chartClientVol', sortedVol.map(x => x[0]), sortedVol.map(x => x[1]), CHART_COLORS, { indexAxis: 'y' });

            // Contract status pie
            new Chart(document.getElementById('chartContractStatus'), {
                type: 'doughnut',
                data: {
                    labels: ['Ativo', 'Inativo'],
                    datasets: [{ data: [contrAtivos, contrInativos], backgroundColor: ['#2EA043', '#8B949E'], borderWidth: 0 }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#8B949E' } } } }
            });

            // Client table
            document.getElementById('clientTable').innerHTML = clients.map(c => {
                const tks = tickets.filter(t => t.clientId === c.id);
                const resolved = tks.filter(t => t.closedAt).length;
                return `<tr>
      <td><div style="font-weight:500">${esc(c.fantasia || c.razaoSocial)}</div><div style="font-size:0.76rem;color:var(--text-secondary)">${esc(c.cnpj || '')}</div></td>
      <td class="td-muted">${esc(c.contato || '—')}</td>
      <td class="td-muted" style="font-size:0.8rem">${c.celular || c.telefone ? `<a href="tel:${(c.celular || c.telefone || '').replace(/\D/g, '')}" style="color:var(--blue)">${esc(c.celular || c.telefone)}</a>` : '—'}</td>
      <td style="text-align:center;font-weight:600">${tks.length}</td>
      <td style="text-align:center;color:var(--success);font-weight:600">${resolved}</td>
      <td>${c.status === 'ativo' ? '<span class="badge badge-green">Ativo</span>' : '<span class="badge badge-gray">Inativo</span>'}</td>
    </tr>`;
            }).join('');
        }

        // ─── TAB: Transfers ───
        function loadTransfers() {
            const transfers = db.get('transfers').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            const tickets = db.get('tickets');

            // Avg time to resolve after transfer (simulated)
            const avgPostH = transfers.length ? '18.4h' : '—';

            document.getElementById('transferKpis').innerHTML = [
                { label: 'Total de Transferências', value: transfers.length, icon: '🔄', cls: 'blue' },
                { label: 'Usuários Envolvidos', value: new Set([...transfers.map(x => x.fromUserId), ...transfers.map(x => x.toUserId)]).size, icon: '👤', cls: 'orange' },
                { label: 'Chamados Transferidos', value: new Set(transfers.map(x => x.ticketId)).size, icon: '🎫', cls: 'yellow' },
                { label: 'Tempo Médio Pós-Transfer.', value: avgPostH, icon: '⏱', cls: 'green' },
            ].map(k => `<div class="kpi-card"><div class="kpi-info"><div class="kpi-label">${k.label}</div><div class="kpi-value">${k.value}</div></div><div class="kpi-icon ${k.cls}" style="font-size:1.3rem">${k.icon}</div></div>`).join('');

            // From chart
            const fromMap = {};
            transfers.forEach(x => { fromMap[x.fromUserName] = (fromMap[x.fromUserName] || 0) + 1; });
            const fromLabels = Object.keys(fromMap).sort((a, b) => fromMap[b] - fromMap[a]);
            mkBarChart('chartTransferFrom', fromLabels, fromLabels.map(k => fromMap[k]), CHART_COLORS);

            // To chart
            const toMap = {};
            transfers.forEach(x => { toMap[x.toUserName] = (toMap[x.toUserName] || 0) + 1; });
            const toLabels = Object.keys(toMap).sort((a, b) => toMap[b] - toMap[a]);
            mkBarChart('chartTransferTo', toLabels, toLabels.map(k => toMap[k]), ['rgba(46,160,67,.5)', 'rgba(0,174,239,.5)', 'rgba(255,107,0,.5)']);

            // Transfers table
            document.getElementById('transferTable').innerHTML = transfers.length ? transfers.map(x => {
                return `<tr>
      <td><div style="font-family:monospace;font-size:0.78rem;color:var(--text-secondary)">${esc(x.ticketNum)}</div><div style="font-size:0.78rem;font-weight:500;max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(x.ticketTitle || '')}</div></td>
      <td class="td-muted">${esc(x.fromUserName)}</td>
      <td style="color:var(--blue);font-weight:500">${esc(x.toUserName)}</td>
      <td style="font-size:0.8rem;max-width:200px;color:var(--text-secondary);font-style:italic">${esc(x.reason)}</td>
      <td class="td-muted">${fmt.datetime(x.createdAt)}</td>
    </tr>`;
            }).join('') : `<tr><td colspan="5"><div class="empty-state"><h4>Nenhuma transferência registrada</h4></div></td></tr>`;
        }

        // ─── TAB: Audit ───
        let auditCurrentPage = 1;
        const AUDIT_ITEMS_PER_PAGE = 50;

        function populateAuditUsers() {
            const users = db.get('users');
            const sel = document.getElementById('auditUser');
            sel.innerHTML = '<option value="">Todos os usuários</option>' + users.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('');
        }

        function getAuditIcon(action) {
            const icons = {
                'login': '🟢', 'logout': '🔴', 'transfer': '🔄', 'password_change': '🔑',
                'create_ticket': '🎫', 'doc_upload': '📎', 'doc_replace': '📝', 'doc_delete': '🗑️',
                'ticket_resolved': '✅', 'ticket_status_change': '📈'
            };
            return icons[action] || '⚙️';
        }

        function renderAudit(page = 1) {
            if (!isSuperadmin) return;
            auditCurrentPage = page;
            const action = document.getElementById('auditAction').value;
            const userId = document.getElementById('auditUser').value;
            const search = document.getElementById('auditSearch').value.toLowerCase();
            const sDate = document.getElementById('auditStart').value;
            const eDate = document.getElementById('auditEnd').value;
            
            let logs = db.get('auditlog').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            
            // apply filters
            if (action) logs = logs.filter(l => l.action === action);
            if (userId) logs = logs.filter(l => l.userId === userId);
            if (search) {
                logs = logs.filter(l => 
                    (l.userName || '').toLowerCase().includes(search) || 
                    (l.details || '').toLowerCase().includes(search) ||
                    (l.action || '').toLowerCase().includes(search)
                );
            }
            if (sDate) {
                const sTime = new Date(sDate + 'T00:00:00').getTime();
                logs = logs.filter(l => new Date(l.createdAt).getTime() >= sTime);
            }
            if (eDate) {
                const eTime = new Date(eDate + 'T23:59:59').getTime();
                logs = logs.filter(l => new Date(l.createdAt).getTime() <= eTime);
            }

            document.getElementById('auditCount').textContent = `(${logs.length} registros encontrad${logs.length===1?'o':'os'})`;
            
            // pagination logic
            const totalPages = Math.ceil(logs.length / AUDIT_ITEMS_PER_PAGE);
            const startIdx = (auditCurrentPage - 1) * AUDIT_ITEMS_PER_PAGE;
            const paginatedLogs = logs.slice(startIdx, startIdx + AUDIT_ITEMS_PER_PAGE);

            document.getElementById('auditList').innerHTML = paginatedLogs.length ? paginatedLogs.map(l => `
    <div class="audit-row" style="padding:16px;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;margin-bottom:12px;display:flex;gap:16px;align-items:flex-start;transition:all 0.2s ease;cursor:default;" data-on-mouseover="this.style.boxShadow='var(--shadow)'" data-on-mouseout="this.style.boxShadow='none'">
      <div style="font-size:1.6rem;min-width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.05);display:flex;align-items:center;justify-content:center;text-align:center">${getAuditIcon(l.action)}</div>
      <div class="audit-detail" style="flex:1">
        <div><strong style="color:var(--text-primary);font-size:0.95rem">${esc(l.userName)}</strong> <span style="color:var(--text-muted);font-size:0.7rem;border:1px solid var(--border-med);padding:3px 8px;border-radius:12px;margin-left:6px">${l.userRole === 'superadmin' ? 'Administrador Master' : esc(l.userRole)}</span></div>
        <div style="color:var(--text-secondary);margin-top:6px;font-size:0.9rem;line-height:1.4">${esc(l.details || `Ação: ${l.action}`)}</div>
      </div>
      <div class="audit-when" style="font-size:0.8rem;color:var(--text-muted);text-align:right;white-space:nowrap">
        <div style="font-weight:600;color:var(--text-primary)">${fmt.date(l.createdAt)}</div>
        <div style="margin-top:2px">${new Date(l.createdAt).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}</div>
      </div>
    </div>`).join('') : `<div style="text-align:center;padding:48px 24px;color:var(--text-secondary);background:var(--bg-surface);border-radius:8px">Nenhum log encontrado para os filtros selecionados.</div>`;

            // render pagination controls
            const pagEl = document.getElementById('auditPagination');
            if (totalPages > 1) {
                let html = `<button class="btn btn-ghost btn-sm" data-on-click="renderAudit(${Math.max(1, auditCurrentPage - 1)})" ${auditCurrentPage===1?'disabled':''}>Anterior</button>`;
                html += `<span style="display:flex;align-items:center;padding:0 12px;font-size:0.8rem;color:var(--text-muted)">Página ${auditCurrentPage} de ${totalPages}</span>`;
                html += `<button class="btn btn-ghost btn-sm" data-on-click="renderAudit(${Math.min(totalPages, auditCurrentPage + 1)})" ${auditCurrentPage===totalPages?'disabled':''}>Próxima</button>`;
                pagEl.innerHTML = html;
            } else {
                pagEl.innerHTML = '';
            }
        }

        function exportAudit() {
            // Re-apply same filters for export
            const action = document.getElementById('auditAction').value;
            const userId = document.getElementById('auditUser').value;
            const search = document.getElementById('auditSearch').value.toLowerCase();
            const sDate = document.getElementById('auditStart').value;
            const eDate = document.getElementById('auditEnd').value;
            
            let logs = db.get('auditlog').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            if (action) logs = logs.filter(l => l.action === action);
            if (userId) logs = logs.filter(l => l.userId === userId);
            if (search) logs = logs.filter(l => (l.userName || '').toLowerCase().includes(search) || (l.details || '').toLowerCase().includes(search) || Math.random() < 0);
            if (sDate) logs = logs.filter(l => new Date(l.createdAt).getTime() >= new Date(sDate + 'T00:00:00').getTime());
            if (eDate) logs = logs.filter(l => new Date(l.createdAt).getTime() <= new Date(eDate + 'T23:59:59').getTime());

            exportCSV(logs.map(l => ({ acao: l.action, usuario: l.userName, papel: l.userRole, detalhes: l.details, data: fmt.datetime(l.createdAt) })), 'audit-log-filtrado.csv');
            toast('Auditoria exportada', 'Exportando apenas dados filtrados.', 'success');
        }

        function exportAll() {
            const tickets = db.get('tickets').map(t => ({ num: t.num, titulo: t.title, cliente: t.clientName, status: t.status, prioridade: t.priority, categoria: t.category, abertura: fmt.date(t.createdAt), resolucao: fmt.date(t.closedAt) }));
            exportCSV(tickets, 'chamados-renostter.csv');
            toast('CSV exportado', '', 'success');
        }

        // ─── TAB: Tech Perf ───
        function loadTechPerf() {
            const users = db.get('users').filter(u => ['tecnico', 'admin', 'superadmin'].includes(u.role));
            document.getElementById('tpTech').innerHTML = '<option value="">Todos os Técnicos</option>' + users.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('');
            renderTechPerf();
        }

        let tpChartBar, tpChartLine;

        function renderTechPerf() {
            const csat = db.get('csat');
            const tickets = db.get('tickets');
            
            // Filters
            const period = document.getElementById('tpDate').value;
            const startEl = document.getElementById('tpCustomDate');
            if (period === 'custom') startEl.style.display = 'flex';
            else startEl.style.display = 'none';

            const sDate = document.getElementById('tpStart').value;
            const eDate = document.getElementById('tpEnd').value;
            const techId = document.getElementById('tpTech').value;
            const cat = document.getElementById('tpCat').value;

            const now = new Date();
            let minDate = 0, maxDate = Infinity;

            if (period === 'today') {
                minDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
            } else if (period === '7d') {
                minDate = now.getTime() - 7 * 86400000;
            } else if (period === '30d') {
                minDate = now.getTime() - 30 * 86400000;
            } else if (period === 'this_month') {
                minDate = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
            } else if (period === 'custom') {
                if (sDate) minDate = new Date(sDate + 'T00:00:00').getTime();
                if (eDate) maxDate = new Date(eDate + 'T23:59:59').getTime();
            }

            // Join CSAT with ticket info and apply filters
            let fCsat = [];
            let fClosedTicks = []; // to calculate response rate

            tickets.filter(t => t.closedAt).forEach(t => {
                const cTime = new Date(t.closedAt).getTime();
                if (cTime >= minDate && cTime <= maxDate) {
                    if (techId && t.assignedTo !== techId) return;
                    if (cat && t.category !== cat) return;
                    fClosedTicks.push(t);
                }
            });

            csat.forEach(c => {
                const cTime = new Date(c.createdAt).getTime();
                if (cTime >= minDate && cTime <= maxDate) {
                    const t = db.find('tickets', c.ticketId) || {};
                    if (techId && t.assignedTo !== techId) return;
                    if (cat && t.category !== cat) return;
                    fCsat.push({ ...c, ticket: t });
                }
            });

            const totalEvals = fCsat.length;
            let avgScore = '—', responseRate = '—', posRate = '—';
            if (totalEvals > 0) {
                const sum = fCsat.reduce((acc, c) => acc + c.rating, 0);
                avgScore = (sum / totalEvals).toFixed(1);
                const positives = fCsat.filter(c => c.rating >= 4).length;
                posRate = Math.round((positives / totalEvals) * 100) + '%';
            }
            if (fClosedTicks.length > 0) {
                responseRate = Math.round((totalEvals / fClosedTicks.length) * 100) + '%';
            }

            document.getElementById('tpKpis').innerHTML = [
                { label: 'Total Avaliações', value: totalEvals, icon: '⭐', cls: 'blue' },
                { label: 'Média de Nota', value: avgScore !== '—' ? avgScore + '★' : '—', icon: '📈', cls: 'orange' },
                { label: 'Taxa de Resposta', value: responseRate, icon: '📩', cls: 'green' },
                { label: '% Positivas (4-5★)', value: posRate, icon: '👍', cls: 'yellow' },
            ].map(k => `<div class="kpi-card"><div class="kpi-info"><div class="kpi-label">${k.label}</div><div class="kpi-value" style="font-size:1.6rem">${k.value}</div></div><div class="kpi-icon ${k.cls}" style="font-size:1.3rem">${k.icon}</div></div>`).join('');

            const techStats = {};
            fCsat.forEach(c => {
                const tId = c.ticket.assignedTo || 'sem-tecnico';
                const tName = c.ticket.assignedName || 'Não Atribuído';
                if (!techStats[tId]) techStats[tId] = { name: tName, total: 0, sum: 0, positives: 0, closedCount: 0 };
                techStats[tId].total++;
                techStats[tId].sum += c.rating;
                if (c.rating >= 4) techStats[tId].positives++;
            });
            fClosedTicks.forEach(t => {
                const tId = t.assignedTo || 'sem-tecnico';
                if (techStats[tId]) techStats[tId].closedCount++;
            });

            const sortedTechs = Object.values(techStats).sort((a,b) => (b.sum/b.total || 0) - (a.sum/a.total || 0));

            const barLabels = sortedTechs.map(x => x.name.split(' ')[0]);
            const barData = sortedTechs.map(x => (x.sum / x.total).toFixed(2));
            if (tpChartBar) tpChartBar.destroy();
            tpChartBar = new Chart(document.getElementById('chartTpBar'), {
                type: 'bar',
                data: { labels: barLabels, datasets: [{ data: barData, backgroundColor: CHART_COLORS.slice(0, barLabels.length), borderRadius: 4 }] },
                options: { ...CHART_OPTS('x'), scales: { y: { min: 0, max: 5 } } }
            });

            const dateMap = {};
            fCsat.forEach(c => {
                const dStr = c.createdAt.slice(0, 10);
                if (!dateMap[dStr]) dateMap[dStr] = { sum:0, total:0 };
                dateMap[dStr].sum += c.rating;
                dateMap[dStr].total++;
            });
            const sortedDates = Object.keys(dateMap).sort();
            const lineData = sortedDates.map(d => (dateMap[d].sum / dateMap[d].total).toFixed(2));
            const lineLabels = sortedDates.map(d => {
                const parts = d.split('-'); return `${parts[2]}/${parts[1]}`;
            });

            if (tpChartLine) tpChartLine.destroy();
            tpChartLine = new Chart(document.getElementById('chartTpLine'), {
                type: 'line',
                data: { labels: lineLabels, datasets: [{ label: 'Média', data: lineData, borderColor: '#00AEEF', tension: 0.2, fill: true, backgroundColor: 'rgba(0,174,239,.1)' }] },
                options: { ...CHART_OPTS('x'), scales: { y: { min: 0, max: 5 } } }
            });

            document.getElementById('tpTable').innerHTML = sortedTechs.length ? sortedTechs.map(x => {
                const avg = (x.sum / x.total).toFixed(1);
                const pRate = Math.round((x.positives / x.total) * 100) + '%';
                const rRate = x.closedCount ? Math.round((x.total / x.closedCount) * 100) + '%' : '—';
                return `<tr>
                    <td style="font-weight:500">${esc(x.name)}</td>
                    <td style="text-align:center">${x.total}</td>
                    <td style="text-align:center;font-weight:600;color:var(--text-primary)">${avg}★</td>
                    <td style="text-align:center" class="td-muted">${rRate}</td>
                    <td style="text-align:center;color:${x.positives/x.total >= 0.8 ? 'var(--success)' : 'var(--text-muted)'}">${pRate}</td>
                    <td><button class="btn btn-ghost btn-sm" data-on-click="openTechFeedbacks('${esc(x.name)}')">📄 Ver</button></td>
                </tr>`;
            }).join('') : `<tr><td colspan="6"><div class="empty-state">Sem dados no período</div></td></tr>`;
        }

        function openTechFeedbacks(techName) {
            const csat = db.get('csat');
            const period = document.getElementById('tpDate').value;
            const sDate = document.getElementById('tpStart').value;
            const eDate = document.getElementById('tpEnd').value;
            const cat = document.getElementById('tpCat').value;
            const now = new Date(); let minDate = 0, maxDate = Infinity;
            if (period === 'today') minDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
            else if (period === '7d') minDate = now.getTime() - 7 * 86400000;
            else if (period === '30d') minDate = now.getTime() - 30 * 86400000;
            else if (period === 'this_month') minDate = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
            else if (period === 'custom') {
                if (sDate) minDate = new Date(sDate + 'T00:00:00').getTime();
                if (eDate) maxDate = new Date(eDate + 'T23:59:59').getTime();
            }
            
            let fCsat = [];
            csat.forEach(c => {
                const cTime = new Date(c.createdAt).getTime();
                if (cTime >= minDate && cTime <= maxDate) {
                    const t = db.find('tickets', c.ticketId) || {};
                    if ((t.assignedName || 'Não Atribuído') !== techName) return;
                    if (cat && t.category !== cat) return;
                    fCsat.push({ ...c, ticket: t });
                }
            });

            fCsat.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
            document.getElementById('tpModalTitle').textContent = `💬 Feedbacks: ${techName}`;
            document.getElementById('tpModalBody').innerHTML = fCsat.length ? fCsat.map(c => `
                <div style="padding:12px;border:1px solid var(--border);border-radius:8px;margin-bottom:10px;background:var(--bg-surface)">
                    <div style="display:flex;justify-content:space-between;margin-bottom:6px">
                        <strong style="font-size:0.85rem">${esc(c.clientName)}</strong>
                        <span>${renderStars(c.rating)}</span>
                    </div>
                    <div style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:6px">${c.comment ? esc(c.comment) : '<em>Sem comentário</em>'}</div>
                    <div style="font-size:0.75rem;color:var(--text-muted);display:flex;justify-content:space-between">
                        <span>Chamado #${c.ticket.num}</span>
                        <span>${fmt.date(c.createdAt)}</span>
                    </div>
                </div>
            `).join('') : '<p style="color:var(--text-secondary);text-align:center">Nenhum feedback associado.</p>';
            openModal('modalTpFeedbacks');
        }

        function exportTechPerf() {
            const csat = db.get('csat');
            const period = document.getElementById('tpDate').value;
            const sDate = document.getElementById('tpStart').value;
            const eDate = document.getElementById('tpEnd').value;
            const techId = document.getElementById('tpTech').value;
            const cat = document.getElementById('tpCat').value;
            const now = new Date(); let minDate = 0, maxDate = Infinity;
            if (period === 'today') minDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
            else if (period === '7d') minDate = now.getTime() - 7 * 86400000;
            else if (period === '30d') minDate = now.getTime() - 30 * 86400000;
            else if (period === 'this_month') minDate = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
            else if (period === 'custom') {
                if (sDate) minDate = new Date(sDate + 'T00:00:00').getTime();
                if (eDate) maxDate = new Date(eDate + 'T23:59:59').getTime();
            }
            
            let rows = [];
            csat.forEach(c => {
                const cTime = new Date(c.createdAt).getTime();
                if (cTime >= minDate && cTime <= maxDate) {
                    const t = db.find('tickets', c.ticketId) || {};
                    if (techId && t.assignedTo !== techId) return;
                    if (cat && t.category !== cat) return;
                    rows.push({
                        Data: fmt.datetime(c.createdAt),
                        Cliente: c.clientName,
                        Chamado: t.num || '',
                        Categoria: t.category || '',
                        Tecnico: t.assignedName || 'Não Atribuído',
                        Estrelas: c.rating,
                        Comentario: c.comment || ''
                    });
                }
            });

            if (rows.length) {
                exportCSV(rows, 'csat-desempenho-tecnicos.csv');
                toast('Dados Exportados', '', 'success');
            } else {
                toast('Sem dados', 'Nenhum resultado para exportar.', 'warning');
            }
        }

        // Init
        initSidebar();
        chartsInit['kpi'] = true;
        loadKPI();
    
