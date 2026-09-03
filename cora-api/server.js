/**
 * Renostter CRM — Middleware de Cobrança
 * 
 * Arquitetura: Express → CobrancaManager → CoraGateway → API Cora (mTLS)
 * 
 * Endpoints:
 *   GET  /health                          → Health check
 * 
 *   POST /api/cobrancas/emitir            → Emitir cobrança (boleto/pix)
 *   GET  /api/cobrancas                   → Listar cobranças (filtros: clientId, status)
 *   GET  /api/cobrancas/kpis              → KPIs financeiros
 *   GET  /api/cobrancas/:id               → Detalhe de uma cobrança
 *   GET  /api/cobrancas/contrato/:cid     → Cobranças de um contrato
 *   DELETE /api/cobrancas/:id             → Cancelar cobrança
 * 
 *   GET  /api/cobrancas/extrato           → Saldo e extrato bancário
 *   POST /api/cobrancas/notificacoes      → Ativar notificações
 *   GET  /api/cobrancas/notificacoes/:id  → Status de entrega
 * 
 *   POST /api/cobrancas/webhook           → Receber webhooks do gateway
 *   GET  /api/cobrancas/sync              → Sincronizar frontend
 * 
 *   POST /api/cobrancas/recorrencia       → Cadastrar recorrência
 *   GET  /api/cobrancas/recorrencia       → Listar recorrências
 *   DELETE /api/cobrancas/recorrencia/:id → Desativar recorrência
 * 
 *   GET  /api/cobrancas/logs              → Logs HTTP
 *   GET  /api/cobrancas/auditoria         → Logs de auditoria
 * 
 *   ── Compat: Endpoints antigos (mantidos para frontend existente) ──
 *   POST /api/cora/boleto                 → Alias → /api/cobrancas/emitir
 *   GET  /api/cora/extrato               → Alias → /api/cobrancas/extrato
 *   POST /api/cora/notificacoes          → Alias
 *   GET  /api/cora/notificacoes/:id      → Alias
 *   POST /api/cora/webhook/receber       → Alias → /api/cobrancas/webhook
 *   GET  /api/cora/sync                  → Alias
 *   POST /api/cora/recorrencia           → Alias
 *   GET  /api/cora/recorrencia           → Alias
 *   DELETE /api/cora/recorrencia/:id     → Alias
 *   GET  /api/cora/logs                  → Alias
 *   GET  /api/cora/boletos               → Alias → /api/cobrancas
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cron = require('node-cron');
const path = require('path');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

// Hotfix Camada 1 — C8: validar env vars antes de qualquer operação
const { validateEnv } = require('./envValidator');
const envConfig = validateEnv();

// Sprint 0 — middleware de autenticação JWT + helpers
const { authMiddleware, requireRole } = require('./middleware/authJWT');
const authRouter = require('./routes/auth');

// Sprint Security Hardening 2 — V09: JWT blacklist (revogação de tokens)
const JWTBlacklist = require('./services/JWTBlacklistService');

// Sprint 13 — middleware de tenant context (multi-tenant SaaS)
const { tenantContext, requireTenantRole } = require('./middleware/tenantContext');
const tenantsRouter = require('./routes/tenants');

// Sprint 4 — infra (Redis, health)
const { connectRedis, disconnectRedis } = require('./infra/redis');
// Sprint 18 — Performance & Cache (precisa vir antes do uso)
const { compression, etag, requestTiming } = require('./infra/performance');
const healthRouter = require('./routes/health');
const uploadsRouter = require('./routes/uploads');

// Sprint 6 — MCP (Model Context Protocol) + OpenClaw
const mcpRouter = require('./routes/mcp');

// Sprint 8 — Automação de Contratos (Email + Assinatura Digital)
const contractsAutomationRouter = require('./routes/contracts-automation');
const signatureWebhookRouter = require('./routes/webhooks-signature');

// Sprint 9 — Lembretes automáticos (WhatsApp + E-mail)
const remindersRouter = require('./routes/reminders');
const dailyRemindersCron = require('./jobs/dailyReminders');

// Sprint 11 — Templates de contrato customizados
const contractTemplatesRouter = require('./routes/contract-templates');

const CoraGateway = require('./gateways/CoraGateway');
const ItauGateway = require('./gateways/ItauGateway');
const CobrancaManager = require('./CobrancaManager');
const { ChamadoManager, STATUS: CHAMADO_STATUS } = require('./ChamadoManager');
const { PmocManager } = require('./PmocManager');
const { ContratoManager } = require('./ContratoManager');
const leadManager = require('./LeadManager');
const cotacaoManager = require('./CotacaoManager');
const { dbAll, dbGet, dbRun } = require('./database');
const pmocManager = new PmocManager();
const contratoManager = new ContratoManager();
const { encrypt, decrypt } = require('./crypto');
const { syncBanks } = require('./sync_banks');
const { verifyWebhookSignature } = require('./middleware/webhookSignature');
const RateLimiter = require('./middleware/rateLimiter');
const approvalsRouter = require('./routes/approvals');

/**
 * Factory for Payment Gateways
 * Now pulls configuration dynamically from 'bancos_cadastrados'
 */
// Cache de gateway em memória — evita SELECT no banco a cada request.
// TTL 5 min é suficiente porque a config do banco muda raramente.
const _gatewayCache = new Map(); // key: provider → { gw, ts }
const GATEWAY_CACHE_TTL = 5 * 60 * 1000;

async function getGateway(provider = null) {
    const cacheKey = provider || '__primary__';
    const cached = _gatewayCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < GATEWAY_CACHE_TTL) {
        return cached.gw;
    }
    if (provider === 'mock') {
        const gw = new CoraGateway({ forceMock: true });
        _gatewayCache.set(cacheKey, { gw, ts: Date.now() });
        return gw;
    }

    try {
        let config;
        
        if (provider) {
            // Buscar configuração específica por nome (ex: 'cora')
            config = await dbGet(`
                SELECT b.*, r.nome_reduzido as ref_nome
                FROM bancos_cadastrados b
                LEFT JOIN bancos_referencia r ON b.banco_referencia_id = r.id
                WHERE (LOWER(b.nome_exibicao) LIKE ? OR LOWER(r.nome_reduzido) = LOWER(?)) 
                AND b.ativo = 1
                LIMIT 1
            `, [`%${provider}%`, provider]);
        } else {
            // Pegar o banco principal (Default)
            config = await dbGet(`
                SELECT b.*, r.nome_reduzido as ref_nome
                FROM bancos_cadastrados b
                LEFT JOIN bancos_referencia r ON b.banco_referencia_id = r.id
                WHERE b.is_primary = 1 AND b.ativo = 1
                LIMIT 1
            `);
        }

        if (!config) {
            // Fallback para .env (apenas se for Cora e nada estiver no banco)
            if (provider === 'cora' || !provider) {
                console.warn(`[Gateway] Nenhuma configuração ativa. Usando .env como fallback.`);
                return new CoraGateway({
                    clientId: process.env.CORA_CLIENT_ID,
                    certPath: path.resolve(__dirname, process.env.CORA_CERT_PATH || 'certs/certificate.pem'),
                    keyPath: path.resolve(__dirname, process.env.CORA_KEY_PATH || 'certs/private-key.key'),
                    isStage: process.env.NODE_ENV !== 'production'
                });
            }
            throw new Error(`Configuração não encontrada para ${provider || 'Banco Principal'}`);
        }

        const clientSecret = config.client_secret_encrypted ? decrypt(config.client_secret_encrypted) : null;
        const bankName = (config.ref_nome || config.nome_exibicao || '').toLowerCase();

        if (bankName.includes('cora')) {
            return new CoraGateway({
                clientId: config.client_id,
                clientSecret: clientSecret,
                certPath: config.cert_path
                    ? (path.isAbsolute(config.cert_path)
                        ? config.cert_path
                        : path.resolve(__dirname, config.cert_path))
                    : path.resolve(__dirname, 'certificate.pem'),
                keyPath: config.key_path
                    ? (path.isAbsolute(config.key_path)
                        ? config.key_path
                        : path.resolve(__dirname, config.key_path))
                    : path.resolve(__dirname, 'private-key.key'),
                // [FIX] Passa o environment correto (production/stage) para o
                // gateway selecionar a URL base certa. Antes caía no default
                // 'stage' e batia em matls-clients.api.stage.cora.com.br.
                env: (config.ambiente || 'stage').toLowerCase()
            });
        }
        
        if (bankName.includes('itau')) {
            const ItauGateway = require('./gateways/ItauGateway');
            return new ItauGateway({
                clientId: config.client_id,
                clientSecret: clientSecret,
                ambiente: config.ambiente
            });
        }

        throw new Error(`Gateway para ${bankName} não suportado para operação automática ainda.`);

    } catch (e) {
        console.error(`[Gateway Factory] Erro ao criar gateway:`, e.message);
        throw e;
    }
}

// ── Inicializar Manager (sem gateway fixo) ──
const manager = new CobrancaManager();

const app = express();

// 1. Security Headers (Helmet + CSP) — Hotfix Camada 1 (C2)
//    CSP está calibrado para o frontend atual do CRM (HTML estático servido
//    por http-server, Chart.js via jsDelivr). Ajuste conforme necessário.
const cspDirectives = {
    defaultSrc: ["'self'"],
    scriptSrc: [
        "'self'",
        // Chart.js via CDN (admin/cobrancas.html)
        "https://cdn.jsdelivr.net",
        // SECURITY HARDENING 3 — V23: nonce-based CSP ao invés de unsafe-inline
        // (CSP calculado dinamicamente em middleware abaixo com nonce único por request)
        // Mantém unsafe-inline apenas em dev como fallback
        ...(process.env.NODE_ENV === 'production' ? [] : ["'unsafe-inline'"]),
    ],
    styleSrc: [
        "'self'",
        "'unsafe-inline'",  // mantido por causa de style="" inline
        "https://fonts.googleapis.com"
    ],
    imgSrc: ["'self'", "data:", "https:"],
    connectSrc: [
        "'self'",
        // SECURITY FIX V05: remove '*' do CSP — usa apenas origens específicas
        ...(envConfig.corsOrigin && envConfig.corsOrigin !== '*'
            ? envConfig.corsOrigin.split(',').map(o => o.trim()).filter(Boolean)
            : []),
        "https://api.cora.com.br",
        "https://api.brasilapi.com.br",
        "https://fonts.gstatic.com"
    ],
    fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
    objectSrc: ["'none'"],
    mediaSrc: ["'self'"],
    frameSrc: ["'none'"],
    frameAncestors: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"]
};

app.use(helmet({
    contentSecurityPolicy: {
        useDefaults: false,
        directives: cspDirectives
    },
    hsts: envConfig.isProd ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
    crossOriginEmbedderPolicy: false,  // necessário para iframes/embeds externos (ex: vídeos)
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

// 2. Audit Middleware (Sprint 0 — captura IP; user/role agora vêm do JWT)
app.use((req, res, next) => {
    req.auditInfo = {
        ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
        // userId/role/userName serão populados pelo authMiddleware (próximo)
        userId: 'pending',
        userName: '',
        role: 'pending'
    };
    next();
});

// 2.5 UI estática (/crm/admin/...) — servida ANTES do authMiddleware
//     porque o frontend faz fetch relativo para /api/... e o navegador
//     precisa carregar o HTML/JS/CSS sem exigir Authorization.
app.use('/crm', express.static(path.resolve(__dirname, '..')));

// 3. Auth Middleware (Sprint 0 — JWT real, substitui leitura de headers)
//    Modos: AUTH_MODE=dual (transição), jwt (padrão prod), legacy (dev only)
//    Rotas públicas (/health, /api/auth/login, /api/auth/refresh) passam direto.
//    Rotas com auth customizada (webhooks) passam — têm verificação própria (HMAC).
app.use(authMiddleware);
// SECURITY HARDENING 2 — V09: rejeita tokens revogados (blacklist)
app.use(JWTBlacklist.checkRevokedToken);

// 3.05 Tenant Context (Sprint 13 — multi-tenant)
//      Resolve req.tenantId / req.tenant / req.tenantRole para cada request
//      autenticado. Rotas isentas (auth, health, webhooks, /api/tenants CRUD)
//      passam direto.
app.use(tenantContext);

// 3.1 Authorization helper (mantido para compatibilidade com código existente)
//     Agora delega ao req.auditInfo.role (que veio do JWT).
const authorize = (roles = []) => (req, res, next) => {
    if (roles.length && !roles.includes(req.auditInfo?.role)) {
        // superadmin sempre passa
        if (req.auditInfo?.role === 'superadmin') return next();
        return res.status(403).json({
            success: false,
            error: 'Acesso negado: Permissão insuficiente para esta operação.'
        });
    }
    next();
};

// 2. CORS — Hotfix Camada 1 (C3)
//    Lista branca de origens via env CRM_FRONTEND_URL (separadas por vírgula).
//    Em desenvolvimento, inclui localhost e 127.0.0.1 explicitamente.
//    SECURITY FIX V05: '*' PROIBIDO mesmo em dev (causa "ACAO" abuse).
const allowedOrigins = (process.env.CRM_FRONTEND_URL || 'http://localhost:8080,http://127.0.0.1:8080')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean)
    .filter(o => o !== '*');  // V05: rejeita '*' sempre

if (allowedOrigins.length === 0) {
    throw new Error('[FATAL] CRM_FRONTEND_URL não configurado ou contém apenas "*". Configure origens específicas.');
}

app.use(cors({
    origin: (origin, callback) => {
        // Permite requests SEM header Origin (curl, Postman, Node http,
        // webhooks). Esses não são browser requests e não representam risco CORS.
        // Também aceita origin 'null' (alguns proxies/setups).
        if (!origin || origin === 'null') return callback(null, true);
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error(`Origem não permitida pelo CORS: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Cora-Signature', 'X-Idempotency-Key', 'X-User-Id', 'X-User-Name', 'X-User-Role']
}));

// 3. JSON body com captura do raw body para verificação de assinatura HMAC (C9)
app.use(express.json({
    limit: '1mb',
    verify: (req, res, buf) => {
        req.rawBody = buf.toString('utf8');
    }
}));

// [RESILIÊNCIA] Request timeout — gateway Cora pode travar em produção.
// 30s é o limite confortável para operações normais (emissão, listagem).
app.use((req, res, next) => {
    res.setTimeout(30_000, () => {
        if (!res.headersSent) {
            console.warn(`[Timeout] ${req.method} ${req.path} após 30s`);
            res.status(504).json({
                success: false,
                error: 'Timeout: gateway não respondeu a tempo',
                code: 'GATEWAY_TIMEOUT'
            });
        }
    });
    next();
});

// 4. Rate limiting — protege contra abuso sem dependência externa.
//    Webhooks do Cora têm IP fixo confiável, então são isentos.
const generalLimiter = new RateLimiter({ windowMs: 60_000, max: 200 });
const webhookLimiter = new RateLimiter({ windowMs: 60_000, max: 500 });  // Cora pode ter bursts
app.use('/api/cobrancas/webhook', webhookLimiter.middleware());
app.use('/api/webhooks/cora', webhookLimiter.middleware());
app.use('/health', new RateLimiter({ windowMs: 60_000, max: 60 }).middleware());  // SECURITY FIX V13: rate limit no /health

// ═══════════════════════════════════════════════════════════════
// Sprint 18 — Performance & Cache middlewares (ANTES das rotas)
// ═══════════════════════════════════════════════════════════════
// Compressão gzip (60-80% economia de banda)
app.use(compression({ threshold: 1024, level: 6 }));
// ETag para 304 Not Modified
app.use(etag());
// Log de latência por endpoint
app.use(requestTiming({ slowThresholdMs: 500, logAll: false }));

// ── Router: Approvals (fluxo de aprovação financeira) ──
app.use('/api/approvals', approvalsRouter);

// ── Router: Auth (Sprint 0 — login, refresh, me, logout) ──
app.use('/api/auth', authRouter);

// ── Health checks (Sprint 4 — liveness/readiness para K8s) ──
app.use('/health', healthRouter);

// ── Uploads (Sprint 4 — presigned URLs para S3) ──
app.use('/api/uploads', uploadsRouter);

// ── Financeiro (Sprint 19 — 9 módulos baseados nas planilhas Cora) ──
const financeiroRouter = require('./routes/financeiro');
app.use('/api/financeiro', financeiroRouter);

// ── Contratos (Sprint 20 — UI + Pop-up Novo Contrato) ──
const contratosRouter = require('./routes/contratos');
app.use('/api/contratos', contratosRouter);

// ── MCP (Sprint 6 — endpoint HTTP para OpenClaw + LLM tools) ──
app.use('/mcp', mcpRouter);

// ── Automação de Contratos (Sprint 8 — Email + Assinatura) ──
app.use('/api/contracts', contractsAutomationRouter);
// Webhook de assinatura fica em /api/webhooks (separado do /api/contracts/*)
app.use('/api/webhooks', signatureWebhookRouter);

// ── Lembretes automáticos (Sprint 9 — WhatsApp + Cron) ──
app.use('/api/reminders', remindersRouter);

// ── Templates de Contrato (Sprint 11 — UI Admin) ──
app.use('/api/contract-templates', contractTemplatesRouter);

// ── Webhook Autentique (Sprint 21 — assinatura digital) ──
const autentiqueWebhookRouter = require('./routes/autentique-webhook');
app.use('/api/webhooks/autentique', autentiqueWebhookRouter);

// ── Tenants (Sprint 13 — multi-tenant SaaS admin) ──
app.use('/api/tenants', tenantsRouter);

// ── BI / Analytics (Sprint 14 — BI avançado com cubos OLAP) ──
const biRouter = require('./routes/bi');
app.use('/api/bi', biRouter);

// ── Portal do Cliente (Sprint 15 — self-service) ──
const portalRouter = require('./routes/portal');
app.use('/api/portal', portalRouter);

// ── Mobile API (Sprint 16 — técnicos em campo) ──
const mobileRouter = require('./routes/mobile');
app.use('/api/mobile', mobileRouter);

// ── LGPD / Compliance (Sprint 17) ──
const lgpdRouter = require('./routes/lgpd');
app.use('/api/lgpd', lgpdRouter);

// ═══════════════════════════════════════════════════════════════
// Sprint 18 — Performance & Cache (middlewares movidos para ANTES das rotas)
// ═══════════════════════════════════════════════════════════════

const PORT = process.env.PORT || 3000;

// Sprint 4 — Conecta no Redis (best-effort; falha não bloqueia dev)
connectRedis().then(() => {
    console.log('[Boot] Redis init: ' + (require('./infra/redis').isRedisAvailable() ? 'conectado' : 'não disponível'));
}).catch(e => {
    console.warn('[Boot] Redis init falhou (continuando):', e.message);
});

// Graceful shutdown
async function gracefulShutdown(signal) {
    console.log(`\n[${signal}] Encerrando gracefully...`);
    try {
        dailyRemindersCron.stop();
        console.log('[Shutdown] ✓ Cron de lembretes parado');
    } catch (_) {}
    try {
        await disconnectRedis();
        console.log('[Shutdown] ✓ Redis desconectado');
    } catch (e) {
        console.warn('[Shutdown] Erro ao desconectar Redis:', e.message);
    }
    process.exit(0);
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

// Sprint 9 — Inicia cron de lembretes diários
dailyRemindersCron.start();

// ═══════════════════════════════════════════
// ENDPOINTS NOVOS (/api/cobrancas/*)
// ═══════════════════════════════════════════

// ── Health ──
// (Movido para routes/health.js — Sprint 4. Suporta /health, /health/live, /health/ready)

// ═══════════════════════════════════════════
// MÓDULO DE FATURAS (Fase 7)
// ═══════════════════════════════════════════

// SECURITY HARDENING 2 — V02: rotas financeiras restritas a admin/financeiro/superadmin
app.post('/api/faturas', requireRole('admin', 'superadmin', 'financeiro', 'tech'), async (req, res) => {
    try {
        const { chamadoId, clienteId, itens, userId } = req.body;
        if (!chamadoId || !clienteId || !itens || !itens.length) {
            return res.status(400).json({ success: false, error: 'Dados incompletos para gerar fatura' });
        }
        const result = await manager.criarFatura({ chamadoId, clienteId, itens, emitidoPor: userId }, req.auditInfo);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/faturas', requireRole('admin', 'superadmin', 'financeiro', 'tech'), async (req, res) => {
    try {
        const { clienteId, status, page, size } = req.query;
        const pSize = parseInt(size) || 50;
        const pPage = parseInt(page) || 0;
        const data = await manager.listarFaturas({ clienteId, status, limit: pSize, offset: pPage * pSize });
        res.json({ success: true, data, page: pPage, size: pSize });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/faturas/:id', requireRole('admin', 'superadmin', 'financeiro', 'tech'), async (req, res) => {
    try {
        const fat = await manager.buscarFatura(req.params.id);
        if (!fat) return res.status(404).json({ success: false, error: 'Fatura não encontrada' });
        res.json({ success: true, data: fat });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.patch('/api/faturas/:id/aprovar', requireRole('admin', 'superadmin', 'financeiro'), async (req, res) => {
    try {
        const { userId } = req.body;
        const gw = await getGateway('cora');
        const result = await manager.aprovarFatura(gw, req.params.id, userId, req.auditInfo);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.patch('/api/faturas/:id/reprovar', requireRole('admin', 'superadmin', 'financeiro'), async (req, res) => {
    try {
        const { justificativa, userId } = req.body;
        if (!justificativa) return res.status(400).json({ success: false, error: 'Justificativa é obrigatória para reprovar' });
        const result = await manager.reprovarFatura(req.params.id, justificativa, userId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ── Emitir Cobrança ──
// SECURITY HARDENING 2 — V02: emissão restrita a admin/financeiro/superadmin
app.post('/api/cobrancas/emitir', requireRole('admin', 'superadmin', 'financeiro'), async (req, res) => {
    try {
        const { provider = 'cora' } = req.body;
        const gw = await getGateway(provider);
        const result = await manager.emitirCobranca(gw, req.body, req.auditInfo);
        res.json(result);
    } catch (error) {
        // Requisito 5: Retornar erro estruturado para o CRM
        const status = error.status || 500;
        res.status(status).json({
            success: false,
            error: error.message,
            code: error.code || 'INTERNAL_ERROR',
            errors: error.errors || []
        });
    }
});

// ── Listar Cobranças (Requisito 4: page/size) ──
// SECURITY HARDENING 2 — V02: listagem restrita (admin/financeiro/tech)
app.get('/api/cobrancas', requireRole('admin', 'superadmin', 'financeiro', 'tech'), async (req, res) => {
    try {
        const { clientId, status, page, size, limit, offset } = req.query;
        
        // Conversão Page/Size -> Limit/Offset
        const pSize = parseInt(size) || parseInt(limit) || 50;
        const pPage = parseInt(page) || 0;
        const pOffset = offset !== undefined ? parseInt(offset) : (pPage * pSize);

        const data = await manager.listarCobrancas({ 
            clientId, 
            status, 
            limit: pSize, 
            offset: pOffset 
        });
        res.json({ success: true, data, page: pPage, size: pSize });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ── Estatísticas para Gráficos ──
// SECURITY HARDENING 2 — V02
app.get('/api/cobrancas/stats', requireRole('admin', 'superadmin', 'financeiro', 'tech'), async (req, res) => {
    try {
        // Volume por mês (últimos 6 meses)
        const volumeMensal = await dbAll(`
            SELECT strftime('%Y-%m', data_vencimento) as mes, 
                   SUM(valor) as total,
                   COUNT(*) as qtd
            FROM cobrancas 
            WHERE data_vencimento >= date('now', '-6 months')
            GROUP BY mes ORDER BY mes ASC
        `);

        // Distribuição por Status
        const statusDist = await dbAll(`
            SELECT status, COUNT(*) as qtd, SUM(valor) as total
            FROM cobrancas GROUP BY status
        `);

        // Volume por Provedor
        const providerDist = await dbAll(`
            SELECT gateway_provider, COUNT(*) as qtd, SUM(valor) as total
            FROM cobrancas GROUP BY gateway_provider
        `);

        res.json({ success: true, data: { volumeMensal, statusDist, providerDist } });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── Relatórios ──
// SECURITY HARDENING 2 — V02
app.get('/api/cobrancas/aging', requireRole('admin', 'superadmin', 'financeiro', 'tech'), async (req, res) => {
    try {
        const report = await manager.getAgingReport();
        res.json({ success: true, data: report });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/cobrancas/summary', requireRole('admin', 'superadmin', 'financeiro', 'tech'), async (req, res) => {
    try {
        const summary = await manager.getExecutiveSummary();
        res.json({ success: true, data: summary });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
app.get('/api/cobrancas/kpis', requireRole('admin', 'superadmin', 'financeiro', 'tech'), async (req, res) => {
    try {
        const kpis = await manager.getKPIs();
        res.json({ success: true, data: kpis });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/cobrancas/:id/reprint', requireRole('admin', 'superadmin', 'financeiro'), async (req, res) => {
    try {
        const cobranca = await manager.getCobranca(req.params.id);
        if (!cobranca) return res.status(404).json({ success: false, error: 'Cobrança não encontrada' });
        res.json({ success: true, data: { 
            pdf_url: cobranca.pdf_url, 
            linha_digitavel: cobranca.linha_digitavel,
            status: cobranca.status 
        } });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── Cancelar ──
// SECURITY HARDENING 2 — V02
app.delete('/api/cobrancas/:id', requireRole('admin', 'superadmin'), async (req, res) => {
    try {
        const { id } = req.params;
        const { userId } = req.body;
        const cob = await manager.buscarCobranca(id);
        if (!cob) return res.json({ success: false, error: 'Não encontrado' });
        
        const gw = await getGateway(cob.gateway_provider || 'cora');
        const result = await manager.cancelarCobranca(gw, id, userId, req.auditInfo);
        res.json(result);
    } catch (e) { res.json({ success: false, error: e.message }); }
});

// ── Extrato ──
// SECURITY HARDENING 2 — V02
app.get('/api/cobrancas/extrato', requireRole('admin', 'superadmin', 'financeiro'), async (req, res) => {
    try {
        const { provider = 'cora' } = req.query;
        const gw = await getGateway(provider);
        const data = await manager.getExtrato(gw);
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ── Banking (Cora) — Saldo e Dados da Conta ──
// GET /api/cora/balance → Saldo em conta (third-party/account/balance)
// SECURITY HARDENING 2 — V02: dados bancários restritos a admin/financeiro
app.get('/api/cora/balance', requireRole('admin', 'superadmin', 'financeiro'), async (req, res) => {
    try {
        const { provider = 'cora' } = req.query;
        const gw = await getGateway(provider);
        const data = await gw.getBalance();
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/cora/account → Dados da conta (third-party/account/)
app.get('/api/cora/account', requireRole('admin', 'superadmin', 'financeiro'), async (req, res) => {
    try {
        const { provider = 'cora' } = req.query;
        const gw = await getGateway(provider);
        const data = await gw.getAccountInfo();
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/cora/statement → Extrato com filtros (bank-statement/statement)
app.get('/api/cora/statement', requireRole('admin', 'superadmin', 'financeiro'), async (req, res) => {
    try {
        const { provider = 'cora', start_date, end_date, page, size } = req.query;
        const gw = await getGateway(provider);
        const data = await gw.getStatement({
            startDate: start_date,
            endDate: end_date,
            page: parseInt(page) || 0,
            size: parseInt(size) || 50
        });
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ── Notificações ──
// SECURITY HARDENING 2 — V02
app.post('/api/cobrancas/notificacoes', requireRole('admin', 'superadmin', 'financeiro', 'tech'), async (req, res) => {
    try {
        const { invoiceId, cobrancaId, send_sms, send_whatsapp, send_email, provider } = req.body;
        const id = cobrancaId || invoiceId;
        if (!id) return res.status(400).json({ success: false, error: 'invoiceId ou cobrancaId obrigatório' });

        const gw = await getGateway(provider || 'cora');
        const result = await manager.ativarNotificacoes(gw, id, {
            sms: send_sms !== undefined ? send_sms : true,
            whatsapp: send_whatsapp !== undefined ? send_whatsapp : true,
            email: send_email !== undefined ? send_email : true
        });
        res.json(result);
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.get('/api/cobrancas/notificacoes/:id', requireRole('admin', 'superadmin', 'financeiro', 'tech'), async (req, res) => {
    try {
        const { provider = 'cora' } = req.query;
        const gw = await getGateway(provider);
        const data = await manager.statusNotificacoes(gw, req.params.id);
        res.json({ success: true, data });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ── Webhook ──
// Hotfix Camada 1 (C9): exige assinatura HMAC válida em produção.
// Em dev, comportamento controlado por WEBHOOK_SIGNATURE_BYPASS=true (uso de testes E2E).
app.post('/api/cobrancas/webhook', verifyWebhookSignature(), async (req, res) => {
    try {
        const { provider = 'cora' } = req.query; // Webhook URL deve incluir ?provider=itau etc
        const gw = await getGateway(provider);
        const result = await manager.processarWebhook(gw, req.body);
        res.status(200).json(result);
    } catch (error) {
        console.error('[Webhook] Erro:', error.message);
        res.status(200).json({ received: true, error: error.message });
    }
});

// ── Sync (frontend) ──
// SECURITY HARDENING 2 — V02
app.get('/api/cobrancas/sync', requireRole('admin', 'superadmin', 'financeiro', 'tech'), async (req, res) => {
    try {
        // [PERF] Sync paginado — antes retornava TODAS as cobranças num único payload
        // (degrada para 50ms+ com 1000 cobranças e trava memória do navegador).
        // Agora aceita ?limit (default 100, max 500) e ?since (updated_at ISO).
        const limit = Math.min(parseInt(req.query.limit) || 100, 500);
        const since = req.query.since || null;
        const params = [];
        let where = '';
        if (since) { where = 'WHERE updated_at > ?'; params.push(since); }
        params.push(limit);
        const rows = await dbAll(
            `SELECT id as cobranca_id, contract_id, client_id, gateway_charge_id, gateway_invoice_id,
                    status, barcode, linha_digitavel, pix_qrcode, pdf_url, valor, data_vencimento,
                    data_pagamento, mock, updated_at
             FROM cobrancas ${where}
             ORDER BY updated_at DESC LIMIT ?`,
            params
        );
        res.json({ success: true, data: rows, count: rows.length, hasMore: rows.length === limit });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ── Recorrência ──
// SECURITY HARDENING 2 — V02
app.post('/api/cobrancas/recorrencia', requireRole('admin', 'superadmin', 'financeiro'), async (req, res) => {
    try {
        const { contractId, clientId, value, frequency, nextDueDate, customerPayload, services, provider = 'cora' } = req.body;
        if (!contractId || !clientId || !value || !nextDueDate) {
            return res.status(400).json({ success: false, error: 'Campos obrigatórios: contractId, clientId, value, nextDueDate' });
        }
        const gw = await getGateway(provider);
        const result = await manager.criarRecorrencia(gw, { contractId, clientId, value, frequency, nextDueDate, customerPayload, services });
        res.json(result);
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.get('/api/cobrancas/recorrencia', requireRole('admin', 'superadmin', 'financeiro'), async (req, res) => {
    try {
        const data = await manager.listarRecorrencias();
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/cobrancas/recorrencia/:contractId', requireRole('admin', 'superadmin', 'financeiro'), async (req, res) => {
    try {
        const result = await manager.desativarRecorrencia(req.params.contractId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ── Email Manual ──
// SECURITY HARDENING 2 — V02
app.post('/api/cobrancas/email', requireRole('admin', 'superadmin', 'financeiro', 'tech'), async (req, res) => {
    try {
        const { cobrancaId, email } = req.body;
        if (!cobrancaId || !email) return res.status(400).json({ success: false, error: 'cobrancaId e email obrigatórios' });
        const result = await manager.enviarEmailCobranca(cobrancaId, email);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/cobrancas/webhooks', requireRole('admin', 'superadmin', 'financeiro'), async (req, res) => {
    try {
        const data = await dbAll('SELECT * FROM webhooks_recebidos ORDER BY received_at DESC LIMIT 50');
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ── NOVO: Módulo de Bancos Brasileiros (Referência BACEN) ──

// Autocomplete de Bancos de Referência
// SECURITY HARDENING 2 — V02
app.get('/api/bancos/referencia', requireRole('admin', 'superadmin', 'financeiro', 'tech'), async (req, res) => {
    const q = req.query.q || '';
    try {
        const rows = await dbAll(`
            SELECT * FROM bancos_referencia 
            WHERE nome_reduzido LIKE ? OR codigo_comp LIKE ? OR ispb LIKE ?
            LIMIT 20
        `, [`%${q}%`, `%${q}%`, `%${q}%`]);
        res.json({ success: true, data: rows });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Sincronizar Bancos de Referência (Manual)
// SECURITY HARDENING 2 — V02
app.post('/api/bancos/referencia/sync', requireRole('admin', 'superadmin', 'financeiro'), async (req, res) => {
    try {
        const result = await syncBanks();
        res.json(result);
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Listar Bancos Cadastrados
// SECURITY HARDENING 2 — V02: configs bancárias sensíveis
app.get('/api/bancos/cadastrados', requireRole('admin', 'superadmin', 'financeiro'), async (req, res) => {
    try {
        const rows = await dbAll(`
            SELECT b.*, r.nome_reduzido as banco_nome_ref, r.codigo_comp as ref_comp
            FROM bancos_cadastrados b
            LEFT JOIN bancos_referencia r ON b.banco_referencia_id = r.id
            ORDER BY b.is_primary DESC, b.created_at DESC
        `);
        res.json({ success: true, data: rows });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Salvar/Editar Banco Cadastrado
// SECURITY HARDENING 2 — V02: alteração de config bancária é admin-only
app.post('/api/bancos/cadastrados', requireRole('admin', 'superadmin'), async (req, res) => {
    const { 
        id, banco_referencia_id, nome_exibicao, ambiente, base_url, 
        client_id, client_secret, cert_path, key_path, 
        webhook_url, webhook_secret, is_primary, ativo 
    } = req.body;

    try {
        const secretEnc = client_secret ? encrypt(client_secret) : null;
        const webSecretEnc = webhook_secret ? encrypt(webhook_secret) : null;

        if (id) {
            // Update
            await dbRun(`
                UPDATE bancos_cadastrados SET
                    banco_referencia_id = ?, nome_exibicao = ?, ambiente = ?, base_url = ?,
                    client_id = ?, cert_path = ?, key_path = ?, webhook_url = ?, 
                    ativo = ?, updated_at = CURRENT_TIMESTAMP
                    ${client_secret ? ', client_secret_encrypted = ?' : ''}
                    ${webhook_secret ? ', webhook_secret_encrypted = ?' : ''}
                WHERE id = ?
            `, [
                banco_referencia_id, nome_exibicao, ambiente, base_url, 
                client_id, cert_path, key_path, webhook_url, ativo,
                ...(client_secret ? [secretEnc] : []),
                ...(webhook_secret ? [webSecretEnc] : []),
                id
            ]);
            
            if (is_primary == 1) await setPrimaryBank(id);
            
            res.json({ success: true, message: 'Banco atualizado' });
        } else {
            // Insert
            const result = await dbRun(`
                INSERT INTO bancos_cadastrados (
                    banco_referencia_id, nome_exibicao, ambiente, base_url,
                    client_id, client_secret_encrypted, cert_path, key_path,
                    webhook_url, webhook_secret_encrypted, is_primary, ativo
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                banco_referencia_id, nome_exibicao, ambiente, base_url,
                client_id, secretEnc, cert_path, key_path,
                webhook_url, webSecretEnc, is_primary || 0, ativo ?? 1
            ]);
            
            if (is_primary == 1) await setPrimaryBank(result.lastID);
            
            res.json({ success: true, id: result.lastID });
        }
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Definir como Principal
// SECURITY HARDENING 2 — V02
app.post('/api/bancos/cadastrados/:id/primario', requireRole('admin', 'superadmin'), async (req, res) => {
    try {
        await setPrimaryBank(req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

async function setPrimaryBank(id) {
    await dbRun("UPDATE bancos_cadastrados SET is_primary = 0");
    await dbRun("UPDATE bancos_cadastrados SET is_primary = 1 WHERE id = ?", [id]);
}

app.delete('/api/bancos/cadastrados/:id', requireRole('admin', 'superadmin'), async (req, res) => {
    try {
        await dbRun("DELETE FROM bancos_cadastrados WHERE id = ?", [req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Testar Conexão
// SECURITY HARDENING 2 — V02
app.post('/api/bancos/testar', requireRole('admin', 'superadmin', 'financeiro'), async (req, res) => {
    const { provider, client_id, client_secret, certificate, key, ambiente } = req.body;
    try {
        let gw;
        const provLower = (provider || '').toLowerCase();
        
        if (provLower.includes('cora')) {
            gw = new CoraGateway({
                clientId: client_id,
                clientSecret: client_secret,
                certPath: certificate ? path.resolve(__dirname, certificate) : path.resolve(__dirname, 'certs/certificate.pem'),
                keyPath: key ? path.resolve(__dirname, key) : path.resolve(__dirname, 'certs/private-key.key'),
                isStage: ambiente === 'stage'
            });
        } else if (provLower.includes('itau')) {
            const ItauGateway = require('./gateways/ItauGateway');
            gw = new ItauGateway({
                clientId: client_id,
                clientSecret: client_secret,
                ambiente: ambiente
            });
        }

        if (!gw) return res.status(400).json({ success: false, error: 'Provedor não suportado para teste imediato' });

        const authRes = await gw.authenticate();
        // Garantir que pegamos a string do token independente do formato (Cora retorna string, Itau retorna objeto)
        const token = typeof authRes === 'string' ? authRes : (authRes.access_token || JSON.stringify(authRes));
        
        res.json({ 
            success: true, 
            message: 'Conexão estabelecida com sucesso!', 
            token_preview: token.substring(0, 15) + '...' 
        });
    } catch (e) {
        res.status(500).json({ success: false, error: `Falha na conexão: ${e.message}` });
    }
});

// ── Logs ──
// SECURITY HARDENING 2 — V02
app.get('/api/cobrancas/logs', requireRole('admin', 'superadmin', 'financeiro'), async (req, res) => {
    try {
        const data = await manager.getLogs({ limit: parseInt(req.query.limit) || 50 });
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message,
            code: error.code || 'INTERNAL_ERROR',
            errors: error.errors || []
        });
    }
});

app.get('/api/cobrancas/auditoria', requireRole('admin', 'superadmin', 'financeiro'), async (req, res) => {
    try {
        const data = await manager.getAuditoria({ limit: parseInt(req.query.limit) || 50 });
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message,
            code: error.code || 'INTERNAL_ERROR',
            errors: error.errors || []
        });
    }
});

// --- Configurações de Integração (Legado/Compatibilidade) ---
// SECURITY HARDENING 2 — V02
app.get('/api/configuracoes', requireRole('admin', 'superadmin', 'financeiro'), async (req, res) => {
    try {
        const rows = await dbAll(`
            SELECT b.*, r.nome_reduzido as provider_name 
            FROM bancos_cadastrados b
            LEFT JOIN bancos_referencia r ON b.banco_referencia_id = r.id
        `);
        // Mapear para o formato que cobrancas.html espera
        const legacyData = rows.map(b => ({
            id: b.id,
            provider: b.nome_exibicao.toLowerCase().includes('cora') ? 'cora' : (b.nome_exibicao.toLowerCase().includes('itau') ? 'itau' : 'custom'),
            ambiente: b.ambiente,
            client_id_encrypted: b.client_id,
            ativo: b.ativo,
            nome_exibicao: b.nome_exibicao
        }));
        res.json({ success: true, data: legacyData });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/configuracoes', requireRole('admin', 'superadmin'), async (req, res) => {
    const { provider, ambiente, clientId, ativo, userId, userName } = req.body;
    try {
        // Tentar encontrar um banco cadastrado que corresponda ao provider
        const existing = await dbGet("SELECT id FROM bancos_cadastrados WHERE nome_exibicao LIKE ?", [`%${provider}%`]);
        
        if (existing) {
            await dbRun(`UPDATE bancos_cadastrados SET 
                ambiente = ?, client_id = ?, ativo = ?, 
                updated_at = CURRENT_TIMESTAMP WHERE id = ?`, 
                [ambiente, clientId, ativo, existing.id]);
        } else {
            // Se não existir, cria um básico (idealmente o usuário usa a tela /admin/bancos para controle total)
            await dbRun(`INSERT INTO bancos_cadastrados (nome_exibicao, ambiente, client_id, ativo) 
                VALUES (?, ?, ?, ?)`, [provider.toUpperCase(), ambiente, clientId, ativo]);
        }

        // Registrar auditoria
        await dbRun(`INSERT INTO logs_auditoria (user_id, user_name, acao, entidade, entidade_id, detalhes_json) 
            VALUES (?, ?, ?, ?, ?, ?)`,
            [userId, userName, 'configurar', 'configuracao', provider, JSON.stringify({ ambiente, ativo })]);

        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── Detalhe de cobrança (DEVE ficar depois das rotas nomeadas) ──
// SECURITY HARDENING 2 — V02
app.get('/api/cobrancas/:id', requireRole('admin', 'superadmin', 'financeiro', 'tech'), async (req, res) => {
    try {
        const cob = await manager.buscarCobranca(req.params.id);
        if (!cob) return res.status(404).json({ success: false, error: 'Cobrança não encontrada' });
        res.json({ success: true, data: cob });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message,
            code: error.code || 'INTERNAL_ERROR',
            errors: error.errors || []
        });
    }
});

// ── Cobranças por contrato ──
// SECURITY HARDENING 2 — V02
app.get('/api/cobrancas/contrato/:cid', requireRole('admin', 'superadmin', 'financeiro', 'tech'), async (req, res) => {
    try {
        const data = await manager.buscarPorContrato(req.params.cid);
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message,
            code: error.code || 'INTERNAL_ERROR',
            errors: error.errors || []
        });
    }
});

// ═══════════════════════════════════════════
// COMPAT: Endpoints antigos (/api/cora/*)
// Mantidos para compatibilidade com frontend existente
// ═══════════════════════════════════════════

app.post('/api/cora/boleto', requireRole('admin', 'superadmin', 'financeiro'), async (req, res) => {
    try {
        const { contractId, clientId, value, dueDate, services, customerPayload } = req.body;
        if (!contractId || !clientId || !value || !dueDate) {
            return res.status(400).json({ success: false, error: 'Campos obrigatórios: contractId, clientId, value, dueDate' });
        }
        const result = await manager.emitirCobranca({ contractId, clientId, value, dueDate, services, customerPayload });
        // Mapear resposta para formato antigo
        res.json({
            success: true,
            duplicate: result.duplicate || false,
            chargeId: result.chargeId,
            barcode: result.barcode,
            pdf: result.pdfUrl,
            pixQrCode: result.pixQrCode,
            boletoId: result.cobrancaId
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message || 'Erro na emissão' });
    }
});

app.get('/api/cora/extrato', requireRole('admin', 'superadmin', 'financeiro'), async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 0;
        const size = parseInt(req.query.size) || 50;
        const data = await manager.getExtrato(undefined, { page, size });
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message,
            code: error.code || 'INTERNAL_ERROR',
            errors: error.errors || []
        });
    }
});

app.post('/api/cora/notificacoes', requireRole('admin', 'superadmin', 'financeiro', 'tech'), async (req, res) => {
    try {
        const { invoiceId, send_sms, send_whatsapp, send_email } = req.body;
        if (!invoiceId) return res.status(400).json({ success: false, error: 'invoiceId obrigatório' });
        const gw = await getGateway('cora');
        const result = await gw.updateNotifications(invoiceId, {
            sms: send_sms, whatsapp: send_whatsapp, email: send_email
        });
        res.json({ success: true, data: result });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.get('/api/cora/notificacoes/:invoiceId', requireRole('admin', 'superadmin', 'financeiro', 'tech'), async (req, res) => {
    try {
        const gw = await getGateway('cora');
        const data = await gw.getNotificationStatus(req.params.invoiceId);
        res.json({ success: true, data });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// Rota canônica de Webhook exigida no Prompt Padrão de Integração Cora
app.post('/api/webhooks/cora', verifyWebhookSignature(), async (req, res) => {
    try {
        const gw = await getGateway('cora');
        const result = await manager.processarWebhook(gw, req.body);
        res.status(200).json(result);
    } catch (error) {
        // A Cora pede que Webhooks sempre retornem 200 para evitar retries desnecessários em erros internos não tratáveis
        console.error('[Cora Webhook] Erro crítico ao processar:', error.message);
        res.status(200).json({ received: true, error: error.message });
    }
});

app.post('/api/cora/webhook/receber', verifyWebhookSignature(), async (req, res) => {
    try {
        const gw = await getGateway('cora');
        const result = await manager.processarWebhook(gw, req.body);
        res.status(200).json(result);
    } catch (error) {
        res.status(200).json({ received: true });
    }
});

app.get('/api/cora/sync', requireRole('admin', 'superadmin', 'financeiro', 'tech'), async (req, res) => {
    try {
        const rows = await dbAll(
            `SELECT id as cobranca_id, contract_id, client_id, gateway_charge_id as charge_id, 
                    gateway_invoice_id as invoice_id, status as cora_status, barcode, pdf_url, pix_qrcode, 
                    valor as value, data_vencimento as due_date, updated_at 
             FROM cobrancas ORDER BY updated_at DESC`
        );
        res.json({ success: true, data: rows });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message,
            code: error.code || 'INTERNAL_ERROR',
            errors: error.errors || []
        });
    }
});

app.get('/api/cora/boletos', requireRole('admin', 'superadmin', 'financeiro', 'tech'), async (req, res) => {
    try {
        const { contractId, status } = req.query;
        const page = parseInt(req.query.page) || 0;
        const size = parseInt(req.query.size) || 50;
        const data = await manager.listarCobrancas({ clientId: contractId, status, page, size });
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message,
            code: error.code || 'INTERNAL_ERROR',
            errors: error.errors || []
        });
    }
});

app.post('/api/cora/recorrencia', requireRole('admin', 'superadmin', 'financeiro'), async (req, res) => {
    try {
        const { contractId, clientId, value, frequency, nextDueDate, customerPayload, services } = req.body;
        if (!contractId || !clientId || !value || !nextDueDate) {
            return res.status(400).json({ success: false, error: 'Campos obrigatórios: contractId, clientId, value, nextDueDate' });
        }
        const result = await manager.criarRecorrencia({ contractId, clientId, value, frequency, nextDueDate, customerPayload, services });
        res.json(result);
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message,
            code: error.code || 'INTERNAL_ERROR',
            errors: error.errors || []
        });
    }
});

app.get('/api/cora/recorrencia', requireRole('admin', 'superadmin', 'financeiro'), async (req, res) => {
    try {
        const data = await manager.listarRecorrencias();
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message,
            code: error.code || 'INTERNAL_ERROR',
            errors: error.errors || []
        });
    }
});

app.delete('/api/cora/recorrencia/:contractId', requireRole('admin', 'superadmin', 'financeiro'), async (req, res) => {
    try {
        const result = await manager.desativarRecorrencia(req.params.contractId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message,
            code: error.code || 'INTERNAL_ERROR',
            errors: error.errors || []
        });
    }
});

app.get('/api/cora/logs', requireRole('admin', 'superadmin', 'financeiro'), async (req, res) => {
    try {
        const data = await manager.getLogs({ limit: parseInt(req.query.limit) || 50 });
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

const ReminderService = require('./ReminderService');
const NotificationService = require('./NotificationService');
const { MOTIVOS_REABERTURA } = require('./ChamadoManager');
const chamadoManager = new ChamadoManager();

// ═══════════════════════════════════════════
// MÓDULO PMOC — Rotas REST
// ═══════════════════════════════════════════

// GET /api/pmoc/kpis — Dashboard KPIs
// SECURITY HARDENING 2 — V02
app.get('/api/pmoc/kpis', requireRole('admin', 'superadmin', 'tech', 'financeiro'), async (req, res) => {
    try {
        const kpis = await pmocManager.getPmocKPIs();
        res.json({ success: true, data: kpis });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/pmoc/pendentes — PMOCs pendentes de execução
app.get('/api/pmoc/pendentes', requireRole('admin', 'superadmin', 'tech', 'financeiro'), async (req, res) => {
    try {
        const dados = await pmocManager.getPendentesProximoVencimento();
        res.json({ success: true, data: dados });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/pmoc/vencidas — PMOCs já vencidas
app.get('/api/pmoc/vencidas', requireRole('admin', 'superadmin', 'tech', 'financeiro'), async (req, res) => {
    try {
        const dados = await pmocManager.getVencidas();
        res.json({ success: true, data: dados });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/pmoc/equipamentos — Listar equipamentos
app.get('/api/pmoc/equipamentos', requireRole('admin', 'superadmin', 'tech', 'financeiro'), async (req, res) => {
    try {
        const { clienteId, contractId, status, page, size } = req.query;
        const r = await pmocManager.listarEquipamentos({ clienteId, contractId, status, page, size });
        res.json({ success: true, ...r });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/pmoc/equipamentos/:id — Detalhe
app.get('/api/pmoc/equipamentos/:id', requireRole('admin', 'superadmin', 'tech', 'financeiro'), async (req, res) => {
    try {
        const eq = await pmocManager.buscarEquipamento(req.params.id);
        if (!eq) return res.status(404).json({ success: false, error: 'Equipamento não encontrado' });
        res.json({ success: true, data: eq });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// POST /api/pmoc/equipamentos — Criar equipamento
app.post('/api/pmoc/equipamentos', requireRole('admin', 'superadmin', 'tech'), async (req, res) => {
    try {
        const { clienteId, contractId, localInstalacao, marca, modelo, numeroSerie,
                potenciaBtu, potenciaKw, tipoEquipamento, refrigerante, regimeServico,
                dataInstalacao, observacoes } = req.body;
        if (!clienteId) return res.status(400).json({ success: false, error: 'clienteId é obrigatório' });
        if (potenciaBtu && potenciaBtu >= 75000) {
            console.log(`[PMOC] Equipamento ${potenciaBtu} BTU — PMOC obrigatório`);
        }
        const eq = await pmocManager.criarEquipamento({ clienteId, contractId, localInstalacao, marca, modelo, numeroSerie, potenciaBtu, potenciaKw, tipoEquipamento, refrigerante, regimeServico, dataInstalacao, observacoes });
        res.status(201).json({ success: true, data: eq });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// PATCH /api/pmoc/equipamentos/:id — Atualizar
app.patch('/api/pmoc/equipamentos/:id', requireRole('admin', 'superadmin', 'tech'), async (req, res) => {
    try {
        const eq = await pmocManager.atualizarEquipamento(req.params.id, req.body);
        res.json({ success: true, data: eq });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// DELETE /api/pmoc/equipamentos/:id — Excluir
app.delete('/api/pmoc/equipamentos/:id', requireRole('admin', 'superadmin'), async (req, res) => {
    try {
        await pmocManager.excluirEquipamento(req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// GET /api/pmoc/manutencoes — Listar manutenções
app.get('/api/pmoc/manutencoes', requireRole('admin', 'superadmin', 'tech', 'financeiro'), async (req, res) => {
    try {
        const { equipamentoId, status, tecnicoId, dataInicio, dataFim, page, size } = req.query;
        const r = await pmocManager.listarManutencoes({ equipamentoId, status, tecnicoId, dataInicio, dataFim, page, size });
        res.json({ success: true, ...r });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/pmoc/manutencoes/:id — Detalhe com checklist
app.get('/api/pmoc/manutencoes/:id', requireRole('admin', 'superadmin', 'tech', 'financeiro'), async (req, res) => {
    try {
        const m = await pmocManager.buscarManutencao(req.params.id);
        if (!m) return res.status(404).json({ success: false, error: 'Manutenção não encontrada' });
        res.json({ success: true, data: m });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// POST /api/pmoc/manutencoes/:id/executar — Executar manutenção (checklist)
app.post('/api/pmoc/manutencoes/:id/executar', requireRole('admin', 'superadmin', 'tech'), async (req, res) => {
    try {
        const { itens, tecnicoId, observacoesGerais, custoMaoObra, custoPecas } = req.body;
        if (!itens || !itens.length) return res.status(400).json({ success: false, error: 'itens é obrigatório' });
        const m = await pmocManager.executarManutencao(req.params.id, { itens, tecnicoId, observacoesGerais, custoMaoObra, custoPecas });
        res.json({ success: true, data: m });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// PATCH /api/pmoc/manutencoes/:id/reagendar — Reagendar
app.patch('/api/pmoc/manutencoes/:id/reagendar', requireRole('admin', 'superadmin', 'tech'), async (req, res) => {
    try {
        const { novaData } = req.body;
        if (!novaData) return res.status(400).json({ success: false, error: 'novaData é obrigatória' });
        await pmocManager.reagendarManutencao(req.params.id, novaData);
        res.json({ success: true });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// GET /api/pmoc/checklist/:tipo — Itens do checklist por tipo
app.get('/api/pmoc/checklist/:tipo', requireRole('admin', 'superadmin', 'tech', 'financeiro'), async (req, res) => {
    try {
        const itens = await pmocManager.getChecklist(req.params.tipo);
        res.json({ success: true, data: itens });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// POST /api/pmoc/checklist — Adicionar item ao checklist
app.post('/api/pmoc/checklist', requireRole('admin', 'superadmin', 'tech'), async (req, res) => {
    try {
        const { tipoManutencao, descricao, categoria, obrigatorio } = req.body;
        if (!tipoManutencao || !descricao) return res.status(400).json({ success: false, error: 'tipoManutencao e descricao são obrigatórios' });
        const r = await pmocManager.adicionarItemChecklist({ tipoManutencao, descricao, categoria, obrigatorio });
        res.status(201).json(r);
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/pmoc/relatorio/:clienteId — Dados para relatório PMOC
app.get('/api/pmoc/relatorio/:clienteId', requireRole('admin', 'superadmin', 'tech', 'financeiro'), async (req, res) => {
    try {
        const rel = await pmocManager.gerarRelatorioPMOC(req.params.clienteId);
        res.json({ success: true, data: rel });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/pmoc/configs — Configurações PMOC
app.get('/api/pmoc/configs', requireRole('admin', 'superadmin', 'tech', 'financeiro'), async (req, res) => {
    try {
        const cfg = await pmocManager.getAllConfigs();
        res.json({ success: true, data: cfg });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// PATCH /api/pmoc/configs — Atualizar configuração
app.patch('/api/pmoc/configs', requireRole('admin', 'superadmin'), async (req, res) => {
    try {
        const { nome, valor } = req.body;
        if (!nome || valor === undefined) return res.status(400).json({ success: false, error: 'nome e valor obrigatórios' });
        await pmocManager.updateConfig(nome, String(valor));
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/pmoc/cliente/:clienteId/manutencoes — Manutenções de um cliente (para portal cliente)
// SECURITY HARDENING 2 — V02: portal cliente usa /api/portal/* com sua própria auth;
// esta rota expõe dados agregados, então exige role interno
app.get('/api/pmoc/cliente/:clienteId/manutencoes', requireRole('admin', 'superadmin', 'tech', 'financeiro'), async (req, res) => {
    try {
        const { status, size = 20 } = req.query;
        const params = [req.params.clienteId];
        const wheres = ['e.cliente_id = ?'];
        if (status) { wheres.push('m.status = ?'); params.push(status); }
        const limit = Math.min(parseInt(size) || 20, 100);
        const rows = await dbAll(
            `SELECT m.*, e.marca, e.modelo, e.local_instalacao, e.potencia_btu
             FROM manutencoes_preventivas m
             JOIN equipamentos e ON m.equipamento_id = e.id
             WHERE ${wheres.join(' AND ')}
             ORDER BY m.proxima_data DESC LIMIT ?`,
            [...params, limit]
        );
        res.json({ success: true, data: rows });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/pmoc/cliente/:clienteId/equipamentos — Equipamentos de um cliente
app.get('/api/pmoc/cliente/:clienteId/equipamentos', requireRole('admin', 'superadmin', 'tech', 'financeiro'), async (req, res) => {
    try {
        const rows = await dbAll(
            `SELECT e.*,
                (SELECT MIN(m.proxima_data) FROM manutencoes_preventivas m WHERE m.equipamento_id = e.id AND m.status = 'Pendente') as proxima_manut
             FROM equipamentos e WHERE e.cliente_id = ? ORDER BY e.local_instalacao`,
            [req.params.clienteId]
        );
        res.json({ success: true, data: rows });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/equipamentos/:id/historico — Histórico unificado (manutenções + chamados + checklists)
// SECURITY HARDENING 2 — V02: inclui dados sensíveis (custos, garantia, peças)
app.get('/api/equipamentos/:id/historico', requireRole('admin', 'superadmin', 'tech', 'financeiro'), async (req, res) => {
    try {
        const equipId = req.params.id;

        // 1. Dados do equipamento
        const equip = await dbGet(
            `SELECT e.*, c.nome as cliente_nome, c.fantasia as cliente_fantasia, c.telefone as cliente_telefone, c.celular as cliente_celular
             FROM equipamentos e
             LEFT JOIN clientes c ON c.id = e.cliente_id
             WHERE e.id = ?`, [equipId]
        );
        if (!equip) return res.status(404).json({ success: false, error: 'Equipamento não encontrado' });

        // 2. Manutenções PMOC (com checklists)
        const manutencoes = await dbAll(
            `SELECT m.*, t.nome as tecnico_nome,
                (SELECT COUNT(*) FROM checklist_registros cr WHERE cr.manutencao_id = m.id) as total_checklist,
                (SELECT COUNT(*) FROM checklist_registros cr WHERE cr.manutencao_id = m.id AND cr.concluido = 1) as checklist_ok
             FROM manutencoes_preventivas m
             LEFT JOIN usuarios t ON t.id = m.tecnico_id
             WHERE m.equipamento_id = ?
             ORDER BY m.data_programada DESC, m.created_at DESC
             LIMIT 100`, [equipId]
        );

        // 3. Chamados / OS vinculados (via cliente + categoria)
        const chamados = await dbAll(
            `SELECT c.id, c.num, c.titulo, c.status, c.priority, c.category, c.created_at, c.updated_at,
                t.nome as tecnico_nome
             FROM chamados c
             LEFT JOIN usuarios t ON t.id = c.assigned_to
             WHERE c.cliente_id = ?
               AND (c.category IN ('corretiva', 'preventiva', 'instalacao', 'pmoc')
                    OR c.titulo LIKE ?
                    OR c.descricao LIKE ?)
             ORDER BY c.created_at DESC
             LIMIT 50`,
            [equip.cliente_id, `%${equip.modelo || ''}%`, `%${equip.numero_serie || ''}%`]
        );

        // 4. Garantia ativa (verifica logs_garantia)
        const garantia = await dbAll(
            `SELECT lg.*, c.num as chamado_num, c.titulo as chamado_titulo
             FROM logs_garantia lg
             LEFT JOIN chamados c ON c.id = lg.chamado_id
             WHERE c.cliente_id = ?
             ORDER BY lg.created_at DESC
             LIMIT 10`, [equip.cliente_id]
        );

        // 5. Custos totais (estimado)
        const pecasUsadas = await dbAll(
            `SELECT sm.*, sm.quantity as qtd, p.nome as peca_nome, p.sku as peca_sku,
                (sm.quantity * COALESCE(sm.unit_cost, 0)) as custo_total
             FROM stock_movements sm
             LEFT JOIN inventory p ON p.id = sm.part_id
             WHERE sm.ticket_id IN (SELECT id FROM chamados WHERE cliente_id = ?)
               AND sm.type = 'saida'
             ORDER BY sm.created_at DESC
             LIMIT 30`, [equip.cliente_id]
        );
        const custoTotal = pecasUsadas.reduce((s, p) => s + (p.custo_total || 0), 0);

        // 6. Estatísticas
        const stats = {
            total_manutencoes: manutencoes.length,
            manutencoes_concluidas: manutencoes.filter(m => m.status === 'Concluída' || m.status === 'Concluido').length,
            manutencoes_pendentes: manutencoes.filter(m => m.status === 'Pendente').length,
            proxima_manutencao: manutencoes.find(m => m.status === 'Pendente' && m.proxima_data)?.proxima_data || null,
            total_chamados: chamados.length,
            chamados_abertos: chamados.filter(c => !['resolvido', 'fechado', 'cancelado'].includes(c.status)).length,
            custo_total_pecas: custoTotal,
            // Idade do equipamento
            idade_anos: equip.data_instalacao ? Math.floor((Date.now() - new Date(equip.data_instalacao).getTime()) / (365.25 * 24 * 3600 * 1000)) : null,
            // Tempo médio entre manutenções (dias)
            intervalo_medio_dias: manutencoes.length > 1 ? calcularIntervaloMedio(manutencoes) : null
        };

        function calcularIntervaloMedio(manuts) {
            const datas = manuts.filter(m => m.data_programada).map(m => new Date(m.data_programada).getTime()).sort((a, b) => a - b);
            if (datas.length < 2) return null;
            const intervalos = [];
            for (let i = 1; i < datas.length; i++) {
                intervalos.push((datas[i] - datas[i-1]) / (24 * 3600 * 1000));
            }
            return Math.round(intervalos.reduce((s, v) => s + v, 0) / intervalos.length);
        }

        // 7. Eventos unificados (timeline)
        const eventos = [];
        manutencoes.forEach(m => {
            eventos.push({
                tipo: 'manutencao',
                data: m.data_programada || m.created_at,
                titulo: `Manutenção ${m.tipo || ''}`.trim(),
                status: m.status,
                detalhe: m.observacoes || m.descricao,
                tecnico: m.tecnico_nome,
                meta: {
                    total_checklist: m.total_checklist,
                    checklist_ok: m.checklist_ok,
                    id: m.id
                }
            });
        });
        chamados.forEach(c => {
            eventos.push({
                tipo: 'chamado',
                data: c.created_at,
                titulo: c.titulo,
                status: c.status,
                detalhe: `Prioridade: ${c.priority} | Categoria: ${c.category}`,
                tecnico: c.tecnico_nome,
                meta: {
                    num: c.num,
                    priority: c.priority,
                    id: c.id
                }
            });
        });
        garantia.forEach(g => {
            eventos.push({
                tipo: 'garantia',
                data: g.created_at,
                titulo: `Garantia: ${g.evento || g.tipo_evento || 'evento'}`,
                status: g.status || 'registrado',
                detalhe: g.observacoes,
                meta: { id: g.id, chamado_num: g.chamado_num }
            });
        });
        // Ordena cronologicamente (mais recente primeiro)
        eventos.sort((a, b) => new Date(b.data) - new Date(a.data));

        res.json({
            success: true,
            data: {
                equipamento: equip,
                stats,
                manutencoes,
                chamados,
                garantia,
                pecas_usadas: pecasUsadas,
                custo_pecas_total: custoTotal,
                eventos,
                ultima_atualizacao: new Date().toISOString()
            }
        });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
const reminders = new ReminderService();

// ── Notificações (Histórico) ──
// SECURITY HARDENING 2 — V02
app.get('/api/cobrancas/:id/notificacoes', requireRole('admin', 'superadmin', 'financeiro', 'tech'), async (req, res) => {
    try {
        const rows = await dbAll('SELECT * FROM logs_notificacoes WHERE cobranca_id = ? ORDER BY created_at DESC', [req.params.id]);
        res.json({ success: true, data: rows });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ═══════════════════════════════════════════
// MÓDULO CHAMADOS — Rotas REST
// ═══════════════════════════════════════════

// GET /api/chamados — Listar (com filtros)
// SECURITY HARDENING 2 — V02
app.get('/api/chamados', requireRole('admin', 'superadmin', 'tech', 'financeiro'), async (req, res) => {
    try {
        const { clienteId, tecnicoId, status, page, size } = req.query;
        const result = await chamadoManager.listarChamados({ clienteId, tecnicoId, status, page, size });
        res.json({ success: true, ...result });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/chamados/kpis — Dashboard de garantia
app.get('/api/chamados/kpis', requireRole('admin', 'superadmin', 'tech', 'financeiro'), async (req, res) => {
    try {
        const kpis = await chamadoManager.getGarantiaKPIs();
        res.json({ success: true, data: kpis });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/chamados/alertas — Garantias próximas de vencer
app.get('/api/chamados/alertas', requireRole('admin', 'superadmin', 'tech', 'financeiro'), async (req, res) => {
    try {
        const dados = await chamadoManager.getGarantiasProximasVencimento();
        res.json({ success: true, data: dados });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/chamados/vencidas — Garantias já vencidas
app.get('/api/chamados/vencidas', requireRole('admin', 'superadmin', 'tech', 'financeiro'), async (req, res) => {
    try {
        const dados = await chamadoManager.getGarantiasVencidas();
        res.json({ success: true, data: dados });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/chamados/configs — Configurações de garantia
app.get('/api/chamados/configs', requireRole('admin', 'superadmin', 'tech', 'financeiro'), async (req, res) => {
    try {
        const configs = await chamadoManager.getAllConfigs();
        res.json({ success: true, data: configs });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// PATCH /api/chamados/configs — Atualizar configuração
// SECURITY HARDENING 2 — V02: admin-only (config global)
app.patch('/api/chamados/configs', requireRole('admin', 'superadmin'), async (req, res) => {
    try {
        const { nome, valor } = req.body;
        if (!nome || valor === undefined) return res.status(400).json({ success: false, error: 'nome e valor obrigatórios' });
        const result = await chamadoManager.updateConfig(nome, String(valor));
        res.json(result);
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/chamados/:id — Detalhe
// SECURITY HARDENING 2 — V02
app.get('/api/chamados/:id', requireRole('admin', 'superadmin', 'tech', 'financeiro'), async (req, res) => {
    try {
        const c = await chamadoManager.buscarChamado(req.params.id);
        if (!c) return res.status(404).json({ success: false, error: 'Chamado não encontrado' });
        res.json({ success: true, data: c });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// POST /api/chamados — Criar
app.post('/api/chamados', requireRole('admin', 'superadmin', 'tech'), async (req, res) => {
    try {
        const { clienteId, tecnicoId, titulo, descricao, categoria, prioridade, userId, userName } = req.body;
        if (!clienteId || !titulo) return res.status(400).json({ success: false, error: 'clienteId e titulo são obrigatórios' });
        const c = await chamadoManager.criarChamado({ clienteId, tecnicoId, titulo, descricao, categoria, prioridade });
        await dbRun(`INSERT INTO logs_auditoria (user_id, user_name, acao, entidade, entidade_id, detalhes_json)
            VALUES (?, ?, ?, ?, ?, ?)`,
            [userId, userName, 'criar_chamado', 'chamado', c.id, JSON.stringify({ titulo, clienteId })]);
        res.status(201).json({ success: true, data: c });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// PATCH /api/chamados/:id — Atualizar
app.patch('/api/chamados/:id', requireRole('admin', 'superadmin', 'tech'), async (req, res) => {
    try {
        const c = await chamadoManager.atualizarChamado(req.params.id, req.body);
        res.json({ success: true, data: c });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// POST /api/chamados/:id/resolve — Resolver
app.post('/api/chamados/:id/resolve', requireRole('admin', 'superadmin', 'tech'), async (req, res) => {
    try {
        const { userId, userName, observacoes } = req.body;
        const c = await chamadoManager.resolverChamado(req.params.id, userId, observacoes);
        res.json({ success: true, data: c });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// POST /api/chamados/:id/close — Fechar
app.post('/api/chamados/:id/close', requireRole('admin', 'superadmin', 'tech'), async (req, res) => {
    try {
        const { userId, userName } = req.body;
        const c = await chamadoManager.fecharChamado(req.params.id, userId);
        res.json({ success: true, data: c });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// POST /api/chamados/:id/cancel — Cancelar
app.post('/api/chamados/:id/cancel', requireRole('admin', 'superadmin', 'tech'), async (req, res) => {
    try {
        const { userId, userName, motivo } = req.body;
        const c = await chamadoManager.cancelarChamado(req.params.id, userId, motivo);
        res.json({ success: true, data: c });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// GET /api/chamados/:id/can-reopen — Verificar se pode reabrir
app.get('/api/chamados/:id/can-reopen', requireRole('admin', 'superadmin', 'tech', 'financeiro'), async (req, res) => {
    try {
        const chamado = await chamadoManager.buscarChamado(req.params.id);
        if (!chamado) return res.status(404).json({ success: false, error: 'Chamado não encontrado' });
        const validacao = await chamadoManager.podeReabrir(chamado);
        const configs = await chamadoManager.getAllConfigs();
        res.json({ success: true, data: { ...validacao, configs } });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// POST /api/chamados/:id/reopen — Reabrir em garantia
app.post('/api/chamados/:id/reopen', requireRole('admin', 'superadmin', 'tech'), async (req, res) => {
    try {
        const { motivo, descricaoProblema, userId, userName } = req.body;
        if (!motivo) return res.status(400).json({ success: false, error: 'motivo é obrigatório' });
        if (!MOTIVOS_REABERTURA.includes(motivo)) {
            return res.status(400).json({ success: false, error: `Motivo deve ser um de: ${MOTIVOS_REABERTURA.join(', ')}` });
        }
        const novo = await chamadoManager.reabrirChamado(req.params.id, { motivo, descricaoProblema, usuarioId: userId, usuarioNome: userName });
        await dbRun(`INSERT INTO logs_auditoria (user_id, user_name, acao, entidade, entidade_id, detalhes_json)
            VALUES (?, ?, ?, ?, ?, ?)`,
            [userId, userName, 'reabrir_garantia', 'chamado', novo.id, JSON.stringify({ originalId: req.params.id, motivo })]);
        res.status(201).json({ success: true, data: novo });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// POST /api/chamados/:id/extend — Estender garantia (admin)
app.post('/api/chamados/:id/extend', requireRole('admin', 'superadmin'), async (req, res) => {
    try {
        const { novoDias, justificativa, userId, userName } = req.body;
        if (!novoDias) return res.status(400).json({ success: false, error: 'novoDias é obrigatório' });
        const c = await chamadoManager.estenderGarantia(req.params.id, { novoDias, justificativa, usuarioId: userId });
        res.json({ success: true, data: c });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// GET /api/chamados/:id/logs — Logs de garantia
app.get('/api/chamados/:id/logs', requireRole('admin', 'superadmin', 'tech', 'financeiro'), async (req, res) => {
    try {
        const logs = await chamadoManager.getLogsGarantia(req.params.id);
        res.json({ success: true, data: logs });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/chamados/:id/reaberturas — Histórico de reaberturas
app.get('/api/chamados/:id/reaberturas', requireRole('admin', 'superadmin', 'tech', 'financeiro'), async (req, res) => {
    try {
        const reaberturas = await chamadoManager.getReaberturas(req.params.id);
        res.json({ success: true, data: reaberturas });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ═══════════════════════════════════════════
// ROTAS — BI Analytics
// Sprint 14: endpoint /api/bi/* movido para routes/bi.js
// (mantido aqui apenas referência; lógica em services/AnalyticsService.js)
// ═══════════════════════════════════════════

// ═══════════════════════════════════════════
// ROTAS — Contratos (Phase 2 RMR)
// ═══════════════════════════════════════════

// GET /api/contratos — Listar contratos (ANTES de :id para não conflitar)
// SECURITY HARDENING 2 — V02
app.get('/api/contratos', requireRole('admin', 'superadmin', 'financeiro', 'tech'), async (req, res) => {
    try {
        const { clienteId, status, tipo, page, size } = req.query;
        const r = await contratoManager.listar({ clienteId, status, tipo, page, size });
        res.json({ success: true, ...r });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/contratos/rmr — Métricas RMR (ANTES de :id)
app.get('/api/contratos/rmr', requireRole('admin', 'superadmin', 'financeiro'), async (req, res) => {
    try {
        const m = await contratoManager.getRMRMetrics();
        res.json({ success: true, data: m });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/contratos/rmr/por-plano
app.get('/api/contratos/rmr/por-plano', requireRole('admin', 'superadmin', 'financeiro'), async (req, res) => {
    try {
        const rows = await contratoManager.getRMRPorPlano(req.tenantId);
        res.json({ success: true, data: rows });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/contratos/rmr/historico
app.get('/api/contratos/rmr/historico', requireRole('admin', 'superadmin', 'financeiro'), async (req, res) => {
    try {
        const meses = parseInt(req.query.meses) || 12;
        const rows = await contratoManager.getReceitaHistorico(meses);
        res.json({ success: true, data: rows });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/contratos/vencendo
app.get('/api/contratos/vencendo', requireRole('admin', 'superadmin', 'financeiro', 'tech'), async (req, res) => {
    try {
        const rows = await contratoManager.getContratosVencendo();
        res.json({ success: true, data: rows });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/contratos/:id
app.get('/api/contratos/:id', requireRole('admin', 'superadmin', 'financeiro', 'tech'), async (req, res) => {
    try {
        const c = await contratoManager.buscar(req.params.id);
        if (!c) return res.status(404).json({ success: false, error: 'Contrato não encontrado' });
        res.json({ success: true, data: c });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// POST /api/contratos
app.post('/api/contratos', requireRole('admin', 'superadmin', 'financeiro'), async (req, res) => {
    try {
        const c = await contratoManager.criar(req.body);
        res.status(201).json({ success: true, data: c });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// PATCH /api/contratos/:id
app.patch('/api/contratos/:id', requireRole('admin', 'superadmin', 'financeiro'), async (req, res) => {
    try {
        const c = await contratoManager.atualizar(req.params.id, req.body);
        res.json({ success: true, data: c });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// DELETE /api/contratos/:id — cancela
app.delete('/api/contratos/:id', requireRole('admin', 'superadmin'), async (req, res) => {
    try {
        await contratoManager.excluir(req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// POST /api/contratos/:id/ativar
app.post('/api/contratos/:id/ativar', requireRole('admin', 'superadmin', 'financeiro'), async (req, res) => {
    try {
        const r = await contratoManager.ativar(req.params.id);
        res.json({ success: true, ...r });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// ═══════════════════════════════════════════
// ROTAS — Leads (CRM Pipeline)
// ═══════════════════════════════════════════

// GET /api/clientes — Listar clientes (consumido pelo wizard de cotação)
// SECURITY HARDENING 2 — V02
app.get('/api/clientes', requireRole('admin', 'superadmin', 'tech', 'financeiro'), async (req, res) => {
    try {
        const { search, limite = 200 } = req.query;
        let sql = 'SELECT * FROM clientes WHERE 1=1';
        const params = [];
        if (search) { sql += ' AND (nome LIKE ? OR fantasia LIKE ? OR cnpj_cpf LIKE ? OR email LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`); }
        sql += ' ORDER BY nome ASC LIMIT ?';
        params.push(parseInt(limite));
        const rows = await dbAll(sql, params);
        res.json({ success: true, data: rows });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/leads — Listar leads
// SECURITY HARDENING 2 — V02
app.get('/api/leads', requireRole('admin', 'superadmin', 'tech', 'financeiro'), async (req, res) => {
    try {
        const { status, origem, search, sort, limit } = req.query;
        const [leads, total] = await Promise.all([
            leadManager.listLeads({ status, origem, search, sort, limit }),
            leadManager.countLeads({ status }),
        ]);
        res.json({ success: true, data: leads, total });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/leads/stats — KPIs de funil
app.get('/api/leads/stats', requireRole('admin', 'superadmin', 'tech', 'financeiro'), async (req, res) => {
    try {
        const stats = await leadManager.getLeadStats();
        res.json({ success: true, data: stats });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// POST /api/leads — Criar lead
app.post('/api/leads', requireRole('admin', 'superadmin', 'tech'), async (req, res) => {
    try {
        const lead = await leadManager.createLead(req.body);
        res.status(201).json({ success: true, data: lead });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// GET /api/leads/origins — Lista de origens (para dropdowns)
app.get('/api/leads/origins', requireRole('admin', 'superadmin', 'tech', 'financeiro'), async (req, res) => {
    res.json({ success: true, data: leadManager.ORIGINS });
});

// GET /api/leads/statuses — Lista de status
app.get('/api/leads/statuses', requireRole('admin', 'superadmin', 'tech', 'financeiro'), async (req, res) => {
    res.json({ success: true, data: leadManager.STATUSES });
});

// GET /api/leads/:id — Detalhe de lead
app.get('/api/leads/:id', requireRole('admin', 'superadmin', 'tech', 'financeiro'), async (req, res) => {
    try {
        const lead = await leadManager.getLeadById(req.params.id);
        if (!lead) return res.status(404).json({ success: false, error: 'Lead não encontrado' });
        res.json({ success: true, data: lead });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// PATCH /api/leads/:id — Atualizar lead
app.patch('/api/leads/:id', requireRole('admin', 'superadmin', 'tech'), async (req, res) => {
    try {
        const lead = await leadManager.updateLead(req.params.id, req.body);
        res.json({ success: true, data: lead });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// DELETE /api/leads/:id — Excluir lead
app.delete('/api/leads/:id', requireRole('admin', 'superadmin'), async (req, res) => {
    try {
        await leadManager.deleteLead(req.params.id);
        res.json({ success: true });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// POST /api/leads/:id/convert — Converter em cliente
app.post('/api/leads/:id/convert', requireRole('admin', 'superadmin', 'tech'), async (req, res) => {
    try {
        const { clienteId } = req.body;
        const lead = await leadManager.convertLead(req.params.id, clienteId);
        res.json({ success: true, data: lead });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// POST /api/leads/import — Bulk import (CSV-like)
app.post('/api/leads/import', requireRole('admin', 'superadmin'), async (req, res) => {
    try {
        const { rows } = req.body;
        if (!Array.isArray(rows)) return res.status(400).json({ success: false, error: 'rows deve ser array' });
        const result = await leadManager.importLeads(rows);
        res.json({ success: true, data: result });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// POST /api/leads/score — Calcular score sem salvar (preview)
app.post('/api/leads/score', requireRole('admin', 'superadmin', 'tech'), async (req, res) => {
    try {
        const score = leadManager.calculateScore(req.body);
        const status = leadManager.deriveStatus(score, 'novo');
        res.json({ success: true, data: { score, status } });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// ═══════════════════════════════════════════
// ROTAS — Cotações / Dimensionamento HVAC
// ═══════════════════════════════════════════

// POST /api/cotacoes/calcular — Calcular BTU + custos sem persistir (preview)
// SECURITY HARDENING 2 — V02
app.post('/api/cotacoes/calcular', requireRole('admin', 'superadmin', 'tech', 'financeiro'), async (req, res) => {
    try {
        const calc = cotacaoManager.calcularBTU(req.body);
        const equipSugerido = await cotacaoManager.sugerirEquipamento(calc.btu_recomendado, req.body.refrigerante);
        const custos = cotacaoManager.calcularCustos({
            custo_equipamento: equipSugerido?.preco_venda || req.body.custo_equipamento || 0,
            custo_instalacao_base: req.body.custo_instalacao || 800,
            margem_lucro_percent: req.body.margem_lucro_percent || 30,
            custo_mao_obra_hora: req.body.custo_mao_obra_hora || 80,
            horas_estimadas: req.body.horas_estimadas || 4
        });
        res.json({ success: true, data: { calculo: calc, equipamento: equipSugerido, custos } });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// POST /api/cotacoes — Criar cotação
app.post('/api/cotacoes', requireRole('admin', 'superadmin', 'tech'), async (req, res) => {
    try {
        const result = await cotacaoManager.criarCotacao(req.body);
        res.status(201).json({ success: true, data: result });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// GET /api/cotacoes — Listar com filtros
app.get('/api/cotacoes', requireRole('admin', 'superadmin', 'tech', 'financeiro'), async (req, res) => {
    try {
        const { status, cliente_id, lead_id, search, limite } = req.query;
        const rows = await cotacaoManager.listarCotacoes({ status, cliente_id, lead_id, search, limite });
        res.json({ success: true, data: rows });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/cotacoes/stats — KPIs
app.get('/api/cotacoes/stats', requireRole('admin', 'superadmin', 'tech', 'financeiro'), async (req, res) => {
    try {
        const { since } = req.query;
        const s = await cotacaoManager.stats({ since });
        res.json({ success: true, data: s });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/cotacoes/:id — Detalhe completo
app.get('/api/cotacoes/:id', requireRole('admin', 'superadmin', 'tech', 'financeiro'), async (req, res) => {
    try {
        const row = await cotacaoManager.obterCotacao(req.params.id);
        if (!row) return res.status(404).json({ success: false, error: 'Cotação não encontrada' });
        res.json({ success: true, data: row });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// PATCH /api/cotacoes/:id — Atualizar
app.patch('/api/cotacoes/:id', requireRole('admin', 'superadmin', 'tech'), async (req, res) => {
    try {
        const result = await cotacaoManager.atualizarCotacao(req.params.id, req.body);
        res.json({ success: true, data: result });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// POST /api/cotacoes/:id/aprovar — Aprovar cotação
app.post('/api/cotacoes/:id/aprovar', requireRole('admin', 'superadmin', 'financeiro'), async (req, res) => {
    try {
        const result = await cotacaoManager.atualizarCotacao(req.params.id, { status: 'aprovada' });
        res.json({ success: true, data: result });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// POST /api/cotacoes/:id/rejeitar — Rejeitar
app.post('/api/cotacoes/:id/rejeitar', requireRole('admin', 'superadmin', 'financeiro'), async (req, res) => {
    try {
        const { motivo } = req.body;
        const result = await cotacaoManager.atualizarCotacao(req.params.id, {
            status: 'rejeitada',
            observacoes: (motivo ? `Rejeitada: ${motivo}` : 'Rejeitada')
        });
        res.json({ success: true, data: result });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// POST /api/cotacoes/:id/gerar-contrato — Converte cotação aprovada em contrato
app.post('/api/cotacoes/:id/gerar-contrato', requireRole('admin', 'superadmin', 'financeiro'), async (req, res) => {
    try {
        const result = await cotacaoManager.atualizarCotacao(req.params.id, { status: 'convertida' });
        res.json({ success: true, data: result, message: 'Cotação convertida. Crie o contrato a partir dela.' });
    } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// DELETE /api/cotacoes/:id — Excluir
app.delete('/api/cotacoes/:id', requireRole('admin', 'superadmin'), async (req, res) => {
    try {
        const r = await cotacaoManager.deletarCotacao(req.params.id);
        res.json({ success: true, data: r });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/cotacoes/:id/bom — Lista itens do BOM
app.get('/api/cotacoes/:id/bom', requireRole('admin', 'superadmin', 'tech', 'financeiro'), async (req, res) => {
    try {
        const itens = await cotacaoManager.obterItensBOM(req.params.id);
        const cotacao = await cotacaoManager.obterCotacao(req.params.id);
        const totais = itens.reduce((acc, i) => ({
            qtd: acc.qtd + 1,
            valor: acc.valor + (i.preco_total || 0)
        }), { qtd: 0, valor: 0 });
        res.json({ success: true, data: { itens, totais, cotacao } });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// POST /api/cotacoes/:id/bom/regenerar — Regenera BOM
app.post('/api/cotacoes/:id/bom/regenerar', requireRole('admin', 'superadmin', 'tech'), async (req, res) => {
    try {
        const c = await cotacaoManager.obterCotacao(req.params.id);
        if (!c) return res.status(404).json({ success: false, error: 'Cotação não encontrada' });
        const equip = c.equipamento_sugerido_id ? { id: c.equipamento_sugerido_id, sku: c.equipamento_sugerido_nome, nome: c.equipamento_sugerido_nome, marca: '', modelo: '', preco_venda: c.custo_equipamento } : null;
        const itens = await cotacaoManager.gerarBOM(c.btu_calculado, equip);
        const qtd = await cotacaoManager.salvarItensBOM(req.params.id, itens);
        res.json({ success: true, data: { itens, total_itens: qtd } });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/cotacoes/:id/pdf — Gera PDF da proposta
// ?format=pdf (default) → PDF binário via Playwright
// ?format=html          → HTML print-friendly (fallback)
app.get('/api/cotacoes/:id/pdf', requireRole('admin', 'superadmin', 'tech', 'financeiro'), async (req, res) => {
    try {
        const c = await cotacaoManager.obterCotacao(req.params.id);
        if (!c) return res.status(404).json({ success: false, error: 'Cotação não encontrada' });
        const itens = await cotacaoManager.obterItensBOM(req.params.id);

        const html = gerarHTMLProposta(c, itens);
        const wantPdf = (req.query.format || 'pdf').toLowerCase() === 'pdf';

        if (!wantPdf) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('Content-Disposition', `inline; filename="proposta-${c.id.substring(0, 8)}.html"`);
            return res.send(html);
        }

        // Tenta gerar PDF real com Playwright (chromium headless)
        let browser = null;
        try {
            const { chromium } = require('playwright');
            browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
            const page = await browser.newPage();
            await page.setContent(html, { waitUntil: 'networkidle', timeout: 15000 });
            const pdfBuffer = await page.pdf({
                format: 'A4',
                printBackground: true,
                margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' }
            });
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `inline; filename="proposta-${c.id.substring(0, 8)}.pdf"`);
            res.setHeader('Content-Length', pdfBuffer.length);
            return res.send(pdfBuffer);
        } catch (pwErr) {
            console.warn('[Cotacao PDF] Playwright falhou, fallback HTML:', pwErr.message);
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('Content-Disposition', `inline; filename="proposta-${c.id.substring(0, 8)}.html"`);
            res.setHeader('X-PDF-Fallback', String(pwErr.message || 'unknown').replace(/[^\x20-\x7E]/g, '?').substring(0, 200));
            return res.send(html);
        } finally {
            if (browser) { try { await browser.close(); } catch (_) {} }
        }
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Função que gera o HTML da proposta (pronto para imprimir como PDF)
function gerarHTMLProposta(c, itens) {
    const fmtBRL = v => 'R$ ' + (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('pt-BR') : '—';
    const eq = c.equipamento_sugerido_nome || '—';
    const totalItens = itens.reduce((s, i) => s + (i.preco_total || 0), 0);

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<title>Proposta Comercial - ${c.id.substring(0, 8)}</title>
<style>
  @page { size: A4; margin: 15mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, 'Segoe UI', sans-serif; color: #14171e; padding: 40px; line-height: 1.5; font-size: 11pt; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #00AEEF; padding-bottom: 20px; margin-bottom: 30px; }
  .logo { font-size: 22pt; font-weight: 800; color: #00AEEF; }
  .logo-sub { font-size: 9pt; color: #6b7280; margin-top: 2px; }
  .doc-info { text-align: right; }
  .doc-info .label { font-size: 8pt; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; }
  .doc-info .value { font-size: 10pt; font-weight: 600; }
  h1 { font-size: 18pt; font-weight: 700; color: #14171e; margin-bottom: 8px; }
  .subtitle { color: #6b7280; font-size: 10pt; margin-bottom: 20px; }
  .section { margin-bottom: 30px; page-break-inside: avoid; }
  .section-title { font-size: 11pt; font-weight: 700; color: #00AEEF; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; margin-bottom: 12px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 24px; }
  .info-item .label { font-size: 8pt; color: #6b7280; text-transform: uppercase; font-weight: 600; letter-spacing: 0.04em; }
  .info-item .value { font-size: 10pt; font-weight: 500; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  th { text-align: left; padding: 8px 10px; background: #f3f4f6; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.04em; color: #4b5563; font-weight: 700; border-bottom: 2px solid #d1d5db; }
  td { padding: 10px; border-bottom: 1px solid #e5e7eb; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .total-row { background: #f9fafb; font-weight: 700; }
  .grand-total { background: #00AEEF; color: white; font-size: 13pt; }
  .grand-total td { padding: 14px 10px; }
  .observations { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; font-size: 9pt; color: #92400e; margin-top: 16px; }
  .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 8pt; color: #6b7280; text-align: center; }
  .signature { margin-top: 60px; display: grid; grid-template-columns: 1fr 1fr; gap: 60px; }
  .signature-line { border-top: 1px solid #14171e; padding-top: 8px; text-align: center; font-size: 9pt; }
  @media print {
    body { padding: 0; }
    .no-print { display: none; }
  }
</style>
</head>
<body>
<div class="no-print" style="text-align:right;margin-bottom:20px">
  <button onclick="window.print()" style="padding:10px 24px;background:#00AEEF;color:white;border:none;border-radius:6px;cursor:pointer;font-size:11pt">🖨️ Salvar como PDF / Imprimir</button>
</div>

<div class="header">
  <div>
    <div class="logo">RENOSTTER</div>
    <div class="logo-sub">Climatização & Manutenção HVAC</div>
  </div>
  <div class="doc-info">
    <div class="label">Proposta Comercial</div>
    <div class="value">#${c.id.substring(0, 8).toUpperCase()}</div>
    <div class="label" style="margin-top:8px">Data</div>
    <div class="value">${fmtDate(c.created_at)}</div>
    <div class="label" style="margin-top:8px">Validade</div>
    <div class="value">${fmtDate(c.validade_em)}</div>
  </div>
</div>

<h1>${c.titulo || 'Proposta de Instalação de Ar Condicionado'}</h1>
<div class="subtitle">${c.endereco_obra || 'Endereço a definir'}</div>

<div class="section">
  <div class="section-title">Cliente</div>
  <div class="info-grid">
    <div class="info-item">
      <div class="label">Nome / Razão Social</div>
      <div class="value">${c.cliente_nome || c.contato_nome || 'A definir'}</div>
    </div>
    <div class="info-item">
      <div class="label">Contato</div>
      <div class="value">${c.contato_nome || '—'}</div>
    </div>
    <div class="info-item">
      <div class="label">E-mail</div>
      <div class="value">${c.contato_email || '—'}</div>
    </div>
    <div class="info-item">
      <div class="label">Telefone</div>
      <div class="value">${c.contato_telefone || '—'}</div>
    </div>
  </div>
</div>

<div class="section">
  <div class="section-title">Dimensionamento Técnico</div>
  <div class="info-grid">
    <div class="info-item">
      <div class="label">Tipo de Ambiente</div>
      <div class="value">${c.ambiente_tipo || '—'}</div>
    </div>
    <div class="info-item">
      <div class="label">Área</div>
      <div class="value">${c.area_m2} m²</div>
    </div>
    <div class="info-item">
      <div class="label">Pé-direito</div>
      <div class="value">${c.pe_direito_m || 2.8} m</div>
    </div>
    <div class="info-item">
      <div class="label">Pessoas / Equipamentos</div>
      <div class="value">${c.num_pessoas} / ${c.num_equipamentos_eletricos}</div>
    </div>
    <div class="info-item">
      <div class="label">BTU Recomendado</div>
      <div class="value" style="color:#00AEEF;font-weight:700">${(c.btu_calculado || 0).toLocaleString('pt-BR')} BTU</div>
    </div>
    <div class="info-item">
      <div class="label">Potência</div>
      <div class="value">${c.potencia_kw || 0} kW</div>
    </div>
    <div class="info-item">
      <div class="label">Refrigerante</div>
      <div class="value">${c.refrigerante || 'R-410A'}</div>
    </div>
    <div class="info-item">
      <div class="label">Equipamento Sugerido</div>
      <div class="value" style="font-weight:700">${eq}</div>
    </div>
  </div>
</div>

<div class="section">
  <div class="section-title">Lista de Materiais (BOM)</div>
  <table>
    <thead>
      <tr>
        <th style="width:5%">#</th>
        <th>Descrição</th>
        <th style="width:10%">SKU</th>
        <th style="width:8%">Qtd</th>
        <th style="width:8%">Un</th>
        <th style="width:15%">Preço Un.</th>
        <th style="width:15%">Total</th>
      </tr>
    </thead>
    <tbody>
      ${itens.map((i, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td>${i.descricao}<br><span style="font-size:8pt;color:#6b7280">${i.observacoes || ''}</span></td>
          <td style="font-family:monospace;font-size:9pt">${i.sku || '—'}</td>
          <td class="num">${i.quantidade}</td>
          <td>${i.unidade || 'un'}</td>
          <td class="num">${fmtBRL(i.preco_unitario)}</td>
          <td class="num" style="font-weight:600">${fmtBRL(i.preco_total)}</td>
        </tr>
      `).join('')}
      <tr class="total-row">
        <td colspan="6" class="num">Subtotal Materiais</td>
        <td class="num">${fmtBRL(totalItens)}</td>
      </tr>
      <tr>
        <td colspan="6" class="num">Mão de obra (${(c.custo_mao_obra / 80).toFixed(0)}h × R$ 80/h)</td>
        <td class="num">${fmtBRL(c.custo_mao_obra)}</td>
      </tr>
      <tr>
        <td colspan="6" class="num">Margem de lucro (${c.margem_lucro_percent}%)</td>
        <td class="num" style="color:#16a34a">${fmtBRL(c.custo_total - totalItens - c.custo_mao_obra)}</td>
      </tr>
      <tr class="grand-total">
        <td colspan="6" class="num">TOTAL GERAL</td>
        <td class="num">${fmtBRL(c.custo_total)}</td>
      </tr>
    </tbody>
  </table>
</div>

<div class="observations">
  <strong>Condições Comerciais:</strong><br>
  • Pagamento: 50% entrada + 50% na entrega<br>
  • Prazo de instalação: 5 a 10 dias úteis após aprovação<br>
  • Garantia: 12 meses no equipamento + 90 dias na instalação<br>
  • Orçamento válido até ${fmtDate(c.validade_em)}<br>
  ${c.observacoes ? '• ' + c.observacoes : ''}
</div>

<div class="signature">
  <div class="signature-line">
    <strong>${c.cliente_nome || c.contato_nome || 'Cliente'}</strong><br>
    <span style="color:#6b7280;font-size:8pt">CPF/CNPJ: _______________</span>
  </div>
  <div class="signature-line">
    <strong>Renostter Climatização</strong><br>
    <span style="color:#6b7280;font-size:8pt">CNPJ: _______________</span>
  </div>
</div>

<div class="footer">
  Renostter Climatização & Manutenção HVAC | contato@renostter.com.br | (11) 9999-9999<br>
  Proposta gerada eletronicamente em ${new Date().toLocaleString('pt-BR')}
</div>

</body>
</html>`;
}

// ═══════════════════════════════════════════
// ROTAS — Geolocalização Técnicos
// ═══════════════════════════════════════════

// POST /api/tecnico/localizacao — Registrar localização (app PWA)
// SECURITY HARDENING 2 — V02: técnico registra a própria localização (autenticação JWT obrigatória)
app.post('/api/tecnico/localizacao', requireRole('admin', 'superadmin', 'tech'), async (req, res) => {
    try {
        const { tecnicoId, latitude, longitude, precisao, endereco, speed, heading, batteryLevel, appVersion } = req.body;
        if (!tecnicoId || latitude == null || longitude == null)
            return res.status(400).json({ success: false, error: 'tecnicoId, latitude e longitude são obrigatórios' });

        // Técnicos só podem registrar a própria localização
        if (req.auditInfo.role === 'tech' && req.auditInfo.userId !== tecnicoId) {
            return res.status(403).json({ success: false, error: 'Técnico só pode registrar a própria localização' });
        }

        await dbRun(`INSERT INTO tecnico_localizacao
            (tecnico_id, latitude, longitude, precisao, endereco, speed, heading, battery_level, app_version, recorded_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
            [tecnicoId, latitude, longitude, precisao || null, endereco || null,
             speed || null, heading || null, batteryLevel || null, appVersion || null]);

        res.status(201).json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/tecnico/localizacao/:tecnicoId — Última localização
// SECURITY HARDENING 2 — V02: técnico vê só a própria, admin vê qualquer
app.get('/api/tecnico/localizacao/:tecnicoId', requireRole('admin', 'superadmin', 'tech', 'financeiro'), async (req, res) => {
    try {
        // Técnico só vê a própria localização
        if (req.auditInfo.role === 'tech' && req.auditInfo.userId !== req.params.tecnicoId) {
            return res.status(403).json({ success: false, error: 'Acesso negado' });
        }
        const loc = await dbGet(
            `SELECT * FROM tecnico_localizacao WHERE tecnico_id = ? ORDER BY recorded_at DESC LIMIT 1`,
            [req.params.tecnicoId]
        );
        res.json({ success: true, data: loc || null });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/tecnico/localizacao — Última localização por técnico (para dispatch)
// SECURITY HARDENING 2 — V02: só admin/superadmin veem todas (dispatch centralizado)
app.get('/api/tecnico/localizacao', requireRole('admin', 'superadmin'), async (req, res) => {
    try {
        const { since } = req.query; // ex: 30 = últimos 30 min
        // Retorna apenas a última localização de cada técnico
        let sql = `
            SELECT l.*, u.nome as tecnico_nome, u.cargo
            FROM tecnico_localizacao l
            INNER JOIN (
                SELECT tecnico_id, MAX(recorded_at) as max_recorded
                FROM tecnico_localizacao
                GROUP BY tecnico_id
            ) latest ON l.tecnico_id = latest.tecnico_id AND l.recorded_at = latest.max_recorded
            LEFT JOIN usuarios u ON u.id = l.tecnico_id
            WHERE 1=1`;
        const params = [];
        if (since) {
            sql += ` AND l.recorded_at >= datetime('now', '-${parseInt(since)} minutes')`;
        }
        sql += ` ORDER BY l.recorded_at DESC`;
        const locs = await dbAll(sql, params);
        res.json({ success: true, data: locs });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ═══════════════════════════════════════════
// ROTAS — Avaliações CSAT (Satisfação pós-serviço)
// ═══════════════════════════════════════════

const CSAT_STARS = {
    nota:          { label: 'Nota geral',        min: 1, max: 5 },
    tempo_resposta:{ label: 'Tempo de resposta', min: 1, max: 5 },
    qualidade_equipamento: { label: 'Qualidade do equipamento', min: 1, max: 5 },
    recomendaria:  { label: 'Recomendaria?',     min: 1, max: 5 },
};

const crypto2 = require('crypto');

// GET /api/avaliacoes — Listar avaliações
// SECURITY HARDENING 2 — V02
app.get('/api/avaliacoes', requireRole('admin', 'superadmin', 'tech', 'financeiro'), async (req, res) => {
    try {
        const { chamadoId, limite } = req.query;
        let sql = 'SELECT a.*, c.titulo as chamado_titulo FROM avaliacoes a LEFT JOIN chamados c ON c.id = a.chamado_id WHERE 1=1';
        const params = [];
        if (chamadoId) { sql += ' AND a.chamado_id = ?'; params.push(chamadoId); }
        sql += ' ORDER BY a.created_at DESC';
        if (limite) { sql += ` LIMIT ${parseInt(limite)}`; }
        const rows = await dbAll(sql, params);
        res.json({ success: true, data: rows });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/avaliacoes/stats — KPIs CSAT
// SECURITY HARDENING 2 — V02
app.get('/api/avaliacoes/stats', requireRole('admin', 'superadmin', 'tech', 'financeiro'), async (req, res) => {
    try {
        const total   = (await dbGet('SELECT COUNT(*) as n FROM avaliacoes')).n || 0;
        const avgNota = (await dbGet('SELECT AVG(nota) as avg FROM avaliacoes')).avg || 0;
        const thisMonth = (await dbGet(
            "SELECT COUNT(*) as n FROM avaliacoes WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')"
        )).n || 0;
        const promoters = (await dbGet('SELECT COUNT(*) as n FROM avaliacoes WHERE nota >= 4')).n || 0;
        const promotersRate = total > 0 ? Math.round((promoters / total) * 100) : 0;
        const nps = promotersRate - (total > 0 ? Math.round(((total - promoters) / total) * 100) : 0);
        res.json({ success: true, data: { total, avgNota: Math.round(avgNota * 10) / 10, thisMonth, promotersRate, nps } });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// POST /api/avaliacoes — Registrar avaliação (feedback do cliente)
// SECURITY HARDENING 2 — V02: mantém-se público (link único enviado por WhatsApp/email após chamado)
// TODO Sprint 19: rate limit + token único de avaliação para evitar abuso
app.post('/api/avaliacoes', async (req, res) => {
    try {
        const { chamadoId, clienteId, tecnicoId, nota, comentario, tempoResposta, qualidadeEquipamento, recomendaria } = req.body;
        if (!chamadoId) return res.status(400).json({ success: false, error: 'chamadoId é obrigatório' });
        if (!nota || nota < 1 || nota > 5) return res.status(400).json({ success: false, error: 'Nota deve ser entre 1 e 5' });

        const id = crypto2.randomUUID();
        await dbRun(`INSERT INTO avaliacoes
            (id, chamado_id, cliente_id, tecnico_id, nota, comentario, tempo_resposta, qualidade_equipamento, recomendaria, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
            [id, chamadoId, clienteId || null, tecnicoId || null, nota,
             comentario || null, tempoResposta || null, qualidadeEquipamento || null, recomendaria || null]);

        res.status(201).json({ success: true, data: { id } });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/avaliacoes/pendentes — Chamados resolvidos sem avaliação (para pedir feedback)
// SECURITY HARDENING 2 — V02
app.get('/api/avaliacoes/pendentes', requireRole('admin', 'superadmin', 'tech', 'financeiro'), async (req, res) => {
    try {
        const rows = await dbAll(`
            SELECT c.id, c.titulo, c.cliente_id, cl.nome as cliente_nome, c.data_fechamento
            FROM chamados c
            LEFT JOIN clientes cl ON cl.id = c.cliente_id
            LEFT JOIN avaliacoes a ON a.chamado_id = c.id
            WHERE c.status IN ('Resolvido', 'Fechado')
              AND c.data_fechamento IS NOT NULL
              AND a.id IS NULL
            ORDER BY c.data_fechamento DESC
            LIMIT 50
        `);
        res.json({ success: true, data: rows });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ═══════════════════════════════════════════
// CRON JOB — Rotinas automáticas
// ═══════════════════════════════════════════
cron.schedule(process.env.CRON_SCHEDULE || '0 3 * * *', async () => {
    console.log(`\n[Cron] ═══ Rotinas automáticas iniciadas (${new Date().toISOString()}) ═══`);
    try {
        // 1. Sincronização de Bancos BACEN (3:00 AM)
        await syncBanks();

        // 2. Recorrências (8:00 AM logic inside manager if needed, or separate cron)
        // Note: For simplicity, we keep both in the same 3:00 AM or use different schedules
        await manager.executarRecorrencias(getGateway);

        // 3. Régua de Cobrança (Lembretes)
        await reminders.executeDailyReminders();

        // 4. Alertas de Garantia
        await verificarGarantiasProximas();

        // 5. Renovação automática de contratos
        const renovacoes = await contratoManager.executarRenovacoesAutomaticas();
        if (renovacoes.length) console.log(`[Cron] ${renovacoes.length} contrato(s) renovados automaticamente.`);

        console.log('[Cron] Todas as tarefas automáticas finalizadas.');
    } catch (e) { console.error('[Cron Error]', e); }
});

// ── Alertas de Garantia (chamado pelo cron) ──
async function verificarGarantiasProximas() {
    try {
        const proximas = await chamadoManager.getGarantiasProximasVencimento();
        if (proximas.length === 0) return;
        console.log(`[Garantia] ${proximas.length} garantia(s) vencendo nos próximos dias:`);
        for (const c of proximas) {
            console.log(`  → #${c.id} — ${c.cliente_nome || c.cliente_id} — vence em ${c.diasRestantes}d`);
            // Aqui você pode disparar e-mail ou notificação interna
            // Ex: await notificationService.enviarAlertaGarantia(c);
        }
    } catch (e) {
        console.error('[Garantia] Erro ao verificar vencimentos:', e.message);
    }
}

// ═══════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════
app.listen(PORT, () => {
    console.log(`\n╔══════════════════════════════════════════╗`);
    console.log(`║  Renostter CRM — Middleware Cobrança     ║`);
    console.log(`║  Porta: ${String(PORT).padEnd(33)}║`);
    console.log(`║  Ambiente: ${(process.env.CORA_ENV || 'stage').padEnd(30)}║`);
    console.log(`╚══════════════════════════════════════════╝\n`);
});
