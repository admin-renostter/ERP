/**
 * Financeiro Routes — 9 módulos baseados nas planilhas Cora
 *
 * Sprint 19 — Módulos Financeiros (Agosto 2026)
 *
 * Endpoints:
 *   /api/financeiro/fluxo-caixa        (1)
 *   /api/financeiro/custo-producao     (2)
 *   /api/financeiro/conciliacao        (3)
 *   /api/financeiro/precificacao       (4)
 *   /api/financeiro/contas             (5)
 *   /api/financeiro/inadimplencia      (6)
 *   /api/financeiro/balanco            (7)
 *   /api/financeiro/orcamento          (8)
 *   /api/financeiro/dre                (9)
 */

const express = require('express');
const router = express.Router();
const { requireRole } = require('../middleware/authJWT');
const { asyncHandler, handleError } = require('../middleware/errorHandler');
const { validate, schemas } = require('../middleware/validate');
const Financeiro = require('../services/FinanceiroService');

const ALLOWED = ['admin', 'superadmin', 'financeiro'];

// ════════════════════════════════════════════════════════════
// 1. FLUXO DE CAIXA
// ════════════════════════════════════════════════════════════

router.get('/fluxo-caixa', requireRole(...ALLOWED), asyncHandler(async (req, res) => {
    const data = await Financeiro.FluxoCaixa.listar(req.query);
    const resumo = await Financeiro.FluxoCaixa.resumo(req.query);
    res.json({ success: true, data, resumo, total: data.length });
}));

router.post('/fluxo-caixa', requireRole(...ALLOWED), asyncHandler(async (req, res) => {
    const result = await Financeiro.FluxoCaixa.criar(req.body);
    res.status(201).json({ success: true, ...result });
}));

router.get('/fluxo-caixa/resumo', requireRole(...ALLOWED), asyncHandler(async (req, res) => {
    const resumo = await Financeiro.FluxoCaixa.resumo(req.query);
    res.json({ success: true, data: resumo });
}));

// ════════════════════════════════════════════════════════════
// 2. CUSTO DE PRODUÇÃO
// ════════════════════════════════════════════════════════════

router.get('/custo-producao', requireRole(...ALLOWED), asyncHandler(async (req, res) => {
    const data = await Financeiro.CustoProducao.listar(req.query);
    res.json({ success: true, data, total: data.length });
}));

router.post('/custo-producao', requireRole(...ALLOWED), asyncHandler(async (req, res) => {
    const result = await Financeiro.CustoProducao.criar(req.body);
    res.status(201).json({ success: true, ...result });
}));

router.get('/custo-producao/resumo', requireRole(...ALLOWED), asyncHandler(async (req, res) => {
    const data = await Financeiro.CustoProducao.resumoPorProduto(req.query);
    res.json({ success: true, data });
}));

// ════════════════════════════════════════════════════════════
// 3. CONCILIAÇÃO BANCÁRIA
// ════════════════════════════════════════════════════════════

router.get('/conciliacao', requireRole(...ALLOWED), asyncHandler(async (req, res) => {
    const data = await Financeiro.Conciliacao.listar(req.query);
    res.json({ success: true, data, total: data.length });
}));

router.post('/conciliacao', requireRole(...ALLOWED), asyncHandler(async (req, res) => {
    const result = await Financeiro.Conciliacao.criar(req.body);
    res.status(201).json({ success: true, ...result });
}));

router.post('/conciliacao/:id/conciliar', requireRole(...ALLOWED), asyncHandler(async (req, res) => {
    const result = await Financeiro.Conciliacao.marcarConciliado(req.params.id);
    res.json({ success: true, ...result });
}));

router.get('/conciliacao/comparar', requireRole(...ALLOWED), asyncHandler(async (req, res) => {
    const data = await Financeiro.Conciliacao.comparar(req.query);
    res.json({ success: true, data });
}));

// ════════════════════════════════════════════════════════════
// 4. PRECIFICAÇÃO
// ════════════════════════════════════════════════════════════

router.get('/precificacao', requireRole(...ALLOWED), asyncHandler(async (req, res) => {
    const data = await Financeiro.Precificacao.listar(req.query);
    res.json({ success: true, data, total: data.length });
}));

router.post('/precificacao', requireRole(...ALLOWED), asyncHandler(async (req, res) => {
    const result = await Financeiro.Precificacao.criar(req.body);
    res.status(201).json({ success: true, ...result });
}));

router.post('/precificacao/calcular', requireRole(...ALLOWED), asyncHandler(async (req, res) => {
    const { custo_produto, margem_percent, impostos_percent, competencia_mes } = req.body;
    const resultado = await Financeiro.Precificacao.calcularPreco({ custo_produto, margem_percent, impostos_percent, competencia_mes });
    res.json({ success: true, data: resultado });
}));

// ════════════════════════════════════════════════════════════
// 5. CONTAS A PAGAR E RECEBER
// ════════════════════════════════════════════════════════════

router.get('/contas', requireRole(...ALLOWED), asyncHandler(async (req, res) => {
    const data = await Financeiro.Contas.listar(req.query);
    res.json({ success: true, data, total: data.length });
}));

router.post('/contas', requireRole(...ALLOWED), asyncHandler(async (req, res) => {
    const result = await Financeiro.Contas.criar(req.body);
    res.status(201).json({ success: true, ...result });
}));

router.post('/contas/:id/pagar', requireRole(...ALLOWED), asyncHandler(async (req, res) => {
    const result = await Financeiro.Contas.registrarPagamento(req.params.id, req.body);
    res.json({ success: true, ...result });
}));

// ════════════════════════════════════════════════════════════
// 6. CONTROLE DE INADIMPLÊNCIA
// ════════════════════════════════════════════════════════════

router.get('/inadimplencia', requireRole(...ALLOWED), asyncHandler(async (req, res) => {
    const data = await Financeiro.Inadimplencia.listar(req.query);
    const resumo = await Financeiro.Inadimplencia.resumo();
    res.json({ success: true, data, resumo, total: data.length });
}));

router.post('/inadimplencia', requireRole(...ALLOWED), asyncHandler(async (req, res) => {
    const result = await Financeiro.Inadimplencia.criar(req.body);
    res.status(201).json({ success: true, ...result });
}));

router.post('/inadimplencia/:id/cobranca', requireRole(...ALLOWED), asyncHandler(async (req, res) => {
    const result = await Financeiro.Inadimplencia.registrarCobranca(req.params.id);
    res.json({ success: true, ...result });
}));

router.get('/inadimplencia/resumo', requireRole(...ALLOWED), asyncHandler(async (req, res) => {
    const data = await Financeiro.Inadimplencia.resumo();
    res.json({ success: true, data });
}));

// ════════════════════════════════════════════════════════════
// 7. BALANÇO PATRIMONIAL
// ════════════════════════════════════════════════════════════

router.get('/balanco', requireRole(...ALLOWED), asyncHandler(async (req, res) => {
    const data = await Financeiro.Balanco.listar(req.query);
    res.json({ success: true, data, total: data.length });
}));

router.post('/balanco', requireRole(...ALLOWED), asyncHandler(async (req, res) => {
    const result = await Financeiro.Balanco.criar(req.body);
    res.status(201).json({ success: true, ...result });
}));

router.get('/balanco/resumo/:trimestre', requireRole(...ALLOWED), asyncHandler(async (req, res) => {
    const data = await Financeiro.Balanco.resumoTrimestre(req.params.trimestre);
    res.json({ success: true, data });
}));

// ════════════════════════════════════════════════════════════
// 8. ORÇAMENTO
// ════════════════════════════════════════════════════════════

router.get('/orcamento', requireRole(...ALLOWED), asyncHandler(async (req, res) => {
    const data = await Financeiro.Orcamento.listar(req.query);
    res.json({ success: true, data, total: data.length });
}));

router.get('/orcamento/:id', requireRole(...ALLOWED), asyncHandler(async (req, res) => {
    const data = await Financeiro.Orcamento.buscarPorId(req.params.id);
    if (!data) return res.status(404).json({ success: false, error: 'Orçamento não encontrado' });
    res.json({ success: true, data });
}));

router.post('/orcamento', requireRole(...ALLOWED), asyncHandler(async (req, res) => {
    const result = await Financeiro.Orcamento.criar(req.body);
    res.status(201).json({ success: true, ...result });
}));

router.patch('/orcamento/:id/status', requireRole(...ALLOWED), asyncHandler(async (req, res) => {
    const { status } = req.body;
    const result = await Financeiro.Orcamento.atualizarStatus(req.params.id, status);
    res.json({ success: true, ...result });
}));

// ════════════════════════════════════════════════════════════
// 9. DRE
// ════════════════════════════════════════════════════════════

router.get('/dre', requireRole(...ALLOWED), asyncHandler(async (req, res) => {
    const data = await Financeiro.DRE.listar(req.query);
    res.json({ success: true, data, total: data.length });
}));

router.post('/dre', requireRole(...ALLOWED), asyncHandler(async (req, res) => {
    const result = await Financeiro.DRE.criar(req.body);
    res.status(201).json({ success: true, ...result });
}));

router.get('/dre/calcular/:mes', requireRole(...ALLOWED), asyncHandler(async (req, res) => {
    const data = await Financeiro.DRE.calcularDRE(req.params.mes);
    res.json({ success: true, data });
}));

router.get('/dre/anual/:ano', requireRole(...ALLOWED), asyncHandler(async (req, res) => {
    const data = await Financeiro.DRE.resumoAnual(parseInt(req.params.ano, 10));
    res.json({ success: true, data });
}));

// ════════════════════════════════════════════════════════════
// RESUMO GERAL DO FINANCEIRO
// ════════════════════════════════════════════════════════════

router.get('/resumo-geral', requireRole(...ALLOWED), asyncHandler(async (req, res) => {
    const [fluxo, inadimplencia, contasPagar, contasReceber] = await Promise.all([
        Financeiro.FluxoCaixa.resumo(),
        Financeiro.Inadimplencia.resumo(),
        Financeiro.Contas.listar({ tipo: 'pagar', status: 'aberto', limit: 1 }),
        Financeiro.Contas.listar({ tipo: 'receber', status: 'aberto', limit: 1 }),
    ]);
    res.json({
        success: true,
        data: {
            fluxo_caixa: fluxo,
            inadimplencia,
            contas_pagar_abertas: contasPagar.length > 0,
            contas_receber_abertas: contasReceber.length > 0,
        },
        modulos: [
            'fluxo-caixa', 'custo-producao', 'conciliacao', 'precificacao',
            'contas', 'inadimplencia', 'balanco', 'orcamento', 'dre',
        ],
    });
}));

module.exports = router;
