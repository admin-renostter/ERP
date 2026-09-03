/**
 * SlowQueryLogger — Monitor de queries lentas (Sprint 18)
 *
 * Mede duração de cada query executada via dbGet/dbAll/dbRun.
 * Queries acima do threshold (default 100ms) são logadas no console
 * e mantidas em memória para análise.
 *
 * Para usar:
 *   const { instrument } = require('./infra/slowQueryLogger');
 *   instrument(dbGet, dbAll, dbRun);  // patch as funções
 *
 * Para ver stats:
 *   const { getStats, clearStats } = require('./infra/slowQueryLogger');
 *   console.log(getStats());  // { total, slow, avgMs, p95Ms, slowest }
 */

const SLOW_THRESHOLD_MS = parseInt(process.env.SLOW_QUERY_THRESHOLD_MS || '100');
const MAX_HISTORY = 200;  // mantém últimas N queries lentas em memória

const stats = {
    total: 0,
    totalMs: 0,
    slow: 0,  // count de queries acima do threshold
    history: [],  // array circular das últimas queries lentas
};

let historyIdx = 0;

function recordQuery(sql, durationMs, params) {
    stats.total++;
    stats.totalMs += durationMs;

    if (durationMs >= SLOW_THRESHOLD_MS) {
        stats.slow++;
        // Mantém histórico
        const entry = {
            sql: sql.replace(/\s+/g, ' ').trim().substring(0, 200),
            duration_ms: Math.round(durationMs * 100) / 100,
            params_count: Array.isArray(params) ? params.length : 0,
            timestamp: new Date().toISOString(),
        };
        if (stats.history.length < MAX_HISTORY) {
            stats.history.push(entry);
        } else {
            stats.history[historyIdx] = entry;
            historyIdx = (historyIdx + 1) % MAX_HISTORY;
        }
        // Log no console
        console.warn(`[SLOW QUERY] ${entry.duration_ms}ms — ${entry.sql}`);
    }
}

function getStats() {
    const allDurations = stats.history.map(h => h.duration_ms).sort((a, b) => a - b);
    const p50 = allDurations[Math.floor(allDurations.length * 0.5)] || 0;
    const p95 = allDurations[Math.floor(allDurations.length * 0.95)] || 0;
    const p99 = allDurations[Math.floor(allDurations.length * 0.99)] || 0;
    const avgMs = stats.total > 0 ? Math.round((stats.totalMs / stats.total) * 100) / 100 : 0;

    return {
        total: stats.total,
        slow: stats.slow,
        slow_rate: stats.total > 0 ? Math.round((stats.slow / stats.total) * 10000) / 100 : 0,
        avg_ms: avgMs,
        p50_ms: Math.round(p50 * 100) / 100,
        p95_ms: Math.round(p95 * 100) / 100,
        p99_ms: Math.round(p99 * 100) / 100,
        slowest: stats.history.slice().sort((a, b) => b.duration_ms - a.duration_ms).slice(0, 10),
        threshold_ms: SLOW_THRESHOLD_MS,
    };
}

function clearStats() {
    stats.total = 0;
    stats.totalMs = 0;
    stats.slow = 0;
    stats.history = [];
    historyIdx = 0;
}

/**
 * Instrumenta as funções dbGet, dbAll, dbRun com medição de tempo.
 * Chame UMA VEZ no boot do server.
 */
function instrument(dbGet, dbAll, dbRun) {
    // Wrap dbGet
    if (dbGet && !dbGet.__instrumented) {
        const origGet = dbGet;
        const wrappedGet = function (sql, params) {
            const start = process.hrtime.bigint();
            const result = origGet.call(this, sql, params);
            return Promise.resolve(result).then(
                r => { recordQuery(sql, Number(process.hrtime.bigint() - start) / 1e6, params); return r; },
                e => { recordQuery(sql, Number(process.hrtime.bigint() - start) / 1e6, params); throw e; }
            );
        };
        wrappedGet.__instrumented = true;
        return { dbGet: wrappedGet, dbAll, dbRun };
    }
}

/**
 * Versão alternativa: instrumenta via monkey-patch no require cache.
 * Como dbGet/dbAll/dbRun são destructured, esse approach não funciona bem.
 * Use instrument() no boot.
 */

module.exports = {
    recordQuery,
    getStats,
    clearStats,
    instrument,
    SLOW_THRESHOLD_MS,
};
