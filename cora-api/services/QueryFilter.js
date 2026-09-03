/**
 * QueryFilter — Helpers de filtragem por tenant (Sprint 13)
 *
 * Fornece utilitários para repositórios filtrarem queries por `tenant_id`
 * automaticamente, baseado no `req.tenantId` injetado pelo `tenantContext`.
 *
 * Padrão: shared DB, shared schema. Toda tabela de negócio tem `tenant_id`.
 *
 * Funções:
 *   - buildWhere(req, opts)       → adiciona `AND tenant_id = ?` à cláusula WHERE
 *   - tenantParams(req)           → [tenantId] para usar como params
 *   - stampTenant(req, row)       → injeta tenant_id em um objeto antes de INSERT
 *   - withTenantFilter(req, fn)   → wrapper que valida tenant antes de executar
 *   - assertTenantWrite(req)      → lança se não há tenant (para INSERT/UPDATE/DELETE)
 *
 * Bypass:
 *   - superadmin (`req.isSuperadmin === true`) e rotas cross-tenant podem
 *     passar `{ bypass: true }` em buildWhere/tenantParams para não filtrar.
 *   - DEFAULT_TENANT_ID (legado) também pode ser usado para "ver tudo do default"
 *     via bypass: 'default' (não recomendado, mas útil para migrations).
 *
 * Uso típico em repositório:
 *
 *   const QF = require('./QueryFilter');
 *
 *   async function listClientes(req) {
 *       const where = QF.buildWhere(req);
 *       const params = QF.tenantParams(req);
 *       return await dbAll(
 *           `SELECT * FROM clientes WHERE 1=1 ${where.sql} ORDER BY nome LIMIT 200`,
 *           [...params, 200]
 *       );
 *   }
 *
 *   async function createCliente(req, data) {
 *       QF.assertTenantWrite(req);
 *       const stamped = QF.stampTenant(req, data);
 *       return await dbRun('INSERT INTO clientes (...) VALUES (...)', [...]);
 *   }
 */

const { DEFAULT_TENANT_ID } = require('./TenantService');

/**
 * Retorna o tenantId efetivo do request, ou null.
 * - superadmin com bypass: null
 * - tenant default legado: tnt_default
 * - outros: req.tenantId
 */
function getEffectiveTenantId(req, { bypass = false } = {}) {
    if (bypass === true) return null;
    if (bypass === 'default') return DEFAULT_TENANT_ID;
    return req?.tenantId || DEFAULT_TENANT_ID;
}

/**
 * Constrói um fragmento SQL para WHERE que filtra por tenant_id.
 *
 * @param {Object} req      - request Express (deve ter req.tenantId)
 * @param {Object} opts
 * @param {string} opts.column - nome da coluna (default 'tenant_id')
 * @param {boolean|string} opts.bypass - true (sem filtro), 'default' (forçar tnt_default)
 * @param {string} opts.alias - alias da tabela para o WHERE (ex: 'c' para "c.tenant_id = ?")
 * @returns {{ sql: string, params: any[] }}
 */
function buildWhere(req, opts = {}) {
    const column = opts.column || 'tenant_id';
    const prefix = opts.alias ? `${opts.alias}.${column}` : column;
    const bypass = opts.bypass || false;
    const tenantId = getEffectiveTenantId(req, { bypass });

    if (!tenantId) {
        return { sql: '', params: [] };
    }
    return { sql: ` AND ${prefix} = ?`, params: [tenantId] };
}

/**
 * Retorna só os params de tenant (útil para queries complexas com WHERE custom).
 */
function tenantParams(req, opts = {}) {
    const bypass = opts.bypass || false;
    const tenantId = getEffectiveTenantId(req, { bypass });
    return tenantId ? [tenantId] : [];
}

/**
 * Injeta `tenant_id` em um objeto para uso em INSERT.
 * Substitui se já houver (previne cross-tenant write acidental).
 */
function stampTenant(req, data) {
    if (!data || typeof data !== 'object') return data;
    if (!req?.tenantId) {
        // Sem tenant, não escreve (a menos que explicitamente bypass)
        throw Object.assign(new Error('tenant_id ausente no request — sem contexto de tenant'), { code: 'NO_TENANT_CONTEXT' });
    }
    return { ...data, tenant_id: req.tenantId };
}

/**
 * Valida que o request tem tenant antes de permitir escrita.
 * Lança erro se não tiver.
 */
function assertTenantWrite(req) {
    if (!req?.tenantId) {
        throw Object.assign(new Error('Operação requer contexto de tenant'), { code: 'NO_TENANT_CONTEXT' });
    }
    return req.tenantId;
}

/**
 * Wrapper que valida tenant antes de executar a função.
 * Para usar em handlers críticos.
 */
async function withTenantFilter(req, fn) {
    assertTenantWrite(req);
    return await fn(req.tenantId);
}

/**
 * Helper para queries com paginação que filtra por tenant.
 *
 * @param {Object} req
 * @param {string} table - nome da tabela (sem alias)
 * @param {Object} extraWhere - { sql: 'AND ...', params: [...] } (sem incluir o AND inicial de tenant)
 * @param {Object} options
 * @returns {{ whereSql: string, params: any[] }}
 */
function buildFullWhere(req, table, extraWhere = null, options = {}) {
    const tenant = buildWhere(req, options);
    const parts = [];
    const params = [...tenant.params];
    if (extraWhere && extraWhere.sql) {
        parts.push(extraWhere.sql);
        if (extraWhere.params) params.push(...extraWhere.params);
    }
    return {
        whereSql: parts.length ? `WHERE 1=1 ${tenant.sql} ${parts.join(' ')}` : `WHERE 1=1 ${tenant.sql}`,
        params,
    };
}

module.exports = {
    buildWhere,
    tenantParams,
    stampTenant,
    assertTenantWrite,
    withTenantFilter,
    buildFullWhere,
    getEffectiveTenantId,
};
