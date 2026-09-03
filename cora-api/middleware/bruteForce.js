/**
 * Brute Force Protection — Account Lockout
 *
 * Sprint Security Hardening 3 — V25
 *
 * PROBLEMA:
 *   Atacante pode tentar milhares de senhas em um único user.
 *   Sem lockout, isso é viável (ataque de dicionário offline + online).
 *
 * SOLUÇÃO:
 *   - Conta é BLOQUEADA após MAX_ATTEMPTS falhas em WINDOW_MIN minutos
 *   - Bloqueio dura LOCKOUT_MIN minutos
 *   - Já existe no schema: failed_login_count, locked_until
 *   - (V25 adiciona: tracking por IP, log estruturado, reset on success)
 *
 * USO:
 *   const BruteForce = require('./middleware/bruteForce');
 *   if (await BruteForce.isLocked(userId)) return res.status(423).json({...});
 *   if (!passwordValid) {
 *     await BruteForce.recordFailure(userId);
 *   } else {
 *     await BruteForce.recordSuccess(userId);
 *   }
 */

const { dbGet, dbRun } = require('../database');
const SecurityLogger = require('../services/SecurityLogger');

const MAX_ATTEMPTS = 5;
const WINDOW_MIN = 15;       // janela de contagem
const LOCKOUT_MIN = 30;      // duração do bloqueio
const IP_MAX_ATTEMPTS = 20;  // limite por IP (defesa contra ataque distribuído)

class BruteForceProtection {
    /**
     * Verifica se uma conta está bloqueada.
     * @param {string} userId
     * @returns {Promise<{ locked: boolean, until?: string, remainingMinutes?: number }>}
     */
    static async isLocked(userId) {
        if (!userId) return { locked: false };
        const user = await dbGet(
            `SELECT locked_until, failed_login_count FROM usuarios WHERE id = ?`,
            [userId]
        );
        if (!user) return { locked: false };
        if (user.locked_until) {
            const now = new Date();
            const lockUntil = new Date(user.locked_until);
            if (now < lockUntil) {
                const remainingMs = lockUntil - now;
                return {
                    locked: true,
                    until: user.locked_until,
                    remainingMinutes: Math.ceil(remainingMs / 60000),
                };
            }
            // Lock expirou — reseta
            await dbRun(
                `UPDATE usuarios SET locked_until = NULL, failed_login_count = 0 WHERE id = ?`,
                [userId]
            );
        }
        return { locked: false };
    }

    /**
     * Verifica se um IP está bloqueado (defesa contra ataque distribuído).
     * Cache em memória (simples, suficiente para volume moderado).
     */
    static _ipAttempts = new Map();

    static async isIpBlocked(ip) {
        if (!ip) return false;
        const entry = this._ipAttempts.get(ip);
        if (!entry) return false;
        const now = Date.now();
        if (now - entry.firstAt > WINDOW_MIN * 60 * 1000) {
            this._ipAttempts.delete(ip);
            return false;
        }
        return entry.count >= IP_MAX_ATTEMPTS;
    }

    static async recordIpFailure(ip) {
        if (!ip) return;
        const now = Date.now();
        const entry = this._ipAttempts.get(ip) || { count: 0, firstAt: now };
        if (now - entry.firstAt > WINDOW_MIN * 60 * 1000) {
            entry.count = 0;
            entry.firstAt = now;
        }
        entry.count++;
        this._ipAttempts.set(ip, entry);
    }

    /**
     * Registra uma falha de login para um usuário.
     * Se atingiu MAX_ATTEMPTS, bloqueia a conta.
     */
    static async recordFailure(userId, { ip, userAgent, email } = {}) {
        if (!userId) return { locked: false };

        // Incrementa contador
        await dbRun(
            `UPDATE usuarios
             SET failed_login_count = COALESCE(failed_login_count, 0) + 1,
                 last_login_ip = COALESCE(?, last_login_ip)
             WHERE id = ?`,
            [ip || null, userId]
        );

        // Pequeno delay para liberar lock do DB (defesa contra WAL starvation)
        await new Promise((resolve) => setImmediate(resolve));

        // Lê contagem atual
        const user = await dbGet(
            `SELECT failed_login_count FROM usuarios WHERE id = ?`,
            [userId]
        );
        const count = user?.failed_login_count || 0;

        // Log estruturado
        await SecurityLogger.loginFailed({
            email: email || null,
            ip: ip || null,
            userAgent: userAgent || null,
            reason: `attempt ${count}/${MAX_ATTEMPTS}`,
        });

        // Se atingiu o limite, bloqueia
        if (count >= MAX_ATTEMPTS) {
            const lockedUntil = new Date(Date.now() + LOCKOUT_MIN * 60 * 1000).toISOString();
            await dbRun(
                `UPDATE usuarios SET locked_until = ? WHERE id = ?`,
                [lockedUntil, userId]
            );
            await SecurityLogger.accountLocked({
                userId, email, ip,
                until: lockedUntil,
            });
            return { locked: true, until: lockedUntil, attempts: count };
        }

        return { locked: false, attempts: count, remaining: MAX_ATTEMPTS - count };
    }

    /**
     * Registra um login bem-sucedido (reseta contador).
     */
    static async recordSuccess(userId, { ip, userAgent, email } = {}) {
        if (!userId) return;
        await dbRun(
            `UPDATE usuarios
             SET failed_login_count = 0,
                 locked_until = NULL,
                 last_login_at = datetime('now'),
                 last_login_ip = COALESCE(?, last_login_ip)
             WHERE id = ?`,
            [ip || null, userId]
        );
        await SecurityLogger.loginSuccess({
            userId, email, ip, userAgent,
        });
    }

    /**
     * Desbloqueia manualmente (admin).
     */
    static async unlock(userId) {
        if (!userId) return;
        await dbRun(
            `UPDATE usuarios SET failed_login_count = 0, locked_until = NULL WHERE id = ?`,
            [userId]
        );
    }

    /**
     * Middleware Express que checa rate limit por IP.
     * Aplica-se ANTES do handler de login.
     */
    static ipRateLimit() {
        return async (req, res, next) => {
            const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
            if (await this.isIpBlocked(ip)) {
                await SecurityLogger.suspiciousActivity({
                    ip, reason: 'ip_rate_limit_exceeded',
                    details: { threshold: IP_MAX_ATTEMPTS, windowMin: WINDOW_MIN },
                });
                return res.status(429).json({
                    success: false,
                    error: 'Muitas tentativas deste IP. Tente novamente em alguns minutos.',
                    code: 'IP_RATE_LIMITED',
                });
            }
            next();
        };
    }
}

module.exports = BruteForceProtection;
