/**
 * tenantLimits — Enforcement de plano/licença (Modelo Híbrido)
 *
 * GAP encontrado na auditoria: `tenants.status` e `tenants.data_expiracao`
 * já existiam no schema (Sprint 13) mas nada no pipeline de requests os
 * checava. Resultado prático: suspender um tenant no admin (ou uma licença
 * self-hosted vencer) não bloqueava nada — os usuários continuavam com
 * acesso total. Este middleware fecha esse gap.
 *
 * Roda DEPOIS de tenantContext (precisa de req.tenant já resolvido).
 * Rotas isentas de tenant (auth, health, webhooks) nunca chegam aqui,
 * porque tenantContext já dá next() direto para elas.
 *
 * Comportamento:
 *   - status === 'suspenso'  → 402 (Payment Required) — inadimplência SaaS
 *     ou licença self-hosted não renovada. 402 (não 403) para o frontend
 *     conseguir diferenciar "sem permissão" de "precisa regularizar".
 *   - status === 'cancelado' → 403, conta encerrada.
 *   - data_expiracao no passado → 402, mesmo tratamento de inadimplência.
 *   - superadmin sempre passa (precisa poder reativar/gerenciar).
 *   - tenant default (legado/self-hosted single-tenant sem plano definido)
 *     passa direto — não força plano em quem ainda não migrou para o
 *     catálogo de planos.
 */

const { DEFAULT_TENANT_ID } = require('../services/TenantService');

const GRACE_PERIOD_DAYS = parseInt(process.env.TENANT_EXPIRATION_GRACE_DAYS || '3', 10);

function isExpired(dataExpiracao) {
    if (!dataExpiracao) return false;
    const expira = new Date(dataExpiracao).getTime();
    if (Number.isNaN(expira)) return false;
    const graceMs = GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;
    return Date.now() > expira + graceMs;
}

function tenantLimits(req, res, next) {
    // Sem tenant resolvido (rota isenta, ou cross-tenant admin) — nada a checar aqui.
    if (!req.tenant) return next();

    // Superadmin sempre passa — precisa conseguir reativar/gerenciar tenants bloqueados.
    if (req.isSuperadmin) return next();

    const tenant = req.tenant;

    // Tenant legado/default sem plano formal: não bloqueia (compatibilidade).
    if (tenant.id === DEFAULT_TENANT_ID && !tenant.plano) {
        return next();
    }

    if (tenant.status === 'cancelado') {
        return res.status(403).json({
            success: false,
            error: 'Esta conta foi encerrada.',
            code: 'TENANT_CANCELED',
        });
    }

    if (tenant.status === 'suspenso') {
        return res.status(402).json({
            success: false,
            error: 'Conta suspensa. Regularize o pagamento (SaaS) ou a licença (self-hosted) para continuar.',
            code: 'TENANT_SUSPENDED',
        });
    }

    if (isExpired(tenant.data_expiracao)) {
        return res.status(402).json({
            success: false,
            error: 'Assinatura ou licença expirada.',
            code: 'TENANT_EXPIRED',
            data_expiracao: tenant.data_expiracao,
        });
    }

    return next();
}

module.exports = { tenantLimits, isExpired, GRACE_PERIOD_DAYS };
