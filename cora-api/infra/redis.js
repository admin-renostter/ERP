/**
 * Redis Client — Singleton com fallback gracioso
 *
 * Sprint 4 — Cloud-Native Stack
 *
 * Em DEV sem Redis, retorna null graciosamente (sistema continua funcionando
 * com rate-limit e cache em memória). Em PROD, se REDIS_URL não estiver
 * setado, lança erro no boot.
 *
 * NOTA: usa redis@3.x (não 4+/6+) para compatibilidade com Redis 3.0.504 (Windows).
 * Em produção (Linux), pode-se usar Redis 6+/7+ com node-redis 4+ normalmente.
 */

const redis = require('redis');

let _client = null;
let _available = false;
let _connecting = false;

const REDIS_URL = process.env.REDIS_URL || process.env.REDIS_CONNECTION_STRING || null;
const REDIS_PREFIX = (process.env.REDIS_PREFIX || 'renostter:') + (process.env.NODE_ENV || 'dev') + ':';
const IS_PROD = process.env.NODE_ENV === 'production';

function getRedis() {
    if (_client) return _client;
    if (!REDIS_URL) {
        if (IS_PROD) {
            throw new Error('[Redis] REDIS_URL não configurado em produção. Defina a env var.');
        }
        return null;
    }
    return _client;
}

function isRedisAvailable() {
    return _available;
}

/**
 * Conecta no Redis. Deve ser chamado no boot do app.
 * Não bloqueia se a conexão falhar em dev (só loga warning).
 */
async function connectRedis() {
    if (!REDIS_URL) {
        console.log('[Redis] REDIS_URL não configurado — funcionando sem cache distribuído.');
        _available = false;
        return null;
    }
    if (_client && _available) return _client;
    if (_connecting) {
        while (_connecting) {
            await new Promise(r => setTimeout(r, 50));
        }
        return _client;
    }

    _connecting = true;
    try {
        // Parse URL manualmente (redis@3 usa opções separadas)
        let host = 'localhost', port = 6379, password = null, db = 0;
        try {
            const u = new URL(REDIS_URL);
            host = u.hostname;
            port = parseInt(u.port || '6379', 10);
            password = u.password ? decodeURIComponent(u.password) : null;
            db = u.pathname && u.pathname.length > 1 ? parseInt(u.pathname.slice(1), 10) : 0;
        } catch (e) {
            console.warn('[Redis] REDIS_URL inválido, usando defaults (localhost:6379)');
        }

        const client = redis.createClient({
            host,
            port,
            ...(password ? { password } : {}),
            ...(db ? { db } : {}),
            retry_strategy: (options) => {
                if (options.total_retry_time > 5000) {
                    console.error('[Redis] Máximo de tempo de reconexão atingido.');
                    return new Error('Redis unreachable');
                }
                if (options.attempt > 5) {
                    return undefined; // para de tentar
                }
                return Math.min(options.attempt * 100, 2000);
            },
        });

        client.on('error', (err) => {
            if (err && err.code !== 'ECONNREFUSED') {
                console.error('[Redis] Erro:', err.message);
            }
            _available = false;
        });
        client.on('ready', () => {
            console.log('[Redis] ✓ Conectado em', `${host}:${port}/${db}`);
            _available = true;
        });
        client.on('reconnecting', () => {
            console.warn('[Redis] Reconectando...');
            _available = false;
        });
        client.on('end', () => {
            console.warn('[Redis] Conexão encerrada.');
            _available = false;
        });

        _client = client;
        // redis@3 retorna uma Promise do .connect() mas já inicia automaticamente
        // Se não estiver conectado ainda, espera
        if (!client.connected) {
            await new Promise((resolve, reject) => {
                const onReady = () => { cleanup(); resolve(); };
                const onError = (err) => { cleanup(); reject(err); };
                const cleanup = () => {
                    client.removeListener('ready', onReady);
                    client.removeListener('error', onError);
                };
                client.once('ready', onReady);
                client.once('error', onError);
                setTimeout(() => { cleanup(); reject(new Error('Redis connect timeout')); }, 10000);
            });
        }
        _available = true;
        return _client;
    } catch (e) {
        console.error('[Redis] Falha ao conectar:', e.message);
        _available = false;
        if (IS_PROD) throw e;
        return null;
    } finally {
        _connecting = false;
    }
}

/**
 * Helper: get/set com prefix automático e TTL opcional.
 * Se Redis não disponível, retorna null (não quebra a app).
 */
async function redisGet(key) {
    const c = getRedis();
    if (!c || !_available) return null;
    try {
        const v = await new Promise((resolve, reject) => {
            c.get(REDIS_PREFIX + key, (err, val) => err ? reject(err) : resolve(val));
        });
        if (!v) return null;
        try { return JSON.parse(v); } catch { return v; }
    } catch (e) {
        console.warn('[Redis] GET falhou:', e.message);
        return null;
    }
}

async function redisSet(key, value, ttlSeconds = null) {
    const c = getRedis();
    if (!c || !_available) return false;
    try {
        const v = typeof value === 'string' ? value : JSON.stringify(value);
        return await new Promise((resolve, reject) => {
            const cb = (err) => err ? reject(err) : resolve(true);
            if (ttlSeconds) {
                c.set(REDIS_PREFIX + key, v, 'EX', ttlSeconds, cb);
            } else {
                c.set(REDIS_PREFIX + key, v, cb);
            }
        });
    } catch (e) {
        console.warn('[Redis] SET falhou:', e.message);
        return false;
    }
}

async function redisDel(key) {
    const c = getRedis();
    if (!c || !_available) return 0;
    try {
        return await new Promise((resolve, reject) => {
            c.del(REDIS_PREFIX + key, (err, n) => err ? reject(err) : resolve(n || 0));
        });
    } catch (e) {
        console.warn('[Redis] DEL falhou:', e.message);
        return 0;
    }
}

async function redisIncr(key, ttlSeconds = null) {
    const c = getRedis();
    if (!c || !_available) return null;
    try {
        const v = await new Promise((resolve, reject) => {
            c.incr(REDIS_PREFIX + key, (err, n) => err ? reject(err) : resolve(n));
        });
        if (ttlSeconds && v === 1) {
            await new Promise((resolve, reject) => {
                c.expire(REDIS_PREFIX + key, ttlSeconds, (err) => err ? reject(err) : resolve());
            });
        }
        return v;
    } catch (e) {
        console.warn('[Redis] INCR falhou:', e.message);
        return null;
    }
}

async function disconnectRedis() {
    if (_client) {
        try {
            await new Promise((resolve) => {
                _client.quit(() => resolve());
            });
        } catch (_) {}
        _client = null;
        _available = false;
    }
}

module.exports = {
    connectRedis,
    disconnectRedis,
    getRedis,
    isRedisAvailable,
    redisGet,
    redisSet,
    redisDel,
    redisIncr,
    REDIS_PREFIX,
    REDIS_URL,
};
