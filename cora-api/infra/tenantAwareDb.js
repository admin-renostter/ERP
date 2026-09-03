/**
 * tenantAwareDb — Wrapper automático de DB com tenant isolation
 *
 * Sprint 13.8 — Refatora queries existentes para filtrar automaticamente
 * por tenant_id SEM precisar alterar cada query individualmente.
 *
 * Como funciona:
 *   - Usa AsyncLocalStorage para rastrear o "request context" atual
 *   - Quando uma query SELECT é executada dentro de um request com tenantId,
 *     injeta automaticamente `AND tenant_id = ?` no WHERE (se ainda não tiver)
 *   - Para INSERTs, injeta o `tenant_id` se o objeto tiver o campo
 *   - Para UPDATEs, adiciona o filtro de tenant no WHERE
 *
 * Uso:
 *   const { runWithTenant, dbGetTenant, dbAllTenant, dbRunTenant } = require('./infra/tenantAwareDb');
 *
 *   router.get('/x', authMiddleware, tenantContext, async (req, res) => {
 *       // req.tenantId já foi populado pelo tenantContext middleware
 *       const result = await runWithTenant(req, async () => {
 *           // Queries aqui são automaticamente filtradas
 *           return await dbAllTenant('SELECT * FROM clientes ORDER BY nome');
 *       });
 *   });
 *
 * IMPORTANTE:
 *   - Esta abordagem é "best-effort": se o WHERE já tem tenant_id, não duplica
 *   - Para queries complexas (JOIN, subquery), o filtro pode não funcionar
 *   - Para queries que DEVEM ser cross-tenant (admin, superadmin), use
 *     `runWithoutTenant()` para bypassar
 *
 * Limitações conhecidas:
 *   - Não detecta `tenant_id` em comentários SQL
 *   - Não substitui `tenant_id = 'literal'` (considera que já tem filtro)
 *   - Detecta APENAS `FROM <tabela>` + ausência de `tenant_id` na query
 *   - Whitelist de tabelas que têm tenant_id (ver KNOWN_TENANT_TABLES)
 */

const { AsyncLocalStorage } = require('async_hooks');
const { dbGet, dbAll, dbRun } = require('../database');

// Tabelas que têm coluna tenant_id (vem da Sprint 13.5)
const KNOWN_TENANT_TABLES = new Set([
    'clientes', 'contratos', 'cobrancas', 'cobrancas_recorrentes',
    'equipamentos', 'manutencoes_preventivas', 'checklist_registros',
    'faturas', 'itens_fatura', 'leads', 'cotacoes', 'cotacao_itens',
    'chamados', 'avaliacoes', 'pending_approvals', 'inventory',
    'logs_auditoria', 'logs_notificacoes', 'webhooks_recebidos',
]);

// Tabelas globais (NÃO filtrar)
const GLOBAL_TABLES = new Set([
    'usuarios', 'tenants', 'tenant_users', 'tenant_invites',
    'bancos_referencia', 'bancos_cadastrados',
    'configuracoes_pmoc', 'checklist_pmoc', 'contract_templates',
    'configuracoes_integracao', 'tokens_integracao', 'cora_logs',
    'sqlite_master', 'sqlite_sequence',
]);

const tenantContext = new AsyncLocalStorage();

/**
 * Roda uma função dentro de um contexto de tenant.
 * O req (com tenantId, isSuperadmin) é capturado para uso pelas queries.
 */
function runWithTenant(req, fn) {
    return tenantContext.run({ req, tenantId: req?.tenantId || null, isSuperadmin: req?.isSuperadmin || false, bypass: false }, fn);
}

/**
 * Roda uma função SEM contexto de tenant (para queries cross-tenant intencionais).
 */
function runWithoutTenant(fn) {
    return tenantContext.run({ req: null, tenantId: null, isSuperadmin: true, bypass: true }, fn);
}

/**
 * Pega o contexto atual (ou null se fora de um runWithTenant).
 */
function getContext() {
    return tenantContext.getStore() || null;
}

/**
 * Injeta filtro de tenant_id em uma query SELECT, se aplicável.
 *
 * Regras:
 *   - Se `bypass` está true, retorna query inalterada
 *   - Se a query não menciona uma tabela conhecida, retorna inalterada
 *   - Se a query JÁ tem `tenant_id`, retorna inalterada
 *   - Se a query não tem WHERE, adiciona WHERE tenant_id = ?
 *   - Se a query tem WHERE, adiciona AND tenant_id = ? no final
 */
function injectTenantFilter(sql, tenantId) {
    if (!tenantId) return { sql, params: [] };
    if (!sql || typeof sql !== 'string') return { sql, params: [] };

    // Detecta tabela alvo — pega o primeiro FROM <tabela>
    const fromMatch = sql.match(/\bFROM\s+([a-zA-Z_][a-zA-Z0-9_]*)/i);
    if (!fromMatch) return { sql, params: [] };

    const table = fromMatch[1].toLowerCase();
    if (GLOBAL_TABLES.has(table)) return { sql, params: [] };
    if (!KNOWN_TENANT_TABLES.has(table)) return { sql, params: [] };

    // Se já tem tenant_id, não duplica
    if (/\btenant_id\b/i.test(sql)) return { sql, params: [] };

    // Decide onde injetar: após WHERE ou cria um WHERE
    if (/\bWHERE\b/i.test(sql)) {
        // Adiciona AND tenant_id = ? após o WHERE existente
        // IMPORTANTE: usa o alias da primeira tabela (c, ct, etc.) para evitar ambiguidade em JOINs
        const firstAlias = getFirstTableAlias(sql);
        const colRef = firstAlias ? `${firstAlias}.tenant_id` : 'tenant_id';
        const newSql = sql.replace(
            /\bWHERE\b/i,
            `WHERE ${colRef} = ? AND`
        ).replace(/AND\s\s+/, 'AND ');  // Remove double space
        return { sql: newSql, params: [tenantId] };
    } else {
        // Sem WHERE: injeta WHERE tenant_id = ? no final (antes de GROUP BY / ORDER BY / LIMIT / ; / fim)
        // Estratégia: encontrar a posição de fim do FROM clause (sem consumir o que vem depois)
        const firstAlias = getFirstTableAlias(sql);
        const colRef = firstAlias ? `${firstAlias}.tenant_id` : 'tenant_id';

        // Tenta: depois do último JOIN ON, injeta WHERE
        const joinMatch = sql.match(/\bJOIN\s+[a-zA-Z_][a-zA-Z0-9_]*(?:\s+[a-zA-Z_][a-zA-Z0-9_]*)?\s+ON\s+[^()]*?(?=\s*(GROUP|ORDER|LIMIT|;|$))/i);
        if (joinMatch) {
            const idx = joinMatch.index + joinMatch[0].length;
            const newSql = sql.substring(0, idx) + ` WHERE ${colRef} = ?` + sql.substring(idx);
            return { sql: newSql, params: [tenantId] };
        }

        // Sem JOIN: injeta WHERE depois do `FROM <tabela> [alias]` (sem consumir chars)
        const fromMatch = sql.match(/\bFROM\s+[a-zA-Z_][a-zA-Z0-9_]*/i);
        if (fromMatch) {
            let idx = fromMatch.index + fromMatch[0].length;
            const aliasMatch = sql.substring(idx).match(/^\s+([a-zA-Z_][a-zA-Z0-9_]*)\b/);
            const SQL_KEYWORDS = new Set(['WHERE', 'ORDER', 'GROUP', 'HAVING', 'LIMIT', 'UNION', 'INNER', 'LEFT', 'RIGHT', 'OUTER', 'JOIN', 'ON', 'AS', 'OFFSET']);
            if (aliasMatch && !SQL_KEYWORDS.has(aliasMatch[1].toUpperCase())) {
                idx += aliasMatch[0].length;
            }
            const newSql = sql.substring(0, idx) + ` WHERE ${colRef} = ?` + sql.substring(idx);
            return { sql: newSql, params: [tenantId] };
        }

        // Fallback: coloca no final
        return { sql: sql + ` WHERE ${colRef} = ?`, params: [tenantId] };
    }
}

/**
 * Injeta tenant_id em um objeto para INSERT.
 * Se os fields já têm tenant_id, sobrescreve.
 */
function injectTenantInObject(data, tenantId) {
    if (!tenantId || !data || typeof data !== 'object') return data;
    if (Array.isArray(data)) {
        return data.map(d => injectTenantInObject(d, tenantId));
    }
    return { ...data, tenant_id: tenantId };
}

// ════════════════════════════════════════════════════════════════
// DB wrappers — auto-inject tenant filter
// ════════════════════════════════════════════════════════════════

/**
 * SECURITY FIX V07: escape de wildcards em LIKE
 *
 * Sem escape, um user que busca `%` no campo de busca pode
 * usar `%` para match all, `_` para match um char, ou `\` para
 * bypass de escaping. Use SEMPRE em queries LIKE.
 *
 * @param {string} s - string a ser escapada
 * @returns {string} string com wildcards escapados
 */
function escapeLike(s) {
    if (s == null) return s;
    return String(s).replace(/[\\%_]/g, c => '\\' + c);
}

/**
 * Extrai o alias da primeira tabela no FROM (ou null se não tem alias).
 * Usado para qualificar `tenant_id` e evitar ambiguidade em JOINs.
 */
function getFirstTableAlias(sql) {
    const m = sql.match(/\bFROM\s+[a-zA-Z_][a-zA-Z0-9_]*(?:\s+(?:AS\s+)?([a-zA-Z_][a-zA-Z0-9_]*))?/i);
    if (!m) return null;
    const alias = m[1];
    if (!alias) return null;
    // Verifica se é SQL keyword (não alias)
    const SQL_KEYWORDS = new Set(['WHERE', 'ORDER', 'GROUP', 'HAVING', 'LIMIT', 'UNION', 'INNER', 'LEFT', 'RIGHT', 'OUTER', 'JOIN', 'ON', 'AS', 'OFFSET']);
    if (SQL_KEYWORDS.has(alias.toUpperCase())) return null;
    return alias;
}

async function dbGetTenant(sql, params = []) {
    const ctx = getContext();
    if (!ctx || ctx.bypass || !ctx.tenantId) {
        return await dbGet(sql, params);
    }
    const { sql: newSql, params: extraParams } = injectTenantFilter(sql, ctx.tenantId);
    // IMPORTANTE: extraParams vem do início do WHERE (tenant_id = ?), então prepend
    const row = await dbGet(newSql, [...extraParams, ...params]);
    // Garante que `null` é retornado quando não há row (não `undefined`)
    return row === undefined ? null : row;
}

async function dbAllTenant(sql, params = []) {
    const ctx = getContext();
    if (!ctx || ctx.bypass || !ctx.tenantId) {
        return await dbAll(sql, params);
    }
    const { sql: newSql, params: extraParams } = injectTenantFilter(sql, ctx.tenantId);
    // IMPORTANTE: extraParams vem do início do WHERE (tenant_id = ?), então prepend
    return await dbAll(newSql, [...extraParams, ...params]);
}

/**
 * dbRunTenant — para INSERT, UPDATE, DELETE.
 * Para UPDATE/DELETE: filtra WHERE por tenant.
 * Para INSERT: injeta tenant_id se possível.
 *
 * IMPORTANTE: para INSERT, passe um objeto como `data` em vez de SQL cru:
 *   await dbRunTenant('INSERT INTO clientes', { nome: 'X', ... });
 *
 * Ou passe um array de fields e params:
 *   await dbRunTenant('INSERT INTO clientes (nome, email) VALUES (?, ?)', ['João', 'j@x.com']);
 */
async function dbRunTenant(sql, paramsOrData = []) {
    const ctx = getContext();
    if (!ctx || ctx.bypass || !ctx.tenantId) {
        return await dbRun(sql, paramsOrData);
    }

    const isInsert = /^\s*INSERT\s+INTO\s+/i.test(sql);

    if (isInsert) {
        // Para INSERT, injeta tenant_id na lista de fields/values
        // Detecta: INSERT INTO <tabela> (fields) VALUES (?, ?, ...)
        const match = sql.match(/^\s*INSERT\s+INTO\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
        if (match) {
            const [, table, fields, placeholders] = match;
            const tableLower = table.toLowerCase();
            if (KNOWN_TENANT_TABLES.has(tableLower) && !GLOBAL_TABLES.has(tableLower)) {
                const fieldsList = fields.split(',').map(f => f.trim());
                // Se já tem tenant_id, não duplica
                if (!fieldsList.some(f => f.toLowerCase() === 'tenant_id')) {
                    fieldsList.push('tenant_id');
                    const newPlaceholders = placeholders.trim() + ', ?';
                    const newSql = `INSERT INTO ${table} (${fieldsList.join(', ')}) VALUES (${newPlaceholders})`;
                    const params = Array.isArray(paramsOrData) ? paramsOrData : [];
                    return await dbRun(newSql, [...params, ctx.tenantId]);
                }
            }
        }
    } else {
        // Para UPDATE/DELETE: filtra WHERE por tenant (se ainda não tem)
        const { sql: newSql, params: extraParams } = injectTenantFilter(sql, ctx.tenantId);
        const params = Array.isArray(paramsOrData) ? paramsOrData : [];
        // IMPORTANTE: extraParams vem do início do WHERE (tenant_id = ?), então prepend
        return await dbRun(newSql, [...extraParams, ...params]);
    }

    return await dbRun(sql, paramsOrData);
}

module.exports = {
    runWithTenant,
    runWithoutTenant,
    getContext,
    injectTenantFilter,
    injectTenantInObject,
    dbGetTenant,
    dbAllTenant,
    dbRunTenant,
    escapeLike,  // SECURITY FIX V07
    KNOWN_TENANT_TABLES,
    GLOBAL_TABLES,
};
