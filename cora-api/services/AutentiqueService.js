/**
 * AutentiqueService — Wrapper GraphQL para Autentique (assinatura digital)
 *
 * Sprint 21 — Módulo de Templates de Contrato + Integração Autentique
 *
 * IMPORTANTE: Autentique NÃO suporta "template de documento" como arquivo base
 * com placeholders. O que existe são TEMPLATES DE E-MAIL (mensagens para signatários).
 * A abordagem é: manter templates (HTML/DOCX) no ERP, gerar o PDF final substituindo
 * placeholders, e enviar esse PDF para o Autentique como documento novo.
 *
 * MODO DEV: Se AUTENTIQUE_TOKEN não estiver configurado, usa _mockResponse() para
 * simular a API (não envia nada real). Em prod, defina AUTENTIQUE_TOKEN no .env.
 *
 * Docs: https://docs.autentique.com.br/api/llms.txt
 */

const crypto = require('crypto');

class AutentiqueService {
    constructor() {
        this.endpoint = process.env.AUTENTIQUE_ENDPOINT || 'https://api.autentique.com.br/v2/graphql';
        this.token = process.env.AUTENTIQUE_TOKEN || null;
        this.mock = !this.token;
        this.sandbox = process.env.AUTENTIQUE_SANDBOX === 'true';
    }

    get isMock() {
        return this.mock;
    }

    /**
     * Gera resposta mock para dev/testes
     */
    _mockResponse(operation, variables) {
        const id = 'mock-' + crypto.randomBytes(6).toString('hex');
        const shortUrl = `https://app.autentique.com.br/mock/${id}`;
        console.log(`[Autentique:MOCK] ${operation}`, JSON.stringify({ id, shortUrl, ...variables }).substring(0, 200));
        return {
            id,
            short_url: shortUrl,
            status: 'sent',
            signers: (variables.signers || []).map((s, i) => ({
                email: s.email,
                name: s.name,
                status: 'pending',
                link: `https://app.autentique.com.br/mock/${id}/signer/${i}`,
            })),
        };
    }

    /**
     * Faz requisição GraphQL ao Autentique
     */
    async _graphql(query, variables = {}) {
        if (this.mock) {
            const op = query.trim().split(/\s+/)[0] || 'query';
            return this._mockResponse(op, variables);
        }

        const response = await fetch(this.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.token}`,
            },
            body: JSON.stringify({ query, variables }),
        });

        if (!response.ok) {
            throw new Error(`Autentique HTTP ${response.status}: ${await response.text()}`);
        }

        const json = await response.json();
        if (json.errors) {
            throw new Error(`Autentique GraphQL: ${json.errors[0]?.message || 'unknown'}`);
        }
        return json.data;
    }

    /**
     * Cria documento no Autentique a partir de base64
     * Documentação Autentique: mutation createDocument
     */
    async createDocument({ name, fileBase64, signers, refusable = true, folderId = null }) {
        const query = `
            mutation CreateDocument($document: DocumentInput!, $signers: [SignerInput!]!) {
                createDocument(document: $document, signers: $signers) {
                    id
                    name
                    status
                    signers { email name status }
                }
            }
        `;

        const document = {
            name,
            refusable,
            folder_id: folderId,
            // Autentique aceita arquivo via template_file (base64)
            ...(fileBase64 ? { template_file: fileBase64 } : {}),
        };

        const variables = { document, signers };

        if (this.mock) {
            return this._mockResponse('createDocument', variables);
        }

        const data = await this._graphql(query, variables);
        return data.createDocument;
    }

    /**
     * Lista templates de e-mail (mensagens para signatários)
     * Documentação Autentique: query emailTemplates
     */
    async listEmailTemplates(limit = 60, page = 1) {
        if (this.mock) {
            return {
                data: [
                    { id: 'mock-tpl-1', name: 'Contrato - Padrão Renostter' },
                    { id: 'mock-tpl-2', name: 'Adendo - Renovação' },
                ],
                pagination: { total: 2, perPage: limit, currentPage: page, lastPage: 1 },
            };
        }

        const query = `
            query ListEmailTemplates($limit: Int, $page: Int) {
                emailTemplates(limit: $limit, page: $page) {
                    data { id name }
                    pagination { total perPage currentPage lastPage }
                }
            }
        `;
        const data = await this._graphql(query, { limit, page });
        return data.emailTemplates;
    }

    /**
     * Lista documentos (contratos enviados)
     */
    async listDocuments(limit = 50, page = 1) {
        if (this.mock) {
            return { data: [], pagination: { total: 0, perPage: limit, currentPage: page, lastPage: 1 } };
        }

        const query = `
            query ListDocuments($limit: Int, $page: Int) {
                documents(limit: $limit, page: $page) {
                    data { id name status created_at signers { email name status } }
                    pagination { total perPage currentPage lastPage }
                }
            }
        `;
        const data = await this._graphql(query, { limit, page });
        return data.documents;
    }

    /**
     * Busca documento específico por ID
     */
    async getDocument(documentId) {
        if (this.mock) {
            return {
                id: documentId,
                name: 'Mock Document',
                status: 'sent',
                signers: [],
            };
        }

        const query = `
            query GetDocument($id: UUID!) {
                document(id: $id) {
                    id name status created_at
                    signers { email name status signed_at }
                }
            }
        `;
        const data = await this._graphql(query, { id: documentId });
        return data.document;
    }

    /**
     * Verifica credenciais / conexão com Autentique
     */
    async healthcheck() {
        if (this.mock) {
            return { ok: true, mode: 'mock', message: 'Autentique em modo MOCK (sem token)' };
        }
        try {
            const query = `{ __typename }`;
            await this._graphql(query);
            return { ok: true, mode: 'live', sandbox: this.sandbox };
        } catch (e) {
            return { ok: false, mode: 'live', error: e.message };
        }
    }
}

module.exports = new AutentiqueService();
