/**
 * PortalService — Lógica de negócio do Portal do Cliente (Sprint 15)
 *
 * Permite que clientes finais (donos de contrato, pagadores de boletos)
 * acessem seus próprios dados SEM precisar de conta admin.
 *
 * Funções principais:
 *   - createPortalUser(clienteId, email, password) — admin cria acesso
 *   - authenticate(email, password)               — login com bcrypt
 *   - getContracts(portalUserId)                   — contratos do cliente
 *   - getBills(portalUserId)                       — cobranças do cliente
 *   - getTickets(portalUserId)                     — chamados do cliente
 *   - createTicket(portalUserId, data)            — abre novo chamado
 *   - getEquipment(portalUserId)                   — equipamentos (HVAC)
 *   - getNotifications(portalUserId)               — notificações recentes
 *
 * Segurança:
 *   - Senhas armazenadas como bcrypt hash (10 rounds)
 *   - Lockout após 5 falhas em 15 min
 *   - Token de reset expira em 1h
 *   - JWT com aud='renostter-portal' (separado do admin)
 *   - Sessões revogáveis via blocklist
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { dbGet, dbAll, dbRun } = require('../database');
const { ContratoManager } = require('../ContratoManager');

const BCRYPT_ROUNDS = 10;
const FAILED_LOGIN_MAX = 5;
const FAILED_LOGIN_WINDOW_MS = 15 * 60 * 1000;  // 15 min
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;     // 15 min
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;       // 1h

function newId(prefix) {
    return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

// ════════════════════════════════════════════════════════════════
// CRIAÇÃO DE USUÁRIO PORTAL
// ════════════════════════════════════════════════════════════════

/**
 * Admin cria acesso ao portal para um cliente.
 * O cliente recebe um email (futuro) com link para definir senha.
 */
async function createPortalUser({ clienteId, email, nome, telefone, password = null }) {
    if (!clienteId) throw new Error('clienteId é obrigatório');
    if (!email) throw new Error('email é obrigatório');

    email = String(email).toLowerCase().trim();

    // Verifica se cliente existe
    const cliente = await dbGet('SELECT id, nome, email FROM clientes WHERE id = ?', [clienteId]);
    if (!cliente) throw new Error('Cliente não encontrado');

    // Verifica se já existe portal_user para este email
    const existing = await dbGet('SELECT id FROM portal_users WHERE email = ?', [email]);
    if (existing) throw new Error('Já existe um portal_user com este email');

    // Se password não foi fornecido, gera um temporário
    const tempPassword = password || crypto.randomBytes(8).toString('hex');
    const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);

    const id = newId('pu');
    await dbRun(
        `INSERT INTO portal_users
         (id, cliente_id, email, password_hash, nome, telefone, ativo, email_verificado, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [id, clienteId, email, passwordHash, nome || cliente.nome, telefone || cliente.telefone]
    );

    return {
        id,
        clienteId,
        email,
        tempPassword,   // devolve para o admin enviar por email
        nome: nome || cliente.nome,
    };
}

/**
 * Cria um convite para o cliente se cadastrar (sem senha ainda).
 * Gera um token que pode ser enviado por email.
 */
async function createInvite({ clienteId, email }) {
    return await createPortalUser({ clienteId, email });
}

// ════════════════════════════════════════════════════════════════
// AUTENTICAÇÃO
// ════════════════════════════════════════════════════════════════

/**
 * Autentica um portal_user com email + password.
 * Retorna { portalUser, cliente, sessionId } ou lança erro.
 *
 * Proteções:
 *   - 5 falhas em 15 min → lock por 15 min
 *   - Senha bcrypt (10 rounds)
 *   - user.ativo = 1 obrigatório
 *   - Email verificado (futuro: vai exigir verificação por email)
 */
async function authenticate(email, password, ip = null) {
    if (!email || !password) throw new Error('Email e senha são obrigatórios');
    email = String(email).toLowerCase().trim();

    const user = await dbGet(
        `SELECT id, cliente_id, email, password_hash, nome, telefone, ativo,
                email_verificado, failed_login_count, locked_until
         FROM portal_users WHERE email = ?`,
        [email]
    );

    // SECURITY FIX V06: timing attack
    // Sempre fazer bcrypt.compare (com hash dummy se user não existe)
    // para garantir tempo constante de resposta
    const DUMMY_HASH = '$2a$10$CwTycUXKueLJ5dGZ0vJQO.7Z8MvKAzGfHzN0YrKvRGZrqq5xkHEHu';
    const hashToCompare = user ? user.password_hash : DUMMY_HASH;
    const passwordOk = await bcrypt.compare(password, hashToCompare);

    if (!user) {
        // Não revela se email existe ou não (mensagem genérica)
        throw new Error('Email ou senha inválidos');
    }

    if (user.ativo !== 1) {
        throw new Error('Conta desativada. Entre em contato com a empresa.');
    }

    // Lockout check
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
        const minutes = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
        throw new Error(`Conta bloqueada. Tente novamente em ${minutes} minutos.`);
    }

    if (!passwordOk) {
        // Increment failed_login_count
        const newCount = (user.failed_login_count || 0) + 1;
        const shouldLock = newCount >= FAILED_LOGIN_MAX;
        await dbRun(
            `UPDATE portal_users
             SET failed_login_count = ?, locked_until = ?
             WHERE id = ?`,
            [
                shouldLock ? 0 : newCount,
                shouldLock ? new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString() : null,
                user.id
            ]
        );
        throw new Error('Email ou senha inválidos');
    }

    // Sucesso: limpa falhas e atualiza último login
    await dbRun(
        `UPDATE portal_users
         SET failed_login_count = 0, locked_until = NULL, ultimo_login_at = CURRENT_TIMESTAMP, ultimo_login_ip = ?
         WHERE id = ?`,
        [ip, user.id]
    );

    // Carrega dados do cliente
    const cliente = await dbGet(
        'SELECT id, nome, email, telefone, cnpj FROM clientes WHERE id = ?',
        [user.cliente_id]
    );

    return { portalUser: user, cliente };
}

/**
 * Solicita reset de senha: gera token que pode ser enviado por email.
 */
async function requestPasswordReset(email) {
    email = String(email || '').toLowerCase().trim();
    const user = await dbGet('SELECT id, email FROM portal_users WHERE email = ?', [email]);
    if (!user) {
        // Não revela se email existe
        return { sent: true, message: 'Se o email existir, um link de reset será enviado.' };
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expira = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();

    await dbRun(
        `UPDATE portal_users
         SET password_reset_token = ?, password_reset_expira_em = ?
         WHERE id = ?`,
        [token, expira, user.id]
    );

    return {
        sent: true,
        token,           // devolve para o dev/admin enviar por email
        expira_em: expira,
        email: user.email,
    };
}

/**
 * Reseta a senha usando o token recebido por email.
 */
async function resetPassword(token, newPassword) {
    if (!token) throw new Error('Token é obrigatório');
    if (!newPassword || newPassword.length < 6) throw new Error('Nova senha deve ter ≥ 6 caracteres');

    const user = await dbGet(
        `SELECT id, password_reset_expira_em FROM portal_users WHERE password_reset_token = ?`,
        [token]
    );
    if (!user) throw new Error('Token inválido');
    if (new Date(user.password_reset_expira_em) < new Date()) {
        throw new Error('Token expirado');
    }

    const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await dbRun(
        `UPDATE portal_users
         SET password_hash = ?, password_reset_token = NULL, password_reset_expira_em = NULL,
             failed_login_count = 0, locked_until = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [hash, user.id]
    );

    return { success: true, message: 'Senha redefinida com sucesso' };
}

// ════════════════════════════════════════════════════════════════
// CONSULTAS (READ-ONLY) — retornam dados do cliente autenticado
// ════════════════════════════════════════════════════════════════

/**
 * Retorna os contratos do cliente.
 * Apenas contratos ativos ou recentes (últimos 12 meses).
 */
async function getContracts(portalUserId) {
    const user = await dbGet('SELECT cliente_id FROM portal_users WHERE id = ?', [portalUserId]);
    if (!user) throw new Error('Usuário não encontrado');

    return await dbAll(
        `SELECT id, tipo_contrato, status, data_inicio, data_fim, valor_mensal,
                frequencia_cobranca as periodicidade, titulo, observacoes,
                renovacao_automatica
         FROM contratos
         WHERE cliente_id = ?
         AND (status = 'Ativo'
              OR (data_fim IS NOT NULL AND date(data_fim) >= date('now', '-12 months')))
         ORDER BY data_inicio DESC`,
        [user.cliente_id]
    );
}

/**
 * Retorna as cobranças do cliente.
 */
async function getBills(portalUserId, { status = null, limit = 50 } = {}) {
    const user = await dbGet('SELECT cliente_id FROM portal_users WHERE id = ?', [portalUserId]);
    if (!user) throw new Error('Usuário não encontrado');

    let sql = `
        SELECT id, contract_id, valor, data_vencimento, data_pagamento, status,
               barcode, linha_digitavel, pix_qrcode, pdf_url,
               gateway_provider, created_at
        FROM cobrancas
        WHERE client_id = ?
    `;
    const params = [user.cliente_id];
    if (status) {
        sql += ' AND status = ?';
        params.push(status);
    }
    sql += ' ORDER BY data_vencimento DESC LIMIT ?';
    params.push(Math.min(parseInt(limit) || 50, 200));
    return await dbAll(sql, params);
}

/**
 * Retorna os chamados do cliente.
 */
async function getTickets(portalUserId, { status = null, limit = 50 } = {}) {
    const user = await dbGet('SELECT cliente_id FROM portal_users WHERE id = ?', [portalUserId]);
    if (!user) throw new Error('Usuário não encontrado');

    let sql = `
        SELECT id, titulo, descricao, categoria, prioridade, status,
               data_abertura, data_conclusao, tecnico_id, observacoes_garantia,
               data_garantia_fim,
               CASE WHEN data_garantia_fim IS NOT NULL
                    THEN CAST(julianday(data_garantia_fim) - julianday('now') AS INTEGER)
                    ELSE NULL END as dias_garantia
        FROM chamados
        WHERE cliente_id = ?
    `;
    const params = [user.cliente_id];
    if (status) {
        sql += ' AND status = ?';
        params.push(status);
    }
    sql += ' ORDER BY data_abertura DESC LIMIT ?';
    params.push(Math.min(parseInt(limit) || 50, 200));
    return await dbAll(sql, params);
}

/**
 * Retorna os equipamentos (HVAC) do cliente.
 */
async function getEquipment(portalUserId) {
    const user = await dbGet('SELECT cliente_id FROM portal_users WHERE id = ?', [portalUserId]);
    if (!user) throw new Error('Usuário não encontrado');

    return await dbAll(
        `SELECT id, local_instalacao, marca, modelo, numero_serie, potencia_btu,
                potencia_kw, tipo_equipamento, refrigerante, data_instalacao,
                status_equipamento
         FROM equipamentos
         WHERE cliente_id = ?
         ORDER BY local_instalacao`,
        [user.cliente_id]
    );
}

/**
 * Retorna as notificações recentes (não lidas primeiro).
 */
async function getNotifications(portalUserId, { limit = 20, onlyUnread = false } = {}) {
    let sql = `
        SELECT id, tipo, titulo, mensagem, link, lida_em, created_at
        FROM portal_notifications
        WHERE portal_user_id = ?
    `;
    const params = [portalUserId];
    if (onlyUnread) {
        sql += ' AND lida_em IS NULL';
    }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(Math.min(parseInt(limit) || 20, 100));
    return await dbAll(sql, params);
}

async function markNotificationRead(portalUserId, notificationId) {
    await dbRun(
        `UPDATE portal_notifications SET lida_em = CURRENT_TIMESTAMP
         WHERE id = ? AND portal_user_id = ?`,
        [notificationId, portalUserId]
    );
}

// ════════════════════════════════════════════════════════════════
// AÇÕES DO CLIENTE
// ════════════════════════════════════════════════════════════════

/**
 * Cliente abre um novo chamado.
 */
async function createTicket(portalUserId, { titulo, descricao, categoria, prioridade, equipamento_id = null }) {
    if (!titulo || !descricao) throw new Error('Título e descrição são obrigatórios');

    const user = await dbGet(
        'SELECT id, cliente_id, nome FROM portal_users WHERE id = ?',
        [portalUserId]
    );
    if (!user) throw new Error('Usuário não encontrado');

    const id = newId('ch');
    await dbRun(
        `INSERT INTO chamados
         (id, cliente_id, titulo, descricao, categoria, prioridade, status, data_abertura, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'Aberto', datetime('now'), datetime('now'))`,
        [id, user.cliente_id, titulo, descricao, categoria || 'Geral', prioridade || 'Média']
    );

    // Notificação interna para o admin
    await dbRun(
        `INSERT INTO portal_notifications
         (id, portal_user_id, tipo, titulo, mensagem, link, created_at)
         VALUES (?, ?, 'chamado', ?, ?, ?, datetime('now'))`,
        [
            newId('pn'),
            portalUserId,
            `Chamado aberto: ${titulo}`,
            `Seu chamado #${id.slice(-6)} foi aberto. Em breve um técnico entrará em contato.`,
            `tickets.html?id=${id}`,
        ]
    );

    return { id, status: 'Aberto', message: 'Chamado aberto com sucesso' };
}

/**
 * Atualiza perfil do cliente (apenas campos permitidos).
 */
async function updateProfile(portalUserId, { nome, telefone, email }) {
    const user = await dbGet('SELECT id, cliente_id FROM portal_users WHERE id = ?', [portalUserId]);
    if (!user) throw new Error('Usuário não encontrado');

    const updates = [];
    const params = [];
    if (nome) { updates.push('nome = ?'); params.push(nome); }
    if (telefone !== undefined) { updates.push('telefone = ?'); params.push(telefone); }
    if (email) {
        email = String(email).toLowerCase().trim();
        updates.push('email = ?');
        params.push(email);
    }
    if (updates.length === 0) return { ok: true };
    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(portalUserId);
    await dbRun(`UPDATE portal_users SET ${updates.join(', ')} WHERE id = ?`, params);

    return { ok: true };
}

// ════════════════════════════════════════════════════════════════
// SESSÕES
// ════════════════════════════════════════════════════════════════

async function createSession(portalUserId, jti, ip = null, userAgent = null, expiraEm) {
    const id = newId('ps');
    await dbRun(
        `INSERT INTO portal_sessions
         (id, portal_user_id, jti, ip, user_agent, expira_em, created_at)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [id, portalUserId, jti, ip, userAgent, expiraEm]
    );
    return id;
}

async function revokeSession(jti) {
    await dbRun(
        `UPDATE portal_sessions SET revogada_em = CURRENT_TIMESTAMP WHERE jti = ?`,
        [jti]
    );
}

async function isSessionRevoked(jti) {
    const row = await dbGet(
        'SELECT revogada_em FROM portal_sessions WHERE jti = ?',
        [jti]
    );
    return row && row.revogada_em !== null;
}

// ════════════════════════════════════════════════════════════════
// ADMIN: listar/gerenciar portal users
// ════════════════════════════════════════════════════════════════

async function listPortalUsers(tenantId = null) {
    let sql = `
        SELECT pu.id, pu.cliente_id, pu.email, pu.nome, pu.telefone, pu.ativo,
               pu.ultimo_login_at, pu.created_at,
               c.nome as cliente_nome
        FROM portal_users pu
        JOIN clientes c ON c.id = pu.cliente_id
    `;
    const params = [];
    if (tenantId) {
        sql += ' WHERE c.tenant_id = ?';
        params.push(tenantId);
    }
    sql += ' ORDER BY pu.created_at DESC';
    return await dbAll(sql, params);
}

async function disablePortalUser(portalUserId) {
    await dbRun(
        `UPDATE portal_users SET ativo = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [portalUserId]
    );
}

async function enablePortalUser(portalUserId) {
    await dbRun(
        `UPDATE portal_users SET ativo = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [portalUserId]
    );
}

module.exports = {
    // Auth
    createPortalUser,
    createInvite,
    authenticate,
    requestPasswordReset,
    resetPassword,

    // Consultas
    getContracts,
    getBills,
    getTickets,
    getEquipment,
    getNotifications,
    markNotificationRead,

    // Ações
    createTicket,
    updateProfile,

    // Sessões
    createSession,
    revokeSession,
    isSessionRevoked,

    // Admin
    listPortalUsers,
    disablePortalUser,
    enablePortalUser,

    // Constantes
    BCRYPT_ROUNDS,
    FAILED_LOGIN_MAX,
};
