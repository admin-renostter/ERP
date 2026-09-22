/* Extraido de admin/suppliers.html por tools/csp-migrate.py (CSP sem unsafe-inline). */
/* ── gerado por tools/csp-migrate.py: nomes liberados para os data-on-* desta pagina ── */
;(function () {
  var s = window.__cspScope || (window.__cspScope = {});
  function def(n, g, st) { Object.defineProperty(s, n, { configurable: true, enumerable: true, get: g, set: st }); }
  def('auth', function () { return typeof auth !== 'undefined' ? auth : undefined; }, function (v) { auth = v; });
  def('closeModal', function () { return typeof closeModal !== 'undefined' ? closeModal : undefined; }, function (v) { closeModal = v; });
  def('openModal_sup', function () { return typeof openModal_sup !== 'undefined' ? openModal_sup : undefined; }, function (v) { openModal_sup = v; });
  def('renderTable', function () { return typeof renderTable !== 'undefined' ? renderTable : undefined; }, function (v) { renderTable = v; });
  def('saveSupplier', function () { return typeof saveSupplier !== 'undefined' ? saveSupplier : undefined; }, function (v) { saveSupplier = v; });
  def('toggleStatus', function () { return typeof toggleStatus !== 'undefined' ? toggleStatus : undefined; }, function (v) { toggleStatus = v; });
  def('viewHistory', function () { return typeof viewHistory !== 'undefined' ? viewHistory : undefined; }, function (v) { viewHistory = v; });
})();
/* ── fim do bloco gerado ── */

        const session = auth.protect(['admin', 'superadmin']);
        let currentSupId = null;

        function loadKpis() {
            const sups = db.get('suppliers');
            const movs = db.get('stock_movements').filter(m => m.type === 'entrada' && m.supplierId);
            const thirtyAgo = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
            const totalVal = movs.reduce((s, m) => s + (Math.abs(m.quantity) * (m.unitCost || 0)), 0);
            const val30 = movs.filter(m => m.createdAt >= thirtyAgo).reduce((s, m) => s + (Math.abs(m.quantity) * (m.unitCost || 0)), 0);
            const kpis = [
                { label: 'Fornecedores Ativos', value: sups.filter(s => s.status === 'ativo').length, icon: '🚚', cls: 'blue' },
                { label: 'Total Comprado', value: 'R$ ' + totalVal.toFixed(2).replace('.', ','), icon: '💰', cls: 'green' },
                { label: 'Compras (30 dias)', value: 'R$ ' + val30.toFixed(2).replace('.', ','), icon: '📊', cls: 'orange' },
                { label: 'Total Pedidos', value: movs.length, icon: '📋', cls: 'yellow' },
            ];
            document.getElementById('kpiGrid').innerHTML = kpis.map(k => `<div class="kpi-card fade-in-up"><div class="kpi-info"><div class="kpi-label">${k.label}</div><div class="kpi-value">${k.value}</div></div><div class="kpi-icon ${k.cls}" style="font-size:1.3rem">${k.icon}</div></div>`).join('');
        }

        function renderTable() {
            const q = (document.getElementById('searchInput').value || '').toLowerCase();
            const st = document.getElementById('fStatus').value;
            let sups = db.get('suppliers');
            if (q) sups = sups.filter(s => s.name.toLowerCase().includes(q) || (s.cnpj || '').includes(q));
            if (st) sups = sups.filter(s => s.status === st);
            const movs = db.get('stock_movements');
            document.getElementById('suppliersTable').innerHTML = sups.map(s => {
                const purchases = movs.filter(m => m.supplierId === s.id && m.type === 'entrada');
                const total = purchases.reduce((a, m) => a + (Math.abs(m.quantity) * (m.unitCost || 0)), 0);
                return `<tr>
          <td><div style="font-weight:500">${esc(s.name)}</div>${s.contactPerson ? `<div style="font-size:.75rem;color:var(--text-secondary)">${esc(s.contactPerson)}</div>` : ''}</td>
          <td style="font-size:.82rem;font-family:monospace">${esc(s.cnpj || '—')}</td>
          <td style="font-size:.82rem">${esc(s.email || '—')}</td>
          <td style="font-size:.82rem">${esc(s.phone || '—')}</td>
          <td style="font-size:.82rem">${s.deliveryDays ? s.deliveryDays + ' dias' : '—'}</td>
          <td style="font-size:.78rem;color:var(--text-secondary)">${esc(s.paymentTerms || '—')}</td>
          <td style="font-size:.82rem">R$ ${total.toFixed(2).replace('.', ',')} <span style="color:var(--text-muted)">(${purchases.length} pedidos)</span></td>
          <td><span class="badge ${s.status === 'ativo' ? 'badge-green' : 'badge-gray'}">${s.status}</span></td>
          <td><div style="display:flex;gap:4px">
            <button class="btn btn-ghost btn-sm" data-on-click="viewHistory('${s.id}')">📋 Histórico</button>
            <button class="btn btn-ghost btn-sm" data-on-click="openModal_sup('${s.id}')">✏️</button>
            <button class="btn btn-ghost btn-sm" data-on-click="toggleStatus('${s.id}')">${s.status === 'ativo' ? '🚫' : '✅'}</button>
          </div></td>
        </tr>`;
            }).join('') || '<tr><td colspan="9" style="text-align:center;padding:30px;color:var(--text-secondary)">Nenhum fornecedor encontrado</td></tr>';
        }

        function openModal_sup(id = null) {
            currentSupId = id;
            document.getElementById('supModalTitle').textContent = id ? 'Editar Fornecedor' : 'Novo Fornecedor';
            if (id) {
                const s = db.find('suppliers', id); if (!s) return;
                document.getElementById('sName').value = s.name || '';
                document.getElementById('sCnpj').value = s.cnpj || '';
                document.getElementById('sContact').value = s.contactPerson || '';
                document.getElementById('sEmail').value = s.email || '';
                document.getElementById('sPhone').value = s.phone || '';
                document.getElementById('sDelivery').value = s.deliveryDays || 5;
                document.getElementById('sPayment').value = s.paymentTerms || '';
                document.getElementById('sStatus').value = s.status || 'ativo';
                document.getElementById('sNotes').value = s.notes || '';
                // Address
                document.getElementById('sCep').value = s.cep || '';
                document.getElementById('sLogradouro').value = s.logradouro || '';
                document.getElementById('sNumero').value = s.numero || '';
                document.getElementById('sBairro').value = s.bairro || '';
                document.getElementById('sCidade').value = s.cidade || '';
                document.getElementById('sUf').value = s.uf || 'SP';
            }
            else {
                ['sName', 'sCnpj', 'sContact', 'sEmail', 'sPhone', 'sPayment', 'sNotes', 'sCep', 'sLogradouro', 'sNumero', 'sBairro', 'sCidade'].forEach(f => document.getElementById(f).value = '');
                document.getElementById('sDelivery').value = 5;
                document.getElementById('sStatus').value = 'ativo';
                document.getElementById('sUf').value = 'SP';
            }
            openModal('modalSupplier');
        }

        function saveSupplier() {
            const name = document.getElementById('sName').value.trim();
            if (!name) { toast('Obrigatório', 'Informe o nome do fornecedor.', 'error'); return; }
            const data = {
                name,
                cnpj: document.getElementById('sCnpj').value.trim(),
                contactPerson: document.getElementById('sContact').value.trim(),
                email: document.getElementById('sEmail').value.trim(),
                phone: document.getElementById('sPhone').value.trim(),
                deliveryDays: parseInt(document.getElementById('sDelivery').value) || null,
                paymentTerms: document.getElementById('sPayment').value.trim(),
                status: document.getElementById('sStatus').value,
                notes: document.getElementById('sNotes').value.trim(),
                cep: document.getElementById('sCep').value.trim(),
                logradouro: document.getElementById('sLogradouro').value.trim(),
                numero: document.getElementById('sNumero').value.trim(),
                bairro: document.getElementById('sBairro').value.trim(),
                cidade: document.getElementById('sCidade').value.trim(),
                uf: document.getElementById('sUf').value
            };
            if (currentSupId) { db.update('suppliers', currentSupId, data); toast('Atualizado!', name, 'success'); }
            else { db.insert('suppliers', data); toast('Fornecedor criado!', name, 'success'); }
            logAudit('supplier', `${currentSupId ? 'Editou' : 'Criou'} fornecedor: ${name}`);
            closeModal('modalSupplier'); loadKpis(); renderTable();
        }

        function toggleStatus(id) { const s = db.find('suppliers', id); if (!s) return; const ns = s.status === 'ativo' ? 'inativo' : 'ativo'; db.update('suppliers', id, { status: ns }); toast('Status alterado', s.name + ' → ' + ns, 'success'); renderTable(); }

        function viewHistory(id) {
            const s = db.find('suppliers', id); if (!s) return;
            document.getElementById('histTitle').textContent = `📋 Histórico de Compras — ${s.name}`;
            const movs = db.get('stock_movements').filter(m => m.supplierId === id && m.type === 'entrada').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
            const total = movs.reduce((a, m) => a + (Math.abs(m.quantity) * (m.unitCost || 0)), 0);
            document.getElementById('histContent').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px">
      <div class="card" style="padding:16px;text-align:center"><div style="font-size:1.5rem;font-weight:700">${movs.length}</div><div style="font-size:.8rem;color:var(--text-secondary)">Pedidos</div></div>
      <div class="card" style="padding:16px;text-align:center"><div style="font-size:1.5rem;font-weight:700">R$ ${total.toFixed(2).replace('.', ',')}</div><div style="font-size:.8rem;color:var(--text-secondary)">Total Gasto</div></div>
      <div class="card" style="padding:16px;text-align:center"><div style="font-size:1.5rem;font-weight:700">${s.deliveryDays || '—'}d</div><div style="font-size:.8rem;color:var(--text-secondary)">Prazo Médio</div></div>
    </div>
    ${movs.length ? `<div class="table-wrapper"><table><thead><tr><th>Produto</th><th>SKU</th><th>Qtd</th><th>Valor Unit.</th><th>Total</th><th>NF</th><th>Data</th></tr></thead><tbody>${movs.map(m => `<tr><td>${esc(m.productName)}</td><td style="font-family:monospace;font-size:.78rem">${esc(m.productSku)}</td><td>${Math.abs(m.quantity)}</td><td>R$ ${(m.unitCost || 0).toFixed(2).replace('.', ',')}</td><td>R$ ${(Math.abs(m.quantity) * (m.unitCost || 0)).toFixed(2).replace('.', ',')}</td><td style="font-size:.78rem">${esc(m.invoiceNumber || '—')}</td><td style="font-size:.78rem">${new Date(m.createdAt).toLocaleDateString('pt-BR')}</td></tr>`).join('')}</tbody></table></div>` : '<p style="text-align:center;padding:30px;color:var(--text-secondary)">Nenhuma compra registrada</p>'}`;
            openModal('modalHistory');
        }

        function initApiLookups() {
            const cnpjInput = document.getElementById('sCnpj');
            const cepInput = document.getElementById('sCep');

            if (cnpjInput) {
                cnpjInput.addEventListener('input', debounce(async (e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    if (val.length === 14) {
                        cnpjInput.parentElement.classList.add('api-loading');
                        const data = await api.getCNPJ(val);
                        cnpjInput.parentElement.classList.remove('api-loading');

                        if (data) {
                            document.getElementById('sName').value = data.razao_social || '';
                            document.getElementById('sEmail').value = data.email || document.getElementById('sEmail').value;
                            document.getElementById('sPhone').value = data.ddd_telefone_1 ? `(${data.ddd_telefone_1.substring(0, 2)}) ${data.ddd_telefone_1.substring(2)}` : document.getElementById('sPhone').value;

                            // Address
                            document.getElementById('sCep').value = data.cep || '';
                            document.getElementById('sLogradouro').value = data.logradouro || '';
                            document.getElementById('sNumero').value = data.numero || '';
                            document.getElementById('sBairro').value = data.bairro || '';
                            document.getElementById('sCidade').value = data.municipio || '';
                            document.getElementById('sUf').value = data.uf || 'SP';

                            toast('Dados importados', 'Informações carregadas via BrasilAPI.', 'success');
                            logAudit('api_lookup', `Consulta Fornecedor CNPJ: ${val} (${data.razao_social})`);
                            ['sName', 'sLogradouro', 'sCidade'].forEach(id => {
                                document.getElementById(id).classList.add('field-highlight');
                                setTimeout(() => document.getElementById(id).classList.remove('field-highlight'), 2000);
                            });
                            if (data.descricao_situacao_cadastral !== 'ATIVA') {
                                toast('Atenção: Situação ' + data.descricao_situacao_cadastral, 'Esta empresa não está com situação ATIVA na Receita.', 'warning');
                                logAudit('api_warning', `CNPJ Fornecedor ${val} com situação: ${data.descricao_situacao_cadastral}`);
                            }
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
                            document.getElementById('sLogradouro').value = data.street || '';
                            document.getElementById('sBairro').value = data.neighborhood || '';
                            document.getElementById('sCidade').value = data.city || '';
                            document.getElementById('sUf').value = data.state || 'SP';

                            toast('Endereço encontrado', '', 'success');
                            logAudit('api_lookup', `Consulta Fornecedor CEP: ${val} (${data.city})`);
                            ['sLogradouro', 'sBairro', 'sCidade', 'sUf'].forEach(id => {
                                document.getElementById(id).classList.add('field-highlight');
                                setTimeout(() => document.getElementById(id).classList.remove('field-highlight'), 2000);
                            });
                        }
                    }
                }, 500));
            }
        }

        loadKpis(); renderTable(); initSidebar(); initApiLookups();
    
