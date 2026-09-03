/**
 * Rotas de Contratos — Endpoints REST
 *
 * Sprint 20 — UI de Contratos + Pop-up "Novo Contrato" (Agosto 2026)
 *
 * Endpoints:
 *   GET    /api/contratos                    Listar com filtros
 *   POST   /api/contratos                    Criar novo contrato (com numeração auto + histórico)
 *   GET    /api/contratos/:id                Buscar por ID
 *   PATCH  /api/contratos/:id                Atualizar
 *   DELETE /api/contratos/:id                Cancelar/excluir
 *   GET    /api/contratos/cliente/:id/historico  Histórico + sugestões
 *   GET    /api/contratos/next-numero        Próximo número sequencial
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { dbGet, dbRun, dbAll } = require('../database');
const { requireRole } = require('../middleware/authJWT');
const { asyncHandler, handleError } = require('../middleware/errorHandler');
const Financeiro = require('../services/FinanceiroService');

const ALLOWED = ['admin', 'superadmin', 'financeiro'];

// Tipos de contrato
const TIPOS_CONTRATO = [
    { value: 'pmoc', label: 'PMOC - Plano de Manutenção', valorPadrao: 1800, slaPadrao: { resposta: 4, resolucao: 24 } },
    { value: 'manutencao_preventiva', label: 'Manutenção Preventiva', valorPadrao: 1200, slaPadrao: { resposta: 8, resolucao: 48 } },
    { value: 'manutencao_corretiva', label: 'Manutenção Corretiva', valorPadrao: 800, slaPadrao: { resposta: 4, resolucao: 24 } },
    { value: 'instalacao', label: 'Instalação', valorPadrao: 3500, slaPadrao: { resposta: 24, resolucao: 168 } },
    { value: 'emergencial', label: 'Atendimento Emergencial 24/7', valorPadrao: 2500, slaPadrao: { resposta: 1, resolucao: 4 } },
    { value: 'empresarial', label: 'Empresarial Completo', valorPadrao: 5000, slaPadrao: { resposta: 2, resolucao: 8 } },
    { value: 'higienizacao', label: 'Higienização Trimestral', valorPadrao: 600, slaPadrao: { resposta: 24, resolucao: 72 } },
];

// Frequências de cobrança
const FREQUENCIAS = [
    { value: 'monthly', label: 'Mensal' },
    { value: 'quarterly', label: 'Trimestral' },
    { value: 'semiannual', label: 'Semestral' },
    { value: 'annual', label: 'Anual' },
    { value: 'unique', label: 'Pagamento Único' },
];

// Serviços disponíveis
const SERVICOS = [
    { id: 'manutencao_preventiva', label: 'Manutenção Preventiva' },
    { id: 'higienizacao', label: 'Higienização Trimestral' },
    { id: 'instalacao', label: 'Instalação de Novos Equipamentos' },
    { id: 'pmoc_relatorio', label: 'PMOC – Relatórios Mensais' },
    { id: 'atendimento_emergencial', label: 'Atendimento Emergencial 24/7' },
    { id: 'limpeza_filtros', label: 'Limpeza de Filtros' },
    { id: 'substituicao_pecas', label: 'Substituição de Peças' },
    { id: 'auditoria_energetica', label: 'Auditoria Energética' },
];

// SLAs disponíveis
const SLAS = [
    { value: 1, label: '1 hora (Emergencial)' },
    { value: 2, label: '2 horas (Crítico)' },
    { value: 4, label: '4 horas (Alto)' },
    { value: 8, label: '8 horas (Padrão)' },
    { value: 24, label: '24 horas (Rotina)' },
    { value: 48, label: '48 horas (Programado)' },
    { value: 72, label: '72 horas (Trimestral)' },
];

/**
 * GET /api/contratos/options/tipos
 * Retorna as opções de tipo, frequência e serviços para popular o formulário
 */
router.get('/options/tipos', requireRole(...ALLOWED), asyncHandler(async (req, res) => {
    res.json({
        success: true,
        data: { tipos: TIPOS_CONTRATO, frequencias: FREQUENCIAS, servicos: SERVICOS, slas: SLAS }
    });
}));

/**
 * GET /api/contratos
 * Lista contratos com filtros
 */
router.get('/', requireRole(...ALLOWED), asyncHandler(async (req, res) => {
    const { cliente_id, status, tipo, dataInicio, dataFim, limit = 100, offset = 0 } = req.query;
    const where = [];
    const params = [];
    if (cliente_id) { where.push('cliente_id = ?'); params.push(cliente_id); }
    if (status) { where.push('status = ?'); params.push(status); }
    if (tipo) { where.push('tipo_contrato = ?'); params.push(tipo); }
    if (dataInicio) { where.push('data_inicio >= ?'); params.push(dataInicio); }
    if (dataFim) { where.push('data_fim <= ?'); params.push(dataFim); }
    const sql = `SELECT c.*, cl.nome as cliente_nome, cl.cnpj as cnpj_cpf, cl.email as cliente_email, cl.telefone as cliente_telefone
                 FROM contratos c
                 LEFT JOIN clientes cl ON cl.id = c.cliente_id
                 ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY c.created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));
    const data = await dbAll(sql, params);
    res.json({ success: true, data, total: data.length });
}));

/**
 * GET /api/contratos/next-numero
 * Retorna o próximo número sequencial de contrato
 */
router.get('/next-numero', requireRole(...ALLOWED), asyncHandler(async (req, res) => {
    const year = new Date().getFullYear();
    const prefix = `CT-${year}-`;
    // Pega os últimos 4 dígitos do ID no formato CT-YYYY-NNNN
    const row = await dbGet(
        `SELECT MAX(CAST(SUBSTR(id, ?) AS INTEGER)) AS last_num
         FROM contratos WHERE id LIKE ?`,
        [prefix.length + 1, `${prefix}%`]
    );
    const nextNum = (row?.last_num || 0) + 1;
    const numero = `${prefix}${String(nextNum).padStart(4, '0')}`;
    res.json({ success: true, data: { numero, sequencial: nextNum, ano: year } });
}));

/**
 * GET /api/contratos/cliente/:id
 * Lista contratos de um cliente específico
 */
router.get('/cliente/:id', requireRole(...ALLOWED), asyncHandler(async (req, res) => {
    const data = await dbAll(`SELECT * FROM contratos WHERE cliente_id = ? ORDER BY data_inicio DESC`, [req.params.id]);
    res.json({ success: true, data, total: data.length });
}));

/**
 * GET /api/contratos/cliente/:id/historico
 * Retorna o histórico do cliente + sugestões inteligentes para novo contrato
 */
router.get('/cliente/:id/historico', requireRole(...ALLOWED), asyncHandler(async (req, res) => {
    const clienteId = req.params.id;

    // 1. Dados do cliente
    const cliente = await dbGet(`SELECT * FROM clientes WHERE id = ?`, [clienteId]);
    if (!cliente) return res.status(404).json({ success: false, error: 'Cliente não encontrado' });

    // 2. Contratos anteriores
    const contratos = await dbAll(
        `SELECT id, tipo_contrato, valor_mensal, valor_anual, data_inicio, data_fim, status, observacoes
         FROM contratos WHERE cliente_id = ? ORDER BY data_inicio DESC`,
        [clienteId]
    );

    // 3. Contrato ativo atual
    const contratoAtivo = contratos.find(c => c.status === 'Ativo' && c.data_fim >= new Date().toISOString().split('T')[0]);

    // 4. Tipo de contrato mais comum
    const tiposCount = {};
    contratos.forEach(c => {
        tiposCount[c.tipo_contrato] = (tiposCount[c.tipo_contrato] || 0) + 1;
    });
    const tipoMaisComum = Object.entries(tiposCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'pmoc';

    // 5. Valor médio histórico
    const valorMedio = contratos.length > 0
        ? contratos.reduce((s, c) => s + (c.valor_mensal || 0), 0) / contratos.length
        : null;

    // 6. Ticket médio (chamados)
    let ticketMedio = null;
    try {
        const tickets = await dbGet(
            `SELECT COUNT(*) as total, AVG(valor) as ticket_medio FROM chamados WHERE cliente_id = ? AND status IN ('Resolvido', 'Fechado')`,
            [clienteId]
        );
        ticketMedio = tickets;
    } catch (_) {}

    // 7. Sugestão baseada em histórico
    const tipoDetalhes = TIPOS_CONTRATO.find(t => t.value === tipoMaisComum);
    const sugestoes = {
        tipo_contrato: tipoMaisComum,
        valor_mensal: valorMedio ? Math.round(valorMedio * 100) / 100 : (tipoDetalhes?.valorPadrao || 1500),
        sla_resposta_horas: tipoDetalhes?.slaPadrao?.resposta || 8,
        sla_resolucao_horas: tipoDetalhes?.slaPadrao?.resolucao || 48,
        servicos_recomendados: tipoDetalhes?.value === 'pmoc'
            ? ['manutencao_preventiva', 'higienizacao', 'pmoc_relatorio']
            : tipoDetalhes?.value === 'manutencao_preventiva'
                ? ['manutencao_preventiva', 'limpeza_filtros']
                : ['manutencao_preventiva'],
    };

    res.json({
        success: true,
        data: {
            cliente,
            contratos,
            contrato_ativo: contratoAtivo || null,
            estatisticas: {
                total_contratos: contratos.length,
                valor_medio_mensal: valorMedio,
                tipo_mais_comum: tipoMaisComum,
                ticket_medio: ticketMedio,
            },
            sugestoes,
        },
    });
}));

/**
 * GET /api/contratos/:id
 * Busca contrato por ID com dados completos
 */
router.get('/:id', requireRole(...ALLOWED), asyncHandler(async (req, res) => {
    const row = await dbGet(
        `SELECT c.*, cl.nome as cliente_nome, cl.cnpj as cnpj_cpf, cl.email as cliente_email
         FROM contratos c LEFT JOIN clientes cl ON cl.id = c.cliente_id
         WHERE c.id = ?`,
        [req.params.id]
    );
    if (!row) return res.status(404).json({ success: false, error: 'Contrato não encontrado' });
    res.json({ success: true, data: row });
}));

/**
 * POST /api/contratos
 * Cria novo contrato com numeração automática
 *
 * Body esperado:
 * {
 *   cliente_id: 'cli-001',
 *   titulo: 'PMOC - TechCorp',
 *   tipo_contrato: 'pmoc',
 *   valor_mensal: 1800,
 *   valor_anual: 21600,
 *   frequencia_cobranca: 'monthly',
 *   data_inicio: '2026-01-01',
 *   data_fim: '2026-12-31',
 *   sla_resposta_horas: 4,
 *   sla_resolucao_horas: 24,
 *   renovacao_automatica: true,
 *   servicos: ['manutencao_preventiva', 'higienizacao'],
 *   observacoes: 'Cliente VIP',
 *   notificar_time: true  // dispara notificação interna
 * }
 */
router.post('/', requireRole(...ALLOWED), asyncHandler(async (req, res) => {
    const {
        cliente_id, titulo, tipo_contrato, valor_mensal, valor_anual,
        frequencia_cobranca = 'monthly', data_inicio, data_fim,
        sla_resposta_horas = 24, sla_resolucao_horas = 72,
        renovacao_automatica = false, qtd_equipamentos_inclusos = 0,
        percentual_desconto = 0, observacoes = '', servicos = [], notificar_time = true,
    } = req.body;

    // Validações
    if (!cliente_id) return res.status(400).json({ success: false, error: 'cliente_id é obrigatório', code: 'MISSING_CLIENTE' });
    if (!tipo_contrato) return res.status(400).json({ success: false, error: 'tipo_contrato é obrigatório', code: 'MISSING_TIPO' });
    if (!TIPOS_CONTRATO.find(t => t.value === tipo_contrato)) {
        return res.status(400).json({ success: false, error: `tipo_contrato inválido: "${tipo_contrato}". Valores aceitos: ${TIPOS_CONTRATO.map(t => t.value).join(', ')}`, code: 'INVALID_TIPO' });
    }
    if (!data_inicio || !data_fim) return res.status(400).json({ success: false, error: 'data_inicio e data_fim são obrigatórios', code: 'MISSING_DATES' });
    if (new Date(data_fim) <= new Date(data_inicio)) {
        return res.status(400).json({ success: false, error: 'data_fim deve ser posterior a data_inicio', code: 'INVALID_DATE_RANGE' });
    }
    if (!valor_mensal || valor_mensal <= 0) {
        return res.status(400).json({ success: false, error: 'valor_mensal deve ser maior que zero', code: 'INVALID_VALOR' });
    }

    // Verifica se cliente existe
    const cliente = await dbGet(`SELECT id, nome FROM clientes WHERE id = ?`, [cliente_id]);
    if (!cliente) return res.status(404).json({ success: false, error: 'Cliente não encontrado', code: 'CLIENTE_NOT_FOUND' });

    // Verifica se já tem contrato ativo no mesmo período
    const conflito = await dbGet(
        `SELECT id FROM contratos WHERE cliente_id = ? AND status = 'Ativo' AND data_fim >= ? LIMIT 1`,
        [cliente_id, data_inicio]
    );
    // Não bloqueia — apenas avisa no response

    // Gera número sequencial
    const year = new Date().getFullYear();
    const prefix = `CT-${year}-`;
    const numRow = await dbGet(
        `SELECT MAX(CAST(SUBSTR(id, ?) AS INTEGER)) AS last_num
         FROM contratos WHERE id LIKE ?`,
        [prefix.length + 1, `${prefix}%`]
    );
    const nextNum = (numRow?.last_num || 0) + 1;
    const id = `${prefix}${String(nextNum).padStart(4, '0')}`;
    const tituloFinal = titulo || `${(TIPOS_CONTRATO.find(t => t.value === tipo_contrato)?.label) || 'Contrato'} - ${cliente.nome}`;

    // Salva servicos como JSON
    const servicosJson = JSON.stringify(servicos);

    // Cria
    await dbRun(
        `INSERT INTO contratos (
            id, cliente_id, titulo, valor_mensal, valor_anual,
            frequencia_cobranca, tipo_contrato, renovacao_automatica,
            qtd_equipamentos_inclusos, percentual_desconto,
            sla_resposta_horas, sla_resolucao_horas, status,
            data_inicio, data_fim, created_by, observacoes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, cliente_id, tituloFinal, valor_mensal, valor_anual || valor_mensal * 12,
         frequencia_cobranca, tipo_contrato, renovacao_automatica ? 1 : 0,
         qtd_equipamentos_inclusos, percentual_desconto,
         sla_resposta_horas, sla_resolucao_horas, 'Ativo',
         data_inicio, data_fim, req.auditInfo?.userId || 'usr-system', observacoes]
    );

    // Gera lançamento no fluxo de caixa (previsão de receita)
    try {
        await Financeiro.FluxoCaixa.criar({
            tipo: 'entrada', categoria: 'vendas',
            descricao: `Contrato ${id} - ${cliente.nome}`,
            valor: valor_mensal, data: data_inicio,
            periodo: 'mensal', cliente_id, status: 'previsto',
            tenant_id: req.auditInfo?.tenantId,
        });
    } catch (e) {
        console.warn('[Contratos] Falha ao criar lançamento no fluxo de caixa:', e.message);
    }

    // Notificação interna (audit)
    if (notificar_time) {
        try {
            const { dbRun: dbR } = require('../database');
            await dbR(
                `INSERT INTO logs_auditoria (entidade, entidade_id, acao, user_id, user_name, ip_address, detalhes_json, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
                ['contrato', id, 'criar', req.auditInfo?.userId || 'system', req.auditInfo?.userName || 'Sistema', req.ip,
                 JSON.stringify({ cliente: cliente.nome, valor: valor_mensal, tipo: tipo_contrato })]
            );
        } catch (_) {}
    }

    res.status(201).json({
        success: true,
        id, numero: id,
        data: { id, cliente_id, titulo: tituloFinal, valor_mensal, status: 'Ativo', data_inicio, data_fim },
        aviso_contrato_ativo: conflito ? `Cliente já possui contrato ativo (${conflito.id}). Avalie encerrar o anterior.` : null,
    });
}));

/**
 * PATCH /api/contratos/:id
 * Atualiza dados de um contrato
 */
router.patch('/:id', requireRole(...ALLOWED), asyncHandler(async (req, res) => {
    const existing = await dbGet(`SELECT * FROM contratos WHERE id = ?`, [req.params.id]);
    if (!existing) return res.status(404).json({ success: false, error: 'Contrato não encontrado' });

    const allowed = ['titulo', 'valor_mensal', 'valor_anual', 'frequencia_cobranca', 'tipo_contrato',
                     'renovacao_automatica', 'qtd_equipamentos_inclusos', 'percentual_desconto',
                     'sla_resposta_horas', 'sla_resolucao_horas', 'status', 'data_inicio', 'data_fim', 'observacoes'];
    const updates = [];
    const params = [];
    for (const k of allowed) {
        if (req.body[k] !== undefined) {
            updates.push(`${k} = ?`);
            params.push(typeof req.body[k] === 'boolean' ? (req.body[k] ? 1 : 0) : req.body[k]);
        }
    }
    if (updates.length === 0) return res.json({ success: true, message: 'Nada para atualizar' });
    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(req.params.id);
    await dbRun(`UPDATE contratos SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ success: true });
}));

/**
 * DELETE /api/contratos/:id
 * Cancela contrato (status = 'Cancelado')
 */
router.delete('/:id', requireRole(...ALLOWED), asyncHandler(async (req, res) => {
    await dbRun(`UPDATE contratos SET status = 'Cancelado', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [req.params.id]);
    res.json({ success: true, message: 'Contrato cancelado' });
}));

module.exports = router;
