/**
 * Health Check — Endpoints de saúde para Kubernetes/Docker
 *
 * Sprint 4 — Cloud-Native Stack
 *
 * Endpoints:
 *   GET /health/live     → liveness probe (process up?)
 *   GET /health/ready    → readiness probe (deps OK?)
 *   GET /health          → health completo (compatibilidade)
 *
 * K8s usage:
 *   livenessProbe:
 *     httpGet: { path: /health/live, port: 3000 }
 *     periodSeconds: 30
 *   readinessProbe:
 *     httpGet: { path: /health/ready, port: 3000 }
 *     periodSeconds: 10
 *     initialDelaySeconds: 20
 */

const express = require('express');
const router = express.Router();
const { dbGet, dbAll } = require('../database');
const { getRedis, isRedisAvailable } = require('../infra/redis');

const startedAt = new Date();
let lastCheckOk = { db: false, redis: false, lastChecked: null };

async function checkDb() {
    try {
        const r = await dbGet('SELECT 1 as ok');
        return r && r.ok === 1;
    } catch (e) {
        return false;
    }
}

async function checkRedis() {
    if (!isRedisAvailable()) return false;
    try {
        const r = getRedis();
        const pong = await r.ping();
        return pong === 'PONG';
    } catch (e) {
        return false;
    }
}

/**
 * GET /health/live — Liveness
 * Retorna 200 SEMPRE se o processo está vivo.
 * K8s usa para decidir se precisa REINICIAR o pod.
 */
router.get('/live', (req, res) => {
    res.status(200).json({
        status: 'ok',
        uptime_s: Math.floor((Date.now() - startedAt.getTime()) / 1000),
        pid: process.pid,
        memory: {
            rss_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
            heap_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        },
        node: process.version,
        env: process.env.NODE_ENV,
    });
});

/**
 * GET /health/ready — Readiness
 * Retorna 200 só se TODAS as dependências estão OK.
 * K8s usa para decidir se o pod recebe tráfego.
 */
router.get('/ready', async (req, res) => {
    const [dbOk, redisOk] = await Promise.all([checkDb(), checkRedis()]);
    lastCheckOk = { db: dbOk, redis: redisOk, lastChecked: new Date().toISOString() };

    const allOk = dbOk && redisOk;
    const checks = {
        db: dbOk ? 'ok' : 'down',
        redis: redisOk ? 'ok' : (isRedisAvailable() ? 'down' : 'not_configured'),
    };

    const httpStatus = allOk ? 200 : 503;
    res.status(httpStatus).json({
        status: allOk ? 'ready' : 'not_ready',
        checks,
        uptime_s: Math.floor((Date.now() - startedAt.getTime()) / 1000),
        version: process.env.APP_VERSION || 'dev',
    });
});

/**
 * GET /health — Health completo (compat com versão anterior)
 */
router.get('/', async (req, res) => {
    const [dbOk, redisOk] = await Promise.all([checkDb(), checkRedis()]);
    const allOk = dbOk && redisOk;
    res.status(allOk ? 200 : 503).json({
        status: allOk ? 'ok' : 'degraded',
        timestamp: new Date().toISOString(),
        uptime_s: Math.floor((Date.now() - startedAt.getTime()) / 1000),
        services: {
            database: dbOk ? 'ok' : 'down',
            redis: redisOk ? 'ok' : (isRedisAvailable() ? 'down' : 'not_configured'),
        },
        version: process.env.APP_VERSION || 'dev',
        environment: process.env.NODE_ENV,
    });
});

module.exports = router;
