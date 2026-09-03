/**
 * Performance middlewares (Sprint 18)
 *
 * Inclui:
 *   - compression: gzip nas responses (reduz tráfego 60-80%)
 *   - etag: HTTP caching (304 Not Modified)
 *   - requestTiming: log de latência por endpoint
 *
 * Uso em server.js:
 *   const { compression, etag, requestTiming } = require('./infra/performance');
 *   app.use(compression());
 *   app.use(etag());
 *   app.use(requestTiming());
 */

const zlib = require('zlib');
const crypto = require('crypto');

// ════════════════════════════════════════════════════════════════
// GZIP COMPRESSION
// ════════════════════════════════════════════════════════════════

/**
 * Compress responses with gzip when client supports it.
 * Otimizado para JSON (mais comum no nosso sistema).
 */
function compression(options = {}) {
    const opts = {
        threshold: 1024,  // só comprime responses > 1KB
        level: 6,         // 1 (rápido) a 9 (max compressão). 6 é balanço ideal.
        ...options,
    };

    return function compressionMiddleware(req, res, next) {
        // Só comprime se o cliente aceita
        const acceptEncoding = req.headers['accept-encoding'] || '';
        if (!acceptEncoding.includes('gzip') && !acceptEncoding.includes('deflate')) {
            return next();
        }

        // Tipos que vale comprimir
        const COMPRESSIBLE_TYPES = /json|text|xml|html|javascript|css/;
        res.setHeader('Vary', 'Accept-Encoding');

        // Hook no res.write/end
        const originalWrite = res.write.bind(res);
        const originalEnd = res.end.bind(res);
        const chunks = [];

        res.write = function (chunk, encoding, cb) {
            if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
            if (typeof encoding === 'function') { encoding(); cb = encoding; }
            return true;
        };

        res.end = function (chunk, encoding, cb) {
            if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
            if (typeof encoding === 'function') { cb = encoding; encoding = null; }

            const body = Buffer.concat(chunks);
            const contentType = res.getHeader('Content-Type') || '';

            // Decide se comprime
            if (body.length < opts.threshold || !COMPRESSIBLE_TYPES.test(contentType)) {
                res.setHeader('Content-Length', body.length);
                return originalEnd(body, cb);
            }

            const encodingType = acceptEncoding.includes('gzip') ? 'gzip' : 'deflate';
            zlib[encodingType](body, { level: opts.level }, (err, compressed) => {
                if (err) {
                    // Fallback: envia sem compress
                    res.setHeader('Content-Length', body.length);
                    return originalEnd(body, cb);
                }
                res.setHeader('Content-Encoding', encodingType);
                res.setHeader('Content-Length', compressed.length);
                return originalEnd(compressed, cb);
            });
        };

        next();
    };
}

// ════════════════════════════════════════════════════════════════
// ETAG (HTTP Caching)
// ════════════════════════════════════════════════════════════════

/**
 * Gera ETag baseado no body + headers.
 * Suporta If-None-Match: retorna 304 Not Modified se igual.
 */
function etag(options = {}) {
    const opts = { weak: true, ...options };

    return function etagMiddleware(req, res, next) {
        // Só faz sentido para GET
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();

        const originalJson = res.json.bind(res);
        const originalSend = res.send.bind(res);
        const originalEnd = res.end.bind(res);
        let body = null;
        let statusCode = 200;

        res.json = function (data) {
            body = JSON.stringify(data);
            statusCode = res.statusCode || 200;
            return checkAndRespond(this, req, res, body, statusCode, opts, () => {
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                return originalSend(body);
            });
        };

        res.send = function (data) {
            body = typeof data === 'string' ? data : JSON.stringify(data);
            statusCode = res.statusCode || 200;
            return checkAndRespond(this, req, res, body, statusCode, opts, () => originalSend(data));
        };

        return next();
    };
}

function checkAndRespond(ctx, req, res, body, statusCode, opts, send) {
    if (statusCode !== 200 || !body) {
        return send();
    }
    const hash = crypto.createHash('md5').update(body).digest('hex');
    const etagValue = opts.weak ? `W/"${hash}"` : `"${hash}"`;
    res.setHeader('ETag', etagValue);

    const clientEtag = req.headers['if-none-match'];
    if (clientEtag && clientEtag === etagValue) {
        res.statusCode = 304;
        return ctx.end();
    }
    return send();
}

// ════════════════════════════════════════════════════════════════
// REQUEST TIMING
// ════════════════════════════════════════════════════════════════

/**
 * Mede latência de cada request e loga endpoints lentos.
 */
function requestTiming(options = {}) {
    const opts = {
        slowThresholdMs: 500,  // log se >500ms
        logAll: false,         // log todos ou só lentos
        ...options,
    };

    return function timingMiddleware(req, res, next) {
        const start = process.hrtime.bigint();

        // Hook em writeHead (executa antes de qualquer header ser enviado)
        const originalWriteHead = res.writeHead.bind(res);
        res.writeHead = function (statusCode, statusMessage, headers) {
            const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
            const rounded = Math.round(durationMs * 100) / 100;
            // setHeader é seguro aqui porque ainda não foi enviado
            try { res.setHeader('X-Response-Time', `${rounded}ms`); } catch (_) {}
            if (opts.logAll || rounded >= opts.slowThresholdMs) {
                const tenant = req.tenantId || '-';
                console.log(`[REQ] ${req.method} ${req.originalUrl || req.url} → ${statusCode} (${rounded}ms, tenant=${tenant})`);
            }
            return originalWriteHead(statusCode, statusMessage, headers);
        };

        // Hook também em res.end (caso writeHead não seja chamado, ex: res.json)
        const originalEnd = res.end.bind(res);
        res.end = function (...args) {
            if (!res.headersSent) {
                const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
                const rounded = Math.round(durationMs * 100) / 100;
                try { res.setHeader('X-Response-Time', `${rounded}ms`); } catch (_) {}
                if (opts.logAll || rounded >= opts.slowThresholdMs) {
                    const tenant = req.tenantId || '-';
                    console.log(`[REQ] ${req.method} ${req.originalUrl || req.url} → ${res.statusCode} (${rounded}ms, tenant=${tenant})`);
                }
            }
            return originalEnd(...args);
        };

        next();
    };
}

// ════════════════════════════════════════════════════════════════
// CURSOR-BASED PAGINATION HELPER
// ════════════════════════════════════════════════════════════════

/**
 * Paginação cursor-based (mais eficiente que OFFSET para tabelas grandes).
 *
 * @param {Object} options
 * @param {Object} options.dbGet - função dbGet
 * @param {string} options.table - tabela
 * @param {Array} options.columns - colunas para SELECT
 * @param {string} options.where - cláusula WHERE (sem 'WHERE')
 * @param {Array} options.whereParams - params do WHERE
 * @param {string} options.orderBy - coluna para ordenar (deve ter índice)
 * @param {string} options.cursor - último id recebido (opcional)
 * @param {number} options.limit - tamanho da página
 * @param {string} options.order - 'ASC' ou 'DESC' (default 'ASC')
 * @returns {Promise<{data, nextCursor, hasMore}>}
 */
async function cursorPaginate({ dbGet, dbAll, table, columns = ['*'], where = '', whereParams = [], orderBy = 'id', cursor = null, limit = 20, order = 'ASC' }) {
    const cols = columns.join(', ');
    const operator = order === 'DESC' ? '<' : '>';

    let sql = `SELECT ${cols} FROM ${table} WHERE 1=1`;
    const params = [];

    if (where) {
        sql += ` AND (${where})`;
        params.push(...whereParams);
    }
    if (cursor) {
        sql += ` AND ${orderBy} ${operator} ?`;
        params.push(cursor);
    }
    sql += ` ORDER BY ${orderBy} ${order} LIMIT ?`;
    // Pega 1 a mais para saber se tem mais
    params.push(parseInt(limit) + 1);

    const rows = await dbAll(sql, params);
    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = data.length > 0 ? data[data.length - 1][orderBy] : null;

    return { data, nextCursor, hasMore };
}

module.exports = {
    compression,
    etag,
    requestTiming,
    cursorPaginate,
};
