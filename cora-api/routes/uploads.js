/**
 * Upload Routes — Endpoint para gerar presigned URLs de upload/download
 *
 * Sprint 4 — Substitui armazenamento base64 no localStorage
 *
 * Endpoints:
 *   POST /api/uploads/sign    → gera presigned URL para upload
 *   POST /api/uploads/sign-multiple → várias URLs em batch
 *   GET  /api/uploads/url/:key → URL pública/presigned para download
 *   DELETE /api/uploads/:key  → remove objeto do S3 (admin only)
 */

const express = require('express');
const { requireRole } = require('../middleware/authJWT');
const {
    isS3Available,
    getPresignedUploadUrl,
    getPresignedDownloadUrl,
    getPublicUrl,
    generateKey,
} = require('../infra/s3');
const { safePathMiddleware } = require('../middleware/pathValidator');

const router = express.Router();

const ALLOWED_PREFIXES = ['documents', 'contracts', 'avatars', 'invoices', 'reports', 'attachments'];
const ALLOWED_CONTENT_TYPES = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    'application/pdf',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain', 'text/csv',
    'application/zip', 'application/octet-stream',
];

const MAX_FILE_SIZE_MB = 50;
const ALLOWED_ROLES = ['admin', 'superadmin', 'tecnico']; // cliente NÃO pode upload direto

/**
 * POST /api/uploads/sign
 * Body: { prefix: "documents", filename: "contrato.pdf", contentType: "application/pdf", contentLength: 12345 }
 * Returns: { uploadUrl, key, publicUrl, expiresIn }
 */
router.post('/sign', requireRole(...ALLOWED_ROLES), async (req, res) => {
    if (!isS3Available()) {
        return res.status(503).json({
            success: false,
            error: 'S3 não configurado. Defina S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY.',
            code: 'S3_NOT_CONFIGURED',
        });
    }

    const { prefix, filename, contentType, contentLength } = req.body || {};

    if (!prefix || !ALLOWED_PREFIXES.includes(prefix)) {
        return res.status(400).json({
            success: false,
            error: `prefix inválido. Permitidos: ${ALLOWED_PREFIXES.join(', ')}`,
            code: 'INVALID_PREFIX',
        });
    }
    if (!filename) {
        return res.status(400).json({ success: false, error: 'filename obrigatório', code: 'MISSING_FILENAME' });
    }
    if (!contentType || !ALLOWED_CONTENT_TYPES.includes(contentType)) {
        return res.status(400).json({
            success: false,
            error: `contentType não permitido: ${contentType}`,
            code: 'INVALID_CONTENT_TYPE',
        });
    }
    if (contentLength && contentLength > MAX_FILE_SIZE_MB * 1024 * 1024) {
        return res.status(400).json({
            success: false,
            error: `arquivo muito grande (${contentLength} bytes). Máximo: ${MAX_FILE_SIZE_MB}MB`,
            code: 'FILE_TOO_LARGE',
        });
    }

    try {
        const key = generateKey(prefix, filename);
        const uploadUrl = getPresignedUploadUrl(key, { contentType, contentLength });
        const publicUrl = getPublicUrl(key);

        return res.json({
            success: true,
            uploadUrl,
            key,
            publicUrl,
            method: 'PUT',
            headers: { 'Content-Type': contentType },
            expiresIn: parseInt(process.env.S3_TTL_PRESIGN || '900', 10),
        });
    } catch (e) {
        console.error('[Uploads] Erro ao gerar URL:', e);
        return res.status(500).json({ success: false, error: e.message, code: 'SIGN_FAILED' });
    }
});

/**
 * POST /api/uploads/sign-multiple
 * Body: { files: [{ prefix, filename, contentType, contentLength }, ...] }
 * Returns: { uploads: [{ uploadUrl, key, publicUrl }, ...] }
 */
router.post('/sign-multiple', requireRole(...ALLOWED_ROLES), async (req, res) => {
    if (!isS3Available()) {
        return res.status(503).json({ success: false, error: 'S3 não configurado', code: 'S3_NOT_CONFIGURED' });
    }
    const { files } = req.body || {};
    if (!Array.isArray(files) || files.length === 0) {
        return res.status(400).json({ success: false, error: 'files array obrigatório', code: 'MISSING_FILES' });
    }
    if (files.length > 10) {
        return res.status(400).json({ success: false, error: 'máximo 10 arquivos por batch', code: 'TOO_MANY_FILES' });
    }

    try {
        const uploads = files.map(f => {
            if (!ALLOWED_PREFIXES.includes(f.prefix) || !f.filename || !ALLOWED_CONTENT_TYPES.includes(f.contentType)) {
                return { error: 'invalid', file: f.filename };
            }
            const key = generateKey(f.prefix, f.filename);
            return {
                uploadUrl: getPresignedUploadUrl(key, { contentType: f.contentType }),
                key,
                publicUrl: getPublicUrl(key),
            };
        });
        return res.json({ success: true, uploads });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message, code: 'BATCH_SIGN_FAILED' });
    }
});

/**
 * GET /api/uploads/url/* — retorna URL para download
 * Query: ?public=1 para URL pública (sem presigned)
 * (Express 5 / path-to-regexp v6 não suporta '/url/*' nem ':key(*)'
 *  — usamos regex manual via .get(/regex/, ...) )
 * SECURITY HARDENING 2 — V02: presigned URLs só para usuários autenticados
 *   (evita que qualquer pessoa descubra/acesse arquivos via enumeração de keys)
 */
router.get(/^\/url\/(.+)$/, requireRole('admin', 'superadmin', 'financeiro', 'tecnico'), (req, res) => {
    if (!isS3Available()) {
        return res.status(503).json({ success: false, error: 'S3 não configurado', code: 'S3_NOT_CONFIGURED' });
    }
    let key = req.params[0];
    if (!key) {
        return res.status(400).json({ success: false, error: 'key obrigatória' });
    }
    // SECURITY HARDENING 3 — V15: path traversal protection
    // Decodifica URL-encoded e checa se há "../" ou separadores inválidos
    key = decodeURIComponent(key);
    if (key.includes('..') || key.startsWith('/') || key.includes('\\') || key.includes('\0')) {
        return res.status(400).json({
            success: false,
            error: 'key inválida: path traversal detectado',
            code: 'INVALID_PATH',
        });
    }
    // Verifica prefixo permitido
    const keyPrefix = key.split('/')[0];
    if (!ALLOWED_PREFIXES.includes(keyPrefix)) {
        return res.status(400).json({
            success: false,
            error: `prefix não permitido: ${keyPrefix}`,
            code: 'INVALID_PREFIX',
        });
    }
    try {
        const url = req.query.public === '1'
            ? getPublicUrl(key)
            : getPresignedDownloadUrl(key);
        return res.json({ success: true, url, expiresIn: parseInt(process.env.S3_TTL_PRESIGN || '900', 10) });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * GET /api/uploads/status — informa se S3 está disponível (UI usa para mostrar/esconder botões)
 * SECURITY HARDENING 2 — V02: autenticado (info de config não deve vazar)
 */
router.get('/status', requireRole('admin', 'superadmin', 'financeiro', 'tecnico'), (req, res) => {
    res.json({
        success: true,
        available: isS3Available(),
        maxFileSizeMb: MAX_FILE_SIZE_MB,
        allowedTypes: ALLOWED_CONTENT_TYPES,
        allowedPrefixes: ALLOWED_PREFIXES,
    });
});

module.exports = router;
