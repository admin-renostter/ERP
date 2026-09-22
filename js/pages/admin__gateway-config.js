/* Extraido de admin/gateway-config.html por tools/csp-migrate.py (CSP sem unsafe-inline). */
/* ── gerado por tools/csp-migrate.py: nomes liberados para os data-on-* desta pagina ── */
;(function () {
  var s = window.__cspScope || (window.__cspScope = {});
  function def(n, g, st) { Object.defineProperty(s, n, { configurable: true, enumerable: true, get: g, set: st }); }
  def('$', function () { return typeof $ !== 'undefined' ? $ : undefined; }, function (v) { $ = v; });
  def('auth', function () { return typeof auth !== 'undefined' ? auth : undefined; }, function (v) { auth = v; });
  def('closeModal', function () { return typeof closeModal !== 'undefined' ? closeModal : undefined; }, function (v) { closeModal = v; });
  def('emitirBoletoTeste', function () { return typeof emitirBoletoTeste !== 'undefined' ? emitirBoletoTeste : undefined; }, function (v) { emitirBoletoTeste = v; });
  def('loadGatewayLogs', function () { return typeof loadGatewayLogs !== 'undefined' ? loadGatewayLogs : undefined; }, function (v) { loadGatewayLogs = v; });
  def('loadLogsFull', function () { return typeof loadLogsFull !== 'undefined' ? loadLogsFull : undefined; }, function (v) { loadLogsFull = v; });
  def('openAmbienteModal', function () { return typeof openAmbienteModal !== 'undefined' ? openAmbienteModal : undefined; }, function (v) { openAmbienteModal = v; });
  def('openProviderWizard', function () { return typeof openProviderWizard !== 'undefined' ? openProviderWizard : undefined; }, function (v) { openProviderWizard = v; });
  def('openUploadCertModal', function () { return typeof openUploadCertModal !== 'undefined' ? openUploadCertModal : undefined; }, function (v) { openUploadCertModal = v; });
  def('openWebhookConfigModal', function () { return typeof openWebhookConfigModal !== 'undefined' ? openWebhookConfigModal : undefined; }, function (v) { openWebhookConfigModal = v; });
  def('p', function () { return typeof p !== 'undefined' ? p : undefined; }, function (v) { p = v; });
  def('saveAmbiente', function () { return typeof saveAmbiente !== 'undefined' ? saveAmbiente : undefined; }, function (v) { saveAmbiente = v; });
  def('saveCertConfig', function () { return typeof saveCertConfig !== 'undefined' ? saveCertConfig : undefined; }, function (v) { saveCertConfig = v; });
  def('saveWebhookConfig', function () { return typeof saveWebhookConfig !== 'undefined' ? saveWebhookConfig : undefined; }, function (v) { saveWebhookConfig = v; });
  def('testCoraConnection', function () { return typeof testCoraConnection !== 'undefined' ? testCoraConnection : undefined; }, function (v) { testCoraConnection = v; });
})();
/* ── fim do bloco gerado ── */

        // ─── Auth ───
        const session = auth.protect(['admin', 'superadmin']);
        initSidebar();

        // ─── Estado ───
        let coraConfig = null;
        let providerList = [
            { id: 'itau', name: 'Itaú', icon: '🏛️', desc: 'Banking Itaú — boletos registrados, PIX', supported: true },
            { id: 'bradesco', name: 'Bradesco', icon: '🟡', desc: 'API Bradesco — boletos + Cobrança Direta', supported: false },
            { id: 'santander', name: 'Santander', icon: '🔴', desc: 'API Santander — boletos + PIX', supported: false },
            { id: 'mercado_pago', name: 'Mercado Pago', icon: '💙', desc: 'Checkout + QR PIX dinâmico', supported: false },
            { id: 'pix_direto', name: 'PIX Direto (BACEN)', icon: '⚡', desc: 'Cobrança direta sem intermediário', supported: false },
            { id: 'stripe', name: 'Stripe', icon: '💜', desc: 'Cartão de crédito + PIX (internacional)', supported: false }
        ];

        // ─── Carregar config ───
        async function loadCoraConfig() {
            try {
                const res = await fetch('/api/bancos/cadastrados');
                if (!res.ok) throw new Error('Falha ao carregar');
                const json = await res.json();
                const rows = json.data || [];
                coraConfig = rows.find(r => (r.ref_comp || '').toUpperCase().includes('CORA') || (r.banco_nome_ref || '').toLowerCase().includes('cora'));
                if (!coraConfig) coraConfig = rows[0]; // fallback para o primary
                if (!coraConfig) {
                    setBanner('error', 'Nenhum banco configurado', 'Cadastre o Cora em Configurações → Bancos.');
                    return;
                }
                renderCoraConfig();
                await loadGatewayLogs();
            } catch (e) {
                setBanner('error', 'API inacessível', 'O middleware na porta 3000 está rodando? ' + e.message);
            }
        }

        function renderCoraConfig() {
            if (!coraConfig) return;
            const isProd = coraConfig.ambiente === 'production';
            const hasCerts = !!(coraConfig.cert_path && coraConfig.key_path);
            const hasWebhook = !!coraConfig.webhook_url;

            document.getElementById('coraAmb').textContent = isProd ? '🟢 Produção (Live)' : '🟡 Homologação (Sandbox)';
            document.getElementById('coraAmb').style.color = isProd ? '#2EA043' : '#FF6B00';
            document.getElementById('coraClientId').textContent = coraConfig.client_id
                ? `${coraConfig.client_id.substring(0, 12)}…${coraConfig.client_id.substring(coraConfig.client_id.length - 4)}`
                : '— não configurado —';

            const certEl = document.getElementById('coraCertPath');
            certEl.textContent = coraConfig.cert_path || '— não configurado —';
            certEl.classList.toggle('muted', !coraConfig.cert_path);

            const keyEl = document.getElementById('coraKeyPath');
            keyEl.textContent = coraConfig.key_path || '— não configurado —';
            keyEl.classList.toggle('muted', !coraConfig.key_path);

            const webhookEl = document.getElementById('coraWebhookUrl');
            webhookEl.textContent = coraConfig.webhook_url || '— não configurado —';
            webhookEl.classList.toggle('muted', !coraConfig.webhook_url);

            // Status final
            const ready = coraConfig.ativo && hasCerts;
            const statusBadge = document.getElementById('badgeStatus');
            const statusText = document.getElementById('badgeStatusText');
            if (ready) {
                statusBadge.className = 'badge-ok';
                statusText.textContent = hasWebhook ? 'ATIVO — pronto para emitir' : 'ATIVO — webhook pendente';
                statusBadge.style.background = 'rgba(255,107,0,.15)';
                statusBadge.style.color = '#FF6B00';
            } else {
                statusBadge.className = 'badge-warn';
                statusText.textContent = 'CONFIGURAÇãO INCOMPLETA';
            }

            // Banner
            if (ready) {
                setBanner('success', hasWebhook ? 'Banco Cora configurado e pronto para emitir boletos' : 'Banco Cora ativo — configure o webhook para receber pagamentos',
                    `Ambiente: ${isProd ? 'Produção' : 'Sandbox'} · Client ID: ${coraConfig.client_id?.substring(0, 12)}…`);
            } else {
                setBanner('error', 'Configuração incompleta', 'Faça upload dos certificados mTLS (.pem + .key) para começar a emitir.');
            }
        }

        function setBanner(type, title, sub) {
            const banner = document.getElementById('statusBanner');
            const icon = document.getElementById('statusIcon');
            const titleEl = document.getElementById('statusTitle');
            const subEl = document.getElementById('statusSub');

            banner.className = '';
            if (type === 'success') {
                banner.style.background = 'rgba(46,160,67,.06)';
                banner.style.borderColor = 'rgba(46,160,67,.3)';
                icon.textContent = '✅';
            } else if (type === 'error') {
                banner.style.background = 'rgba(218,54,51,.06)';
                banner.style.borderColor = 'rgba(218,54,51,.3)';
                icon.textContent = '⚠️';
            } else {
                banner.style.background = 'var(--bg-card)';
                banner.style.borderColor = 'var(--border)';
                icon.textContent = '⏳';
            }
            titleEl.textContent = title;
            subEl.textContent = sub;
        }

        // ─── Testar Conexão ───
        async function testCoraConnection() {
            const box = document.getElementById('coraHealthBox');
            const icon = document.getElementById('coraHealthIcon');
            const ttl = document.getElementById('coraHealthTitle');
            const body = document.getElementById('coraHealthBody');

            box.classList.add('show');
            box.classList.remove('success', 'error');
            icon.textContent = '⏳';
            ttl.textContent = 'Testando...';
            body.textContent = 'Solicitando novo token mTLS na API Cora...';

            try {
                const start = Date.now();
                const res = await fetch('/api/bancos/testar', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        provider: 'cora',
                        client_id: coraConfig?.client_id,
                        certificate: coraConfig?.cert_path,
                        key: coraConfig?.key_path,
                        ambiente: coraConfig?.ambiente
                    })
                });
                const json = await res.json();
                const latency = Date.now() - start;

                if (res.ok && json.success) {
                    box.classList.add('success');
                    icon.textContent = '✓';
                    ttl.textContent = 'Conexão OK';
                    body.innerHTML = `<strong>${json.message}</strong><br>Token preview: <code>${json.token_preview}</code><br>Tempo: ${latency}ms · Ambiente: ${coraConfig?.ambiente}`;
                    toast('Sucesso', 'Banco Cora respondeu com sucesso.', 'success');
                } else {
                    throw new Error(json.error || 'Erro desconhecido');
                }
            } catch (e) {
                box.classList.add('error');
                icon.textContent = '✗';
                ttl.textContent = 'Falha na conexão';
                body.innerHTML = `<strong>${e.message}</strong><br><br><strong>Possíveis causas:</strong><br>• Certificados (.pem/.key) não conferem com a Client ID<br>• Client ID não cadastrada na plataforma Cora Web<br>• Ambiente errado (stage vs produção)<br>• Máquina sem acesso à internet`;
                toast('Erro', e.message, 'error');
            }
        }

        // ─── Logs ───
        async function loadGatewayLogs() {
            try {
                const res = await fetch('/api/cora/logs?limit=5');
                const json = await res.json();
                const logs = json.data || [];
                const list = document.getElementById('gatewayLogsList');
                if (logs.length === 0) {
                    list.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text-muted);font-size:0.85rem">Nenhuma chamada registrada ainda. Use "Testar Conexão" para começar.</div>';
                    return;
                }
                list.innerHTML = logs.map(l => `
                    <div class="log-row">
                        <div style="flex:1">
                            <div style="font-weight:600;font-size:0.82rem">${esc(l.type || 'HTTP')} → <code>${esc(l.endpoint || '')}</code></div>
                            <div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px">${esc(l.contract_id || '')} ${l.charge_id ? '· '+esc(l.charge_id) : ''} · ${fmt.datetime(l.created_at)}</div>
                        </div>
                        <span class="log-status ${l.http_status >= 400 ? 'error' : 'success'}">${l.http_status || '—'}</span>
                    </div>
                `).join('');
            } catch (e) {
                document.getElementById('gatewayLogsList').innerHTML = '<div style="padding:16px;color:var(--danger);font-size:0.85rem">API inacessível: ' + e.message + '</div>';
            }
        }

        function loadLogsFull() {
            window.open('cobrancas.html#logs', '_blank');
        }

        // ─── Modais ───
        function openUploadCertModal() {
            document.getElementById('certFile').value = '';
            document.getElementById('keyFile').value = '';
            document.getElementById('certPath').value = coraConfig?.cert_path || '';
            openModal('modalCert');
        }

        function saveCertConfig() {
            const certPath = document.getElementById('certPath').value.trim() || (coraConfig?.cert_path || '');
            if (!certPath) {
                toast('Atenção', 'Informe pelo menos o caminho do certificado (campo "Caminho alternativo").', 'warning');
                return;
            }

            // Simulação: este endpoint /api/bancos/cadastrados aceita update; aqui só refresca o card.
            // Em produção, o handler já está pronto em /api/bancos/cadastrados (POST com id preenchido).
            updateCoraInBackend({
                id: coraConfig.id,
                cert_path: certPath,
                key_path: certPath.replace(/certificate\.pem$/, 'private-key.key')
            }).then(() => {
                toast('Certificados atualizados', 'Recarregue e teste a conexão.', 'success');
                closeModal('modalCert');
                loadCoraConfig();
            }).catch(e => {
                toast('Erro', e.message, 'error');
            });
        }

        function openWebhookConfigModal() {
            document.getElementById('webhookUrl').value = coraConfig?.webhook_url || '';
            document.getElementById('webhookSecret').value = '';
            openModal('modalWebhook');
        }

        function saveWebhookConfig() {
            const url = document.getElementById('webhookUrl').value.trim();
            if (!url || !url.startsWith('http')) {
                toast('Atenção', 'Informe uma URL válida (http/https).', 'warning');
                return;
            }
            updateCoraInBackend({ id: coraConfig.id, webhook_url: url })
                .then(() => {
                    toast('Webhook configurado', 'Cadastre o mesmo secret na Cora Web para validação HMAC.', 'success');
                    closeModal('modalWebhook');
                    loadCoraConfig();
                }).catch(e => toast('Erro', e.message, 'error'));
        }

        function openAmbienteModal() {
            document.getElementById('newAmb').value = coraConfig?.ambiente || 'stage';
            openModal('modalAmb');
        }

        function saveAmbiente() {
            const novoAmb = document.getElementById('newAmb').value;
            updateCoraInBackend({ id: coraConfig.id, ambiente: novoAmb })
                .then(() => {
                    toast('Ambiente alterado', 'Token anterior invalidado.', 'info');
                    closeModal('modalAmb');
                    loadCoraConfig();
                }).catch(e => toast('Erro', e.message, 'error'));
        }

        async function updateCoraInBackend(payload) {
            // POST /api/bancos/cadastrados já trata de update se `id` estiver presente
            // (vide server.js handler), mas o endpoint expõe só "banco_referencia_id".
            // Para simplificar, enviamos via POST mantendo id como referência.
            const res = await fetch('/api/bancos/cadastrados', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...payload,
                    banco_referencia_id: coraConfig.banco_referencia_id,
                    nome_exibicao: coraConfig.nome_exibicao,
                    client_id: coraConfig.client_id,
                    ambiente: payload.ambiente || coraConfig.ambiente
                })
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Falha ao salvar');
            return json;
        }

        // ─── Emitir Boleto Teste ───
        async function emitirBoletoTeste() {
            const result = await fetch('/api/cobrancas/sync').then(r => r.json());
            if (!coraConfig.client_id) return toast('Erro', 'Configure o Cora primeiro.', 'error');

            const ok = confirm('Emitir um boleto de teste no Cora? Valor simbólico R$ 1,00 com vencimento D+5.');
            if (!ok) return;
            try {
                const res = await fetch('/api/cobrancas/emitir', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        provider: 'cora',
                        contractId: 'TEST_' + Date.now(),
                        clientId: 'test_client',
                        value: 1.00,
                        dueDate: new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0],
                        services: [{ name: 'Boleto de teste', amount: 100 }],
                        customerPayload: {
                            name: 'Teste Renostter',
                            email: 'teste@renostter.com.br',
                            document: { identity: '12345678000190', type: 'CNPJ' }
                        }
                    })
                });
                const json = await res.json();
                if (res.ok && (json.success || json.duplicate)) {
                    toast('Boleto emitido', `Cobrança ${json.cobrancaId || ''} criada no Cora. Veja em Cobranças.`, 'success');
                    loadGatewayLogs();
                } else {
                    throw new Error(json.error || 'Falha ao emitir');
                }
            } catch (e) {
                toast('Erro', e.message, 'error');
            }
        }

        // ─── Provider tiles ───
        function renderProviderTiles() {
            const el = document.getElementById('providerTiles');
            el.innerHTML = providerList.map(p => `
                <div class="provider-tile ${p.supported ? '' : 'disabled'}" data-on-click="${p.supported ? `openProviderWizard('${p.id}')` : ''}">
                    <div style="font-size:1.6rem;margin-bottom:8px">${p.icon}</div>
                    <div style="font-weight:600;font-size:0.9rem;margin-bottom:4px">${esc(p.name)}</div>
                    <div style="font-size:0.75rem;color:var(--text-secondary);line-height:1.35">${esc(p.desc)}</div>
                    ${p.supported
                        ? '<div style="margin-top:10px;font-size:0.7rem;color:var(--blue);font-weight:600">Pronto para configurar →</div>'
                        : '<div style="margin-top:10px;font-size:0.7rem;color:var(--text-muted)">🚧 Em breve</div>'}
                </div>
            `).join('');
        }

        function openProviderWizard(providerId) {
            const p = providerList.find(x => x.id === providerId);
            if (!p) return;
            toast('Wizard de provider', `Para configurar ${p.name}, abra uma issue ou entre em contato com o admin — driver ainda não implementado nesta release.`, 'info');
        }

        // ─── Init ───
        document.addEventListener('DOMContentLoaded', () => {
            renderProviderTiles();
            loadCoraConfig();
        });
    
