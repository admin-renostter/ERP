/* Extraido de client/faturas.html por tools/csp-migrate.py (CSP sem unsafe-inline). */
/* ── gerado por tools/csp-migrate.py: nomes liberados para os data-on-* desta pagina ── */
;(function () {
  var s = window.__cspScope || (window.__cspScope = {});
  function def(n, g, st) { Object.defineProperty(s, n, { configurable: true, enumerable: true, get: g, set: st }); }
  def('aprovarFatura', function () { return typeof aprovarFatura !== 'undefined' ? aprovarFatura : undefined; }, function (v) { aprovarFatura = v; });
  def('auth', function () { return typeof auth !== 'undefined' ? auth : undefined; }, function (v) { auth = v; });
  def('copiar', function () { return typeof copiar !== 'undefined' ? copiar : undefined; }, function (v) { copiar = v; });
  def('reprovarFatura', function () { return typeof reprovarFatura !== 'undefined' ? reprovarFatura : undefined; }, function (v) { reprovarFatura = v; });
})();
/* ── fim do bloco gerado ── */

        const session = auth.protect(['cliente']);
        const clientId = session.clientId;

        const fmtVal = v => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const fmtDate = d => d ? new Date(d).toLocaleDateString('pt-BR') : '—';

        (async function init() {
            loadAll();
        })();

        async function loadAll() {
            try {
                // 1. Carregar Cobranças (Billed)
                const resC = await fetch(`${CORA_API_URL}/api/cobrancas?clientId=${clientId}`);
                const dataC = await resC.json();
                const cobrancas = dataC.success ? dataC.data : [];

                // 2. Carregar Propostas (Pending Invoices)
                const resF = await CoraIntegration.listarFaturas({ clientId });
                const faturas = resF.success ? resF.data : [];

                renderFaturas(cobrancas, faturas);
            } catch (e) {
                console.error('[Faturas]', e);
                document.getElementById('faturaGrid').innerHTML = '<div class="empty-faturas"><div style="font-size:2.5rem">📡</div><h3>Erro de conexão</h3><p>Não foi possível carregar suas faturas. Tente novamente.</p></div>';
            }
        }

        function renderFaturas(cobrancas, faturas) {
            const aberto = cobrancas.filter(f => ['PENDING', 'OPEN', 'OVERDUE'].includes(f.status));
            const pago = cobrancas.filter(f => f.status === 'PAID');

            document.getElementById('sumTotal').textContent = fmtVal(aberto.reduce((s, f) => s + (f.valor || 0), 0));
            document.getElementById('sumPago').textContent = fmtVal(pago.reduce((s, f) => s + (f.valor || 0), 0));
            document.getElementById('sumQtd').textContent = cobrancas.length + faturas.length;

            let html = '';

            // ── Section: Propostas Pendentes ──
            const pendentes = faturas.filter(f => f.status === 'AUTORIZACAO_PENDENTE');
            if (pendentes.length > 0) {
                html += `<h3 style="grid-column: 1/-1; margin: 10px 0 5px; font-size: 1.1rem; border-left: 4px solid var(--blue); padding-left: 12px;">Aprovações Pendentes</h3>`;
                html += pendentes.map(f => `
                    <div class="fatura-card" style="border-color: var(--blue-dim); background: linear-gradient(to bottom, var(--bg-surface), rgba(0,174,239,0.02))">
                        <div class="fatura-header">
                            <div class="fatura-valor">${fmtVal(f.valor_total)}</div>
                            <span class="status-badge status-PENDING">Aguardando Sua Aprovação</span>
                        </div>
                        <div class="fatura-body">
                            <div><div class="fatura-label">Nº Proposta</div><div>${f.numero}</div></div>
                            <div><div class="fatura-label">Chamado</div><div>#${f.ticket_num || f.ticket_id}</div></div>
                            <div style="grid-column: span 2; margin-top: 8px">
                                <div class="fatura-label">Serviços / Peças</div>
                                <div style="font-size: 0.8rem; color: var(--text-secondary); line-height: 1.4">
                                    ${(f.itens || []).map(i => `• ${i.quantidade}x ${i.descricao}`).join('<br>') || 'Apenas Mão de obra'}
                                </div>
                            </div>
                        </div>
                        <div class="fatura-actions">
                            <button class="btn btn-primary btn-sm" data-on-click="aprovarFatura('${f.id}')">✅ Aprovar e Gerar Boleto</button>
                            <button class="btn btn-ghost btn-sm" style="color:var(--danger)" data-on-click="reprovarFatura('${f.id}')">✕ Reprovar</button>
                        </div>
                    </div>
                `).join('');
            }

            // ── Section: Cobranças e Faturas ──
            if (cobrancas.length > 0 || faturas.length > pendentes.length) {
                html += `<h3 style="grid-column: 1/-1; margin: 25px 0 5px; font-size: 1.1rem; color: var(--text-secondary)">Histórico de Cobranças</h3>`;
                
                // Unir outras faturas (reprovadas, etc) se houver
                const outrasFaturas = faturas.filter(f => f.status !== 'AUTORIZACAO_PENDENTE');
                
                const sortedCobrancas = [...aberto.sort((a, b) => new Date(a.data_vencimento) - new Date(b.data_vencimento)), ...pago.sort((a, b) => new Date(b.data_pagamento || b.updated_at) - new Date(a.data_pagamento || a.updated_at))];
                
                html += sortedCobrancas.map(f => {
                    const isOverdue = f.status === 'OVERDUE' || (f.status === 'PENDING' && new Date(f.data_vencimento) < new Date());
                    const statusLabel = { PENDING: 'Aguardando', OPEN: 'Aberto', PAID: 'Pago', OVERDUE: 'Vencido', CANCELLED: 'Cancelado' };
                    const realStatus = isOverdue && f.status !== 'PAID' ? 'OVERDUE' : f.status;

                    return `<div class="fatura-card">
                        <div class="fatura-header">
                            <div class="fatura-valor ${f.status === 'PAID' ? 'paid' : ''}">${fmtVal(f.valor)}</div>
                            <span class="status-badge status-${realStatus}">${statusLabel[realStatus] || f.status}</span>
                        </div>
                        <div class="fatura-body">
                            <div><div class="fatura-label">Vencimento</div><div>${fmtDate(f.data_vencimento)}</div></div>
                            <div><div class="fatura-label">Referência</div><div>#${f.fatura_numero || f.contract_id || 'Serviço'}</div></div>
                        </div>
                        ${f.linha_digitavel ? `<div class="digitavel-box" data-on-click="copiar('${f.linha_digitavel}')" title="Clique para copiar">${f.linha_digitavel}</div>` : ''}
                        <div class="fatura-actions">
                            ${f.pdf_url ? `<a class="btn btn-primary btn-sm" href="${f.pdf_url}" target="_blank">📄 Baixar Boleto</a>` : ''}
                            ${f.linha_digitavel ? `<button class="btn btn-ghost btn-sm" data-on-click="copiar('${f.linha_digitavel}')">📋 Copiar Código</button>` : ''}
                        </div>
                    </div>`;
                }).join('');

                html += outrasFaturas.map(f => `
                    <div class="fatura-card" style="opacity: 0.7">
                        <div class="fatura-header">
                            <div class="fatura-valor">${fmtVal(f.valor_total)}</div>
                            <span class="status-badge" style="background: #eee; color: #666">${f.status === 'REJEITADO' ? 'REPROVADA' : f.status}</span>
                        </div>
                        <div class="fatura-body">
                            <div><div class="fatura-label">Data</div><div>${fmtDate(f.created_at)}</div></div>
                            <div><div class="fatura-label">Nº</div><div>${f.numero}</div></div>
                        </div>
                    </div>
                `).join('');
            }

            if (!cobrancas.length && !faturas.length) {
                html = '<div class="empty-faturas"><div style="font-size:2.5rem">🎉</div><h3>Nenhuma fatura pendente!</h3><p>Você está em dia com seus pagamentos.</p></div>';
            }

            document.getElementById('faturaGrid').innerHTML = html;
        }

        async function aprovarFatura(id) {
            if (!confirm('Deseja aprovar esta fatura? O boleto será gerado automaticamente para o seu e-mail.')) return;
            try {
                const res = await CoraIntegration.aprovarFatura(id);
                if (res.success) {
                    toast('Sucesso!', 'Fatura aprovada. O boleto está disponível no histórico.', 'success');
                    loadAll();
                }
            } catch (e) {
                toast('Erro', e.message, 'error');
            }
        }

        async function reprovarFatura(id) {
            const justificativa = prompt('Por favor, informe o motivo da reprovação:');
            if (justificativa === null) return;
            if (!justificativa.trim()) return toast('Erro', 'Justificativa obrigatória para reprovar.', 'warning');

            try {
                const res = await CoraIntegration.reprovarFatura(id, justificativa);
                if (res.success) {
                    toast('Fatura Reprovada', 'Sua resposta foi enviada à equipe técnica.', 'success');
                    loadAll();
                }
            } catch (e) {
                toast('Erro', e.message, 'error');
            }
        }

        function copiar(text) {
            navigator.clipboard.writeText(text);
            toast('Copiado!', 'Código copiado para a área de transferência.', 'success');
        }

        initSidebar();
    
