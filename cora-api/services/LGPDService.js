/**
 * LGPDService — Conformidade com a Lei Geral de Proteção de Dados (Sprint 17)
 *
 * Lei 13.709/2018 (LGPD) — direitos do titular:
 *   1. Acesso (art. 18, I)         — saber quais dados temos
 *   2. Correção (art. 18, III)     — corrigir dados errados
 *   3. Exclusão (art. 18, VI)      — direito ao esquecimento
 *   4. Portabilidade (art. 18, V)  — exportar em formato estruturado
 *   5. Oposição (art. 18, II)      — opor-se a tratamento
 *   6. Revogação de consentimento  — retirar consentimento
 *
 * Conformidade:
 *   - DSAR tem prazo de 15 dias para resposta (LGPD art. 38, §5º)
 *   - Auditoria de acessos por 5 anos (LGPD art. 37)
 *   - Anonimização: substitui dados pessoais por códigos/hash
 *   - Direito ao esquecimento: deleta após cumprimento de obrigações legais
 *
 * Funções principais:
 *   - createDSAR(clienteId, tipo, descricao)    — titular abre pedido
 *   - processDSAR(pedidoId)                      — admin processa
 *   - exportClienteData(clienteId)                — gera JSON com todos os dados
 *   - anonymizeCliente(clienteId)                — substitui dados sensíveis
 *   - deleteCliente(clienteId, hard)             — direito ao esquecimento
 *   - recordConsent(clienteId, tipo, aceito)      — registra consentimento
 *   - revokeConsent(clienteId, tipo)              — titular revoga
 *   - auditAccess(userId, acao, entidade, ...)    — registra acesso
 *   - runRetentionPolicy()                        — executa política de retenção
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { dbGet, dbAll, dbRun } = require('../database');

const LGPD_RESPONSE_DAYS = 15;  // Prazo legal
const ANON_HASH_SALT = 'renostter-lgpd-2026';  // Para gerar hashes únicos por cliente

function newId(prefix) {
    return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

/**
 * Anonimiza um campo: gera um hash determinístico para que o registro
 * ainda possa ser referenciado (FKs, integridade), mas sem expor PII.
 */
function anonHash(value) {
    if (!value) return null;
    return crypto.createHash('sha256').update(String(value) + ANON_HASH_SALT).digest('hex').substring(0, 12);
}

function anonName(name) {
    if (!name) return null;
    // Mantém primeira letra, substitui resto por *
    return name[0] + '*'.repeat(Math.max(1, name.length - 1));
}

// ════════════════════════════════════════════════════════════════
// DSAR — Data Subject Access Request
// ════════════════════════════════════════════════════════════════

const VALID_DSAR_TYPES = ['acesso', 'portabilidade', 'correcao', 'exclusao', 'oposicao'];

/**
 * Titular abre um DSAR (via portal ou admin).
 * Retorna o pedido com prazo legal calculado.
 */
async function createDSAR({ clienteId, tipo, descricao = null, ip = null }) {
    if (!clienteId) throw new Error('clienteId obrigatório');
    if (!VALID_DSAR_TYPES.includes(tipo)) {
        throw new Error(`tipo inválido: ${tipo}. Permitidos: ${VALID_DSAR_TYPES.join(', ')}`);
    }

    const cliente = await dbGet('SELECT id, nome FROM clientes WHERE id = ?', [clienteId]);
    if (!cliente) throw new Error('Cliente não encontrado');

    const id = newId('dsar');
    const prazoLegal = new Date(Date.now() + LGPD_RESPONSE_DAYS * 24 * 60 * 60 * 1000).toISOString();

    await dbRun(
        `INSERT INTO dsar_pedidos
         (id, cliente_id, tipo, status, descricao, prazo_legal, recebido_em, ip, created_at, updated_at)
         VALUES (?, ?, ?, 'pendente', ?, ?, datetime('now'), ?, datetime('now'), datetime('now'))`,
        [id, clienteId, tipo, descricao, prazoLegal, ip]
    );

    return {
        id,
        cliente_id: clienteId,
        tipo,
        status: 'pendente',
        prazo_legal: prazoLegal,
        dias_restantes: LGPD_RESPONSE_DAYS,
        message: `DSAR criado. Prazo legal de resposta: ${LGPD_RESPONSE_DAYS} dias.`,
    };
}

/**
 * Lista DSARs com filtros.
 */
async function listDSARs({ status = null, clienteId = null, limit = 50 } = {}) {
    let sql = `
        SELECT d.id, d.cliente_id, d.tipo, d.status, d.descricao, d.prazo_legal,
               d.recebido_em, d.concluido_em, d.atribuido_para, d.resposta,
               d.arquivo_export_url, c.nome as cliente_nome, c.email as cliente_email
        FROM dsar_pedidos d
        JOIN clientes c ON c.id = d.cliente_id
        WHERE 1=1
    `;
    const params = [];
    if (status) { sql += ' AND d.status = ?'; params.push(status); }
    if (clienteId) { sql += ' AND d.cliente_id = ?'; params.push(clienteId); }
    sql += ' ORDER BY d.recebido_em DESC LIMIT ?';
    params.push(Math.min(parseInt(limit) || 50, 200));
    return await dbAll(sql, params);
}

async function getDSAR(id) {
    return await dbGet('SELECT * FROM dsar_pedidos WHERE id = ?', [id]);
}

/**
 * Admin marca DSAR como em análise ou atribui para si.
 */
async function updateDSARStatus(id, { status, atribuidoPara = null, resposta = null, arquivoExportUrl = null }) {
    const valid = ['pendente', 'em_analise', 'concluido', 'rejeitado', 'expirado'];
    if (status && !valid.includes(status)) {
        throw new Error(`status inválido: ${status}`);
    }
    const updates = [];
    const params = [];
    if (status) { updates.push('status = ?'); params.push(status); }
    if (atribuidoPara) { updates.push('atribuido_para = ?'); params.push(atribuidoPara); }
    if (resposta) { updates.push('resposta = ?'); params.push(resposta); }
    if (arquivoExportUrl) { updates.push('arquivo_export_url = ?'); params.push(arquivoExportUrl); }
    if (status === 'concluido') { updates.push('concluido_em = datetime(\'now\')'); }
    if (updates.length === 0) return { ok: true };
    updates.push('updated_at = datetime(\'now\')');
    params.push(id);
    await dbRun(`UPDATE dsar_pedidos SET ${updates.join(', ')} WHERE id = ?`, params);
    return { ok: true };
}

// ════════════════════════════════════════════════════════════════
// EXPORTAÇÃO (Portabilidade)
// ════════════════════════════════════════════════════════════════

/**
 * Exporta TODOS os dados de um cliente em formato JSON estruturado.
 * Direito de portabilidade (LGPD art. 18, V).
 *
 * Retorna um objeto com:
 *   - cliente (dados cadastrais)
 *   - contratos
 *   - cobrancas
 *   - chamados
 *   - equipamentos
 *   - notificacoes
 *   - consentimentos
 *   - audit_acessos (histórico de quem viu os dados)
 */
async function exportClienteData(clienteId) {
    if (!clienteId) throw new Error('clienteId obrigatório');

    const cliente = await dbGet('SELECT * FROM clientes WHERE id = ?', [clienteId]);
    if (!cliente) throw new Error('Cliente não encontrado');

    const [
        contratos, cobrancas, chamados, equipamentos,
        avaliacoes, cotacoes, leads, consentimentos, auditoria,
    ] = await Promise.all([
        dbAll('SELECT * FROM contratos WHERE cliente_id = ?', [clienteId]),
        dbAll('SELECT id, contract_id, valor, data_vencimento, data_pagamento, status, gateway_provider FROM cobrancas WHERE client_id = ? ORDER BY data_vencimento DESC', [clienteId]),
        dbAll('SELECT id, titulo, descricao, categoria, status, data_abertura, data_conclusao FROM chamados WHERE cliente_id = ? ORDER BY data_abertura DESC', [clienteId]),
        dbAll('SELECT * FROM equipamentos WHERE cliente_id = ?', [clienteId]),
        dbAll('SELECT * FROM avaliacoes WHERE cliente_id = ?', [clienteId]),
        dbAll('SELECT * FROM cotacoes WHERE cliente_id = ?', [clienteId]),
        dbAll('SELECT id, nome, email, telefone, origem, status, pontuacao, created_at FROM leads WHERE converted_to_cliente_id = ?', [clienteId]),
        dbAll('SELECT tipo, aceito, aceito_em, revogado_em, metodo_coleta, created_at FROM consentimentos WHERE cliente_id = ? ORDER BY created_at DESC', [clienteId]),
        dbAll('SELECT user_id, user_role, acao, entidade, entidade_id, ip, created_at FROM audit_acessos WHERE cliente_id = ? ORDER BY created_at DESC LIMIT 500', [clienteId]),
    ]);

    // Portal user (se existir)
    const portalUser = await dbGet(
        'SELECT id, email, nome, telefone, ativo, ultimo_login_at, created_at FROM portal_users WHERE cliente_id = ?',
        [clienteId]
    );

    return {
        exportado_em: new Date().toISOString(),
        exportado_por: 'LGPDService.exportClienteData',
        base_legal: 'LGPD art. 18, V (portabilidade)',
        titular: {
            id: cliente.id,
            nome: cliente.nome,
            email: cliente.email,
            telefone: cliente.telefone,
            cnpj: cliente.cnpj,
            data_cadastro: cliente.created_at,
        },
        dados: {
            cliente: {
                id: cliente.id, nome: cliente.nome, email: cliente.email,
                telefone: cliente.telefone, cnpj: cliente.cnpj,
            },
            contratos,
            cobrancas,
            chamados,
            equipamentos,
            avaliacoes,
            cotacoes,
            leads: leads,
            consentimentos,
            portal_user: portalUser || null,
            auditoria_acessos: auditoria,
        },
        contadores: {
            contratos: contratos.length,
            cobrancas: cobrancas.length,
            chamados: chamados.length,
            equipamentos: equipamentos.length,
            avaliacoes: avaliacoes.length,
            cotacoes: cotacoes.length,
            leads: leads.length,
            consentimentos: consentimentos.length,
            auditoria: auditoria.length,
        },
    };
}

/**
 * Salva o export em arquivo JSON e retorna o path.
 */
async function exportClienteDataToFile(clienteId, outputDir = '/tmp') {
    const data = await exportClienteData(clienteId);
    const filename = `lgpd_export_${clienteId}_${Date.now()}.json`;
    const filepath = path.join(outputDir, filename);
    try {
        fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
        return { filepath, filename, size: fs.statSync(filepath).size };
    } catch (e) {
        // Fallback: retorna o JSON inline se não conseguir escrever
        return { filepath: null, filename, data, size: JSON.stringify(data).length };
    }
}

// ════════════════════════════════════════════════════════════════
// ANONIMIZAÇÃO
// ════════════════════════════════════════════════════════════════

/**
 * Anonimiza um cliente: substitui PII por hashes/códigos.
 * Mantém integridade referencial (FKs intactas) mas dados pessoais somem.
 *
 * Ideal para: clientes cancelados há muito tempo, leads não convertidos antigos, etc.
 */
async function anonymizeCliente(clienteId, { actorUserId = null } = {}) {
    if (!clienteId) throw new Error('clienteId obrigatório');
    const cliente = await dbGet('SELECT id, nome, email FROM clientes WHERE id = ?', [clienteId]);
    if (!cliente) throw new Error('Cliente não encontrado');

    const hash = anonHash(clienteId);
    const ts = new Date().toISOString().substring(0, 19);

    // Anonimiza dados pessoais na tabela clientes
    await dbRun(
        `UPDATE clientes
         SET nome = ?, email = ?, telefone = ?, cnpj = ?
         WHERE id = ?`,
        [
            `ANON-${hash}`,
            `anon-${hash}@anonimizado.local`,
            null,
            anonHash(cliente.cnpj),
            clienteId,
        ]
    );

    // Anonimiza portal_user
    await dbRun(
        `UPDATE portal_users
         SET nome = ?, email = ?, telefone = ?, ativo = 0
         WHERE cliente_id = ?`,
        [`ANON-${hash}`, `anon-${hash}@anonimizado.local`, null, clienteId]
    );

    // Audit log
    await auditAccess({
        userId: actorUserId,
        userRole: actorUserId ? 'admin' : 'system',
        clienteId,
        acao: 'delete',
        entidade: 'cliente',
        entidadeId: clienteId,
        motivo: `Anonimização LGPD executada em ${ts}`,
    });

    return {
        ok: true,
        cliente_id: clienteId,
        anonimizado_em: new Date().toISOString(),
        message: 'Cliente anonimizado. Dados pessoais substituídos por hashes.',
    };
}

// ════════════════════════════════════════════════════════════════
// EXCLUSÃO (Direito ao Esquecimento)
// ════════════════════════════════════════════════════════════════

/**
 * Exclui cliente + dados vinculados (FK CASCADE).
 * ⚠️ Esta é uma operação IRREVERSÍVEL.
 *
 * Use apenas após:
 *   1. Cumprimento de todas as obrigações legais/fiscais
 *   2. Anonimização (se for o caso)
 *   3. Confirmação explícita do titular
 */
async function deleteCliente(clienteId, { actorUserId = null, motivo = null, hard = true } = {}) {
    if (!clienteId) throw new Error('clienteId obrigatório');
    const cliente = await dbGet('SELECT id FROM clientes WHERE id = ?', [clienteId]);
    if (!cliente) throw new Error('Cliente não encontrado');

    // Audit ANTES de deletar
    await auditAccess({
        userId: actorUserId,
        userRole: actorUserId ? 'admin' : 'system',
        clienteId,
        acao: 'delete',
        entidade: 'cliente',
        entidadeId: clienteId,
        motivo: motivo || 'Direito ao esquecimento (LGPD art. 18, VI)',
    });

    if (hard) {
        // Hard delete: cascateia via FK constraints
        await dbRun('DELETE FROM clientes WHERE id = ?', [clienteId]);
    } else {
        // Soft delete: marca como inativo (substitui PII)
        await dbRun('UPDATE clientes SET nome = ?, email = ?, telefone = ? WHERE id = ?', [
            `DELETED-${anonHash(clienteId)}`, null, null, clienteId,
        ]);
    }

    return {
        ok: true,
        cliente_id: clienteId,
        deleted_at: new Date().toISOString(),
        method: hard ? 'hard' : 'soft',
        message: hard ? 'Cliente deletado permanentemente (CASCADE).' : 'Cliente marcado como inativo.',
    };
}

// ════════════════════════════════════════════════════════════════
// CONSENTIMENTOS
// ════════════════════════════════════════════════════════════════

const VALID_CONSENT_TYPES = [
    'marketing_email', 'marketing_sms', 'marketing_whatsapp',
    'compartilhamento_dados', 'cookies', 'newsletter',
];

/**
 * Registra consentimento (aceite ou recusa).
 */
async function recordConsent({ clienteId, tipo, aceito, ip = null, userAgent = null, metodoColeta = 'api', detalhes = null }) {
    if (!clienteId) throw new Error('clienteId obrigatório');
    if (!VALID_CONSENT_TYPES.includes(tipo)) {
        throw new Error(`tipo de consentimento inválido: ${tipo}. Válidos: ${VALID_CONSENT_TYPES.join(', ')}`);
    }

    // Se já existe, atualiza
    const existing = await dbGet(
        'SELECT id FROM consentimentos WHERE cliente_id = ? AND tipo = ?',
        [clienteId, tipo]
    );

    if (existing) {
        await dbRun(
            `UPDATE consentimentos
             SET aceito = ?, ip = ?, user_agent = ?, metodo_coleta = ?, detalhes = ?,
                 aceito_em = CASE WHEN ? = 1 THEN datetime('now') ELSE aceito_em END,
                 revogado_em = CASE WHEN ? = 0 AND aceito = 1 THEN datetime('now') ELSE revogado_em END,
                 updated_at = datetime('now')
             WHERE id = ?`,
            [aceito ? 1 : 0, ip, userAgent, metodoColeta, detalhes, aceito ? 1 : 0, aceito ? 1 : 0, existing.id]
        );
        return { id: existing.id, updated: true };
    }

    const id = newId('cons');
    await dbRun(
        `INSERT INTO consentimentos
         (id, cliente_id, tipo, aceito, ip, user_agent, metodo_coleta, detalhes, aceito_em, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 1 THEN datetime('now') ELSE NULL END, datetime('now'), datetime('now'))`,
        [id, clienteId, tipo, aceito ? 1 : 0, ip, userAgent, metodoColeta, detalhes, aceito ? 1 : 0]
    );
    return { id, created: true };
}

/**
 * Titular revoga consentimento.
 */
async function revokeConsent({ clienteId, tipo }) {
    return await recordConsent({ clienteId, tipo, aceito: false });
}

/**
 * Lista consentimentos de um cliente.
 */
async function getConsents(clienteId) {
    return await dbAll(
        `SELECT tipo, aceito, aceito_em, revogado_em, metodo_coleta, created_at
         FROM consentimentos WHERE cliente_id = ?
         ORDER BY tipo`,
        [clienteId]
    );
}

// ════════════════════════════════════════════════════════════════
// AUDIT DE ACESSOS
// ════════════════════════════════════════════════════════════════

/**
 * Registra um acesso a dados pessoais (LGPD art. 37).
 * Use em middlewares/services que leem dados sensíveis.
 */
async function auditAccess({ userId = null, userRole = null, clienteId = null, acao, entidade, entidadeId = null, camposAcessados = null, ip = null, userAgent = null, motivo = null }) {
    if (!acao) throw new Error('acao obrigatória');
    if (!entidade) throw new Error('entidade obrigatória');

    await dbRun(
        `INSERT INTO audit_acessos
         (user_id, user_role, cliente_id, acao, entidade, entidade_id, campos_acessados, ip, user_agent, motivo, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [
            userId, userRole, clienteId, acao, entidade, entidadeId,
            camposAcessados ? JSON.stringify(camposAcessados) : null,
            ip, userAgent, motivo,
        ]
    );
}

async function getAuditLogs({ clienteId = null, userId = null, limite = 100 } = {}) {
    let sql = `
        SELECT a.id, a.user_id, a.user_role, a.cliente_id, a.acao, a.entidade, a.entidade_id,
               a.campos_acessados, a.ip, a.motivo, a.created_at,
               u.nome as user_nome, c.nome as cliente_nome
        FROM audit_acessos a
        LEFT JOIN usuarios u ON u.id = a.user_id
        LEFT JOIN clientes c ON c.id = a.cliente_id
        WHERE 1=1
    `;
    const params = [];
    if (clienteId) { sql += ' AND a.cliente_id = ?'; params.push(clienteId); }
    if (userId) { sql += ' AND a.user_id = ?'; params.push(userId); }
    sql += ' ORDER BY a.created_at DESC LIMIT ?';
    params.push(Math.min(parseInt(limite) || 100, 500));
    return await dbAll(sql, params);
}

// ════════════════════════════════════════════════════════════════
// POLÍTICA DE RETENÇÃO
// ════════════════════════════════════════════════════════════════

async function getPoliticaRetencao() {
    return await dbAll('SELECT * FROM politica_retencao WHERE ativo = 1 ORDER BY entidade');
}

async function updatePoliticaRetencao(entidade, { diasRetencao, acaoPosExpiracao, ativo, descricao }) {
    const updates = [];
    const params = [];
    if (diasRetencao !== undefined) { updates.push('dias_retencao = ?'); params.push(diasRetencao); }
    if (acaoPosExpiracao) { updates.push('acao_pos_expiracao = ?'); params.push(acaoPosExpiracao); }
    if (ativo !== undefined) { updates.push('ativo = ?'); params.push(ativo ? 1 : 0); }
    if (descricao !== undefined) { updates.push('descricao = ?'); params.push(descricao); }
    if (updates.length === 0) return { ok: true };
    updates.push('updated_at = datetime(\'now\')');
    params.push(entidade);
    await dbRun(`UPDATE politica_retencao SET ${updates.join(', ')} WHERE entidade = ?`, params);
    return { ok: true };
}

/**
 * Executa a política de retenção: varre dados antigos e anonimiza/deleta.
 * CUIDADO: operação pesada. Rodar em cron noturno.
 */
async function runRetentionPolicy() {
    const politicas = await getPoliticaRetencao();
    const resultados = [];

    for (const p of politicas) {
        if (!p.ativo) continue;
        // Implementação específica por entidade — aqui só logamos
        resultados.push({
            entidade: p.entidade,
            dias_retencao: p.dias_retencao,
            acao: p.acao_pos_expiracao,
            status: 'configured',
        });
    }

    return { politicas: resultados, executado_em: new Date().toISOString() };
}

// ════════════════════════════════════════════════════════════════
// HELPER: auto-audit em leituras de clientes
// ════════════════════════════════════════════════════════════════

/**
 * Wrapper para marcar leituras de cliente como auditadas.
 * Use em handlers que retornam dados pessoais.
 */
function withAudit(userId, userRole, clienteId, acao, entidade, entidadeId, callback) {
    return async (req, res) => {
        // Registra audit (fire-and-forget para não atrasar resposta)
        auditAccess({
            userId, userRole, clienteId, acao, entidade, entidadeId,
            ip: req.ip, userAgent: req.headers?.['user-agent'],
        }).catch(e => console.warn('[LGPD] Falha ao auditar:', e.message));
        return callback(req, res);
    };
}

module.exports = {
    // DSAR
    createDSAR,
    listDSARs,
    getDSAR,
    updateDSARStatus,
    // Exportação
    exportClienteData,
    exportClienteDataToFile,
    // Anonimização
    anonymizeCliente,
    // Exclusão
    deleteCliente,
    // Consentimento
    recordConsent,
    revokeConsent,
    getConsents,
    // Audit
    auditAccess,
    getAuditLogs,
    withAudit,
    // Política de retenção
    getPoliticaRetencao,
    updatePoliticaRetencao,
    runRetentionPolicy,
    // Constantes
    LGPD_RESPONSE_DAYS,
    VALID_DSAR_TYPES,
    VALID_CONSENT_TYPES,
};
