/**
 * SecurityLogger — Logs estruturados de eventos de segurança
 *
 * Sprint Security Hardening 3 — V21
 *
 * PROBLEMA:
 *   - console.log/error é texto livre, difícil de auditar
 *   - Em incidentes, é preciso buscar "quem logou com IP X às 14h?"
 *   - Logs não estruturados são caros de parsear (Splunk, ELK)
 *   - Eventos críticos (login falho, token revogado, brute force) precisam
 *     ficar em local dedicado com retenção longa
 *
 * SOLUÇÃO:
 *   - Tabela `security_events` (separada de logs_auditoria, que é genérica)
 *   - Funções tipadas: loginSuccess, loginFailed, tokenRevoked, accessDenied, etc
 *   - Schema fixo: timestamp, event_type, severity, user_id, ip, user_agent, details
 *   - Severities: low, medium, high, critical
 *   - Rotação: log JSONL rotativo em disco + DB
 *
 * USO:
 *   const SecurityLogger = require('./services/SecurityLogger');
 *   await SecurityLogger.loginFailed({ email: req.body.email, ip, userAgent });
 *   await SecurityLogger.tokenRevoked({ jti, userId, reason });
 *   await SecurityLogger.accessDenied({ userId, ip, path, requiredRoles });
 */

const fs = require('fs');
const path = require('path');
const { dbRun } = require('../database');

// Tabela security_events (idempotente — criada no boot se não existir)
const CREATE_SECURITY_EVENTS_SQL = `
    CREATE TABLE IF NOT EXISTS security_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        event_type TEXT NOT NULL,
        severity TEXT NOT NULL,
        user_id TEXT,
        user_email TEXT,
        ip TEXT,
        user_agent TEXT,
        path TEXT,
        method TEXT,
        details_json TEXT
    )
`;
const CREATE_INDEXES_SQL = [
    `CREATE INDEX IF NOT EXISTS idx_se_event_type ON security_events(event_type)`,
    `CREATE INDEX IF NOT EXISTS idx_se_user_id ON security_events(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_se_ip ON security_events(ip)`,
    `CREATE INDEX IF NOT EXISTS idx_se_timestamp ON security_events(timestamp)`,
    `CREATE INDEX IF NOT EXISTS idx_se_severity ON security_events(severity)`,
];

// Inicializa tabela
let _initialized = false;
function ensureTable() {
    if (_initialized) return;
    try {
        // database.js já cria a tabela via CREATE TABLE IF NOT EXISTS no boot,
        // então só marcamos como inicializado. A função existe para compat.
        _initialized = true;
    } catch (e) {
        // Ignore — primeira chamada pode falhar, próxima sucede
    }
}

// Arquivo de log JSONL (opcional, se LOG_DIR configurado)
const LOG_DIR = process.env.SECURITY_LOG_DIR || path.join(__dirname, '..', 'logs');
let _logFile = null;
function getLogFile() {
    if (_logFile) return _logFile;
    try {
        if (!fs.existsSync(LOG_DIR)) {
            fs.mkdirSync(LOG_DIR, { recursive: true });
        }
        const date = new Date().toISOString().split('T')[0];  // YYYY-MM-DD
        _logFile = path.join(LOG_DIR, `security-${date}.jsonl`);
    } catch (e) {
        _logFile = null;
    }
    return _logFile;
}

/**
 * Registra um evento de segurança.
 * @param {Object} event
 *   @param {string} event.type         - Tipo: 'login_success', 'login_failed', etc
 *   @param {string} event.severity     - 'low' | 'medium' | 'high' | 'critical'
 *   @param {string} [event.userId]
 *   @param {string} [event.email]
 *   @param {string} [event.ip]
 *   @param {string} [event.userAgent]
 *   @param {string} [event.path]
 *   @param {string} [event.method]
 *   @param {Object} [event.details]
 */
async function log(event) {
    if (!event || !event.type) return;
    const severity = event.severity || 'low';
    const entry = {
        timestamp: new Date().toISOString(),
        type: event.type,
        severity,
        userId: event.userId || null,
        email: event.email || null,
        ip: event.ip || null,
        userAgent: event.userAgent || null,
        path: event.path || null,
        method: event.method || null,
        details: event.details || null,
    };

    // 1. Console (sempre — para debug em dev)
    if (severity === 'critical' || severity === 'high') {
        console.error(`[SECURITY:${severity.toUpperCase()}]`, JSON.stringify(entry));
    } else {
        console.log(`[SECURITY:${severity}]`, JSON.stringify(entry));
    }

    // 2. Arquivo JSONL (best-effort, não bloqueia)
    // SECURITY HARDENING 3: skip em testes para não segurar event loop
    if (process.env.NODE_ENV === 'test' || process.env.DISABLE_SECURITY_LOG_FILE === '1') {
        // skip file log
    } else {
        const logFile = getLogFile();
        if (logFile) {
            try {
                fs.appendFile(logFile, JSON.stringify(entry) + '\n', (err) => {
                    if (err) {/* ignore */}
                });
            } catch (_) { /* ignore */ }
        }
    }

    // 3. Banco de dados (async, não bloqueia)
    ensureTable();
    try {
        await dbRun(
            `INSERT INTO security_events
             (event_type, severity, user_id, user_email, ip, user_agent, path, method, details_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                entry.type,
                entry.severity,
                entry.userId,
                entry.email,
                entry.ip,
                entry.userAgent,
                entry.path,
                entry.method,
                entry.details ? JSON.stringify(entry.details) : null,
            ]
        );
    } catch (e) {
        // Falha no DB não bloqueia — log já foi escrito em console + arquivo
    }
}

// ─── Eventos pré-definidos ───

async function loginSuccess({ userId, email, ip, userAgent }) {
    return log({
        type: 'login_success',
        severity: 'low',
        userId, email, ip, userAgent,
    });
}

async function loginFailed({ email, ip, userAgent, reason }) {
    return log({
        type: 'login_failed',
        severity: 'medium',
        email, ip, userAgent,
        details: { reason },
    });
}

async function accountLocked({ userId, email, ip, until }) {
    return log({
        type: 'account_locked',
        severity: 'high',
        userId, email, ip,
        details: { until },
    });
}

async function tokenRevoked({ jti, userId, reason }) {
    return log({
        type: 'token_revoked',
        severity: 'medium',
        userId,
        details: { jti: jti?.substring(0, 8) + '...', reason },
    });
}

async function accessDenied({ userId, ip, path, method, requiredRoles, currentRole }) {
    return log({
        type: 'access_denied',
        severity: 'medium',
        userId, ip, path, method,
        details: { requiredRoles, currentRole },
    });
}

async function suspiciousActivity({ userId, ip, reason, details }) {
    return log({
        type: 'suspicious_activity',
        severity: 'high',
        userId, ip,
        details: { reason, ...details },
    });
}

async function roleChanged({ targetUserId, byUserId, oldRole, newRole }) {
    return log({
        type: 'role_changed',
        severity: 'high',
        userId: targetUserId,
        details: { byUserId, oldRole, newRole },
    });
}

async function secretRotated({ secretType, byUserId }) {
    return log({
        type: 'secret_rotated',
        severity: 'critical',
        userId: byUserId,
        details: { secretType },
    });
}

async function webhookSignatureFailed({ ip, userAgent, path }) {
    return log({
        type: 'webhook_signature_failed',
        severity: 'high',
        ip, userAgent, path,
    });
}

async function pathTraversalAttempt({ userId, ip, attemptedPath }) {
    return log({
        type: 'path_traversal_attempt',
        severity: 'high',
        userId, ip,
        details: { attemptedPath },
    });
}

async function mimeValidationFailed({ userId, ip, claimed, detected }) {
    return log({
        type: 'mime_validation_failed',
        severity: 'medium',
        userId, ip,
        details: { claimed, detected },
    });
}

module.exports = {
    log,
    loginSuccess,
    loginFailed,
    accountLocked,
    tokenRevoked,
    accessDenied,
    suspiciousActivity,
    roleChanged,
    secretRotated,
    webhookSignatureFailed,
    pathTraversalAttempt,
    mimeValidationFailed,
    ensureTable,
};
