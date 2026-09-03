/**
 * Signature Service — Autentique wrapper (GraphQL)
 *
 * Sprint 8 — Assinatura digital integrada ao ERP
 *
 * A Autentique usa GraphQL em https://api.autentique.com.br/v2/graphql.
 * Para upload de arquivo, é necessário enviar via multipart/form-data
 * (padrão GraphQL Multipart Request Spec).
 *
 * Custos (BRL, out/2026):
 *   - Criar documento:         R$ 0,06
 *   - Signatário por email:    R$ 0,013
 *   - Signatário por WhatsApp: R$ 0,12
 *   - Signatário por SMS:      R$ 0,16
 *
 * Free tier: 20 docs/mês (10 via API). Profissional R$ 99/mês ilimitado.
 *
 * Sandbox: passar `sandbox: true` para testes (grátis, deletado após 7 dias).
 */

const fetch = globalThis.fetch;
const FormData = globalThis.FormData;

const AUTENTIQUE_API_URL = process.env.AUTENTIQUE_API_URL || 'https://api.autentique.com.br/v2/graphql';
const AUTENTIQUE_TOKEN = process.env.AUTENTIQUE_TOKEN || null;
const AUTENTIQUE_FOLDER_ID = process.env.AUTENTIQUE_FOLDER_ID || null;
const IS_SANDBOX = process.env.AUTENTIQUE_SANDBOX === 'true' || process.env.NODE_ENV !== 'production';

const IS_PROD = process.env.NODE_ENV === 'production';

function isSignatureAvailable() {
    return !!AUTENTIQUE_TOKEN;
}

/**
 * Mapeia delivery method simples (EMAIL/WHATSAPP/SMS/LINK) para enum da Autentique.
 */
function mapDeliveryMethod(method) {
    const map = {
        'EMAIL': 'DELIVERY_METHOD_EMAIL',
        'WHATSAPP': 'DELIVERY_METHOD_WHATSAPP',
        'SMS': 'DELIVERY_METHOD_SMS',
        'LINK': 'DELIVERY_METHOD_LINK',
    };
    const upper = String(method || 'EMAIL').toUpperCase();
    return map[upper] || 'DELIVERY_METHOD_EMAIL';
}

/**
 * Executa query/mutation GraphQL (sem upload).
 */
async function graphql(query, variables = {}) {
    if (!isSignatureAvailable()) {
        throw new Error('AUTENTIQUE_TOKEN não configurado');
    }
    const res = await fetch(AUTENTIQUE_API_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${AUTENTIQUE_TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
    });
    const data = await res.json();
    if (data.errors && data.errors.length > 0) {
        const msg = data.errors.map(e => e.message).join('; ');
        throw new Error(`Autentique GraphQL error: ${msg}`);
    }
    return data.data;
}

/**
 * Executa mutation GraphQL com upload de arquivo (multipart).
 *
 * @param {string} query
 * @param {Object} variables - deve ter chave 'file' que é Buffer
 * @param {Object} files - mapa de {variableName: { buffer, filename, mimeType }}
 */
async function graphqlWithUpload(query, variables, files) {
    if (!isSignatureAvailable()) {
        throw new Error('AUTENTIQUE_TOKEN não configurado');
    }
    const form = new FormData();
    form.append('operations', JSON.stringify({ query, variables }));

    // Map de arquivos: '0' = primeiro file, '1' = segundo, etc.
    const fileMap = {};
    let fileIdx = 0;
    for (const [varName, file] of Object.entries(files)) {
        const blob = new Blob([file.buffer], { type: file.mimeType || 'application/pdf' });
        form.append(`${fileIdx}`, blob, file.filename || 'document.pdf');
        fileMap[fileIdx] = [`variables.${varName}`];
        fileIdx++;
    }
    form.append('map', JSON.stringify(fileMap));

    const res = await fetch(AUTENTIQUE_API_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${AUTENTIQUE_TOKEN}`,
        },
        body: form,
    });
    const data = await res.json();
    if (data.errors && data.errors.length > 0) {
        const msg = data.errors.map(e => e.message).join('; ');
        throw new Error(`Autentique GraphQL error: ${msg}`);
    }
    return data.data;
}

/**
 * Cria um documento (envelope) para assinatura.
 *
 * @param {Object} opts
 * @param {string} opts.name - nome do documento (ex: "Contrato PMOC - Empresa X")
 * @param {Buffer|string} opts.pdf - Buffer do PDF (ou caminho de arquivo)
 * @param {Array<{name, email, phone?, deliveryMethod?: 'EMAIL'|'WHATSAPP'|'SMS'|'LINK'}>} opts.signers
 * @param {boolean} [opts.sandbox]
 * @param {string} [opts.folderId]
 * @param {string} [opts.message] - mensagem exibida no e-mail
 * @param {string} [opts.deadlineAt] - ISO date para vencimento do envelope
 * @returns {Promise<Object>} { id, name, signers, ... }
 */
async function createDocument({ name, pdf, signers = [], sandbox = IS_SANDBOX, folderId = AUTENTIQUE_FOLDER_ID, message, deadlineAt }) {
    if (!isSignatureAvailable()) {
        throw new Error('AUTENTIQUE_TOKEN não configurado');
    }

    // Converte PDF pra Buffer se necessário
    let pdfBuffer;
    if (Buffer.isBuffer(pdf)) {
        pdfBuffer = pdf;
    } else if (typeof pdf === 'string') {
        const fs = require('fs');
        if (fs.existsSync(pdf)) {
            pdfBuffer = fs.readFileSync(pdf);
        } else {
            // assume base64
            pdfBuffer = Buffer.from(pdf, 'base64');
        }
    } else {
        throw new Error('pdf deve ser Buffer, caminho de arquivo ou base64');
    }

    const mutation = `
        mutation CreateDocument($document: DocumentInput!, $signers: [SignerInput!]!, $file: Upload!, $folder_id: UUID, $sandbox: Boolean) {
            createDocument(
                document: $document
                signers: $signers
                file: $file
                folder_id: $folder_id
                sandbox: $sandbox
            ) {
                id
                name
                created_at
                sandbox
                deadline_at
                signers_history {
                    created_at
                    user {
                        public_id
                        name
                        email
                        delivery_method
                        created_at
                        updated_at
                        archived_at
                    }
                }
            }
        }
    `;

    const documentInput = {
        name,
        ...(message ? { message } : {}),
        ...(deadlineAt ? { deadline_at: deadlineAt } : {}),
    };

    const signersInput = signers.map(s => ({
        name: s.name,
        email: s.email,
        ...(s.phone ? { phone: s.phone } : {}),
        // Aceita 'EMAIL'|'WHATSAPP'|'SMS'|'LINK' e converte para enum completo
        delivery_method: mapDeliveryMethod(s.deliveryMethod),
        action: s.action || 'SIGN',
    }));

    const variables = {
        document: documentInput,
        signers: signersInput,
        file: null,  // preenchido pelo upload
        folder_id: folderId || null,
        sandbox: !!sandbox,
    };

    return graphqlWithUpload(mutation, variables, {
        file: { buffer: pdfBuffer, filename: 'contrato.pdf', mimeType: 'application/pdf' },
    }).then(data => data.createDocument);
}

/**
 * Lista documentos.
 */
async function listDocuments({ limit = 20, page = 1, folderId = AUTENTIQUE_FOLDER_ID } = {}) {
    const query = `
        query ListDocuments($limit: Int, $page: Int, $folder_id: UUID) {
            documents(limit: $limit, page: $page, folder_id: $folder_id) {
                data {
                    id
                    name
                    created_at
                    sandbox
                    deadline_at
                }
            }
        }
    `;
    const data = await graphql(query, { limit, page, folder_id: folderId });
    return data.documents.data;
}

/**
 * Busca um documento por ID.
 */
async function getDocument(documentId) {
    const query = `
        query GetDocument($id: UUID!) {
            document(id: $id) {
                id
                name
                created_at
                sandbox
                deadline_at
                signers_history {
                    created_at
                    user {
                        public_id
                        name
                        email
                        delivery_method
                        created_at
                        updated_at
                        archived_at
                    }
                }
            }
        }
    `;
    const data = await graphql(query, { id: documentId });
    return data.document;
}

/**
 * Reenvia link/email para signatários.
 */
async function resendSignatures(documentIds) {
    const ids = Array.isArray(documentIds) ? documentIds : [documentIds];
    const mutation = `
        mutation ResendSignatures($public_ids: [UUID!]) {
            resendSignatures(public_ids: $public_ids) {
                id
            }
        }
    `;
    const data = await graphql(mutation, { public_ids: ids });
    return data.resendSignatures;
}

/**
 * Deleta/cancela um documento.
 */
async function deleteDocument(documentId) {
    const mutation = `
        mutation DeleteDocument($id: ID!) {
            deleteDocument(id: $id) {
                id
            }
        }
    `;
    const data = await graphql(mutation, { id: documentId });
    return data.deleteDocument;
}

/**
 * Info da organização (para verificar plano, conta, etc).
 */
async function me() {
    const query = `
        query Me {
            me {
                id
                name
                email
                organization { id name }
            }
        }
    `;
    const data = await graphql(query);
    return data.me;
}

module.exports = {
    isSignatureAvailable,
    createDocument,
    listDocuments,
    getDocument,
    resendSignatures,
    deleteDocument,
    me,
    graphql,
    graphqlWithUpload,
    AUTENTIQUE_API_URL,
    IS_SANDBOX,
};
