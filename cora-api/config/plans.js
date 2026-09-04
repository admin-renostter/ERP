/**
 * Catálogo de planos — Modelo Híbrido (SaaS + Self-Hosted)
 *
 * Fonte única de verdade para limites e features por plano. Antes desta
 * versão, o campo `tenants.plano` (trial|starter|pro|enterprise) só era
 * armazenado — nenhum lugar do código definia o que cada plano realmente
 * significa em limites/features. Este arquivo formaliza isso.
 *
 * Dois canais de venda usam o MESMO catálogo:
 *   - SaaS multi-tenant: enforcement aqui é ligado à cobrança (Stripe) —
 *     inadimplência → status='suspenso' → bloqueado por tenantLimits.js
 *   - Self-hosted licenciado: o cliente roda a própria instância; o tenant
 *     "enterprise" único dele tem `data_expiracao` = validade da licença.
 *     Renovar a licença = estender `data_expiracao` (ver TODO de licenciamento
 *     no rodapé deste arquivo).
 *
 * TODO (decisão de negócio, não técnica): preencher `price.monthly_brl`
 * quando o pricing for definido. Deixado null de propósito — não inventar
 * preço no código.
 */

const PLANS = {
    trial: {
        label: 'Trial',
        channel: 'saas',
        price: { monthly_brl: 0, billing: null },
        limits: {
            usuarios: 3,
            contratos: 15,
            armazenamento_mb: 250,
        },
        features: {
            whatsapp_real: false,
            ia_assistant: false,   // Sprint 6 (MCP/RAG) — desligado no trial
            mcp_export: false,
            api_access: false,
            self_signup: true,
        },
        trialDurationDays: 14,
    },

    starter: {
        label: 'Starter',
        channel: 'saas',
        price: { monthly_brl: null /* TODO: definir */, billing: 'stripe_subscription' },
        limits: {
            usuarios: 5,
            contratos: 50,
            armazenamento_mb: 1024,
        },
        features: {
            whatsapp_real: true,
            ia_assistant: false,
            mcp_export: false,
            api_access: false,
            self_signup: true,
        },
    },

    pro: {
        label: 'Pro',
        channel: 'saas',
        price: { monthly_brl: null /* TODO: definir */, billing: 'stripe_subscription' },
        limits: {
            usuarios: 20,
            contratos: 300,
            armazenamento_mb: 5120,
        },
        features: {
            whatsapp_real: true,
            ia_assistant: true,    // add-on de IA vendável (ver Blueprint, seção IA-first)
            mcp_export: false,
            api_access: true,
            self_signup: true,
        },
    },

    enterprise: {
        label: 'Enterprise',
        channel: 'both', // SaaS dedicado OU self-hosted licenciado
        price: { monthly_brl: null /* TODO: sob consulta */, billing: 'manual_invoice_or_license' },
        limits: {
            usuarios: null,        // null = sem limite
            contratos: null,
            armazenamento_mb: null,
        },
        features: {
            whatsapp_real: true,
            ia_assistant: true,
            mcp_export: true,      // cliente conecta o próprio agente de IA ao ERP dele
            api_access: true,
            self_signup: false,    // provisionamento manual/venda assistida
        },
    },
};

const VALID_PLAN_KEYS = Object.keys(PLANS);

function getPlan(planoKey) {
    return PLANS[planoKey] || null;
}

function getLimit(tenant, limitKey) {
    const plan = getPlan(tenant?.plano);
    if (!plan) return null;
    const explicit = tenant?.[`limite_${limitKey}`];
    // limite explícito no registro do tenant (setado manualmente) tem prioridade
    // sobre o default do plano — permite exceções comerciais pontuais.
    if (explicit !== undefined && explicit !== null) return explicit;
    return plan.limits[limitKey] ?? null;
}

function hasFeature(tenant, featureKey) {
    const plan = getPlan(tenant?.plano);
    if (!plan) return false;
    return Boolean(plan.features[featureKey]);
}

module.exports = { PLANS, VALID_PLAN_KEYS, getPlan, getLimit, hasFeature };

/**
 * TODO — Licenciamento self-hosted (não implementado ainda):
 *   Hoje `data_expiracao` é só uma data no banco. Para o canal self-hosted
 *   funcionar como licença de verdade (não apenas "confiar no cliente"),
 *   falta um mecanismo de ativação assinado — ex: uma chave de licença (JWT
 *   assinado com uma chave privada nossa) que o servidor valida no boot via
 *   envValidator.js, além do check de data_expiracao em runtime que o
 *   middleware tenantLimits.js já cobre. Ver Blueprint (artifact), seção
 *   "Modelo Híbrido" para o desenho completo.
 */
