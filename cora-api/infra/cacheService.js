/**
 * CacheService — Cache global com Redis (Sprint 18)
 *
 * Substitui/integrar com o `tenantAwareDb` para queries frequentes.
 *
 * Estratégia:
 *   - LRU por chave (max 1000 chaves em memória)
 *   - TTL configurável por chave
 *   - Invalidação por namespace (ex: ao criar cliente, invalida 'clientes:*')
 *   - Graceful degradation: se Redis indisponível, usa memória local
 *   - Tags para invalidação em grupo
 *
 * Padrão de uso:
 *   const CACHE = require('./infra/cacheService');
 *
 *   // Get/Set
 *   const cached = await CACHE.get('clientes:list', { ttl: 60 });
 *   if (!cached) {
 *       const data = await dbAll('SELECT * FROM clientes');
 *       await CACHE.set('clientes:list', data, { ttl: 60 });
 *   }
 *
 *   // Invalidação por namespace
 *   await CACHE.invalidateNamespace('clientes');  // deleta clientes:*
 *   await CACHE.invalidate('clientes:list');      // deleta chave específica
 *
 *   // Cache-aside helper (com fetch automático)
 *   const data = await CACHE.wrap('clientes:list', 60, async () => {
 *       return await dbAll('SELECT * FROM clientes');
 *   });
 */

const crypto = require('crypto');

// ════════════════════════════════════════════════════════════════
// CACHE EM MEMÓRIA (LRU simples)
// ════════════════════════════════════════════════════════════════

class MemoryLRU {
    constructor(maxSize = 1000) {
        this.maxSize = maxSize;
        this.cache = new Map();  // key -> { value, expires, hits }
        this.stats = { gets: 0, sets: 0, hits: 0, misses: 0, evictions: 0 };
    }

    _isExpired(entry) {
        return entry.expires && entry.expires < Date.now();
    }

    get(key) {
        this.stats.gets++;
        const entry = this.cache.get(key);
        if (!entry) {
            this.stats.misses++;
            return null;
        }
        if (this._isExpired(entry)) {
            this.cache.delete(key);
            this.stats.misses++;
            return null;
        }
        entry.hits = (entry.hits || 0) + 1;
        this.stats.hits++;
        return entry.value;
    }

    set(key, value, ttlSeconds) {
        this.stats.sets++;
        // Eviction (LRU)
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
            this.stats.evictions++;
        }
        this.cache.set(key, {
            value,
            expires: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
            hits: 0,
        });
    }

    delete(key) {
        return this.cache.delete(key);
    }

    // Invalida todas as chaves que começam com `prefix`
    invalidatePrefix(prefix) {
        let count = 0;
        for (const key of this.cache.keys()) {
            if (key.startsWith(prefix)) {
                this.cache.delete(key);
                count++;
            }
        }
        return count;
    }

    clear() {
        const size = this.cache.size;
        this.cache.clear();
        return size;
    }

    getStats() {
        return {
            ...this.stats,
            size: this.cache.size,
            maxSize: this.maxSize,
            hitRate: this.stats.gets > 0
                ? Math.round((this.stats.hits / this.stats.gets) * 100)
                : 0,
        };
    }
}

const memoryCache = new MemoryLRU(2000);

// ════════════════════════════════════════════════════════════════
// CACHE COM REDIS (best-effort, fallback para memória)
// ════════════════════════════════════════════════════════════════

let redisClient = null;
let redisAvailable = false;

function tryConnectRedis() {
    if (redisClient) return;
    try {
        const redis = require('./redis');
        if (redis.isRedisAvailable && redis.isRedisAvailable()) {
            redisClient = redis.client;
            redisAvailable = true;
            console.log('[CacheService] Redis disponível, usando cache distribuído');
        } else {
            console.log('[CacheService] Redis não disponível, usando cache em memória');
        }
    } catch (e) {
        console.log('[CacheService] Erro ao conectar Redis:', e.message);
    }
}

// Tenta conectar no import
tryConnectRedis();

/**
 * Get value from cache (Redis first, then memory).
 * Returns null if not found.
 */
async function get(key) {
    // Tenta Redis primeiro
    if (redisAvailable && redisClient) {
        try {
            const val = await redisClient.get(`renostter:${key}`);
            if (val) {
                memoryCache.stats.hits++;
                return JSON.parse(val);
            }
        } catch (_) { /* silencioso */ }
    }
    // Fallback: memória
    return memoryCache.get(key);
}

/**
 * Set value in cache.
 */
async function set(key, value, options = {}) {
    const ttl = options.ttl || 300;  // 5 min default
    memoryCache.set(key, value, ttl);
    if (redisAvailable && redisClient) {
        try {
            await redisClient.setex(`renostter:${key}`, ttl, JSON.stringify(value));
        } catch (_) { /* silencioso */ }
    }
    return true;
}

/**
 * Delete a specific key.
 */
async function del(key) {
    memoryCache.delete(key);
    if (redisAvailable && redisClient) {
        try { await redisClient.del(`renostter:${key}`); } catch (_) {}
    }
    return true;
}

/**
 * Invalidate all keys with a prefix (namespace).
 * Ex: invalidateNamespace('clientes') deleta 'clientes:list', 'clientes:abc', etc.
 */
async function invalidateNamespace(namespace) {
    const prefix = `${namespace}:`;
    const memCount = memoryCache.invalidatePrefix(prefix);
    if (redisAvailable && redisClient) {
        try {
            // SCAN para encontrar chaves (não usar KEYS em produção)
            let cursor = '0';
            let redisCount = 0;
            do {
                const result = await redisClient.scan(cursor, 'MATCH', `renostter:${prefix}*`, 'COUNT', 100);
                cursor = result[0];
                const keys = result[1];
                if (keys.length > 0) {
                    await redisClient.del(...keys);
                    redisCount += keys.length;
                }
            } while (cursor !== '0');
            return { memory: memCount, redis: redisCount };
        } catch (_) { /* silencioso */ }
    }
    return { memory: memCount, redis: 0 };
}

/**
 * Cache-aside: get from cache, or fetch + set.
 * Simplest pattern for read-through caching.
 *
 * @param {string} key
 * @param {number} ttl - seconds
 * @param {Function} fetchFn - async function that returns the data
 */
async function wrap(key, ttl, fetchFn) {
    const cached = await get(key);
    if (cached !== null) return { data: cached, fromCache: true };
    const data = await fetchFn();
    await set(key, data, { ttl });
    return { data, fromCache: false };
}

/**
 * Invalidate by entity pattern (e.g. 'cliente:123' invalida 'clientes:*' e 'cliente:123:*').
 */
async function invalidateEntity(entity, id = null) {
    const base = entity.endsWith('s') ? entity : entity + 's';  // 'cliente' → 'clientes'
    await invalidateNamespace(base);
    if (id) {
        await invalidateNamespace(`${base}:${id}`);
    }
    return { entity, id, cleared: true };
}

function getStats() {
    return {
        ...memoryCache.getStats(),
        redis_available: redisAvailable,
    };
}

module.exports = {
    get,
    set,
    del,
    clear: () => memoryCache.clear(),
    wrap,
    invalidateNamespace,
    invalidateEntity,
    getStats,
    memoryCache,  // export para testes
};
