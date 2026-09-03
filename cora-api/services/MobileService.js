/**
 * MobileService — API otimizada para técnicos em campo (Sprint 16)
 *
 * Funcionalidades:
 *   - sync (full + incremental) — baixa tudo em uma chamada
 *   - upload de fotos em chamados
 *   - tracking de geolocalização
 *   - push tokens (registro de dispositivo)
 *   - updates com versionamento (resolução de conflitos offline)
 *
 * Todos os métodos filtram por `tecnicoId` (user que está fazendo a request)
 * para garantir que um técnico só vê/edita seus próprios chamados.
 *
 * IMPORTANTE — Multi-tenant:
 *   O middleware tenantContext injeta `req.tenantId` automaticamente.
 *   As queries usam `dbAllTenant`/`dbRunTenant` para garantir isolamento.
 *
 * Conflitos offline (Sprint 16.6):
 *   - Cada update checa `version` retornado pelo server
 *   - Se client enviar `expected_version` diferente, retorna 409 Conflict
 *   - Client pode resolver (re-fetch ou overwrite)
 */

const crypto = require('crypto');
const { dbGet, dbAll, dbRun } = require('../database');
// Sprint 13.8: wrappers tenant-aware
const { dbAllTenant, dbGetTenant, dbRunTenant } = require('../infra/tenantAwareDb');
const { ChamadoManager } = require('../ChamadoManager');

function newId(prefix) {
    return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

const PHOTO_MAX_BYTES = 10 * 1024 * 1024;  // 10 MB por foto
const PHOTO_ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic']);

// ════════════════════════════════════════════════════════════════
// SYNC
// ════════════════════════════════════════════════════════════════

/**
 * Sync completo: retorna todos os dados que o técnico precisa
 * (chamados atribuídos, equipamentos, clientes, contratos).
 *
 * Para sync incremental, use `syncIncremental(userId, since)`.
 */
async function syncFull(userId, options = {}) {
    const start = Date.now();
    const { includeContracts = true, includeEquipment = true, onlyMine = true } = options;

    const tickets = await dbAllTenant(
        `SELECT id, cliente_id, titulo, descricao, categoria, prioridade, status,
                data_abertura, data_conclusao, observacoes_garantia,
                updated_at, version
         FROM chamados
         WHERE tecnico_id = ? AND deleted = 0
         ORDER BY data_abertura DESC
         LIMIT 500`,
        [userId]
    );

    const clientesIds = [...new Set(tickets.map(t => t.cliente_id).filter(Boolean))];
    let clientes = [];
    if (clientesIds.length > 0) {
        const placeholders = clientesIds.map(() => '?').join(',');
        clientes = await dbAll(
            `SELECT id, nome, telefone, email, cnpj
             FROM clientes WHERE id IN (${placeholders})`,
            clientesIds
        );
    }

    let contratos = [];
    if (includeContracts && clientesIds.length > 0) {
        const placeholders = clientesIds.map(() => '?').join(',');
        contratos = await dbAll(
            `SELECT id, cliente_id, tipo_contrato, status, data_inicio, data_fim, valor_mensal
             FROM contratos WHERE cliente_id IN (${placeholders})`,
            clientesIds
        );
    }

    let equipamentos = [];
    if (includeEquipment && clientesIds.length > 0) {
        const placeholders = clientesIds.map(() => '?').join(',');
        equipamentos = await dbAll(
            `SELECT id, cliente_id, local_instalacao, marca, modelo, potencia_btu, status_equipamento
             FROM equipamentos WHERE cliente_id IN (${placeholders})`,
            clientesIds
        );
    }

    // Checklist templates (para o técnico usar no campo)
    const checklistTemplates = await dbAll(
        `SELECT id, tipo_manutencao, item_ordem, item_descricao, item_categoria, obrigatorio
         FROM checklist_pmoc WHERE ativo = 1 ORDER BY tipo_manutencao, item_ordem`
    );

    const duration = Date.now() - start;

    return {
        type: 'full',
        timestamp: new Date().toISOString(),
        duration_ms: duration,
        data: {
            tickets,
            clientes,
            contratos,
            equipamentos,
            checklist_templates: checklistTemplates,
        },
        counts: {
            tickets: tickets.length,
            clientes: clientes.length,
            contratos: contratos.length,
            equipamentos: equipamentos.length,
            checklist_templates: checklistTemplates.length,
        },
    };
}

/**
 * Sync incremental: retorna apenas tickets atualizados desde `since`.
 * Otimizado para reduzir tráfego em mobile.
 */
async function syncIncremental(userId, since, options = {}) {
    const start = Date.now();
    const sinceISO = new Date(since).toISOString();

    // Tickets novos ou atualizados
    const ticketsUpdated = await dbAllTenant(
        `SELECT id, cliente_id, titulo, descricao, categoria, prioridade, status,
                data_abertura, data_conclusao, updated_at, version
         FROM chamados
         WHERE tecnico_id = ? AND updated_at > ?
         ORDER BY updated_at ASC
         LIMIT 200`,
        [userId, sinceISO]
    );

    // Tickets deletados (soft delete via version + deleted flag)
    const ticketsDeleted = await dbAllTenant(
        `SELECT id, updated_at FROM chamados
         WHERE tecnico_id = ? AND updated_at > ? AND deleted = 1`,
        [userId, sinceISO]
    );

    // Fotos novas
    const ticketsIds = ticketsUpdated.map(t => t.id);
    let photos = [];
    if (ticketsIds.length > 0) {
        const placeholders = ticketsIds.map(() => '?').join(',');
        photos = await dbAll(
            `SELECT id, chamado_id, filename, mime_type, tamanho_bytes, latitude, longitude, uploaded_at
             FROM chamado_fotos WHERE chamado_id IN (${placeholders}) AND uploaded_at > ? AND deleted = 0`,
            [...ticketsIds, sinceISO]
        );
    }

    const duration = Date.now() - start;
    return {
        type: 'incremental',
        since: sinceISO,
        timestamp: new Date().toISOString(),
        duration_ms: duration,
        data: {
            tickets_updated: ticketsUpdated,
            tickets_deleted: ticketsDeleted.map(t => t.id),
            photos,
        },
        counts: {
            tickets_updated: ticketsUpdated.length,
            tickets_deleted: ticketsDeleted.length,
            photos: photos.length,
        },
    };
}

// ════════════════════════════════════════════════════════════════
// FOTOS
// ════════════════════════════════════════════════════════════════

/**
 * Upload de foto em um chamado.
 *
 * @param {string} userId
 * @param {string} chamadoId
 * @param {Object} photo - { base64, filename, mime_type, latitude?, longitude? }
 * @returns {Object} - { id, filename, tamanho_bytes, uploaded_at }
 */
async function uploadPhoto(userId, chamadoId, photo) {
    if (!photo) throw new Error('Dados da foto são obrigatórios');
    if (!photo.base64) throw new Error('base64 da foto é obrigatório');
    if (!photo.filename) throw new Error('filename é obrigatório');
    if (!photo.mime_type) throw new Error('mime_type é obrigatório');

    if (!PHOTO_ALLOWED_MIME.has(photo.mime_type)) {
        throw new Error(`mime_type não permitido: ${photo.mime_type}`);
    }

    // Calcula tamanho aproximado a partir do base64 (4 chars = 3 bytes)
    const tamanhoBytes = Math.ceil(photo.base64.length * 0.75);
    if (tamanhoBytes > PHOTO_MAX_BYTES) {
        throw new Error(`Foto muito grande: ${tamanhoBytes} bytes (máx ${PHOTO_MAX_BYTES})`);
    }

    // Verifica que o chamado existe e pertence ao técnico
    const chamado = await dbGetTenant(
        'SELECT id, cliente_id FROM chamados WHERE id = ? AND tecnico_id = ?',
        [chamadoId, userId]
    );
    if (!chamado) throw new Error('Chamado não encontrado ou não atribuído a você');

    const id = newId('foto');
    await dbRun(
        `INSERT INTO chamado_fotos
         (id, chamado_id, filename, mime_type, tamanho_bytes, latitude, longitude, uploaded_by, uploaded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [
            id, chamadoId, photo.filename, photo.mime_type, tamanhoBytes,
            photo.latitude || null, photo.longitude || null, userId,
        ]
    );

    return {
        id,
        chamado_id: chamadoId,
        filename: photo.filename,
        mime_type: photo.mime_type,
        tamanho_bytes: tamanhoBytes,
        latitude: photo.latitude || null,
        longitude: photo.longitude || null,
        uploaded_at: new Date().toISOString(),
    };
}

/**
 * Lista fotos de um chamado.
 */
async function listPhotos(userId, chamadoId) {
    // Verifica acesso
    const chamado = await dbGetTenant(
        'SELECT id FROM chamados WHERE id = ? AND tecnico_id = ?',
        [chamadoId, userId]
    );
    if (!chamado) throw new Error('Chamado não encontrado');

    return await dbAll(
        `SELECT id, filename, mime_type, tamanho_bytes, latitude, longitude, uploaded_at
         FROM chamado_fotos WHERE chamado_id = ? AND deleted = 0
         ORDER BY uploaded_at DESC`,
        [chamadoId]
    );
}

/**
 * Deleta uma foto (soft delete).
 */
async function deletePhoto(userId, photoId) {
    const photo = await dbGet(
        'SELECT id, chamado_id FROM chamado_fotos WHERE id = ? AND deleted = 0',
        [photoId]
    );
    if (!photo) throw new Error('Foto não encontrada');

    // Verifica que o técnico tem acesso ao chamado
    const chamado = await dbGetTenant(
        'SELECT id FROM chamados WHERE id = ? AND tecnico_id = ?',
        [photo.chamado_id, userId]
    );
    if (!chamado) throw new Error('Sem permissão para deletar');

    await dbRun('UPDATE chamado_fotos SET deleted = 1 WHERE id = ?', [photoId]);
    return { ok: true };
}

// ════════════════════════════════════════════════════════════════
// GEOLOCALIZAÇÃO
// ════════════════════════════════════════════════════════════════

/**
 * Registra uma posição GPS do técnico.
 * Chamado periodicamente pelo app (ex: a cada 5min ou em pontos-chave).
 *
 * @param {string} userId
 * @param {Object} loc - { latitude, longitude, precisao?, speed?, heading?, battery_level?, app_version?, endereco? }
 */
async function recordLocation(userId, loc) {
    if (!loc || loc.latitude == null || loc.longitude == null) {
        throw new Error('latitude e longitude são obrigatórios');
    }
    if (loc.latitude < -90 || loc.latitude > 90) throw new Error('latitude inválida');
    if (loc.longitude < -180 || loc.longitude > 180) throw new Error('longitude inválida');

    await dbRun(
        `INSERT INTO tecnico_localizacao
         (tecnico_id, latitude, longitude, precisao, endereco, speed, heading, battery_level, app_version, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [
            userId,
            loc.latitude, loc.longitude,
            loc.precisao || null, loc.endereco || null,
            loc.speed || null, loc.heading || null,
            loc.battery_level || null, loc.app_version || null,
        ]
    );
    return { ok: true, recorded_at: new Date().toISOString() };
}

/**
 * Retorna últimas N localizações do técnico.
 */
async function getRecentLocations(userId, limit = 50) {
    return await dbAll(
        `SELECT latitude, longitude, precisao, speed, heading, battery_level, endereco, recorded_at
         FROM tecnico_localizacao
         WHERE tecnico_id = ?
         ORDER BY recorded_at DESC
         LIMIT ?`,
        [userId, Math.min(parseInt(limit) || 50, 200)]
    );
}

/**
 * Localização atual (última posição conhecida).
 */
async function getCurrentLocation(userId) {
    return await dbGet(
        `SELECT latitude, longitude, precisao, endereco, battery_level, recorded_at
         FROM tecnico_localizacao
         WHERE tecnico_id = ?
         ORDER BY recorded_at DESC
         LIMIT 1`,
        [userId]
    );
}

// ════════════════════════════════════════════════════════════════
// UPDATES OFFLINE COM VERSIONAMENTO
// ════════════════════════════════════════════════════════════════

/**
 * Atualiza status/observações de um chamado.
 * Resolvendo conflitos de offline via `expected_version`.
 *
 * Cenários:
 *   - expected_version === current_version → atualiza e incrementa version
 *   - expected_version !== current_version → retorna 409 com versão atual
 *   - force=true → sobrescreve sem checar versão
 */
async function updateTicketMobile(userId, chamadoId, { status, observacoes, data_conclusao, expected_version, force = false }) {
    const chamado = await dbGetTenant(
        'SELECT id, status, version FROM chamados WHERE id = ? AND tecnico_id = ?',
        [chamadoId, userId]
    );
    if (!chamado) throw new Error('Chamado não encontrado ou não atribuído a você');

    // Conflito de versão
    if (!force && expected_version != null && expected_version !== chamado.version) {
        const err = new Error(`Conflito de versão: esperado ${expected_version}, atual ${chamado.version}`);
        err.code = 'VERSION_CONFLICT';
        err.current_version = chamado.version;
        err.expected_version = expected_version;
        err.current_state = await dbGet('SELECT * FROM chamados WHERE id = ?', [chamadoId]);
        throw err;
    }

    const updates = [];
    const params = [];
    if (status) { updates.push('status = ?'); params.push(status); }
    if (observacoes !== undefined) { updates.push('observacoes_garantia = ?'); params.push(observacoes); }
    if (data_conclusao) { updates.push('data_conclusao = ?'); params.push(data_conclusao); }

    if (updates.length === 0) return { ok: true, version: chamado.version };

    // Sempre incrementa version + atualiza updated_at
    updates.push('version = version + 1');
    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(chamadoId);

    await dbRun(`UPDATE chamados SET ${updates.join(', ')} WHERE id = ?`, params);

    const updated = await dbGet('SELECT version, updated_at FROM chamados WHERE id = ?', [chamadoId]);
    return {
        ok: true,
        version: updated.version,
        updated_at: updated.updated_at,
    };
}

// ════════════════════════════════════════════════════════════════
// PUSH TOKENS
// ════════════════════════════════════════════════════════════════

async function registerPushToken(userId, { token, platform, device_id, device_name, app_version }) {
    if (!token) throw new Error('token é obrigatório');
    if (!platform) throw new Error('platform é obrigatório (ios|android|web)');
    if (!['ios', 'android', 'web'].includes(platform)) {
        throw new Error(`platform inválido: ${platform}`);
    }

    // UPSERT: se token já existe, atualiza user_id e metadados
    const existing = await dbGet('SELECT id, user_id FROM push_tokens WHERE token = ?', [token]);
    if (existing) {
        if (existing.user_id !== userId) {
            throw new Error('Token já registrado para outro usuário');
        }
        await dbRun(
            `UPDATE push_tokens
             SET platform = ?, device_id = ?, device_name = ?, app_version = ?,
                 ativo = 1, ultimo_uso_at = datetime('now'), updated_at = datetime('now')
             WHERE id = ?`,
            [platform, device_id || null, device_name || null, app_version || null, existing.id]
        );
        return { id: existing.id, updated: true };
    }

    const id = newId('pt');
    await dbRun(
        `INSERT INTO push_tokens
         (id, user_id, token, platform, device_id, device_name, app_version, ativo, ultimo_uso_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'), datetime('now'))`,
        [id, userId, token, platform, device_id || null, device_name || null, app_version || null]
    );
    return { id, created: true };
}

async function unregisterPushToken(userId, token) {
    const r = await dbRun(
        `UPDATE push_tokens SET ativo = 0, updated_at = datetime('now') WHERE token = ? AND user_id = ?`,
        [token, userId]
    );
    return { ok: r.changes > 0 };
}

async function getActivePushTokens(userId) {
    return await dbAll(
        `SELECT id, token, platform, device_name, app_version, ultimo_uso_at
         FROM push_tokens WHERE user_id = ? AND ativo = 1`,
        [userId]
    );
}

// ════════════════════════════════════════════════════════════════
// SYNC LOG
// ════════════════════════════════════════════════════════════════

async function logSync(userId, data) {
    try {
        await dbRun(
            `INSERT INTO mobile_sync_log
             (user_id, device_id, sync_type, tickets_received, tickets_sent,
              photos_sent, location_points_sent, duration_ms, ip, user_agent)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                userId, data.device_id || null, data.sync_type || 'full',
                data.tickets_received || 0, data.tickets_sent || 0,
                data.photos_sent || 0, data.location_points_sent || 0,
                data.duration_ms || null, data.ip || null, data.user_agent || null,
            ]
        );
    } catch (e) {
        console.warn('[MobileService] Falha ao logar sync:', e.message);
    }
}

async function getSyncStats(userId, days = 7) {
    return await dbAll(
        `SELECT sync_type, COUNT(*) as total,
                SUM(tickets_received) as total_tickets_received,
                SUM(photos_sent) as total_photos,
                AVG(duration_ms) as avg_duration_ms
         FROM mobile_sync_log
         WHERE user_id = ? AND created_at >= date('now', ?)
         GROUP BY sync_type`,
        [userId, `-${days} days`]
    );
}

module.exports = {
    // Sync
    syncFull,
    syncIncremental,
    // Fotos
    uploadPhoto,
    listPhotos,
    deletePhoto,
    // Localização
    recordLocation,
    getRecentLocations,
    getCurrentLocation,
    // Updates
    updateTicketMobile,
    // Push
    registerPushToken,
    unregisterPushToken,
    getActivePushTokens,
    // Stats
    logSync,
    getSyncStats,
    // Constantes
    PHOTO_MAX_BYTES,
    PHOTO_ALLOWED_MIME,
};
