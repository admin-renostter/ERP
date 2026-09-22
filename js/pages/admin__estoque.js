/* Extraido de admin/estoque.html por tools/csp-migrate.py (CSP sem unsafe-inline). */
/* ── gerado por tools/csp-migrate.py: nomes liberados para os data-on-* desta pagina ── */
;(function () {
  var s = window.__cspScope || (window.__cspScope = {});
  function def(n, g, st) { Object.defineProperty(s, n, { configurable: true, enumerable: true, get: g, set: st }); }
  def('auth', function () { return typeof auth !== 'undefined' ? auth : undefined; }, function (v) { auth = v; });
  def('closeModal', function () { return typeof closeModal !== 'undefined' ? closeModal : undefined; }, function (v) { closeModal = v; });
  def('exportMasterInventory', function () { return typeof exportMasterInventory !== 'undefined' ? exportMasterInventory : undefined; }, function (v) { exportMasterInventory = v; });
  def('loadInventoryReport', function () { return typeof loadInventoryReport !== 'undefined' ? loadInventoryReport : undefined; }, function (v) { loadInventoryReport = v; });
  def('openMovimentarEstoqueModal', function () { return typeof openMovimentarEstoqueModal !== 'undefined' ? openMovimentarEstoqueModal : undefined; }, function (v) { openMovimentarEstoqueModal = v; });
  def('submitMovimentarEstoque', function () { return typeof submitMovimentarEstoque !== 'undefined' ? submitMovimentarEstoque : undefined; }, function (v) { submitMovimentarEstoque = v; });
})();
/* ── fim do bloco gerado ── */

        // ─── Auth + sidebar ───
        const session = auth.protect(['admin', 'superadmin']);
        initSidebar();

        // ─── Chart helper ───
        function mkBarChart(id, labels, data, colors, opts = {}) {
            const indexAxis = opts.indexAxis || 'x';
            const ctx = document.getElementById(id).getContext('2d');
            if (window[id + 'Inst']) window[id + 'Inst'].destroy();
            window[id + 'Inst'] = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [{ data, backgroundColor: Array.isArray(colors) ? colors : [colors], borderRadius: 6 }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    indexAxis,
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
                }
            });
        }

        // ─── Render principal ───
        function loadInventoryReport() {
            const products = db.get('inventory');
            const movements = db.get('stock_movements');
            const importLogs = db.get('import_logs') || [];

            const totalItems = products.length;
            const totalValue = products.reduce((s, p) => s + (p.currentStock * (p.costPrice || 0)), 0);
            const critical = products.filter(p => p.currentStock <= p.minStock).length;
            const recentMovements = movements.filter(m => new Date(m.createdAt) > new Date(Date.now() - 30 * 86400000)).length;

            // KPIs
            const kpis = [
                { label: 'Itens no Catálogo', value: totalItems, icon: '📦', cls: 'blue' },
                { label: 'Valor Total em Estoque', value: fmt.currency(totalValue), icon: '💰', cls: 'green' },
                { label: 'Itens c/ Estoque Crítico', value: critical, icon: '⚠️', cls: 'red' },
                { label: 'Movimentações (30 dias)', value: recentMovements, icon: '🔄', cls: 'orange' },
            ];
            document.getElementById('invKpis').innerHTML = kpis.map(k => `
                <div class="kpi-card">
                    <div class="kpi-info">
                        <div class="kpi-label">${esc(k.label)}</div>
                        <div class="kpi-value" style="font-size:1.4rem">${k.value}</div>
                    </div>
                    <div class="kpi-icon ${k.cls}" style="font-size:1.3rem">${k.icon}</div>
                </div>`).join('');

            // Curva ABC
            const abcData = [...products].map(p => ({ name: p.name, val: p.currentStock * (p.costPrice || 0) }))
                .sort((a, b) => b.val - a.val).slice(0, 10);
            mkBarChart('chartABC', abcData.map(x => x.name), abcData.map(x => x.val), ['rgba(0,174,239,.6)'], { indexAxis: 'y' });

            // Movimentação Mensal
            const months = {};
            movements.forEach(m => {
                const mo = (m.createdAt || '').slice(0, 7);
                if (!months[mo]) months[mo] = { in: 0, out: 0 };
                if (m.quantity > 0) months[mo].in += m.quantity;
                else months[mo].out += Math.abs(m.quantity);
            });
            const mLabels = Object.keys(months).sort().slice(-6);
            if (window.chartInvMovInst) window.chartInvMovInst.destroy();
            window.chartInvMovInst = new Chart(document.getElementById('chartInvMovements'), {
                type: 'line',
                data: {
                    labels: mLabels,
                    datasets: [
                        { label: 'Entradas', data: mLabels.map(l => months[l].in), borderColor: '#2EA043', backgroundColor: 'rgba(46,160,67,.1)', fill: true, tension: 0.4 },
                        { label: 'Saídas', data: mLabels.map(l => months[l].out), borderColor: '#DA3633', backgroundColor: 'rgba(218,54,51,.1)', fill: true, tension: 0.4 }
                    ]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { labels: { color: '#8B949E' } } },
                    scales: {
                        y: { beginAtZero: true, ticks: { color: '#8B949E' } },
                        x: { ticks: { color: '#8B949E' } }
                    }
                }
            });

            // Populate category/location dropdowns (uma vez)
            const catSet = new Set(), locSet = new Set();
            products.forEach(p => {
                if (p.category) catSet.add(p.category);
                if (p.location) locSet.add(p.location);
            });
            const selCat = document.getElementById('invCatFilter');
            const selLoc = document.getElementById('invLocFilter');
            if (selCat.options.length <= 1) {
                selCat.innerHTML = '<option value="">Todas</option>' + [...catSet].sort().map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
            }
            if (selLoc.options.length <= 1) {
                selLoc.innerHTML = '<option value="">Todas</option>' + [...locSet].sort().map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
            }

            // ─── Filtros da tabela mestre ───
            const search = (document.getElementById('invSearch').value || '').toLowerCase();
            const fStatus = document.getElementById('invStatusFilter').value;
            const fCat = document.getElementById('invCatFilter').value;
            const fLoc = document.getElementById('invLocFilter').value;

            let fProds = [...products];
            if (fStatus === 'critical') fProds = fProds.filter(p => p.currentStock <= p.minStock);
            else if (fStatus === 'ok') fProds = fProds.filter(p => p.currentStock > p.minStock);

            if (fCat) fProds = fProds.filter(p => p.category === fCat);
            if (fLoc) fProds = fProds.filter(p => p.location === fLoc);
            if (search) fProds = fProds.filter(p => (p.name || '').toLowerCase().includes(search) || (p.sku || '').toLowerCase().includes(search));

            document.getElementById('inventoryMasterTable').innerHTML = fProds.length ? fProds.map(p => {
                const isCrit = p.currentStock <= p.minStock;
                const lastMov = movements.filter(m => m.productId === p.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
                const safeName = esc(p.name);
                const safeSku = esc(p.sku || p.id.slice(0, 8));
                const safeCat = esc(p.category || 'Sem Categoria');
                const safeLoc = esc(p.location || 'N/A');
                const safeProdId = esc(p.id);
                return `
                <tr>
                    <td data-label="Cód. (SKU)">
                        <div style="font-weight:600;font-size:0.8rem">${safeSku}</div>
                    </td>
                    <td data-label="Descrição | Nome">
                        <div style="font-weight:500;color:var(--text-primary)">${safeName}</div>
                        <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px">${safeCat}</div>
                    </td>
                    <td data-label="Qtd. Atual" style="text-align:right;font-weight:600;color:${isCrit ? 'var(--danger)' : 'var(--text-primary)'}">
                        ${p.currentStock} ${isCrit ? '<span title="Estoque Crítico">⚠️</span>' : ''}
                    </td>
                    <td data-label="Qtd. Mínima" style="text-align:right" class="td-muted">${p.minStock}</td>
                    <td data-label="Localização"><span class="badge badge-gray">${safeLoc}</span></td>
                    <td data-label="Última Movimentação" class="td-muted" style="font-size:0.8rem">${lastMov ? fmt.date(lastMov.createdAt) : '—'}</td>
                    <td data-label="Ações" style="text-align:right" class="td-actions">
                        <button class="btn btn-ghost btn-sm btn-icon" title="Editar" data-on-click="window.location.href='inventory.html'">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                        <button class="btn btn-ghost btn-sm btn-icon" title="Ajuste Rápido" data-on-click="openMovimentarEstoqueModal('${safeProdId}')">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"></polyline><polyline points="23 20 23 14 17 14"></polyline><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path></svg>
                        </button>
                    </td>
                </tr>`;
            }).join('') : '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:32px">Nenhum item de estoque encontrado nos filtros atuais.</td></tr>';
        }

        // ─── Modal Movimentar ───
        function openMovimentarEstoqueModal(preselectId = '') {
            const products = db.get('inventory').sort((a, b) => a.name.localeCompare(b.name));
            const sel = document.getElementById('movProduct');
            sel.innerHTML = '<option value="">Selecione um produto...</option>' + products.map(p =>
                `<option value="${esc(p.id)}">${esc(p.sku || p.id.slice(0, 6))} - ${esc(p.name)} (Qtd: ${p.currentStock})</option>`
            ).join('');
            if (preselectId) sel.value = preselectId;

            document.getElementById('movQty').value = 1;
            document.getElementById('movObs').value = '';
            document.getElementById('movType').value = 'in';

            openModal('modalMovimentarEstoque');
        }

        function submitMovimentarEstoque() {
            if (session.role !== 'superadmin' && session.role !== 'admin') {
                return toast('Erro', 'Apenas gestores podem movimentar estoque logístico.', 'error');
            }

            const prodId = document.getElementById('movProduct').value;
            const type = document.getElementById('movType').value;
            const qtyStr = document.getElementById('movQty').value;
            const obs = document.getElementById('movObs').value.trim();

            if (!prodId) return toast('Erro', 'Selecione um produto para movimentar.', 'error');
            const qty = parseInt(qtyStr, 10);
            if (isNaN(qty) || qty <= 0) return toast('Erro', 'A quantidade deve ser maior que zero.', 'error');

            let inv = db.get('inventory');
            const prodIdx = inv.findIndex(p => p.id === prodId);
            if (prodIdx === -1) return toast('Erro', 'Produto não encontrado.', 'error');

            const prod = inv[prodIdx];
            if (type === 'out' && prod.currentStock < qty) {
                return toast('Estoque Insuficiente', `Saldo atual de ${prod.currentStock}. Impossível remover ${qty}.`, 'error');
            }

            const change = type === 'in' ? qty : -qty;
            inv[prodIdx].currentStock += change;
            db.set('inventory', inv);

            // Register stock movement log
            const movs = db.get('stock_movements');
            movs.push({
                id: db._uid(),
                productId: prod.id,
                quantity: change,
                type: 'manual',
                status: 'aprovado',
                reason: obs || (type === 'in' ? 'Entrada Avulsa' : 'Saída Avulsa'),
                createdAt: new Date().toISOString(),
                createdBy: session.userId,
                userName: session.name
            });
            db.set('stock_movements', movs);

            logAudit('inventory_move', `Mestre: Movimentou [${type === 'in' ? '+' : '-'}${qty}] em ${prod.name}`);

            closeModal('modalMovimentarEstoque');
            toast('Movimentação Registrada', `O saldo do produto ${prod.name} foi atualizado.`, 'success');
            loadInventoryReport();
        }

        function exportMasterInventory() {
            const search = (document.getElementById('invSearch').value || '').toLowerCase();
            const fStatus = document.getElementById('invStatusFilter').value;
            const fCat = document.getElementById('invCatFilter').value;
            const fLoc = document.getElementById('invLocFilter').value;
            const products = db.get('inventory');

            let fProds = [...products];
            if (fStatus === 'critical') fProds = fProds.filter(p => p.currentStock <= p.minStock);
            else if (fStatus === 'ok') fProds = fProds.filter(p => p.currentStock > p.minStock);
            if (fCat) fProds = fProds.filter(p => p.category === fCat);
            if (fLoc) fProds = fProds.filter(p => p.location === fLoc);
            if (search) fProds = fProds.filter(p => (p.name || '').toLowerCase().includes(search) || (p.sku || '').toLowerCase().includes(search));

            const data = fProds.map(p => ({
                sku: p.sku || 'N/A',
                nome: p.name,
                estoqueAtual: p.currentStock,
                estoqueMinimo: p.minStock,
                status: p.currentStock <= p.minStock ? 'CRITICO' : 'OK',
                precoCusto: p.costPrice || 0,
                totalCusto: (p.currentStock * (p.costPrice || 0)),
                categoria: p.category || '',
                localizacao: p.location || ''
            }));
            exportCSV(data, 'relatorio-almoxarifado-renostter.csv');
            toast('Mestre Estoque', 'O inventário filtrado foi exportado.', 'success');
        }

        // ─── Init ───
        document.addEventListener('DOMContentLoaded', () => {
            try { initSidebar(); } catch (e) { /* already initialized */ }
            loadInventoryReport();
        });
    
