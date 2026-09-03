/**
 * Rate Limiter nativo — sem dependências externas
 *
 * Implementação simples baseada em Map<ip, {count, resetAt}>.
 * Adequado para uso single-instance (não distribuído).
 *
 * Para multi-instance, trocar por Redis-backed (express-rate-limit).
 */

class RateLimiter {
    constructor({ windowMs = 60_000, max = 100, message = 'Muitas requisições. Tente novamente em breve.' } = {}) {
        this.windowMs = windowMs;
        this.max = max;
        this.message = message;
        this.buckets = new Map(); // key → { count, resetAt }
        // Limpar buckets expirados a cada 5 min para não vazar memória
        this._gcInterval = setInterval(() => this._gc(), 5 * 60_000);
        if (this._gcInterval.unref) this._gcInterval.unref();
    }

    _gc() {
        const now = Date.now();
        for (const [k, b] of this.buckets) {
            if (now >= b.resetAt) this.buckets.delete(k);
        }
    }

    /**
     * Middleware Express
     */
    middleware() {
        return (req, res, next) => {
            const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
            const key = `${ip}:${req.method}:${req.path}`;
            const now = Date.now();
            let bucket = this.buckets.get(key);
            if (!bucket || now >= bucket.resetAt) {
                bucket = { count: 0, resetAt: now + this.windowMs };
                this.buckets.set(key, bucket);
            }
            bucket.count++;
            res.setHeader('X-RateLimit-Limit', String(this.max));
            res.setHeader('X-RateLimit-Remaining', String(Math.max(0, this.max - bucket.count)));
            res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

            if (bucket.count > this.max) {
                return res.status(429).json({
                    success: false,
                    error: this.message,
                    retryAfter: Math.ceil((bucket.resetAt - now) / 1000)
                });
            }
            next();
        };
    }
}

module.exports = RateLimiter;