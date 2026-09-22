/* Extraido de admin/cobrancas.html por tools/csp-migrate.py (CSP sem unsafe-inline). */
/* ── gerado por tools/csp-migrate.py: nomes liberados para os data-on-* desta pagina ── */
;(function () {
  var s = window.__cspScope || (window.__cspScope = {});
  function def(n, g, st) { Object.defineProperty(s, n, { configurable: true, enumerable: true, get: g, set: st }); }
  def('$', function () { return typeof $ !== 'undefined' ? $ : undefined; }, function (v) { $ = v; });
  def('auth', function () { return typeof auth !== 'undefined' ? auth : undefined; }, function (v) { auth = v; });
  def('cancelar', function () { return typeof cancelar !== 'undefined' ? cancelar : undefined; }, function (v) { cancelar = v; });
  def('clearAdvFilters', function () { return typeof clearAdvFilters !== 'undefined' ? clearAdvFilters : undefined; }, function (v) { clearAdvFilters = v; });
  def('closeModal', function () { return typeof closeModal !== 'undefined' ? closeModal : undefined; }, function (v) { closeModal = v; });
  def('copiar', function () { return typeof copiar !== 'undefined' ? copiar : undefined; }, function (v) { copiar = v; });
  def('editProvider', function () { return typeof editProvider !== 'undefined' ? editProvider : undefined; }, function (v) { editProvider = v; });
  def('emitirCobranca', function () { return typeof emitirCobranca !== 'undefined' ? emitirCobranca : undefined; }, function (v) { emitirCobranca = v; });
  def('enviarEmailManual', function () { return typeof enviarEmailManual !== 'undefined' ? enviarEmailManual : undefined; }, function (v) { enviarEmailManual = v; });
  def('exportCSV', function () { return typeof exportCSV !== 'undefined' ? exportCSV : undefined; }, function (v) { exportCSV = v; });
  def('goPage', function () { return typeof goPage !== 'undefined' ? goPage : undefined; }, function (v) { goPage = v; });
  def('i', function () { return typeof i !== 'undefined' ? i : undefined; }, function (v) { i = v; });
  def('openAgingReport', function () { return typeof openAgingReport !== 'undefined' ? openAgingReport : undefined; }, function (v) { openAgingReport = v; });
  def('openExecutiveSummary', function () { return typeof openExecutiveSummary !== 'undefined' ? openExecutiveSummary : undefined; }, function (v) { openExecutiveSummary = v; });
  def('openExtrato', function () { return typeof openExtrato !== 'undefined' ? openExtrato : undefined; }, function (v) { openExtrato = v; });
  def('openModal', function () { return typeof openModal !== 'undefined' ? openModal : undefined; }, function (v) { openModal = v; });
  def('p', function () { return typeof p !== 'undefined' ? p : undefined; }, function (v) { p = v; });
  def('renderTable', function () { return typeof renderTable !== 'undefined' ? renderTable : undefined; }, function (v) { renderTable = v; });
  def('reprintInvoice', function () { return typeof reprintInvoice !== 'undefined' ? reprintInvoice : undefined; }, function (v) { reprintInvoice = v; });
  def('saveConfig', function () { return typeof saveConfig !== 'undefined' ? saveConfig : undefined; }, function (v) { saveConfig = v; });
  def('switchConfigTab', function () { return typeof switchConfigTab !== 'undefined' ? switchConfigTab : undefined; }, function (v) { switchConfigTab = v; });
  def('switchTab', function () { return typeof switchTab !== 'undefined' ? switchTab : undefined; }, function (v) { switchTab = v; });
  def('syncCobrancas', function () { return typeof syncCobrancas !== 'undefined' ? syncCobrancas : undefined; }, function (v) { syncCobrancas = v; });
  def('toggleSelectAll', function () { return typeof toggleSelectAll !== 'undefined' ? toggleSelectAll : undefined; }, function (v) { toggleSelectAll = v; });
  def('updateBatchUI', function () { return typeof updateBatchUI !== 'undefined' ? updateBatchUI : undefined; }, function (v) { updateBatchUI = v; });
  def('validateEmitForm', function () { return typeof validateEmitForm !== 'undefined' ? validateEmitForm : undefined; }, function (v) { validateEmitForm = v; });
  def('verDetalhe', function () { return typeof verDetalhe !== 'undefined' ? verDetalhe : undefined; }, function (v) { verDetalhe = v; });
})();
/* ── fim do bloco gerado ── */

        const session = auth.protect(['admin', 'superadmin']);
        const CORA_API = ''; // mesma origem (/api/...)

        let cobrancas = [];
        let currentPage = 1;
        const perPage = 15;

        // ── Init ──
        async function init() {
            await loadKPIs();
            await loadCobrancas();
            await renderCharts();
            populateContratos();
            populateBancos();
            setDefaultDueDate();

            // Auto-open modal if contractId is in URL (Semana 4)
            const params = new URLSearchParams(window.location.search);
            const contractId = params.get('contractId');
            if (contractId) {
                const sel = document.getElementById('emContratoId');
                sel.value = contractId;
                sel.dispatchEvent(new Event('change'));
                openModal('modalEmitir');
                // Clean URL
                window.history.replaceState({}, document.title, window.location.pathname);
            }
        }
        init();

        let chartVolume, chartStatus;
        async function renderCharts() {
            try {
                const res = await api('GET', '/api/cobrancas/stats');
                if (!res.success) return;
                const { volumeMensal, statusDist } = res.data;

                // Gráfico de Volume (Linha)
                const ctxVol = document.getElementById('chartVolume').getContext('2d');
                if (chartVolume) chartVolume.destroy();
                chartVolume = new Chart(ctxVol, {
                    type: 'line',
                    data: {
                        labels: volumeMensal.map(m => m.mes),
                        datasets: [{
                            label: 'Total (R$)',
                            data: volumeMensal.map(m => m.total),
                            borderColor: '#3b82f6',
                            backgroundColor: 'rgba(59, 130, 246, 0.1)',
                            fill: true,
                            tension: 0.4
                        }]
                    },
                    options: { 
                        responsive: true, 
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: { y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } }, x: { grid: { display: false } } }
                    }
                });

                // Gráfico de Status (Rosca)
                const ctxStatus = document.getElementById('chartStatus').getContext('2d');
                if (chartStatus) chartStatus.destroy();
                
                const statusColors = { 
                    PAID: '#10b981', PENDING: '#f59e0b', OPEN: '#3b82f6', 
                    OVERDUE: '#ef4444', CANCELLED: '#94a3b8' 
                };
                
                chartStatus = new Chart(ctxStatus, {
                    type: 'doughnut',
                    data: {
                        labels: statusDist.map(s => s.status),
                        datasets: [{
                            data: statusDist.map(s => s.qtd),
                            backgroundColor: statusDist.map(s => statusColors[s.status] || '#cbd5e1'),
                            borderWidth: 0,
                            weight: 1
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        cutout: '70%',
                        plugins: { 
                            legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 } } }
                        }
                    }
                });
            } catch (e) { console.error('Error rendering charts:', e); }
        }

        // ── Fetch helpers ──
        async function api(method, path, body) {
            const opts = { 
                method, 
                headers: { 
                    'Content-Type': 'application/json',
                    ...(typeof auth !== 'undefined' && auth.current() ? {
                        'x-user-id': auth.current().userId,
                        'x-user-name': auth.current().name,
                        'x-user-role': auth.current().role
                    } : {})
                } 
            };
            if (body) opts.body = JSON.stringify(body);
            const r = await fetch(`${CORA_API}${path}`, opts);
            return r.json();
        }

        // ── KPIs ──
        async function loadKPIs() {
            // Show skeletons
            const sk = '<span class="skeleton skeleton-value"></span>';
            const skSub = '<span class="skeleton skeleton-text" style="width:40%"></span>';
            document.getElementById('kpiTotal').innerHTML = sk;
            document.getElementById('kpiTotalQtd').innerHTML = skSub;
            document.getElementById('kpiPendente').innerHTML = sk;
            document.getElementById('kpiPendenteQtd').innerHTML = skSub;
            document.getElementById('kpiPago').innerHTML = sk;
            document.getElementById('kpiPagoQtd').innerHTML = skSub;
            document.getElementById('kpiVencido').innerHTML = sk;
            document.getElementById('kpiVencidoQtd').innerHTML = skSub;

            try {
                const res = await api('GET', '/api/cobrancas/kpis');
                if (!res.success) return;
                const d = res.data;
                const fmtV = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                document.getElementById('kpiTotal').textContent = fmtV(d.totalEmitido.valor);
                document.getElementById('kpiTotalQtd').textContent = `${d.totalEmitido.qtd} cobrança(s)`;
                document.getElementById('kpiPendente').textContent = fmtV(d.pendente.valor);
                document.getElementById('kpiPendenteQtd').textContent = `${d.pendente.qtd} aguardando`;
                document.getElementById('kpiPago').textContent = fmtV(d.pago.valor);
                document.getElementById('kpiPagoQtd').textContent = `${d.pago.qtd} recebido(s)`;
                document.getElementById('kpiVencido').textContent = fmtV(d.vencido.valor);
                document.getElementById('kpiVencidoQtd').textContent = `${d.vencido.qtd} inadimplente(s)`;

                // Breakdown por Provedor (opcional: console ou UI compacta)
                if (d.breakdown) {
                    console.log('[KPIs] Breakdown:', d.breakdown);
                }
            } catch (e) { console.error('[KPIs]', e); }
        }

        // ── Listar ──
        async function loadCobrancas() {
            const tbody = document.getElementById('tbodyCobrancas');
            if (tbody) {
                tbody.innerHTML = Array(5).fill(0).map(() => `
                    <tr>
                        <td colspan="7"><div class="skeleton" style="height:20px;margin:4px 0"></div></td>
                    </tr>
                `).join('');
            }

            try {
                const res = await api('GET', '/api/cobrancas');
                cobrancas = res.success ? res.data : [];
                renderTable();
            } catch { cobrancas = []; renderTable(); }
        }

        function clearAdvFilters() {
            document.getElementById('filterGateway').value = '';
            document.getElementById('filterDateFrom').value = '';
            document.getElementById('filterDateTo').value = '';
            renderTable();
        }

        // ── Render table ──
        function renderTable() {
            const search = document.getElementById('searchInput').value.toLowerCase();
            const filterSt = document.getElementById('filterStatus').value;
            const filterGw = document.getElementById('filterGateway').value;
            const filterFrom = document.getElementById('filterDateFrom').value;
            const filterTo = document.getElementById('filterDateTo').value;

            let filtered = cobrancas.filter(c => {
                if (filterSt && c.status !== filterSt) return false;
                if (filterGw && c.gateway_provider !== filterGw) return false;
                if (filterFrom && c.data_vencimento < filterFrom) return false;
                if (filterTo && c.data_vencimento > filterTo) return false;
                
                if (search) {
                    const clientName = getClientName(c.client_id);
                    if (!clientName.toLowerCase().includes(search) && !c.contract_id.toLowerCase().includes(search)) return false;
                }
                return true;
            });

            const totalPages = Math.ceil(filtered.length / perPage) || 1;
            if (currentPage > totalPages) currentPage = totalPages;
            const start = (currentPage - 1) * perPage;
            const page = filtered.slice(start, start + perPage);

            const tbody = document.getElementById('cobTable');
            tbody.innerHTML = page.length ? page.map(c => {
                const clientName = getClientName(c.client_id);
                const fmtDate = d => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
                const fmtVal = v => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                const mockTag = c.mock ? '<span class="mock-badge">MOCK</span>' : '';
                return `<tr>
                    <td><input type="checkbox" class="cob-check" value="${c.id}" data-on-change="updateBatchUI()"></td>
                    <td><strong>${clientName}</strong><br><span style="font-size:.75rem;color:var(--text-secondary)">${c.contract_id}</span></td>
                    <td><strong>${fmtVal(c.valor)}</strong></td>
                    <td>${fmtDate(c.data_vencimento)}</td>
                    <td><span class="status-badge status-${c.status}">${c.status}</span>${mockTag}</td>
                    <td style="font-size:.78rem;text-transform:capitalize">${c.gateway_provider || 'cora'}</td>
                    <td><div class="cob-actions">
                        <button class="btn btn-ghost btn-sm" data-on-click="verDetalhe('${c.id}')" title="Detalhes">🔍</button>
                        ${c.pdf_url ? `<a class="btn btn-ghost btn-sm" href="${c.pdf_url}" target="_blank" title="PDF">📄</a>` : ''}
                        ${c.linha_digitavel ? `<button class="btn btn-ghost btn-sm" data-on-click="copiar('${c.linha_digitavel}')" title="Copiar Digitável">📋</button>` : ''}
                        <button class="btn btn-ghost btn-sm" data-on-click="reprintInvoice('${c.id}')" title="Reimprimir / Link">🖨️</button>
                        ${['PENDING','OPEN','OVERDUE'].includes(c.status) ? `<button class="btn btn-ghost btn-sm" data-on-click="enviarEmailManual('${c.id}')" title="Reenviar E-mail de Cobrança">📩</button>` : ''}
                        ${['PENDING','OPEN'].includes(c.status) ? `<button class="btn btn-ghost btn-sm" data-on-click="cancelar('${c.id}')" title="Cancelar" style="color:var(--red)">✕</button>` : ''}
                    </div></td>
                </tr>`;
            }).join('') : '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-secondary)">Nenhuma cobrança encontrada</td></tr>';

            document.getElementById('paginInfo').textContent = `${filtered.length} cobrança(s) · Página ${currentPage}/${totalPages}`;
            document.getElementById('paginBtns').innerHTML = Array.from({ length: totalPages }, (_, i) =>
                `<button class="btn btn-ghost btn-sm${i + 1 === currentPage ? ' active' : ''}" data-on-click="goPage(${i + 1})">${i + 1}</button>`
            ).join('');
        }

        function goPage(p) { 
            currentPage = p; 
            renderTable(); 
            document.getElementById('checkAll').checked = false;
            updateBatchUI();
        }

        // ── Seleção em Lote ──
        function toggleSelectAll(checked) {
            const checks = document.querySelectorAll('.cob-check');
            checks.forEach(c => c.checked = checked);
            updateBatchUI();
        }

        function updateBatchUI() {
            const selected = document.querySelectorAll('.cob-check:checked');
            const btn = document.getElementById('btnBatch');
            const count = document.getElementById('batchCount');
            
            if (selected.length > 0) {
                btn.style.display = 'flex';
                count.textContent = selected.length;
            } else {
                btn.style.display = 'none';
            }
        }

        async function batchDownload() {
            const selected = Array.from(document.querySelectorAll('.cob-check:checked')).map(c => c.value);
            const items = cobrancas.filter(c => selected.includes(c.id));
            const pdfs = items.filter(i => i.pdf_url).map(i => i.pdf_url);

            if (pdfs.length === 0) return toast('Atenção', 'Nenhuma das cobranças selecionadas possui PDF disponível.', 'warning');

            toast('Processando', `Iniciando download de ${pdfs.length} boletos...`, 'info');
            
            // Simular download em lote (abrir abas ou disparar downloads)
            pdfs.forEach((url, i) => {
            });
        }

        async function reprintInvoice(id) {
            try {
                const res = await api('GET', `/api/cobrancas/${id}/reprint`);
                if (!res.success) return toast('Erro', res.error || 'Falha ao recuperar dados da cobrança.', 'error');
                
                const { pdf_url, linha_digitavel } = res.data;
                if (pdf_url) {
                    window.open(pdf_url, '_blank');
                } else if (linha_digitavel) {
                    await navigator.clipboard.writeText(linha_digitavel);
                    toast('Copiado', 'Link indisponível. Linha digitável copiada para a área de transferência.', 'info');
                } else {
                    toast('Aviso', 'Nenhum dado de impressão disponível para esta cobrança.', 'warning');
                }
            } catch (e) {
                console.error('[Reprint]', e);
                toast('Erro', 'Falha na comunicação com o servidor.', 'error');
            }
        }

        // ── Helpers ──
        function getClientName(clientId) {
            const c = db.find('clients', clientId);
            return c ? (c.fantasia || c.razaoSocial || c.name || clientId) : clientId;
        }

        function getContractLabel(contract) {
            const c = db.find('clients', contract.clientId);
            const name = c ? (c.fantasia || c.razaoSocial || '').substring(0, 30) : 'Sem cliente';
            return `${name} — R$ ${(contract.value || 0).toLocaleString('pt-BR')}`;
        }

        function populateContratos() {
            const contracts = db.get('contracts').filter(c => c.status === 'ativo');
            const sel = document.getElementById('emContratoId');
            sel.innerHTML = '<option value="">Selecione um contrato...</option>' +
                contracts.map(c => `<option value="${c.id}" data-value="${c.value}" data-client="${c.clientId}" data-bank="${c.bankId || 1}">${getContractLabel(c)}</option>`).join('');
            
            sel.onchange = function () {
                const opt = sel.options[sel.selectedIndex];
                if (!opt || !opt.value) {
                    document.getElementById('emValor').value = '';
                    validateEmitForm();
                    return;
                }
                
                if (opt.dataset.value) document.getElementById('emValor').value = opt.dataset.value;
                
                // Auto-select provider based on contract's bankId
                if (opt.dataset.bank) {
                    const bankIdMap = { 1: 'cora', 2: 'itau' }; // Simple mapping for now
                    const provider = bankIdMap[opt.dataset.bank] || 'cora';
                    document.getElementById('emProvider').value = provider;
                }
                validateEmitForm();
            };
        }

        async function populateBancos() {
            try {
                const res = await api('GET', '/api/configuracoes');
                if (res.success) {
                    const sel = document.getElementById('emProvider');
                    const activeOnly = res.data.filter(b => b.ativo === 1);
                    if (activeOnly.length > 0) {
                        sel.innerHTML = activeOnly.map(b => `<option value="${b.provider}">${b.nome_exibicao} ${b.is_primary ? '(Principal)' : ''}</option>`).join('');
                    } else {
                        sel.innerHTML = '<option value="cora">Cora Bank (Fallback)</option>';
                    }
                }
            } catch (e) { console.error('Error loading banks for select:', e); }
        }

        function setDefaultDueDate() {
            const d = new Date();
            d.setDate(d.getDate() + 15);
            document.getElementById('emVencimento').value = d.toISOString().split('T')[0];
        }

        // ── Emitir ──
        function validateEmitForm() {
            const contractId = document.getElementById('emContratoId').value;
            const dueDateStr = document.getElementById('emVencimento').value;
            const valueStr = document.getElementById('emValor').value;
            
            let isValid = true;
            
            if (!contractId) {
                document.getElementById('errContrato').style.display = 'block';
                isValid = false;
            } else {
                document.getElementById('errContrato').style.display = 'none';
            }
            
            if (!dueDateStr) {
                document.getElementById('errVencimento').style.display = 'block';
                document.getElementById('errVencimento').textContent = 'Data não pode ser vazia.';
                isValid = false;
            } else {
                const parts = dueDateStr.split('-');
                const dueDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                const today = new Date();
                today.setHours(0,0,0,0);
                if (dueDate <= today) {
                    document.getElementById('errVencimento').style.display = 'block';
                    document.getElementById('errVencimento').textContent = 'Data não pode ser retroativa ou igual a hoje.';
                    isValid = false;
                } else {
                    document.getElementById('errVencimento').style.display = 'none';
                }
            }
            
            const value = parseFloat(valueStr);
            if (isNaN(value) || value <= 0) {
                document.getElementById('errValor').style.display = 'block';
                isValid = false;
            } else {
                document.getElementById('errValor').style.display = 'none';
            }
            
            document.getElementById('btnEmitir').disabled = !isValid;
            return isValid;
        }

        async function emitirCobranca() {
            if (!validateEmitForm()) {
                toast('Erro de validação', 'Verifique os campos obrigatórios e as regras de negócio.', 'warning');
                return;
            }

            const sel = document.getElementById('emContratoId');
            const opt = sel.options[sel.selectedIndex];
            const contractId = sel.value;
            const clientId = opt?.dataset?.client;
            const value = parseFloat(document.getElementById('emValor').value);
            const dueDate = document.getElementById('emVencimento').value;
            const servico = document.getElementById('emServico').value || 'Serviço Financeiro';
            const observacoes = document.getElementById('emObs').value || '';

            const client = db.find('clients', clientId) || {};
            const cleanDoc = (client.cnpj || client.cpf || '00000000000').replace(/[^\d]/g, '');

            const btn = document.getElementById('btnEmitir');
            const btnText = document.getElementById('btnEmitirText');
            const btnLoader = document.getElementById('btnEmitirLoader');

            btn.disabled = true;
            btnText.textContent = 'Emitindo...';
            btnLoader.style.display = 'inline-block';

            try {
                const res = await api('POST', '/api/cobrancas/emitir', {
                    provider: document.getElementById('emProvider').value,
                    contractId, clientId, value, dueDate,
                    services: [servico],
                    observacoes: observacoes,
                    customerPayload: {
                        name: client.razaoSocial || client.fantasia || 'Cliente CRM',
                        email: client.email || '',
                        document: { identity: cleanDoc, type: cleanDoc.length > 11 ? 'CNPJ' : 'CPF' },
                        address: {
                            street: client.endereco || 'Rua Principal',
                            number: client.numero || '123',
                            district: client.bairro || 'Centro',
                            city: client.cidade || 'Sede',
                            state: client.uf || 'SP',
                            zip_code: (client.cep || '01001000').replace(/\D/g, '')
                        }
                    },
                    fineSettings: {
                        juros: parseFloat(document.getElementById('emJuros').value) || 0,
                        multa: parseFloat(document.getElementById('emMulta').value) || 0
                    },
                    userId: session.userId
                });

                if (res.success) {
                    toast('✅ Cobrança emitida!', res.duplicate ? 'Atenção: Boleto já existente detectado.' : `Operação realizada com sucesso. ID: ${res.cobrancaId}`, 'success');
                    closeModal('modalEmitir');
                    await loadKPIs();
                    await loadCobrancas();
                } else {
                    toast('Falha na emissão', res.error || 'Acesso negado ou erro no gateway.', 'error');
                }
            } catch (e) {
                toast('Erro Crítico', 'Não foi possível contatar o servidor. Tente novamente mais tarde.', 'error');
            } finally {
                btn.disabled = false;
                btnText.textContent = '🏦 Emitir Cobrança';
                btnLoader.style.display = 'none';
            }
        }

        // ── Detalhe ──
        async function verDetalhe(id) {
            const cob = cobrancas.find(c => c.id === id);
            if (!cob) return;
            const fmtDate = d => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
            const fmtVal = v => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            const clientName = getClientName(cob.client_id);

            document.getElementById('detalheTitle').textContent = `📋 ${clientName} — ${fmtVal(cob.valor)}`;
            // ── Buscar Histórico de Notificações ──
            let notifHistory = '';
            try {
                const nRes = await api('GET', `/api/cobrancas/${id}/notificacoes`);
                if (nRes.success && nRes.data.length) {
                    notifHistory = `
                        <div style="margin-top:16px;border-top:1px solid var(--border-color);padding-top:12px">
                            <h4 style="font-size:.75rem;text-transform:uppercase;color:var(--text-secondary);margin-bottom:8px">Histórico de Notificações</h4>
                            <div class="notif-log" style="font-size:.7rem;max-height:120px;overflow-y:auto">
                                ${nRes.data.map(n => `
                                    <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                                        <span>${n.channel === 'email' ? '📧' : '💬'} ${n.type}</span>
                                        <span style="color:var(--text-secondary)">${fmtDate(n.created_at)}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `;
                }
            } catch (e) {}

            document.getElementById('detalheBody').innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
                    <div><span class="status-badge status-${cob.status}" style="font-size:.85rem;padding:5px 14px">${cob.status}</span>
                    ${cob.mock ? '<span class="mock-badge" style="font-size:.75rem">MOCK</span>' : ''}</div>
                    <div style="font-size:.8rem;color:var(--text-secondary)">ID: ${cob.id}</div>
                </div>
                <div class="detail-grid">
                    <div class="detail-item"><div class="dl">Contrato</div><div class="dv">${cob.contract_id}</div></div>
                    <div class="detail-item"><div class="dl">Cliente</div><div class="dv">${clientName}</div></div>
                    <div class="detail-item"><div class="dl">Valor</div><div class="dv" style="color:var(--blue);font-weight:700;font-size:1.1rem">${fmtVal(cob.valor)}</div></div>
                    <div class="detail-item"><div class="dl">Vencimento</div><div class="dv">${fmtDate(cob.data_vencimento)}</div></div>
                    <div class="detail-item"><div class="dl">Gateway</div><div class="dv" style="text-transform:capitalize">${cob.gateway_provider}</div></div>
                    <div class="detail-item"><div class="dl">Gateway ID</div><div class="dv mono">${cob.gateway_charge_id || '—'}</div></div>
                    ${cob.barcode ? `<div class="detail-item full"><div class="dl">Código de Barras</div><div class="dv mono">${cob.barcode}</div></div>` : ''}
                    ${cob.linha_digitavel ? `<div class="detail-item full"><div class="dl">Linha Digitável</div><div class="dv mono">${cob.linha_digitavel}</div></div>` : ''}
                    ${cob.pix_qrcode ? `<div class="detail-item full"><div class="dl">Pix QR Code</div><div class="dv mono" style="font-size:.7rem">${cob.pix_qrcode}</div></div>` : ''}
                    <div class="detail-item"><div class="dl">Emitido em</div><div class="dv">${fmtDate(cob.created_at)}</div></div>
                    <div class="detail-item"><div class="dl">Atualizado</div><div class="dv">${fmtDate(cob.updated_at)}</div></div>
                </div>
                ${notifHistory}
                ${cob.pdf_url ? `<div style="margin-top:16px;text-align:center"><a class="btn btn-primary btn-sm" href="${cob.pdf_url}" target="_blank">📄 Baixar PDF do Boleto</a></div>` : ''}
            `;
            openModal('modalDetalhe');
        }

        // ── Cancelar ──
        async function cancelar(id) {
            if (!confirm('Tem certeza que deseja cancelar esta cobrança?')) return;
            const res = await api('DELETE', `/api/cobrancas/${id}`, { userId: session.userId });
            if (res.success) {
                toast('Cobrança cancelada', '', 'success');
                await loadKPIs();
                await loadCobrancas();
            } else {
                toast('Erro', res.error, 'error');
            }
        }

        // ── Aging Report ──
        async function openAgingReport() {
            openModal('modalAging');
            const body = document.getElementById('agingBody');
            body.innerHTML = '<div style="text-align:center;padding:20px">Calculando inadimplência...</div>';
            
            try {
                const res = await api('GET', '/api/cobrancas/aging');
                if (res.success) {
                    const fmtVal = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                    const totalGeral = res.data.reduce((acc, current) => acc + (current.total || 0), 0);
                    
                    body.innerHTML = `
                        <div style="margin-bottom:20px;padding:12px;background:var(--red-dim);border-radius:8px;text-align:center">
                            <span style="font-size:0.75rem;color:var(--text-secondary);display:block">Total Inadimplente</span>
                            <strong style="font-size:1.4rem;color:var(--red)">${fmtVal(totalGeral)}</strong>
                        </div>
                        <table style="width:100%;border-collapse:collapse">
                            <thead>
                                <tr style="text-align:left;font-size:0.7rem;text-transform:uppercase;color:var(--text-secondary);border-bottom:1px solid var(--border-color)">
                                    <th style="padding:8px">FAIXA DE ATRASO</th>
                                    <th style="padding:8px;text-align:right">QTD</th>
                                    <th style="padding:8px;text-align:right">VALOR</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${res.data.map(row => `
                                    <tr style="border-bottom:1px solid var(--border-color)">
                                        <td style="padding:10px 8px;font-weight:600">${row.bucket}</td>
                                        <td style="padding:10px 8px;text-align:right">${row.qtd}</td>
                                        <td style="padding:10px 8px;text-align:right;color:var(--red);font-weight:700">${fmtVal(row.total)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                        <p style="font-size:0.65rem;color:var(--text-secondary);margin-top:16px;text-align:center">
                            * Considera apenas cobranças PENDENTES ou em ABERTO com data de vencimento anterior a hoje.
                        </p>
                    `;
                } else {
                    body.innerHTML = `<div style="color:var(--red)">Erro: ${res.error}</div>`;
                }
            } catch (e) { body.innerHTML = '<div style="color:var(--red)">Erro de conexão</div>'; }
        }
        
        async function enviarEmailManual(id) {
            const cob = cobrancas.find(c => c.id === id);
            if (!cob) return;
            const client = db.find('clients', cob.client_id) || {};
            const email = client.email || prompt('Digite o e-mail do cliente:');
            if (!email) return;

            toast('⏳ Enviando...', 'Preparando e-mail de cobrança', 'info');
            try {
                const res = await api('POST', '/api/cobrancas/email', { cobrancaId: id, email });
                if (res.success) {
                    toast('✅ E-mail enviado!', `Enviado para ${email}`, 'success');
                } else {
                    toast('Erro no envio', res.error, 'error');
                }
            } catch (e) { toast('Erro de conexão', 'Middleware indisponível', 'error'); }
        }

        async function openExtrato() {
            openModal('modalExtrato');
            const container = document.getElementById('extratoContent');
            const balanceEl = document.getElementById('extratoBalance');
            container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-secondary)">⏳ Buscando dados bancários...</div>';
            
            try {
                const res = await api('GET', '/api/cobrancas/extrato');
                if (res.success && res.data) {
                    balanceEl.textContent = `Saldo Atual: ${res.data.balance.toLocaleString('pt-BR', {style:'currency', currency:'BRL'})}`;
                    
                    if (!res.data.items || res.data.items.length === 0) {
                        container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-secondary)">Nenhuma transação recente encontrada.</div>';
                        return;
                    }

                    container.innerHTML = `
                        <table style="width:100%;font-size:.85rem;border-collapse:separate;border-spacing:0 8px;">
                            <thead>
                                <tr style="text-align:left;color:var(--text-secondary);font-size:.7rem;text-transform:uppercase;">
                                    <th style="padding-bottom:8px">Data</th>
                                    <th style="padding-bottom:8px">Descrição</th>
                                    <th style="padding-bottom:8px;text-align:right">Valor</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${res.data.items.map(it => {
                                    const amount = it.amount || 0;
                                    const color = amount < 0 ? 'var(--red)' : 'var(--green)';
                                    return `<tr>
                                        <td style="padding:8px 0;border-bottom:1px solid var(--border-color);">${new Date(it.date).toLocaleDateString('pt-BR')}</td>
                                        <td style="padding:8px 0;border-bottom:1px solid var(--border-color);">${it.description}</td>
                                        <td style="padding:8px 0;border-bottom:1px solid var(--border-color);text-align:right;font-weight:700;color:${color}">${amount.toLocaleString('pt-BR', {style:'currency', currency:'BRL'})}</td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                    `;
                } else {
                    container.innerHTML = `<div style="text-align:center;padding:40px;color:var(--red)">${res.error || 'Erro ao carregar extrato.'}</div>`;
                }
            } catch (e) {
                container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--red)">Erro de conexão com o servidor.</div>';
            }
        }

        // ── Tab Navigation ──
        function switchTab(tab) {
            document.getElementById('section-cobrancas').style.display = tab === 'cobrancas' ? 'block' : 'none';
            document.getElementById('section-config').style.display = tab === 'config' ? 'block' : 'none';
            
            document.getElementById('tabBtn-cobrancas').classList.toggle('active', tab === 'cobrancas');
            document.getElementById('tabBtn-config').classList.toggle('active', tab === 'config');

            if (tab === 'config') {
                loadProviders();
                loadAuditoria();
            }
        }

        // ── Gateway Config Logic ──
        let currentConfigs = [];

        async function loadProviders() {
            const list = document.getElementById('providersList');
            list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-secondary)">⏳ Buscando provedores ativos...</div>';
            
            try {
                const res = await api('GET', '/api/configuracoes');
                if (res.success) {
                    currentConfigs = res.data;
                    if (currentConfigs.length === 0) {
                        list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-secondary)">Nenhum banco configurado. <br><a href="gateway-config.html" style="color:var(--blue);font-weight:700">Configurar AGORA</a></div>';
                        return;
                    }

                    list.innerHTML = currentConfigs.map(p => {
                        const icon = p.provider === 'itau' ? '🟠' : (p.provider === 'cora' ? '🏦' : '💳');
                        const status = p.ativo ? '<span style="color:var(--green)">● Conectado</span>' : '<span style="color:var(--text-secondary)">○ Inativo</span>';
                        return `
                            <div class="provider-item" data-on-click="editProvider(${p.id})" style="display:flex;align-items:center;justify-content:space-between;padding:12px;background:var(--bg-secondary);border-radius:8px;cursor:pointer;border:1px solid var(--border-color);transition:0.2s;margin-bottom:8px">
                                <div style="display:flex;align-items:center;gap:12px">
                                    <span style="font-size:1.4rem">${icon}</span>
                                    <div>
                                        <div style="font-weight:600">${p.nome_exibicao}</div>
                                        <div style="font-size:0.7rem">${status} | ${p.ambiente.toUpperCase()}</div>
                                    </div>
                                </div>
                                <span style="font-size:0.8rem">Configurar →</span>
                            </div>
                        `;
                    }).join('');
                } else {
                    list.innerHTML = `<div style="text-align:center;padding:20px;color:var(--red)">${res.error}</div>`;
                }
            } catch (e) { list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--red)">Falha de conexão com o servidor.</div>'; }
        }

        function editProvider(id) {
            const conf = currentConfigs.find(c => c.id === id);
            if (!conf) return;
            
            document.getElementById('formConfig').style.display = 'block';
            
            document.getElementById('confProvider').value = conf.provider;
            document.getElementById('confAmbiente').value = conf.ambiente;
            document.getElementById('confClientId').value = conf.client_id_encrypted || '';
            document.getElementById('confAtivo').value = conf.ativo ? "1" : "0";
            
            // Add Test Link
            const testBtnId = 'btnTestInTab';
            if (!document.getElementById(testBtnId)) {
                const btn = document.createElement('button');
                btn.id = testBtnId;
                btn.type = 'button';
                btn.className = 'btn btn-ghost w-full';
                btn.style.marginTop = '8px';
                btn.innerHTML = '⚡ Testar Conexão em Tempo Real';
                btn.onclick = testTabConnection;
                document.getElementById('formConfig').appendChild(btn);
            }
        }

        async function testTabConnection() {
            const provider = document.getElementById('confProvider').value;
            const btn = document.getElementById('btnTestInTab');
            const originalText = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '⏳ Testando...';

            try {
                const res = await api('POST', '/api/bancos/testar', {
                    provider: provider,
                    client_id: document.getElementById('confClientId').value,
                    ambiente: document.getElementById('confAmbiente').value
                });
                if (res.success) {
                    toast('Sucesso!', 'Conexão validada com o banco.', 'success');
                    btn.innerHTML = '✅ Conexão OK!';
                } else {
                    toast('Falha', res.error, 'error');
                    btn.innerHTML = '❌ Falha no teste';
                }
            } catch (e) { toast('Erro', 'Servidor offline', 'error'); }
            
            setTimeout(() => {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }, 3000);
        }

        async function saveConfig(e) {
            e.preventDefault();
            const payload = {
                provider: document.getElementById('confProvider').value,
                ambiente: document.getElementById('confAmbiente').value,
                clientId: document.getElementById('confClientId').value,
                ativo: parseInt(document.getElementById('confAtivo').value),
                userId: session.userId,
                userName: session.userName
            };

            const btn = document.querySelector('#formConfig button[type="submit"]');
            const originalText = btn.innerHTML;
            btn.disabled = true;
            btn.textContent = '⏳ Salvando...';

            try {
                const res = await api('POST', '/api/configuracoes', payload);
                if (res.success) {
                    toast('Segurança Ativa', 'Credenciais criptografadas via AES-256-GCM.', 'success');
                    await loadProviders();
                } else {
                    toast('Erro', res.error, 'error');
                }
            } catch (e) { toast('Erro', 'Falha na conexão', 'error'); }
            
            btn.disabled = false;
            btn.textContent = originalText;
        }

        async function loadAuditoria() {
            const tbody = document.getElementById('auditTable');
            try {
                const res = await api('GET', '/api/cobrancas/auditoria');
                if (res.success) {
                    const configLogs = res.data.filter(l => l.entidade === 'configuracao').slice(0, 10);
                    tbody.innerHTML = configLogs.map(l => `
                        <tr>
                            <td>${new Date(l.created_at).toLocaleString('pt-BR')}</td>
                            <td>${l.user_name}</td>
                            <td>${l.acao}</td>
                            <td>${l.entidade_id}</td>
                            <td class="td-muted">${l.detalhes_json}</td>
                        </tr>
                    `).join('') || '<tr><td colspan="5" style="text-align:center;padding:20px">Nenhum log de configuração.</td></tr>';
                }
            } catch (e) {}
        }

        // ── Sync ──
        async function syncCobrancas() {
            document.getElementById('btnSync').textContent = '⏳ Sincronizando...';
            await loadKPIs();
            await loadCobrancas();
            document.getElementById('btnSync').textContent = '🔄 Sincronizar';
            toast('Sincronizado', 'Dados atualizados com sucesso', 'success');
        }

        // ── Copiar ──
        function copiar(text) {
            navigator.clipboard.writeText(text);
            toast('Copiado!', 'Linha digitável copiada para a área de transferência.', 'success');
        }

        // ── Export CSV ──
        function exportCSV() {
            const header = 'ID,Contrato,Cliente,Valor,Vencimento,Status,Gateway,Barcode\n';
            const rows = cobrancas.map(c => `${c.id},${c.contract_id},${getClientName(c.client_id)},${c.valor},${c.data_vencimento},${c.status},${c.gateway_provider},${c.barcode || ''}`).join('\n');
            const blob = new Blob([header + rows], { type: 'text/csv' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `cobrancas_${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
        }

        // ── Modal ──
        function openModal(id) { document.getElementById(id).classList.add('open'); }
        function closeModal(id) { document.getElementById(id).classList.remove('open'); }

        // ── Resumo Gerencial ──
        async function openExecutiveSummary() {
            openModal('modalSummary');
            const body = document.getElementById('summaryBody');
            body.innerHTML = '<div style="text-align:center;padding:40px">Consolidando dados financeiros...</div>';
            
            try {
                const res = await api('GET', '/api/cobrancas/summary');
                if (res.success) {
                    const { kpis, aging, generated_at } = res.data;
                    const fmtVal = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                    const today = new Date(generated_at).toLocaleDateString('pt-BR');
                    
                    body.innerHTML = `
                        <div style="border-bottom:2px solid #333; padding-bottom:16px; margin-bottom:24px; text-align:center">
                            <h1 style="margin:0; font-size:1.8rem">Relatório Executivo de Cobrança</h1>
                            <p style="color:#666; margin:4px 0">Posição em ${today}</p>
                        </div>
                        
                        <div class="grid grid-cols-2 gap-24" style="margin-bottom:32px">
                            <div style="border:1px solid #ddd; padding:16px; border-radius:8px">
                                <h4 style="margin:0 0 8px 0; color:#444">Faturamento Total</h4>
                                <strong style="font-size:1.4rem">${fmtVal(kpis.totalEmitido.valor)}</strong>
                                <p style="font-size:0.75rem; color:#666">${kpis.totalEmitido.qtd} títulos emitidos</p>
                            </div>
                            <div style="border:1px solid #ddd; padding:16px; border-radius:8px">
                                <h4 style="margin:0 0 8px 0; color:#444">Taxa de Recebimento</h4>
                                <strong style="font-size:1.4rem; color:var(--green)">${((kpis.pago.valor / kpis.totalEmitido.valor) * 100 || 0).toFixed(1)}%</strong>
                                <p style="font-size:0.75rem; color:#666">${fmtVal(kpis.pago.valor)} liquidados</p>
                            </div>
                        </div>

                        <h3 style="border-bottom:1px solid #eee; padding-bottom:8px">Inadimplência por Faixa (Aging)</h3>
                        <table style="width:100%; margin-top:12px; border-collapse:collapse">
                            <thead>
                                <tr style="text-align:left; background:#f9f9f9">
                                    <th style="padding:12px">Tempo de Atraso</th>
                                    <th style="padding:12px; text-align:right">Montante</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${aging.map(a => `
                                    <tr>
                                        <td style="padding:10px 12px; border-bottom:1px solid #eee">${a.bucket}</td>
                                        <td style="padding:10px 12px; text-align:right; border-bottom:1px solid #eee; font-weight:700; color:#d32f2f">${fmtVal(a.total)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>

                        <div style="margin-top:40px; font-size:0.8rem; color:#666">
                            <p><strong>Notas:</strong> Este documento foi gerado automaticamente pelo módulo de cobrança Renostter. 
                            Os valores representam a soma consolidada de todos os gateways ativos (Cora e Itaú).</p>
                        </div>
                    `;
                }
            } catch (e) { body.innerHTML = 'Erro ao gerar relatório.'; }
        }

        // ── Config Sub-Tabs ──
        function switchConfigTab(sub) {
            const subs = ['sub-gateways', 'sub-auditoria', 'sub-webhooks'];
            subs.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = id === `sub-${sub}` ? 'block' : 'none';
            });
            
            const tabs = ['tabBtn-gateways', 'tabBtn-auditoria', 'tabBtn-webhooks'];
            tabs.forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    el.classList.toggle('active', id === `tabBtn-${sub}`);
                    el.style.borderBottom = id === `tabBtn-${sub}` ? '2px solid var(--primary-color)' : '2px solid transparent';
                    el.style.color = id === `tabBtn-${sub}` ? 'var(--primary-color)' : 'var(--text-secondary)';
                }
            });

            if (sub === 'auditoria') loadAuditoria();
            if (sub === 'webhooks') loadWebhooks();
        }

        async function loadWebhooks() {
            const tbody = document.getElementById('webhooksTable');
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px">Buscando webhooks...</td></tr>';
            try {
                const res = await api('GET', '/api/cobrancas/webhooks');
                if (res.success) {
                    tbody.innerHTML = res.data.map(w => `
                        <tr style="border-bottom:1px solid var(--border-color)">
                            <td style="padding:10px 8px">${new Date(w.received_at).toLocaleString('pt-BR')}</td>
                            <td style="padding:10px 8px"><strong>${w.provider.toUpperCase()}</strong></td>
                            <td style="padding:10px 8px"><span style="font-size:0.65rem;padding:2px 6px;background:var(--bg-secondary);border-radius:4px;border:1px solid var(--border-color)">${w.event_type}</span></td>
                            <td style="padding:10px 8px"><code title='${w.raw_payload}' style="font-size:0.65rem;display:block;max-width:350px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${w.raw_payload}</code></td>
                        </tr>
                    `).join('') || '<tr><td colspan="4" style="text-align:center;padding:20px">Nenhum evento registrado.</td></tr>';
                }
            } catch (e) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--red)">Falha ao carregar.</td></tr>'; }
        }

        initSidebar();
    
