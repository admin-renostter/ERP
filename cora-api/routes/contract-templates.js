/**
 * Routes — Templates de Contrato customizados
 *
 * Sprint 11 — UI admin
 * Sprint 21 — Integração Autentique (assinatura digital)
 *
 * IMPORTANTE: Rotas estáticas (/foo, /foo/bar) DEVEM vir ANTES de rotas dinâmicas
 * (/:id) porque o Express testa na ordem. /:id casaria "contratos-gerados" como id.
 *
 * Rotas (ordem de declaração):
 *
 *   GET    /                                Lista templates
 *   POST   /                                Cria novo template
 *   POST   /seed                            Cria templates padrão
 *   POST   /extract-vars                    Extrai placeholders de HTML
 *   GET    /autentique/status               Healthcheck Autentique
 *   POST   /gerar                           Gera contrato a partir de template
 *   GET    /contratos-gerados               Lista contratos gerados
 *   GET    /contratos-gerados/:id           Detalhe contrato gerado
 *   POST   /contratos-gerados/:id/enviar    Envia contrato gerado p/ Autentique
 *   GET    /contratos-gerados/:id/status    Sincroniza status com Autentique
 *   GET    /slug/:slug                      Detalhe por slug
 *   GET    /:id                             Detalhe
 *   PUT    /:id                             Atualiza
 *   DELETE /:id                             Soft delete
 *   POST   /:id/duplicate                   Duplica
 *   POST   /:id/render                      Renderiza com data
 */

const express = require('express');
const router = express.Router();
const { requireRole } = require('../middleware/authJWT');
const TemplateService = require('../services/TemplateService');
const AutentiqueService = require('../services/AutentiqueService');
const { dbGet, dbRun, dbAll } = require('../database');
const crypto = require('crypto');

// ═══════════════════════════════════════════════════════════════════════
// ROTAS ESTÁTICAS (DEVEM VIR ANTES DAS DINÂMICAS /:id)
// ═══════════════════════════════════════════════════════════════════════

/**
 * GET /api/contract-templates
 * Query: ?categoria=manutencao&page=0&size=50
 */
router.get('/', requireRole('admin', 'superadmin', 'financeiro', 'tecnico'), async (req, res) => {
    try {
        const result = await TemplateService.listar({
            categoria: req.query.categoria,
            apenasAtivos: req.query.incluirInativos === 'true' ? false : true,
            page: parseInt(req.query.page || '0'),
            size: parseInt(req.query.size || '50'),
        });
        res.json({ success: true, ...result });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * POST /api/contract-templates
 * Body: { slug, nome, html_content, descricao?, categoria?, tipo_contrato?, css_content? }
 */
router.post('/', requireRole('admin', 'superadmin'), async (req, res) => {
    try {
        const tpl = await TemplateService.criar({
            ...req.body,
            created_by: req.auditInfo?.userId,
        });
        res.status(201).json({ success: true, template: tpl });
    } catch (e) {
        const status = e.code === 'MISSING_REQUIRED' || e.code === 'INVALID_SLUG' ? 400 : 500;
        res.status(status).json({ success: false, error: e.message, code: e.code });
    }
});

/**
 * POST /api/contract-templates/seed
 * Cria templates padrão (manutenção, PMOC, etc).
 */
router.post('/seed', requireRole('admin', 'superadmin'), async (req, res) => {
    try {
        const results = await TemplateService.seedPadroes();
        res.json({ success: true, results });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * POST /api/contract-templates/extract-vars
 * Body: { html: "..." }
 * Returns: { variables: ["cliente.nome", "contrato.valor_mensal", ...] }
 */
router.post('/extract-vars', requireRole('admin', 'superadmin', 'tecnico'), async (req, res) => {
    try {
        const { html } = req.body || {};
        if (!html) return res.status(400).json({ success: false, error: 'html é obrigatório' });
        const variables = TemplateService.extractPlaceholders(html);
        res.json({ success: true, variables });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════
// SPRINT 21 — INTEGRAÇÃO AUTENTIQUE
// ═══════════════════════════════════════════════════════════════════════

/**
 * GET /api/contract-templates/autentique/status
 * Healthcheck da integração Autentique
 */
router.get('/autentique/status', requireRole('admin', 'superadmin'), async (req, res) => {
    try {
        const status = await AutentiqueService.healthcheck();
        res.json({ success: true, ...status });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * POST /api/contract-templates/gerar
 * Gera contrato a partir de um template (substitui placeholders)
 *
 * Body: {
 *   template_id: 'tpl-001',
 *   cliente_id: 'cli-001',
 *   contrato_id?: 'CT-2026-0001',  // opcional — vincula a um contrato existente
 *   data?: { ... },                 // variáveis extras
 *   enviar_autentique?: false,      // se true, envia direto para assinatura
 *   signers?: [{ email, name, positions? }]
 * }
 */
router.post('/gerar', requireRole('admin', 'superadmin', 'financeiro', 'tecnico'), async (req, res) => {
    try {
        const { template_id, cliente_id, contrato_id, data = {}, enviar_autentique = false, signers = [] } = req.body || {};

        if (!template_id) return res.status(400).json({ success: false, error: 'template_id é obrigatório', code: 'MISSING_TEMPLATE' });
        if (!cliente_id) return res.status(400).json({ success: false, error: 'cliente_id é obrigatório', code: 'MISSING_CLIENTE' });

        const tpl = await TemplateService.buscarPorId(template_id);
        if (!tpl) return res.status(404).json({ success: false, error: 'Template não encontrado', code: 'TEMPLATE_NOT_FOUND' });

        const cliente = await dbGet('SELECT * FROM clientes WHERE id = ?', [cliente_id]);
        if (!cliente) return res.status(404).json({ success: false, error: 'Cliente não encontrado', code: 'CLIENTE_NOT_FOUND' });

        const contrato = contrato_id ? await dbGet('SELECT * FROM contratos WHERE id = ?', [contrato_id]) : null;

        const empresa = {
            nome: process.env.COMPANY_NAME || 'Renostter Climatização',
            cnpj: process.env.COMPANY_CNPJ || '11.222.333/0001-44',
            endereco: process.env.COMPANY_ADDRESS || 'Av. Brasil, 1000',
            cidade: process.env.COMPANY_CITY || 'São Paulo',
            estado: process.env.COMPANY_STATE || 'SP',
        };
        const hoje = new Date();
        const ctx = {
            contrato: contrato ? {
                id: contrato.id,
                titulo: contrato.titulo,
                valor_mensal: contrato.valor_mensal,
                valor_mensal_fmt: formatCurrency(contrato.valor_mensal),
                valor_anual: contrato.valor_anual,
                valor_anual_fmt: formatCurrency(contrato.valor_anual),
                data_inicio: contrato.data_inicio,
                data_inicio_fmt: formatDate(contrato.data_inicio),
                data_fim: contrato.data_fim,
                data_fim_fmt: formatDate(contrato.data_fim),
                dias_contrato: contrato.data_fim ? daysBetween(contrato.data_inicio, contrato.data_fim) : 0,
                tipo: contrato.tipo_contrato,
                frequencia: contrato.frequencia_cobranca,
            } : null,
            cliente: {
                nome: cliente.nome,
                email: cliente.email,
                cnpj_cpf: cliente.cnpj,
                cnpj_cpf_fmt: cliente.cnpj,
                telefone: cliente.telefone,
                endereco: cliente.endereco || '',
            },
            empresa,
            hoje: hoje.toISOString().split('T')[0],
            hoje_extenso: formatDateLong(hoje),
            ...data,
        };

        const render = await TemplateService.renderizarTemplate(template_id, ctx);
        const htmlFinal = render.html;

        const id = 'cgen-' + crypto.randomBytes(6).toString('hex');
        const nomeDoc = `${tpl.nome} - ${cliente.nome}`;
        await dbRun(
            `INSERT INTO contratos_gerados
                (id, template_id, contrato_id, cliente_id, nome_documento, status, html_renderizado, signers_json, created_by)
             VALUES (?, ?, ?, ?, ?, 'pendente', ?, ?, ?)`,
            [id, template_id, contrato_id || null, cliente_id, nomeDoc, JSON.stringify(signers), req.auditInfo?.userId || 'system']
        );

        let autentiqueResult = null;
        let aviso = null;

        if (enviar_autentique) {
            try {
                const fileBase64 = Buffer.from(htmlFinal, 'utf-8').toString('base64');
                const finalSigners = signers.length > 0
                    ? signers
                    : (cliente.email ? [{ email: cliente.email, name: cliente.nome }] : []);

                if (finalSigners.length === 0) {
                    aviso = 'Nenhum signatário informado — contrato salvo mas não enviado';
                } else {
                    autentiqueResult = await AutentiqueService.createDocument({
                        name: nomeDoc,
                        fileBase64,
                        signers: finalSigners,
                    });

                    await dbRun(
                        `UPDATE contratos_gerados
                            SET autentique_document_id = ?, autentique_short_url = ?, status = 'enviado', data_envio = datetime('now')
                          WHERE id = ?`,
                        [autentiqueResult.id, autentiqueResult.short_url, id]
                    );
                }
            } catch (e) {
                await dbRun(
                    `UPDATE contratos_gerados SET status = 'erro', erro = ? WHERE id = ?`,
                    [e.message, id]
                );
                aviso = `Contrato gerado mas falhou ao enviar: ${e.message}`;
            }
        }

        const saved = await dbGet('SELECT * FROM contratos_gerados WHERE id = ?', [id]);
        res.status(201).json({
            success: true,
            id,
            html: htmlFinal,
            placeholders: render.placeholders,
            documento: saved,
            autentique: autentiqueResult,
            aviso,
        });
    } catch (e) {
        console.error('[Templates] Erro em /gerar:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * GET /api/contract-templates/contratos-gerados
 * Lista contratos gerados (com filtros)
 */
router.get('/contratos-gerados', requireRole('admin', 'superadmin', 'financeiro', 'tecnico'), async (req, res) => {
    try {
        const { status, cliente_id, template_id, limit = 50 } = req.query;
        const where = [];
        const params = [];
        if (status) { where.push('cg.status = ?'); params.push(status); }
        if (cliente_id) { where.push('cg.cliente_id = ?'); params.push(cliente_id); }
        if (template_id) { where.push('cg.template_id = ?'); params.push(template_id); }
        const sql = `SELECT cg.*, c.nome as cliente_nome, ct.nome as template_nome, ct.slug as template_slug
                     FROM contratos_gerados cg
                     LEFT JOIN clientes c ON c.id = cg.cliente_id
                     LEFT JOIN contract_templates ct ON ct.id = cg.template_id
                     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                     ORDER BY cg.created_at DESC LIMIT ?`;
        params.push(parseInt(limit));
        const data = await dbAll(sql, params);
        res.json({ success: true, data, total: data.length });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * GET /api/contract-templates/contratos-gerados/:id
 */
router.get('/contratos-gerados/:id', requireRole('admin', 'superadmin', 'financeiro', 'tecnico'), async (req, res) => {
    try {
        const row = await dbGet(
            `SELECT cg.*, c.nome as cliente_nome, ct.nome as template_nome, ct.slug as template_slug
             FROM contratos_gerados cg
             LEFT JOIN clientes c ON c.id = cg.cliente_id
             LEFT JOIN contract_templates ct ON ct.id = cg.template_id
             WHERE cg.id = ?`,
            [req.params.id]
        );
        if (!row) return res.status(404).json({ success: false, error: 'Contrato gerado não encontrado' });
        if (row.signers_json) {
            try { row.signers = JSON.parse(row.signers_json); } catch { row.signers = []; }
        }
        res.json({ success: true, data: row });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * POST /api/contract-templates/contratos-gerados/:id/enviar
 * Envia um contrato já gerado para o Autentique
 */
router.post('/contratos-gerados/:id/enviar', requireRole('admin', 'superadmin'), async (req, res) => {
    try {
        const { signers = [] } = req.body || {};
        const row = await dbGet('SELECT * FROM contratos_gerados WHERE id = ?', [req.params.id]);
        if (!row) return res.status(404).json({ success: false, error: 'Contrato gerado não encontrado' });
        if (row.autentique_document_id) {
            return res.status(400).json({ success: false, error: 'Já enviado ao Autentique', code: 'ALREADY_SENT' });
        }

        const cliente = row.cliente_id ? await dbGet('SELECT email, nome FROM clientes WHERE id = ?', [row.cliente_id]) : null;
        const finalSigners = signers.length > 0
            ? signers
            : (cliente ? [{ email: cliente.email, name: cliente.nome }] : []);

        if (finalSigners.length === 0) {
            return res.status(400).json({ success: false, error: 'Nenhum signatário disponível', code: 'NO_SIGNERS' });
        }

        const fileBase64 = Buffer.from(row.html_renderizado || '', 'utf-8').toString('base64');
        const result = await AutentiqueService.createDocument({
            name: row.nome_documento,
            fileBase64,
            signers: finalSigners,
        });

        await dbRun(
            `UPDATE contratos_gerados
                SET autentique_document_id = ?, autentique_short_url = ?, status = 'enviado',
                    data_envio = datetime('now'), signers_json = ?, updated_at = datetime('now')
              WHERE id = ?`,
            [result.id, result.short_url, JSON.stringify(finalSigners), req.params.id]
        );

        res.json({ success: true, autentique: result });
    } catch (e) {
        await dbRun(
            `UPDATE contratos_gerados SET status = 'erro', erro = ?, updated_at = datetime('now') WHERE id = ?`,
            [e.message, req.params.id]
        );
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * GET /api/contract-templates/contratos-gerados/:id/status
 * Sincroniza status com Autentique
 */
router.get('/contratos-gerados/:id/status', requireRole('admin', 'superadmin', 'financeiro', 'tecnico'), async (req, res) => {
    try {
        const row = await dbGet('SELECT * FROM contratos_gerados WHERE id = ?', [req.params.id]);
        if (!row) return res.status(404).json({ success: false, error: 'Contrato gerado não encontrado' });
        if (!row.autentique_document_id) {
            return res.json({ success: true, status: row.status, message: 'Ainda não enviado ao Autentique' });
        }

        const doc = await AutentiqueService.getDocument(row.autentique_document_id);
        const statusMap = {
            'sent': 'enviado', 'pending': 'enviado',
            'signed': 'assinado', 'rejected': 'rejeitado', 'canceled': 'cancelado',
        };
        const newStatus = statusMap[doc.status] || row.status;

        if (newStatus !== row.status) {
            await dbRun(
                `UPDATE contratos_gerados SET status = ?, data_assinatura = CASE WHEN ? = 'assinado' THEN datetime('now') ELSE data_assinatura END, updated_at = datetime('now') WHERE id = ?`,
                [newStatus, newStatus, req.params.id]
            );
        }

        res.json({ success: true, status: newStatus, autentique_status: doc.status, document: doc });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * GET /api/contract-templates/slug/:slug
 * Detalhe por slug
 */
router.get('/slug/:slug', requireRole('admin', 'superadmin', 'financeiro', 'tecnico'), async (req, res) => {
    try {
        const tpl = await TemplateService.buscarPorSlug(req.params.slug);
        if (!tpl) return res.status(404).json({ success: false, error: 'Template não encontrado' });
        res.json({ success: true, template: tpl });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════
// ROTAS DINÂMICAS — DEVEM VIR POR ÚLTIMO (/:id casa qualquer string)
// ═══════════════════════════════════════════════════════════════════════

/**
 * GET /api/contract-templates/:id
 */
router.get('/:id', requireRole('admin', 'superadmin', 'financeiro', 'tecnico'), async (req, res) => {
    try {
        const tpl = await TemplateService.buscarPorId(req.params.id);
        if (!tpl) return res.status(404).json({ success: false, error: 'Template não encontrado' });
        res.json({ success: true, template: tpl });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * PUT /api/contract-templates/:id
 */
router.put('/:id', requireRole('admin', 'superadmin'), async (req, res) => {
    try {
        const tpl = await TemplateService.atualizar(req.params.id, req.body);
        res.json({ success: true, template: tpl });
    } catch (e) {
        const status = e.code === 'NO_FIELDS' ? 400 : 500;
        res.status(status).json({ success: false, error: e.message, code: e.code });
    }
});

/**
 * DELETE /api/contract-templates/:id (soft delete)
 */
router.delete('/:id', requireRole('admin', 'superadmin'), async (req, res) => {
    try {
        await TemplateService.remover(req.params.id);
        res.json({ success: true, message: 'Template desativado' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * POST /api/contract-templates/:id/duplicate
 */
router.post('/:id/duplicate', requireRole('admin', 'superadmin'), async (req, res) => {
    try {
        const tpl = await TemplateService.duplicar(req.params.id, req.body?.novoSlug);
        res.status(201).json({ success: true, template: tpl });
    } catch (e) {
        const status = e.code === 'NOT_FOUND' ? 404 : 500;
        res.status(status).json({ success: false, error: e.message, code: e.code });
    }
});

/**
 * POST /api/contract-templates/:id/render
 */
router.post('/:id/render', requireRole('admin', 'superadmin', 'tecnico'), async (req, res) => {
    try {
        const result = await TemplateService.renderizarTemplate(req.params.id, req.body?.data || {});
        res.json({ success: true, ...result });
    } catch (e) {
        const status = e.code === 'TEMPLATE_NOT_FOUND' ? 404 : 500;
        res.status(status).json({ success: false, error: e.message, code: e.code });
    }
});

// ═══════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════

function formatCurrency(v) {
    if (v == null) return '';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function formatDate(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
}

function formatDateLong(d) {
    return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function daysBetween(start, end) {
    if (!start || !end) return 0;
    const d1 = new Date(start);
    const d2 = new Date(end);
    return Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24));
}

module.exports = router;
