/**
 * Cora API Integration — Frontend Bridge
 * Connects the CRM Renostter (localStorage) to the Node.js Middleware.
 * 
 * Usage:
 *   CoraIntegration.emitirBoleto(contract, client, dueDate)
 *   CoraIntegration.syncStatus()
 *   CoraIntegration.getExtrato()
 *   CoraIntegration.ativarNotificacoes(invoiceId, { sms, whatsapp, email })
 *   CoraIntegration.cadastrarRecorrencia(contract, client, frequency)
 *   CoraIntegration.listarBoletos(contractId)
 *   CoraIntegration.getLogs(limit)
 */

// Resolve a Base URL dinamicamente para evitar erro CORS ou "Failed to fetch" fora de localhost
const API_HOST = '127.0.0.1';
const CORA_API_URL = `http://${API_HOST}:3000`;

const CoraIntegration = {

    // ── Helper: HTTP Request ──
    async _fetch(method, path, body = null) {
        const session = typeof auth !== 'undefined' ? auth.current() : null;
        const options = {
            method,
            headers: { 
                'Content-Type': 'application/json',
                ...(session && {
                    'x-user-id': session.userId,
                    'x-user-name': session.name,
                    'x-user-role': session.role
                })
            }
        };
        if (body) options.body = JSON.stringify(body);

        try {
            const response = await fetch(`${CORA_API_URL}${path}`, options);
            const data = await response.json().catch(() => null);

            if (!response.ok) {
                // Requisito 5: Capturar código e lista de erros detalhados
                const errorMsg = data?.error || data?.message || `Erro HTTP ${response.status}`;
                const err = new Error(errorMsg);
                err.code = data?.code;
                err.errors = data?.errors || [];
                err.status = response.status;
                throw err;
            }
            
            return data;
        } catch (error) {
            // Traduz o erro feio nativo para algo legível
            if (error.message.includes('Failed to fetch')) {
                error.message = 'Servidor inacessível. O backend na porta 3000 está rodando?';
            }
            
            // Log detalhado para auxílio no debug (Requisito 5)
            if (error.errors && error.errors.length > 0) {
                console.error(`[CoraIntegration] Erros detalhados:`, error.errors);
            }
            
            console.error(`[CoraIntegration] ${method} ${path} failed:`, error);
            throw error;
        }
    },

    // ── Health Check ──
    async healthCheck() {
        return this._fetch('GET', '/health');
    },

    /**
     * Obter KPIs financeiros unificados
     */
    async getKPIs() {
        return this._fetch('GET', '/api/cobrancas/kpis');
    },

    /**
     * Emitir boleto para um contrato
     * @param {Object} contract - Objeto do contrato (localStorage)
     * @param {Object} client   - Objeto do cliente (localStorage)
     * @param {string} dueDate  - Data vencimento YYYY-MM-DD
     */
    async emitirBoleto(contract, client, dueDate) {
        const cleanDoc = (client.cnpj || client.cpf || '').replace(/[^\d]/g, '');
        if (cleanDoc.length !== 11 && cleanDoc.length !== 14) {
            throw new Error(`O cliente ${client.fantasia || client.razaoSocial} não possui um CPF (11 dígitos) ou CNPJ (14 dígitos) válido cadastrado. Atualize o cadastro.`);
        }

        const payload = {
            contractId: contract.id,
            clientId: client.id,
            value: contract.value,
            dueDate: dueDate,
            services: contract.servicos || ['Serviços Variados'],
            customerPayload: {
                name: client.razaoSocial || client.fantasia || 'Cliente Renostter',
                email: client.email || 'contato@renostter.com.br',
                document: {
                    identity: cleanDoc,
                    type: cleanDoc.length > 11 ? 'CNPJ' : 'CPF'
                },
                address: {
                    street: client.logradouro || 'Rua Desconhecida',
                    number: client.numero || 'S/N',
                    district: client.bairro || 'Centro',
                    city: client.cidade || 'São Paulo',
                    state: client.uf || 'SP',
                    zip_code: (client.cep || '01001000').replace(/[^\d]/g, '')
                }
            }
        };

        const data = await this._fetch('POST', '/api/cobrancas/emitir', payload);
        if (!data.success) throw new Error(data.error || 'Erro na emissão');

        // Atualizar o contrato localmente no localStorage
        if (typeof db !== 'undefined') {
            db.update('contracts', contract.id, {
                cora_charge_id: data.chargeId,
                cora_barcode: data.barcode,
                cora_pdf: data.pdfUrl, // Campo pdfUrl no novo retorno
                cora_pix_qrcode: data.pixQrCode,
                ultimo_status_pagamento: data.duplicate ? 'DUPLICATE' : 'PENDING',
                data_proxima_cobranca: dueDate
            });
        }

        return data;
    },

    /**
     * Sincronizar status dos boletos (webhook updates) com localStorage
     * @returns {number} Quantidade de contratos atualizados
     */
    async syncStatus() {
        const json = await this._fetch('GET', '/api/cobrancas/sync');
        if (!json.success) return 0;

        let modificados = 0;
        if (typeof db === 'undefined') return 0;

        json.data.forEach(update => {
            const contract = db.find('contracts', update.contract_id);
            if (contract && contract.ultimo_status_pagamento !== update.status) {
                db.update('contracts', contract.id, {
                    ultimo_status_pagamento: update.status,
                    cora_barcode: update.barcode || contract.cora_barcode,
                    cora_pdf: update.pdf_url || contract.cora_pdf,
                    cora_pix_qrcode: update.pix_qrcode || contract.cora_pix_qrcode
                });

                // Se ficou PAID, criar transação financeira
                if (update.status === 'PAID') {
                    const existing = db.get('financial_transactions')
                        .find(ft => ft.contractId === contract.id && ft.description?.includes('Cobrança'));
                    if (!existing) {
                        db.insert('financial_transactions', {
                            type: 'receita',
                            description: `Pagamento Cobrança — ${contract.clientName || contract.id}`,
                            value: update.valor || contract.value,
                            dueDate: update.data_vencimento,
                            payDate: new Date().toISOString().split('T')[0],
                            status: 'pago',
                            clientId: update.client_id || contract.clientId,
                            contractId: contract.id,
                            categoryId: 'fcat1'
                        });
                    }
                }
                modificados++;
            }
        });

        if (modificados > 0) {
            console.log(`[BillingIntegration] Sincronizado: ${modificados} contrato(s) atualizado(s).`);
        }
        return modificados;
    },

    /**
     * Consultar extrato bancário
     */
    async getExtrato() {
        return this._fetch('GET', '/api/cobrancas/extrato');
    },

    /**
     * Ativar/Desativar notificações para um boleto (Gateway-side)
     */
    async ativarNotificacoes(cobrancaId, options = {}) {
        return this._fetch('POST', '/api/cobrancas/notificacoes', {
            cobrancaId,
            send_sms: options.sms !== undefined ? options.sms : true,
            send_whatsapp: options.whatsapp !== undefined ? options.whatsapp : true,
            send_email: options.email !== undefined ? options.email : true
        });
    },

    /**
     * Enviar e-mail manual via Middleware (Nodemailer)
     */
    async enviarEmailManual(cobrancaId, email) {
        return this._fetch('POST', '/api/cobrancas/email', {
            cobrancaId,
            email
        });
    },

    /**
     * Cadastrar contrato para cobrança recorrente automática
     * @param {Object} contract - Contrato
     * @param {Object} client   - Cliente
     * @param {string} frequency - 'monthly' | 'yearly' | 'weekly'
     */
    async cadastrarRecorrencia(contract, client, frequency = 'monthly') {
        const cleanDoc = (client.cnpj || client.cpf || '').replace(/[^\d]/g, '');
        const nextDue = new Date();
        nextDue.setMonth(nextDue.getMonth() + 1);

        return this._fetch('POST', '/api/cobrancas/recorrencia', {
            contractId: contract.id,
            clientId: client.id,
            value: contract.value,
            frequency,
            nextDueDate: nextDue.toISOString().split('T')[0],
            customerPayload: {
                name: client.razaoSocial || client.fantasia || 'Cliente',
                email: client.email || '',
                document: { identity: cleanDoc, type: cleanDoc.length > 11 ? 'CNPJ' : 'CPF' },
                address: {
                    street: client.logradouro || '', number: client.numero || '',
                    district: client.bairro || '', city: client.cidade || '',
                    state: client.uf || '', zip_code: (client.cep || '').replace(/[^\d]/g, '')
                }
            },
            services: contract.servicos || ['Serviço']
        });
    },

    /**
     * Desativar cobrança recorrente
     * @param {string} contractId
     */
    async desativarRecorrencia(contractId) {
        return this._fetch('DELETE', `/api/cobrancas/recorrencia/${contractId}`);
    },

    /**
     * Listar cobranças emitidas (Requisito 4: Suporte a Paginação)
     * @param {Object} params - { contractId, status, page, size }
     */
    async listarBoletos(params = {}) {
        const page = params.page || 0;
        const size = params.size || 50;
        let query = `/api/cobrancas?page=${page}&size=${size}&`;
        if (params.contractId) query += `contractId=${params.contractId}&`;
        if (params.status) query += `status=${params.status}&`;
        return this._fetch('GET', query);
    },

    /**
     * Consultar logs de integração (Suporte a Paginação)
     */
    async getLogs(page = 0, size = 50) {
        return this._fetch('GET', `/api/cobrancas/logs?page=${page}&size=${size}`);
    },

    // ── Invoices (Faturas) ──

    /**
     * Listar faturas (propostas de faturamento)
     * @param {Object} params - { clientId, ticketId, status, page, size }
     */
    async listarFaturas(params = {}) {
        const page = params.page || 0;
        const size = params.size || 50;
        let query = `/api/faturas?page=${page}&size=${size}&`;
        if (params.clientId) query += `clientId=${params.clientId}&`;
        if (params.ticketId) query += `ticketId=${params.ticketId}&`;
        if (params.status) query += `status=${params.status}&`;
        return this._fetch('GET', query);
    },

    /**
     * Buscar detalhes de uma fatura por ID
     */
    async buscarFatura(id) {
        return this._fetch('GET', `/api/faturas/${id}`);
    },

    /**
     * Criar uma nova proposta de fatura a partir de um chamado
     * @param {Object} payload - { clientId, ticketId, items, maoDeObra, vencimentoDias }
     */
    async criarFatura(payload) {
        return this._fetch('POST', `/api/faturas`, payload);
    },

    /**
     * Aprovar uma fatura (gera a cobrança no gateway)
     */
    async aprovarFatura(id) {
        return this._fetch('PATCH', `/api/faturas/${id}/aprovar`);
    },

    /**
     * Reprovar uma fatura com justificativa
     */
    async reprovarFatura(id, justificativa) {
        return this._fetch('PATCH', `/api/faturas/${id}/reprovar`, { justificativa });
    }
};

// Aliases para compatibilidade e futuro
const BillingIntegration = CoraIntegration;

// ── Auto-sync ao carregar a página ──
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(async () => {
        if (typeof db !== 'undefined') {
            try {
                await CoraIntegration.syncStatus();
            } catch (e) {
                // Middleware não está rodando — silenciar
            }
        }
    }, 2000);
});
