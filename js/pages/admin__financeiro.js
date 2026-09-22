/* Extraido de admin/financeiro.html por tools/csp-migrate.py (CSP sem unsafe-inline). */
/* ── gerado por tools/csp-migrate.py: nomes liberados para os data-on-* desta pagina ── */
;(function () {
  var s = window.__cspScope || (window.__cspScope = {});
  function def(n, g, st) { Object.defineProperty(s, n, { configurable: true, enumerable: true, get: g, set: st }); }
  def('auth', function () { return typeof auth !== 'undefined' ? auth : undefined; }, function (v) { auth = v; });
  def('baixar', function () { return typeof baixar !== 'undefined' ? baixar : undefined; }, function (v) { baixar = v; });
  def('closeModal', function () { return typeof closeModal !== 'undefined' ? closeModal : undefined; }, function (v) { closeModal = v; });
  def('filterByStatus', function () { return typeof filterByStatus !== 'undefined' ? filterByStatus : undefined; }, function (v) { filterByStatus = v; });
  def('openEdit', function () { return typeof openEdit !== 'undefined' ? openEdit : undefined; }, function (v) { openEdit = v; });
  def('openModal', function () { return typeof openModal !== 'undefined' ? openModal : undefined; }, function (v) { openModal = v; });
  def('refresh', function () { return typeof refresh !== 'undefined' ? refresh : undefined; }, function (v) { refresh = v; });
  def('saveDespesa', function () { return typeof saveDespesa !== 'undefined' ? saveDespesa : undefined; }, function (v) { saveDespesa = v; });
  def('saveEdit', function () { return typeof saveEdit !== 'undefined' ? saveEdit : undefined; }, function (v) { saveEdit = v; });
  def('saveVenda', function () { return typeof saveVenda !== 'undefined' ? saveVenda : undefined; }, function (v) { saveVenda = v; });
  def('switchTable', function () { return typeof switchTable !== 'undefined' ? switchTable : undefined; }, function (v) { switchTable = v; });
  def('toggleDetails', function () { return typeof toggleDetails !== 'undefined' ? toggleDetails : undefined; }, function (v) { toggleDetails = v; });
})();
/* ── fim do bloco gerado ── */

        const session = auth.protect(['admin', 'superadmin']);
        let currentTable = 'recebidos';
        let activeClientsList = [];

        function init() {
            if (!session) return;
            initSidebar();

            // Set default dates (last 30 days) BEFORE loading data
            const d = new Date();
            document.getElementById('filterEnd').value = d.toISOString().split('T')[0];
            d.setDate(d.getDate() - 30);
            document.getElementById('filterStart').value = d.toISOString().split('T')[0];

            loadKPIs();
            loadSummary();
            loadOptions();
            loadTransactions();
            setupAutocomplete();

            // Carregar saldo Cora assincronamente
            setTimeout(async () => {
                try {
                    const extrato = await CoraIntegration.getExtrato();
                    if (extrato && extrato.success && extrato.data) {
                        document.getElementById('kpiCoraSaldo').textContent = fmt.currency(extrato.data.balance);
                        document.getElementById('kpiCoraCard').style.display = '';
                    }
                } catch(e) { /* Middleware não disponível */ }
            }, 500);
        }

        // Date helper
        function isWithinPeriod(dateStr, start, end) {
            if (!dateStr) return false;
            // truncate time from date strings if present
            const d = dateStr.split('T')[0];
            if (start && d < start) return false;
            if (end && d > end) return false;
            return true;
        }

        function getFilteredTransactions() {
            const trans = db.get('financial_transactions');
            const start = document.getElementById('filterStart').value;
            const end = document.getElementById('filterEnd').value;

            // For calculating KPIs and Summary, we only care about the date period
            return trans.filter(t => {
                const dateToUse = (t.status === 'pago' && t.payDate) ? t.payDate : t.dueDate;
                return isWithinPeriod(dateToUse, start, end);
            });
        }

        function hydrateTransactionStatus(t) {
            // Se não está pago, verifica se está vencido com base na data atual
            if (t.status !== 'pago') {
                const today = new Date().toISOString().split('T')[0];
                if (t.dueDate < today) {
                    t.status = 'vencido';
                } else {
                    t.status = 'pendente';
                }
            }
            return t;
        }

        function loadKPIs() {
            const trans = getFilteredTransactions().map(hydrateTransactionStatus);
            const clients = db.get('clients');

            // "Receber" e "Pagar" no contexto de KPIs muitas vezes significa o que ainda falta (pendente + vencido)
            // de acordo com os requisitos do card Principal.
            const toReceive = trans.filter(t => t.type === 'receita' && (t.status === 'pendente' || t.status === 'vencido')).reduce((a, b) => a + b.value, 0);
            const toPay = trans.filter(t => t.type === 'despesa' && (t.status === 'pendente' || t.status === 'vencido')).reduce((a, b) => a + b.value, 0);

            // Number of clients with transactions in the period
            const uniqueClientIds = new Set(trans.filter(t => t.clientId).map(t => t.clientId));
            let activeClients = uniqueClientIds.size;
            if (activeClients === 0) {
                // Fallback to active clients if no transactions in period
                activeClients = clients.filter(c => c.status === 'ativo').length;
            }

            document.getElementById('kpiReceber').textContent = fmt.currency(toReceive);
            document.getElementById('kpiPagar').textContent = fmt.currency(toPay);
            document.getElementById('kpiClientes').textContent = activeClients;
        }

        function loadSummary() {
            const trans = getFilteredTransactions().map(hydrateTransactionStatus);

            // Contas a Receber
            const rec_pago = trans.filter(t => t.type === 'receita' && t.status === 'pago').reduce((a, b) => a + b.value, 0);
            const rec_pend = trans.filter(t => t.type === 'receita' && t.status === 'pendente').reduce((a, b) => a + b.value, 0);
            const rec_venc = trans.filter(t => t.type === 'receita' && t.status === 'vencido').reduce((a, b) => a + b.value, 0);

            document.getElementById('sumRecebido').textContent = fmt.currency(rec_pago);
            document.getElementById('sumPendenteR').textContent = fmt.currency(rec_pend);
            document.getElementById('sumVencidoR').textContent = fmt.currency(rec_venc);
            document.getElementById('sumTotalR').textContent = fmt.currency(rec_pago + rec_pend + rec_venc);

            // Contas a Pagar
            const pag_pago = trans.filter(t => t.type === 'despesa' && t.status === 'pago').reduce((a, b) => a + b.value, 0);
            const pag_pend = trans.filter(t => t.type === 'despesa' && t.status === 'pendente').reduce((a, b) => a + b.value, 0);
            const pag_venc = trans.filter(t => t.type === 'despesa' && t.status === 'vencido').reduce((a, b) => a + b.value, 0);

            document.getElementById('sumPago').textContent = fmt.currency(pag_pago);
            document.getElementById('sumPendenteP').textContent = fmt.currency(pag_pend);
            document.getElementById('sumVencidoP').textContent = fmt.currency(pag_venc);
            document.getElementById('sumTotalP').textContent = fmt.currency(pag_pago + pag_pend + pag_venc);

            // Lucro do Período (apenas transações efetivadas)
            document.getElementById('profRec').textContent = fmt.currency(rec_pago);
            document.getElementById('profDes').textContent = fmt.currency(pag_pago);

            const net = rec_pago - pag_pago;
            const netEl = document.getElementById('profNet');
            netEl.textContent = fmt.currency(net);
            netEl.style.color = net >= 0 ? 'var(--green)' : 'var(--red)';
        }

        function loadOptions() {
            const clients = db.get('clients').filter(c => c.status === 'ativo');
            activeClientsList = clients;

            const sups = db.get('suppliers').filter(s => s.status === 'ativo');
            const cats = db.get('financial_categories').filter(c => c.type === 'despesa');

            document.getElementById('vendaCliente').innerHTML = clients.map(c => `<option value="${c.id}">${esc(c.fantasia)}</option>`).join('');
            document.getElementById('despFornecedor').innerHTML = sups.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
            document.getElementById('despCat').innerHTML = cats.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
        }

        function loadTransactions() {
            const trans = db.get('financial_transactions').map(hydrateTransactionStatus);
            const cats = db.get('financial_categories');
            const clients = db.get('clients');
            const sups = db.get('suppliers');

            const type = document.getElementById('filterType').value;
            const status = document.getElementById('filterStatus').value;
            const start = document.getElementById('filterStart').value;
            const end = document.getElementById('filterEnd').value;
            const search = document.getElementById('filterSearch').value.toLowerCase();

            let filtered = trans.filter(t => {
                // Filtro 1: Tipo (Receita, Despesa, Todas)
                if (type !== 'todas' && t.type !== type) return false;

                // Filtro 2: Search Input
                if (search) {
                    const desc = (t.description || '').toLowerCase();
                    const client = clients.find(c => c.id === t.clientId)?.fantasia.toLowerCase() || '';
                    const sup = sups.find(s => s.id === t.supplierId)?.name.toLowerCase() || '';
                    if (!desc.includes(search) && !client.includes(search) && !sup.includes(search)) return false;
                }

                // Filtro 3: Abas (Tabs) - Isso define a lógica base de Status
                if (currentTable === 'recebidos' && t.status !== 'pago') return false;
                if (currentTable === 'pendentes' && t.status === 'pago') return false;

                // Filtro 4: Status do Dropdown (Sub-filtro das abas)
                if (status !== 'todos' && t.status !== status) return false;

                // Filtro 5: Data (Período)
                // Se for pago, consideramos a data efetiva de pagamento, senão a data de vencimento
                const dateToUse = (t.status === 'pago' && t.payDate) ? t.payDate : t.dueDate;

                if (!isWithinPeriod(dateToUse, start, end)) return false;

                return true;
            });

            filtered.sort((a, b) => new Date(b.dueDate) - new Date(a.dueDate));

            const body = document.getElementById('transTableBody');
            if (filtered.length === 0) {
                body.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-secondary)">Nenhuma transação encontrada para este período.</td></tr>';
                return;
            }

            body.innerHTML = filtered.map(t => {
                const cat = cats.find(c => c.id === t.categoryId);
                const isPos = t.type === 'receita';
                return `
                    <tr>
                        <td><button class="expand-btn" data-on-click="toggleDetails('${t.id}', this)">▼</button></td>
                        <td><strong>${esc(t.description)}</strong></td>
                        <td><span class="role-badge" style="background:${cat?.color || '#eee'};color:#fff">${esc(cat?.name || 'Geral')}</span></td>
                        <td class="td-muted">${fmt.date(t.payDate || t.dueDate)}</td>
                        <td>${badgeStatus(t.status)}</td>
                        <td style="text-align:right" class="${isPos ? 'val-positive' : 'val-negative'}">
                            ${isPos ? '+' : '-'} ${fmt.currency(t.value)}
                        </td>
                    </tr>
                    <tr id="details-${t.id}" class="table-row-details">
                        <td colspan="6">
                            <div class="details-content">
                                <div>
                                    <strong>Vínculo:</strong><br>
                                    ${t.clientId ? `Cliente: <a href="clients.html?id=${t.clientId}">${esc(clients.find(c => c.id === t.clientId)?.fantasia)}</a>` : ''}
                                    ${t.supplierId ? `Fornecedor: ${esc(sups.find(s => s.id === t.supplierId)?.name)}` : ''}
                                </div>
                                <div>
                                    <strong>Documento:</strong><br>
                                    ${t.contractId ? `Contrato: ${t.contractId}` : 'Venda Avulsa'}
                                    ${t.ticketId ? `<br>Chamado: ${t.ticketId}` : ''}
                                </div>
                                <div>
                                    <strong>Data de Vencimento:</strong> ${fmt.date(t.dueDate)}<br>
                                    <strong>Data de Pagamento:</strong> ${t.payDate ? fmt.date(t.payDate) : '—'}
                                </div>
                                <div style="display:flex; gap:10px; align-items:flex-end; justify-content:flex-end">
                                    ${t.status !== 'pago' ? `<button class="btn btn-sm btn-green" data-on-click="baixar('${t.id}')">Baixar Pagamento</button>` : ''}
                                    <button class="btn btn-sm btn-ghost" data-on-click="openEdit('${t.id}')">Editar</button>
                                </div>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
        }

        function toggleDetails(id, btn) {
            const el = document.getElementById('details-' + id);
            const isOpen = el.style.display === 'table-row';
            el.style.display = isOpen ? 'none' : 'table-row';
            btn.classList.toggle('active', !isOpen);
        }

        function switchTable(tab) {
            currentTable = tab;
            document.getElementById('tabRecebidos').classList.toggle('active', tab === 'recebidos');
            document.getElementById('tabPendentes').classList.toggle('active', tab === 'pendentes');
            loadTransactions();
        }

        function filterByStatus(status, type) {
            document.getElementById('filterStatus').value = status;
            document.getElementById('filterType').value = type;
            if (type === 'receita') {
                switchTable(status === 'pago' ? 'recebidos' : 'pendentes');
            }
            loadTransactions();
        }

        function openModal(id) { document.getElementById(id).classList.add('open'); }
        function closeModal(id) { document.getElementById(id).classList.remove('open'); }

        // Remove: Autocomplete JS / QuickClient JS / BrasilAPI Logic 

        function saveVenda(e) {
            e.preventDefault();
            const cid = document.getElementById('vendaCliente').value;
            const valor = parseFloat(document.getElementById('vendaValor').value);

            // T04 & T11 - Validation Hard Block
            if (!cid || isNaN(valor) || valor <= 0) {
                return toast('Valor Inválido', 'A transação deve ter um Cliente válido e Valor maior que zero.', 'error');
            }

            const data = {
                type: 'receita',
                clientId: cid,
                description: document.getElementById('vendaDesc').value,
                value: valor,
                dueDate: document.getElementById('vendaVenc').value,
                status: 'pendente',
                formaPagamento: document.getElementById('vendaForma').value,
                categoryId: 'fcat1' // Default Manutenção
            };

            db.insert('financial_transactions', data);
            toast('Lançamento realizado', 'Receita cadastrada com sucesso.', 'success');
            closeModal('modalVenda');

            // Clean Form
            // No need to reset document.getElementById('vendaCliente') manually as the modal handles some resets or the <select> retains the active state naturally
            document.getElementById('vendaDesc').value = '';
            document.getElementById('vendaValor').value = '';
            document.getElementById('vendaVenc').value = '';

            refresh();
        }

        function saveDespesa(e) {
            e.preventDefault();
            const data = {
                type: 'despesa',
                supplierId: document.getElementById('despFornecedor').value,
                description: document.getElementById('despDesc').value,
                value: parseFloat(document.getElementById('despValor').value),
                dueDate: document.getElementById('despVenc').value,
                categoryId: document.getElementById('despCat').value,
                status: 'pendente'
            };
            db.insert('financial_transactions', data);
            toast('Lançamento realizado', 'Despesa cadastrada com sucesso.', 'success');
            closeModal('modalDespesa');
            refresh();
        }

        function baixar(id) {
            db.update('financial_transactions', id, { status: 'pago', payDate: new Date().toISOString().split('T')[0] });
            toast('Pagamento baixado', 'A transação foi marcada como paga.', 'success');
            refresh();
        }

        function openEdit(id) {
            const t = db.find('financial_transactions', id);
            if (!t) return;

            document.getElementById('editId').value = t.id;
            document.getElementById('editDesc').value = t.description;
            document.getElementById('editValor').value = t.value;
            document.getElementById('editStatus').value = t.status;
            document.getElementById('editVenc').value = t.dueDate;
            document.getElementById('editPayDate').value = t.payDate || '';

            // Reload categories based on type
            const cats = db.get('financial_categories').filter(c => c.type === t.type);
            const catSelect = document.getElementById('editCat');
            catSelect.innerHTML = cats.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
            catSelect.value = t.categoryId;

            openModal('modalEdit');
        }

        function saveEdit(e) {
            e.preventDefault();
            const id = document.getElementById('editId').value;
            const data = {
                description: document.getElementById('editDesc').value,
                value: parseFloat(document.getElementById('editValor').value),
                status: document.getElementById('editStatus').value,
                dueDate: document.getElementById('editVenc').value,
                payDate: document.getElementById('editPayDate').value || null,
                categoryId: document.getElementById('editCat').value
            };

            db.update('financial_transactions', id, data);
            toast('Lançamento atualizado', 'As alterações foram salvas.', 'success');
            closeModal('modalEdit');
            refresh();
        }

        function refresh() {
            loadKPIs();
            loadSummary();
            loadTransactions();
        }

        function badgeStatus(s) {
            const map = {
                pago: { label: 'Pago', cls: 'badge-green' },
                pendente: { label: 'Pendente', cls: 'badge-yellow' },
                vencido: { label: 'Vencido', cls: 'badge-red' }
            };
            const item = map[s] || { label: s, cls: 'badge-gray' };
            return `<span class="badge ${item.cls}">${item.label}</span>`;
        }

        init();
    
