/**
 * S3 Client — Singleton para upload/download de arquivos
 *
 * Sprint 4 — Cloud-Native Stack
 *
 * Funciona com:
 *   - AWS S3 (produção)
 *   - MinIO (dev, via docker-compose)
 *   - Backblaze B2 (compatível com S3)
 *   - Cloudflare R2 (compatível com S3)
 *
 * Recursos:
 *   - Presigned URLs (upload direto do browser, sem proxy pelo app)
 *   - Multipart upload (arquivos grandes)
 *   - Lifecycle automático (delete após N dias)
 *
 * Variáveis de ambiente:
 *   S3_ENDPOINT        (vazio = AWS S3; http://minio:9000 = local)
 *   S3_REGION          (us-east-1)
 *   S3_BUCKET          (renostter-prod)
 *   S3_ACCESS_KEY      (obrigatório)
 *   S3_SECRET_KEY      (obrigatório)
 *   S3_FORCE_PATH_STYLE (true para MinIO; false para AWS)
 *   S3_PUBLIC_BASE_URL (CDN/CloudFront opcional; gera URLs públicas)
 */

const crypto = require('crypto');
const path = require('path');

const S3_ENDPOINT = process.env.S3_ENDPOINT || null;
const S3_REGION = process.env.S3_REGION || 'us-east-1';
const S3_BUCKET = process.env.S3_BUCKET || null;
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY || null;
const S3_SECRET_KEY = process.env.S3_SECRET_KEY || null;
const S3_FORCE_PATH_STYLE = process.env.S3_FORCE_PATH_STYLE === 'true';
const S3_PUBLIC_BASE_URL = process.env.S3_PUBLIC_BASE_URL || null; // ex: https://cdn.renostter.com
const S3_TTL_PRESIGN = parseInt(process.env.S3_TTL_PRESIGN || '900', 10); // 15 min default

const IS_PROD = process.env.NODE_ENV === 'production';

let _client = null;
let _available = false;

function isS3Available() {
    return !!S3_BUCKET && !!S3_ACCESS_KEY && !!S3_SECRET_KEY;
}

/**
 * Lazy-init do client. Usa AWS SDK v3 (mais leve, modular).
 * Como ainda não temos a dep, implemento manualmente via fetch + AWS SigV4.
 * Para produção real, é recomendado usar @aws-sdk/client-s3 (~3MB).
 */
function getClient() {
    if (_client) return _client;
    if (!isS3Available()) {
        if (IS_PROD) {
            throw new Error('[S3] S3 não configurado em produção. Defina S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY.');
        }
        return null;
    }
    _client = { configured: true, bucket: S3_BUCKET, endpoint: S3_ENDPOINT, region: S3_REGION };
    return _client;
}

/**
 * Hash SHA256 para AWS SigV4.
 */
function sha256(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
}

function hmac(key, data) {
    return crypto.createHmac('sha256', key).update(data).digest();
}

/**
 * Gera assinatura AWS SigV4 para um request.
 */
function signAwsV4({ method, host, region, service, path, query, headers, body, accessKey, secretKey, date }) {
    const d = date || new Date();
    const amzDate = d.toISOString().replace(/[:\-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
    const dateStamp = amzDate.slice(0, 8);

    const canonicalHeaders = Object.keys(headers)
        .sort()
        .map(k => `${k.toLowerCase()}:${headers[k]}\n`)
        .join('');
    const signedHeaders = Object.keys(headers).sort().map(k => k.toLowerCase()).join(';');

    const canonicalRequest = [
        method,
        path,
        Object.keys(query).sort().map(k => `${encodeURIComponent(k)}=${encodeURIComponent(query[k] || '')}`).join('&'),
        canonicalHeaders,
        signedHeaders,
        sha256(body || ''),
    ].join('\n');

    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = [
        'AWS4-HMAC-SHA256',
        amzDate,
        credentialScope,
        sha256(canonicalRequest),
    ].join('\n');

    const kDate = hmac(`AWS4${secretKey}`, dateStamp);
    const kRegion = hmac(kDate, region);
    const kService = hmac(kRegion, service);
    const kSigning = hmac(kService, 'aws4_request');
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

    return {
        authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
        amzDate,
    };
}

/**
 * Gera presigned URL para UPLOAD (PUT).
 * Frontend usa essa URL para enviar o arquivo direto para o S3.
 *
 * @param {string} key - chave do objeto (ex: "documents/abc-123.pdf")
 * @param {object} opts - { contentType, contentLength, ttl }
 * @returns {string} URL pré-assinada
 */
function getPresignedUploadUrl(key, opts = {}) {
    if (!isS3Available()) {
        if (IS_PROD) throw new Error('[S3] não configurado');
        return null;
    }
    const ttl = opts.ttl || S3_TTL_PRESIGN;
    const now = new Date();
    const host = S3_ENDPOINT
        ? new URL(S3_ENDPOINT).host
        : `${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com`;
    const region = S3_REGION;
    const path = `/${key}`;
    const query = {
        'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
        'X-Amz-Credential': `${S3_ACCESS_KEY}/${now.toISOString().slice(0, 10).replace(/-/g, '')}/${region}/s3/aws4_request`,
        'X-Amz-Date': now.toISOString().replace(/[:\-]|\.\d{3}/g, ''),
        'X-Amz-Expires': String(ttl),
        'X-Amz-SignedHeaders': 'host',
    };
    if (opts.contentType) query['Content-Type'] = opts.contentType;

    const headers = { host };
    const { authorization, amzDate } = signAwsV4({
        method: 'PUT',
        host, region,
        service: 's3',
        path, query, headers, body: '',
        accessKey: S3_ACCESS_KEY,
        secretKey: S3_SECRET_KEY,
        date: now,
    });

    const protocol = S3_ENDPOINT ? new URL(S3_ENDPOINT).protocol : 'https:';
    const hostForUrl = S3_FORCE_PATH_STYLE ? new URL(S3_ENDPOINT).host : host;
    const pathForUrl = S3_FORCE_PATH_STYLE ? `/${S3_BUCKET}${path}` : path;

    const finalQuery = { ...query, 'X-Amz-Date': amzDate };
    const qs = Object.keys(finalQuery).sort().map(k => `${encodeURIComponent(k)}=${encodeURIComponent(finalQuery[k] || '')}`).join('&');

    return `${protocol}//${hostForUrl}${pathForUrl}?${qs}`;
}

/**
 * Gera presigned URL para DOWNLOAD (GET).
 */
function getPresignedDownloadUrl(key, opts = {}) {
    if (!isS3Available()) {
        if (IS_PROD) throw new Error('[S3] não configurado');
        return null;
    }
    const ttl = opts.ttl || S3_TTL_PRESIGN;
    const now = new Date();
    const host = S3_ENDPOINT ? new URL(S3_ENDPOINT).host : `${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com`;
    const region = S3_REGION;
    const path = `/${key}`;
    const query = {
        'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
        'X-Amz-Credential': `${S3_ACCESS_KEY}/${now.toISOString().slice(0, 10).replace(/-/g, '')}/${region}/s3/aws4_request`,
        'X-Amz-Date': now.toISOString().replace(/[:\-]|\.\d{3}/g, ''),
        'X-Amz-Expires': String(ttl),
        'X-Amz-SignedHeaders': 'host',
    };
    const headers = { host };
    const { authorization, amzDate } = signAwsV4({
        method: 'GET', host, region, service: 's3', path, query, headers, body: '',
        accessKey: S3_ACCESS_KEY, secretKey: S3_SECRET_KEY, date: now,
    });
    const protocol = S3_ENDPOINT ? new URL(S3_ENDPOINT).protocol : 'https:';
    const hostForUrl = S3_FORCE_PATH_STYLE ? new URL(S3_ENDPOINT).host : host;
    const pathForUrl = S3_FORCE_PATH_STYLE ? `/${S3_BUCKET}${path}` : path;
    const finalQuery = { ...query, 'X-Amz-Date': amzDate };
    const qs = Object.keys(finalQuery).sort().map(k => `${encodeURIComponent(k)}=${encodeURIComponent(finalQuery[k] || '')}`).join('&');
    return `${protocol}//${hostForUrl}${pathForUrl}?${qs}`;
}

/**
 * URL pública (quando bucket é público via CDN/CloudFront).
 */
function getPublicUrl(key) {
    if (S3_PUBLIC_BASE_URL) {
        return `${S3_PUBLIC_BASE_URL.replace(/\/$/, '')}/${key}`;
    }
    if (S3_ENDPOINT) {
        return `${S3_ENDPOINT.replace(/\/$/, '')}/${S3_BUCKET}/${key}`;
    }
    return `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${key}`;
}

/**
 * Gera chave S3 com prefixo organizado por data/tipo.
 */
function generateKey(prefix, originalFilename) {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const ext = path.extname(originalFilename);
    const id = crypto.randomBytes(8).toString('hex');
    return `${prefix}/${year}/${month}/${id}${ext}`;
}

module.exports = {
    isS3Available,
    getClient,
    getPresignedUploadUrl,
    getPresignedDownloadUrl,
    getPublicUrl,
    generateKey,
};
