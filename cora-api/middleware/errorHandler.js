/**
 * Error Handler — Helper para sanitizar erros antes de retornar ao cliente
 *
 * Sprint Security Hardening 2 — V12
 *
 * PROBLEMA RESOLVIDO:
 *   Em vários endpoints, o código fazia:
 *     res.status(500).json({ success: false, error: error.message });
 *   O `error.message` frequentemente contém informações sensíveis:
 *     - Caminhos de arquivo: "/var/www/renostter/cora-api/services/LeadManager.js:42"
 *     - SQL queries: "SQLITE_ERROR: no such column: foo (SELECT * FROM leads WHERE...)"
 *     - Stack traces parciais
 *     - Detalhes de mTLS / chaves / secrets
 *     - URLs internas (127.0.0.1, IPs internos)
 *   Atacantes podem usar essas informações para mapear a infraestrutura.
 *
 * SOLUÇÃO:
 *   Helper `handleError(res, error, { context, logToDb })`:
 *     1. Loga o erro COMPLETO internamente (console.error + DB opcional)
 *     2. Retorna uma mensagem GENÉRICA ao cliente
 *     3. Sanitiza o que for seguro enviar (error.code, error.status, error.errors[])
 *     4. Inclui correlationId para rastrear nos logs
 *
 * Códigos de erro seguros que o cliente pode ver:
 *     - VALIDATION_ERROR (400)
 *     - NOT_FOUND (404)
 *     - UNAUTHORIZED (401)
 *     - FORBIDDEN (403)
 *     - CONFLICT (409)
 *     - RATE_LIMITED (429)
 *     - GATEWAY_ERROR (502)
 *     - INTERNAL_ERROR (500) ← genérico
 *
 * USO:
 *   const { handleError } = require('./middleware/errorHandler');
 *   try { ... } catch (e) { return handleError(res, e, { context: 'POST /api/leads' }); }
 */

const crypto = require('crypto');

// Status HTTP inferido pelo tipo/código do erro
const STATUS_MAP = {
    // 4xx — erros do cliente
    VALIDATION_ERROR: 400,
    BAD_REQUEST: 400,
    MISSING_FIELDS: 400,
    UNAUTHORIZED: 401,
    NO_AUTH: 401,
    TOKEN_EXPIRED: 401,
    INVALID_TOKEN: 401,
    TOKEN_REVOKED: 401,
    FORBIDDEN: 403,
    NO_PERMISSION: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    DUPLICATE: 409,
    RATE_LIMITED: 429,
    // 5xx — erros do servidor / upstream
    GATEWAY_ERROR: 502,
    GATEWAY_TIMEOUT: 504,
    UPSTREAM_ERROR: 502,
    INTERNAL_ERROR: 500,
    DB_ERROR: 500,
};

// Mensagens públicas padrão (seguras para enviar ao cliente)
const PUBLIC_MESSAGES = {
    400: 'Requisição inválida',
    401: 'Autenticação necessária',
    403: 'Acesso negado',
    404: 'Recurso não encontrado',
    409: 'Conflito de estado',
    429: 'Muitas requisições. Tente novamente em alguns instantes.',
    500: 'Erro interno do servidor',
    502: 'Serviço upstream indisponível',
    503: 'Serviço temporariamente indisponível',
    504: 'Tempo de resposta do upstream excedido',
};

// Padrões de informação sensível (regex)
const SENSITIVE_PATTERNS = [
    // Paths absolutos (Unix e Windows)
    /(?:\/[\w.-]+)+\.\w{1,5}(?::\d+)?/g,
    /[A-Z]:\\(?:[\w.-]+\\)+[\w.-]+/g,
    // SQL queries parciais (SELECT, INSERT, UPDATE, DELETE + keywords)
    /\b(?:SELECT|INSERT|UPDATE|DELETE)\s+[\s\S]{0,200}?(?:FROM|INTO|SET|WHERE|VALUES)/gi,
    // Stack frames (Node: "    at functionName (file:line:col)")
    /\s+at\s+[\w.<>]+\s+\([\w./-]+:\d+:\d+\)/g,
    // IPs internos / localhost
    /\b(?:127\.\d{1,3}\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(?::\d+)?/g,
    // Bearer tokens / JWTs parciais
    /eyJ[A-Za-z0-9_-]{10,}/g,
    // client_secret, api_key, password= em URLs/query
    /(?:client_secret|api_key|password|token)=[\w.-]{4,}/gi,
];

/**
 * Sanitiza uma string removendo padrões sensíveis.
 * Substitui por [REDACTED:tipo].
 */
function sanitizeMessage(msg) {
    if (typeof msg !== 'string') return '';
    let s = msg;
    s = s.replace(SENSITIVE_PATTERNS[0], '[REDACTED:path]');
    s = s.replace(SENSITIVE_PATTERNS[1], '[REDACTED:path]');
    s = s.replace(SENSITIVE_PATTERNS[2], '[REDACTED:sql]');
    s = s.replace(SENSITIVE_PATTERNS[3], '');
    s = s.replace(SENSITIVE_PATTERNS[4], '[REDACTED:ip]');
    s = s.replace(SENSITIVE_PATTERNS[5], '[REDACTED:token]');
    s = s.replace(SENSITIVE_PATTERNS[6], '[REDACTED:credential]');
    return s.trim();
}

/**
 * Extrai status HTTP de um erro.
 */
function inferStatus(err) {
    if (!err) return 500;
    if (err.status && Number.isInteger(err.status)) return err.status;
    if (err.statusCode && Number.isInteger(err.statusCode)) return err.statusCode;
    if (err.code && STATUS_MAP[err.code]) return STATUS_MAP[err.code];
    // SQLITE_BUSY, SQLITE_CONSTRAINT, etc.
    if (err.code && /^SQLITE_/i.test(err.code)) {
        if (err.code === 'SQLITE_CONSTRAINT') return 409;
        if (err.code === 'SQLITE_BUSY') return 503;
        return 500;
    }
    // network/gateway
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT') {
        return 502;
    }
    return 500;
}

/**
 * Extrai code estruturado (se houver) ou retorna INTERNAL_ERROR.
 */
function inferCode(err) {
    if (err?.code && /^[A-Z_]{3,30}$/.test(err.code)) return err.code;
    if (err?.type === 'entity.parse.failed') return 'INVALID_JSON';
    return 'INTERNAL_ERROR';
}

/**
 * Handler principal. Use em try/catch dos endpoints.
 *
 * @param {Response} res       - Express response
 * @param {Error}    err       - Erro capturado
 * @param {Object}   opts
 *   @param {string}  opts.context   - Descrição do contexto (ex: 'POST /api/leads')
 *   @param {Object}  opts.req       - Express request (opcional, para auditInfo)
 *   @param {string}  opts.publicMessage - Override da mensagem pública
 *   @param {Object}  opts.details   - Detalhes extras SEGUROS para enviar ao cliente
 *   @param {boolean} opts.logToDb   - Salvar no DB (audit_acessos)? Default true
 *   @param {string}  opts.correlationId - ID pré-existente (opcional)
 *
 * @returns {Response} res com JSON sanitizado
 */
function handleError(res, err, opts = {}) {
    const status = inferStatus(err);
    const code = inferCode(err);
    const correlationId = opts.correlationId || crypto.randomBytes(8).toString('hex');

    // 1. Log interno COMPLETO (com stack, paths, etc.)
    const internalLog = {
        timestamp: new Date().toISOString(),
        correlationId,
        context: opts.context || 'unknown',
        code,
        status,
        message: err?.message,
        stack: err?.stack,
        type: err?.type,
        // Detalhes do request (se fornecido)
        userId: opts.req?.auditInfo?.userId,
        userRole: opts.req?.auditInfo?.role,
        ip: opts.req?.headers?.['x-forwarded-for'] || opts.req?.socket?.remoteAddress,
        method: opts.req?.method,
        path: opts.req?.originalUrl || opts.req?.path,
    };
    console.error('[ErrorHandler]', JSON.stringify(internalLog, null, 2));

    // 2. Log no DB (audit_acessos) — assíncrono, não bloqueia
    if (opts.logToDb !== false) {
        setImmediate(() => {
            try {
                const { dbRun } = require('../database');
                dbRun(
                    `INSERT INTO audit_acessos (user_id, ip, acao, recurso, status_code, correlation_id, detalhes_json)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        internalLog.userId || null,
                        internalLog.ip || null,
                        'error',
                        internalLog.context || null,
                        status,
                        correlationId,
                        JSON.stringify({ code, message: err?.message?.substring(0, 200) || null, status })
                    ]
                ).catch((dbErr) => {
                    console.warn('[ErrorHandler] Falha ao gravar audit_acessos:', dbErr.message);
                });
            } catch (e) {
                // ignore — error handler não pode falhar
            }
        });
    }

    // 3. Monta resposta pública SEGURA
    const publicMessage = opts.publicMessage
        || PUBLIC_MESSAGES[status]
        || PUBLIC_MESSAGES[500];

    const response = {
        success: false,
        error: publicMessage,
        code,
        correlationId,  // cliente pode citar em ticket de suporte
    };

    // 4. Anexar detalhes SEGUROS (validation errors, not found id, etc.)
    if (opts.details && typeof opts.details === 'object') {
        response.details = opts.details;
    } else if (Array.isArray(err?.errors) && err.errors.length > 0 && status < 500) {
        // Erros de validação (Zod-like) podem ir pro cliente
        response.details = err.errors.map((e) => ({
            field: e.field || e.path,
            message: sanitizeMessage(e.message || String(e)),
        }));
    }

    // 5. Para erros 4xx conhecidos, pode incluir uma mensagem mais útil
    //    (após sanitização)
    if (status >= 400 && status < 500 && err?.message) {
        const sanitized = sanitizeMessage(err.message);
        if (sanitized && sanitized !== publicMessage && sanitized.length < 200) {
            response.error = sanitized;
        }
    }

    return res.status(status).json(response);
}

/**
 * Async handler wrapper. Captura rejeições automaticamente.
 *
 *   router.get('/foo', asyncHandler(async (req, res) => {
 *     const data = await service.foo();
 *     res.json(data);
 *   }));
 */
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch((err) => {
            return handleError(res, err, { context: `${req.method} ${req.path}`, req });
        });
    };
}

module.exports = {
    handleError,
    asyncHandler,
    sanitizeMessage,
    inferStatus,
    inferCode,
    STATUS_MAP,
    PUBLIC_MESSAGES,
};
