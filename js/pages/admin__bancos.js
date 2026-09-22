/* Extraido de admin/bancos.html por tools/csp-migrate.py (CSP sem unsafe-inline). */
/* ── gerado por tools/csp-migrate.py: nomes liberados para os data-on-* desta pagina ── */
;(function () {
  var s = window.__cspScope || (window.__cspScope = {});
  function def(n, g, st) { Object.defineProperty(s, n, { configurable: true, enumerable: true, get: g, set: st }); }
  def('$', function () { return typeof $ !== 'undefined' ? $ : undefined; }, function (v) { $ = v; });
  def('auth', function () { return typeof auth !== 'undefined' ? auth : undefined; }, function (v) { auth = v; });
  def('b', function () { return typeof b !== 'undefined' ? b : undefined; }, function (v) { b = v; });
  def('closeModal', function () { return typeof closeModal !== 'undefined' ? closeModal : undefined; }, function (v) { closeModal = v; });
  def('deleteBank', function () { return typeof deleteBank !== 'undefined' ? deleteBank : undefined; }, function (v) { deleteBank = v; });
  def('editBank', function () { return typeof editBank !== 'undefined' ? editBank : undefined; }, function (v) { editBank = v; });
  def('filterBanks', function () { return typeof filterBanks !== 'undefined' ? filterBanks : undefined; }, function (v) { filterBanks = v; });
  def('handleSearch', function () { return typeof handleSearch !== 'undefined' ? handleSearch : undefined; }, function (v) { handleSearch = v; });
  def('openBankModal', function () { return typeof openBankModal !== 'undefined' ? openBankModal : undefined; }, function (v) { openBankModal = v; });
  def('runManualSync', function () { return typeof runManualSync !== 'undefined' ? runManualSync : undefined; }, function (v) { runManualSync = v; });
  def('saveBank', function () { return typeof saveBank !== 'undefined' ? saveBank : undefined; }, function (v) { saveBank = v; });
  def('selectRefBank', function () { return typeof selectRefBank !== 'undefined' ? selectRefBank : undefined; }, function (v) { selectRefBank = v; });
  def('testBankConnection', function () { return typeof testBankConnection !== 'undefined' ? testBankConnection : undefined; }, function (v) { testBankConnection = v; });
})();
/* ── fim do bloco gerado ── */

        const session = auth.protect(['admin', 'superadmin']);
        const API_URL = ''; // mesma origem (/api/...)
        let registeredBanks = [];

        async function init() {
            initSidebar();
            await loadBanks();
        }
        init();

        async function fetchApi(path, method = 'GET', body = null) {
            const opts = { method, headers: { 'Content-Type': 'application/json' } };
            if (body) opts.body = JSON.stringify(body);
            try {
                const r = await fetch(`${API_URL}${path}`, opts);
                if (!r.ok) {
                    const err = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
                    throw new Error(err.error || err.message || `Erro ${r.status}`);
                }
                return r.json();
            } catch (e) {
                console.error(`[API Error] ${method} ${path}:`, e.message);
                throw e;
            }
        }

        async function loadBanks() {
            const res = await fetchApi('/api/bancos/cadastrados');
            if (res.success) {
                registeredBanks = res.data;
                renderBanks();
            }
        }

        function filterBanks(q) {
            const query = q.toLowerCase();
            const filtered = registeredBanks.filter(b => 
                b.nome_exibicao.toLowerCase().includes(query) || 
                (b.banco_nome_ref || '').toLowerCase().includes(query) ||
                (b.codigo_comp || b.ref_comp || '').includes(query)
            );
            renderBanks(filtered);
        }

        async function runManualSync() {
            const btn = document.getElementById('btnSync');
            btn.disabled = true;
            btn.innerHTML = '⏳ Sincronizando...';
            try {
                const res = await fetchApi('/api/bancos/referencia/sync', 'POST');
                if (res.success) {
                    toast('Sucesso!', res.summary, 'success');
                } else {
                    toast('Erro', res.error, 'error');
                }
            } catch (e) {
                toast('Erro', 'Falha na comunicação com o servidor.', 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '🔄 Sincronizar Bancos';
            }
        }

        function renderBanks(data = null) {
            const grid = document.getElementById('banksGrid');
            const placeholder = document.getElementById('noBanks');
            const source = data || registeredBanks;
            
            if (source.length === 0) {
                grid.style.display = 'none';
                placeholder.style.display = 'block';
                return;
            }

            grid.style.display = 'grid';
            placeholder.style.display = 'none';

            grid.innerHTML = source.map(b => `
                <div class="bank-card ${b.is_primary ? 'is-primary' : ''}">
                    <div class="bank-header">
                        <div class="bank-icon">
                            ${(b.banco_nome_ref || b.nome_exibicao)[0].toUpperCase()}
                        </div>
                        <div style="display:flex; gap:8px;">
                            ${b.is_primary ? '<span class="badge-primary">Principal</span>' : ''}
                            <button class="btn btn-ghost btn-sm" data-on-click="editBank(${b.id})">⚙️</button>
                            <button class="btn btn-ghost btn-sm" data-on-click="deleteBank(${b.id})" style="color:var(--red)">🗑️</button>
                        </div>
                    </div>
                    <div class="bank-info">
                        <h3>${b.nome_exibicao}</h3>
                        <p>${b.banco_nome_ref || 'Custom Integrated'}</p>
                    </div>
                    <div class="bank-details">
                        <div class="detail-item">
                            <span class="detail-label">Código</span>
                            <span class="detail-value">${b.codigo_comp || b.ref_comp || '—'}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Ambiente</span>
                            <span class="detail-value" style="text-transform:capitalize">${b.ambiente}</span>
                        </div>
                        <div class="detail-item" style="grid-column: span 2;">
                            <span class="detail-label">API Status</span>
                            <span class="detail-value" style="display:flex; align-items:center; gap:5px;">
                                <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${b.ativo ? '#2ecc71' : '#95a5a6'}"></span>
                                ${b.ativo ? 'Conectado' : 'Inativo'}
                            </span>
                        </div>
                    </div>
                </div>
            `).join('');
        }

        // --- Autocomplete ---
        let searchTimeout;
        async function handleSearch(q) {
            clearTimeout(searchTimeout);
            if (!q || q.length < 2) {
                document.getElementById('searchSuggestions').classList.remove('open');
                return;
            }

            searchTimeout = setTimeout(async () => {
                const res = await fetchApi(`/api/bancos/referencia?q=${q}`);
                if (res.success && res.data.length > 0) {
                    const dropdown = document.getElementById('searchSuggestions');
                    dropdown.innerHTML = res.data.map(b => `
                        <div class="autocomplete-item" data-on-click="selectRefBank(${b.id}, '${b.codigo_comp}', '${b.ispb}', '${b.nome_reduzido}', '${b.nome_extenso}')">
                            <strong>${b.codigo_comp || 'N/A'}</strong> ${b.nome_reduzido}
                            <div style="font-size:0.7rem; color:var(--text-secondary)">ISPB: ${b.ispb}</div>
                        </div>
                    `).join('');
                    dropdown.classList.add('open');
                }
            }, 300);
        }

        function selectRefBank(id, code, ispb, short, full) {
            document.getElementById('refId').value = id;
            document.getElementById('bankCode').value = code || '';
            document.getElementById('bankIspb').value = ispb || '';
            document.getElementById('bankSearch').value = `${code || '---'} - ${short}`;
            if (!document.getElementById('bankNick').value) {
                document.getElementById('bankNick').value = short;
            }
            document.getElementById('searchSuggestions').classList.remove('open');
        }

        // --- CRUD ---
        function openBankModal() {
            document.getElementById('formBank').reset();
            document.getElementById('bankId').value = '';
            document.getElementById('refId').value = '';
            document.getElementById('modalTitle').textContent = 'Novo Banco';
            document.getElementById('testFeedback').style.display = 'none';
            openModal('modalBank');
        }

        function editBank(id) {
            const b = registeredBanks.find(x => x.id === id);
            if (!b) return;

            document.getElementById('bankId').value = b.id;
            document.getElementById('refId').value = b.banco_referencia_id || '';
            document.getElementById('bankSearch').value = b.banco_nome_ref ? `${b.ref_comp || '---'} - ${b.banco_nome_ref}` : 'Banco Customizado';
            document.getElementById('bankNick').value = b.nome_exibicao;
            document.getElementById('bankEnv').value = b.ambiente;
            document.getElementById('bankCode').value = b.codigo_comp || b.ref_comp || '';
            document.getElementById('bankIspb').value = b.ispb || '';
            document.getElementById('bankUrl').value = b.base_url || '';
            document.getElementById('bankClientId').value = b.client_id || '';
            document.getElementById('bankClientSecret').value = ''; // Secret stays encrypted
            document.getElementById('bankCert').value = b.cert_path || '';
            document.getElementById('bankKey').value = b.key_path || '';
            document.getElementById('bankWebhookUrl').value = b.webhook_url || '';
            document.getElementById('bankWebhookSecret').value = '';
            document.getElementById('bankPrimary').checked = b.is_primary === 1;

            document.getElementById('modalTitle').textContent = 'Configurar ' + b.nome_exibicao;
            document.getElementById('testFeedback').style.display = 'none';
            openModal('modalBank');
        }

        async function saveBank() {
            const data = {
                id: document.getElementById('bankId').value || null,
                banco_referencia_id: document.getElementById('refId').value || null,
                nome_exibicao: document.getElementById('bankNick').value,
                ambiente: document.getElementById('bankEnv').value,
                base_url: document.getElementById('bankUrl').value,
                client_id: document.getElementById('bankClientId').value,
                client_secret: document.getElementById('bankClientSecret').value,
                cert_path: document.getElementById('bankCert').value,
                key_path: document.getElementById('bankKey').value,
                webhook_url: document.getElementById('bankWebhookUrl').value,
                webhook_secret: document.getElementById('bankWebhookSecret').value,
                is_primary: document.getElementById('bankPrimary').checked ? 1 : 0
            };

            const res = await fetchApi('/api/bancos/cadastrados', 'POST', data);
            if (res.success) {
                closeModal('modalBank');
                loadBanks();
            } else {
                alert('Erro ao salvar: ' + res.error);
            }
        }

        async function deleteBank(id) {
            if (!confirm('Tem certeza que deseja remover este banco? Todas as cobranças vinculadas podem ser afetadas.')) return;
            const res = await fetchApi(`/api/bancos/cadastrados/${id}`, 'DELETE');
            if (res.success) loadBanks();
        }

        async function testBankConnection() {
            const feedback = document.getElementById('testFeedback');
            feedback.style.display = 'block';
            feedback.className = 'test-feedback';
            feedback.innerHTML = '⏳ Validando credenciais...';

            const nick = document.getElementById('bankNick').value;
            const data = {
                provider: nick,
                client_id: document.getElementById('bankClientId').value,
                client_secret: document.getElementById('bankClientSecret').value,
                certificate: document.getElementById('bankCert').value,
                key: document.getElementById('bankKey').value,
                ambiente: document.getElementById('bankEnv').value
            };

            try {
                const res = await fetchApi('/api/bancos/testar', 'POST', data);
                if (res.success) {
                    feedback.classList.add('success');
                    feedback.innerHTML = `✅ Conexão bem-sucedida!<br><small>Token: ${res.token_preview}</small>`;
                } else {
                    feedback.classList.add('error');
                    feedback.innerHTML = `❌ Falha: ${res.error}`;
                }
            } catch (e) {
                feedback.classList.add('error');
                feedback.innerHTML = `❌ Erro: ${e.message}`;
            }
        }

        function openModal(id) { document.getElementById(id).classList.add('open'); }
        function closeModal(id) { document.getElementById(id).classList.remove('open'); }

        // Fechar autocomplete ao clicar fora
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.autocomplete-container')) {
                document.getElementById('searchSuggestions').classList.remove('open');
            }
        });
    
