/**
 * Validate middleware — Validação de inputs sem dependências externas (Sprint Security Fixes V20)
 *
 * Uso:
 *   const { validate, schemas } = require('./middleware/validate');
 *   router.post('/login', validate(schemas.authLogin), handler);
 *
 * Schemas ficam centralizados em `schemas` para fácil auditoria.
 *
 * IMPORTANTE: este middleware é uma camada EXTRA de validação, não
 * substitui validação de domínio. Schemas aqui são GENERICOS:
 *   - email: string no formato email
 *   - id: string com regex de ID
 *   - search: string max 100 chars
 *
 * Validação específica de domínio (e.g. "user existe", "valor > 0")
 * continua sendo feita nos services/handlers.
 */

const ID_REGEX = /^[a-zA-Z0-9_-]+$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validadores genéricos
 */
const v = {
    isString: (val, opts = {}) => {
        if (typeof val !== 'string') return false;
        if (opts.min != null && val.length < opts.min) return false;
        if (opts.max != null && val.length > opts.max) return false;
        if (opts.pattern && !opts.pattern.test(val)) return false;
        if (opts.enum && !opts.enum.includes(val)) return false;
        return true;
    },
    isEmail: (val) => typeof val === 'string' && val.length <= 255 && EMAIL_REGEX.test(val),
    isId: (val) => typeof val === 'string' && val.length >= 2 && val.length <= 64 && ID_REGEX.test(val),
    isNumber: (val, opts = {}) => {
        const n = typeof val === 'string' ? Number(val) : val;
        if (typeof n !== 'number' || isNaN(n)) return false;
        if (opts.min != null && n < opts.min) return false;
        if (opts.max != null && n > opts.max) return false;
        if (opts.integer && !Number.isInteger(n)) return false;
        return true;
    },
    isBoolean: (val) => typeof val === 'boolean',
    isIn: (val, list) => list.includes(val),
};

/**
 * Schemas de validação
 * Cada schema é uma função que recebe um objeto e retorna
 *   { valid: true, value: cleaned } ou { valid: false, errors: [...] }
 */
const schemas = {
    // Auth
    authLogin: (body) => {
        const errors = [];
        if (!v.isEmail(body?.email)) errors.push({ field: 'email', message: 'email inválido' });
        if (!v.isString(body?.password, { min: 1, max: 200 })) errors.push({ field: 'password', message: 'senha obrigatória (1-200 chars)' });
        return { valid: errors.length === 0, errors, value: errors.length === 0 ? body : null };
    },

    authRefresh: (body) => {
        const errors = [];
        if (!v.isString(body?.refreshToken, { min: 10, max: 2000 })) errors.push({ field: 'refreshToken', message: 'refreshToken inválido' });
        return { valid: errors.length === 0, errors, value: errors.length === 0 ? body : null };
    },

    // Portal
    portalLogin: (body) => schemas.authLogin(body),
    portalForgot: (body) => {
        const errors = [];
        if (!v.isEmail(body?.email)) errors.push({ field: 'email', message: 'email inválido' });
        return { valid: errors.length === 0, errors, value: errors.length === 0 ? body : null };
    },
    portalReset: (body) => {
        const errors = [];
        if (!v.isString(body?.token, { min: 20, max: 200 })) errors.push({ field: 'token', message: 'token inválido' });
        if (!v.isString(body?.newPassword, { min: 8, max: 200 })) errors.push({ field: 'newPassword', message: 'senha deve ter 8-200 chars' });
        return { valid: errors.length === 0, errors, value: errors.length === 0 ? body : null };
    },
    portalProfile: (body) => {
        const errors = [];
        if (body?.nome !== undefined && !v.isString(body.nome, { min: 2, max: 100 })) errors.push({ field: 'nome', message: 'nome deve ter 2-100 chars' });
        if (body?.telefone !== undefined && !v.isString(body.telefone, { max: 30 })) errors.push({ field: 'telefone', message: 'telefone inválido' });
        if (body?.email !== undefined && !v.isEmail(body.email)) errors.push({ field: 'email', message: 'email inválido' });
        return { valid: errors.length === 0, errors, value: errors.length === 0 ? body : null };
    },
    portalTicket: (body) => {
        const errors = [];
        if (!v.isString(body?.titulo, { min: 3, max: 200 })) errors.push({ field: 'titulo', message: 'titulo deve ter 3-200 chars' });
        if (!v.isString(body?.descricao, { min: 3, max: 2000 })) errors.push({ field: 'descricao', message: 'descricao deve ter 3-2000 chars' });
        if (body?.categoria !== undefined && !v.isString(body.categoria, { max: 50 })) errors.push({ field: 'categoria', message: 'categoria inválida' });
        if (body?.prioridade !== undefined && !v.isIn(body.prioridade, ['Baixa', 'Média', 'Alta', 'Urgente'])) errors.push({ field: 'prioridade', message: 'prioridade inválida' });
        return { valid: errors.length === 0, errors, value: errors.length === 0 ? body : null };
    },

    // Mobile
    mobilePhoto: (body) => {
        const errors = [];
        if (!v.isString(body?.base64, { min: 100, max: 15_000_000 })) errors.push({ field: 'base64', message: 'base64 inválido (100-15M chars)' });
        if (!v.isString(body?.filename, { min: 1, max: 200 })) errors.push({ field: 'filename', message: 'filename obrigatório' });
        if (!v.isIn(body?.mime_type, ['image/jpeg', 'image/png', 'image/webp', 'image/heic'])) errors.push({ field: 'mime_type', message: 'mime_type inválido' });
        if (body?.latitude !== undefined && !v.isNumber(body.latitude, { min: -90, max: 90 })) errors.push({ field: 'latitude', message: 'latitude deve estar em [-90, 90]' });
        if (body?.longitude !== undefined && !v.isNumber(body.longitude, { min: -180, max: 180 })) errors.push({ field: 'longitude', message: 'longitude deve estar em [-180, 180]' });
        return { valid: errors.length === 0, errors, value: errors.length === 0 ? body : null };
    },
    mobileLocation: (body) => {
        const errors = [];
        if (!v.isNumber(body?.latitude, { min: -90, max: 90 })) errors.push({ field: 'latitude', message: 'latitude inválida' });
        if (!v.isNumber(body?.longitude, { min: -180, max: 180 })) errors.push({ field: 'longitude', message: 'longitude inválida' });
        if (body?.precisao !== undefined && !v.isNumber(body.precisao, { min: 0, max: 10000 })) errors.push({ field: 'precisao', message: 'precisao inválida' });
        if (body?.speed !== undefined && !v.isNumber(body.speed, { min: 0, max: 1000 })) errors.push({ field: 'speed', message: 'speed inválido' });
        if (body?.heading !== undefined && !v.isNumber(body.heading, { min: 0, max: 360 })) errors.push({ field: 'heading', message: 'heading inválido' });
        if (body?.battery_level !== undefined && !v.isNumber(body.battery_level, { min: 0, max: 1 })) errors.push({ field: 'battery_level', message: 'battery_level deve estar em [0, 1]' });
        return { valid: errors.length === 0, errors, value: errors.length === 0 ? body : null };
    },
    mobilePushToken: (body) => {
        const errors = [];
        if (!v.isString(body?.token, { min: 10, max: 500 })) errors.push({ field: 'token', message: 'token inválido' });
        if (!v.isIn(body?.platform, ['ios', 'android', 'web'])) errors.push({ field: 'platform', message: 'platform deve ser ios|android|web' });
        if (body?.device_id !== undefined && !v.isString(body.device_id, { max: 200 })) errors.push({ field: 'device_id', message: 'device_id inválido' });
        return { valid: errors.length === 0, errors, value: errors.length === 0 ? body : null };
    },

    // LGPD
    lgpdDSAR: (body) => {
        const errors = [];
        if (!v.isIn(body?.tipo, ['acesso', 'portabilidade', 'correcao', 'exclusao', 'oposicao'])) errors.push({ field: 'tipo', message: 'tipo DSAR inválido' });
        if (body?.descricao !== undefined && !v.isString(body.descricao, { max: 2000 })) errors.push({ field: 'descricao', message: 'descricao muito longa' });
        return { valid: errors.length === 0, errors, value: errors.length === 0 ? body : null };
    },
    lgpdConsent: (body) => {
        const errors = [];
        const validTypes = ['marketing_email', 'marketing_sms', 'marketing_whatsapp', 'compartilhamento_dados', 'cookies', 'newsletter'];
        if (!v.isIn(body?.tipo, validTypes)) errors.push({ field: 'tipo', message: 'tipo de consentimento inválido' });
        if (!v.isBoolean(body?.aceito)) errors.push({ field: 'aceito', message: 'aceito deve ser boolean' });
        return { valid: errors.length === 0, errors, value: errors.length === 0 ? body : null };
    },
};

/**
 * Middleware factory.
 * Valida `req.body` contra o schema; erros retornam 400.
 */
function validate(schema) {
    if (!schema) throw new Error('Schema é obrigatório');
    return (req, res, next) => {
        const result = schema(req.body || {});
        if (!result.valid) {
            return res.status(400).json({
                success: false,
                error: 'Dados inválidos',
                code: 'VALIDATION_ERROR',
                details: result.errors,
            });
        }
        if (result.value) req.body = result.value;
        next();
    };
}

module.exports = { validate, schemas, v, idSchema: v.isId };
