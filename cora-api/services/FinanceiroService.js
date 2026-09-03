/**
 * FinanceiroService — Módulos financeiros baseados nas 9 planilhas Cora
 *
 * Sprint 19 — Módulos Financeiros (Agosto 2026)
 *
 * Integra os seguintes módulos:
 *   1. Fluxo de Caixa (semanal/mensal/semestral)
 *   2. Custo de Produção (matérias-primas + embalagens + mão de obra)
 *   3. Conciliação Bancária (extrato vs balancete)
 *   4. Precificação (despesas fixas + variáveis + markup)
 *   5. Contas a Pagar e Receber (com juros por atraso)
 *   6. Controle de Inadimplência (clientes em atraso)
 *   7. Balanço Patrimonial (ativo/passivo trimestral)
 *   8. Orçamento (precificação de serviços)
 *   9. DRE (Demonstração de Resultado do Exercício - mensal)
 *
 * Todos os métodos são padronizados:
 *   - listar(filtros)        → array paginado
 *   - criar(dados)           → insere registro
 *   - atualizar(id, dados)   → atualiza registro
 *   - excluir(id)            → remove registro
 *   - resumo(periodo)        → agregações e KPIs
 */

const { dbRun, dbGet, dbAll } = require('../database');

// ════════════════════════════════════════════════════════════
// 1. FLUXO DE CAIXA
// ════════════════════════════════════════════════════════════

class FluxoCaixa {
    static async listar({ tipo, periodo, dataInicio, dataFim, status, limit = 100, offset = 0 } = {}) {
        const where = [];
        const params = [];
        if (tipo) { where.push('tipo = ?'); params.push(tipo); }
        if (periodo) { where.push('periodo = ?'); params.push(periodo); }
        if (status) { where.push('status = ?'); params.push(status); }
        if (dataInicio) { where.push('data >= ?'); params.push(dataInicio); }
        if (dataFim) { where.push('data <= ?'); params.push(dataFim); }
        const sql = `SELECT * FROM fin_fluxo_caixa ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                     ORDER BY data ASC LIMIT ? OFFSET ?`;
        params.push(limit, offset);
        return await dbAll(sql, params);
    }

    static async criar({ tipo, categoria, descricao, valor, data, data_realizado, status = 'previsto', periodo, cliente_id, fornecedor, tenant_id }) {
        if (!['entrada', 'saida'].includes(tipo)) throw new Error('tipo deve ser entrada ou saida');
        if (!valor || valor <= 0) throw new Error('valor deve ser positivo');
        const r = await dbRun(
            `INSERT INTO fin_fluxo_caixa (tipo, categoria, descricao, valor, data, data_realizado, status, periodo, cliente_id, fornecedor, tenant_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [tipo, categoria, descricao, valor, data, data_realizado, status, periodo, cliente_id, fornecedor, tenant_id]
        );
        return { id: r.lastID };
    }

    static async resumo({ dataInicio, dataFim, periodo } = {}) {
        const where = [];
        const params = [];
        if (dataInicio) { where.push('data >= ?'); params.push(dataInicio); }
        if (dataFim) { where.push('data <= ?'); params.push(dataFim); }
        if (periodo) { where.push('periodo = ?'); params.push(periodo); }
        const sql = `
            SELECT
                SUM(CASE WHEN tipo='entrada' THEN valor ELSE 0 END) AS total_entradas,
                SUM(CASE WHEN tipo='saida'   THEN valor ELSE 0 END) AS total_saidas,
                SUM(CASE WHEN tipo='entrada' AND status='realizado' THEN valor ELSE 0 END) AS entradas_realizadas,
                SUM(CASE WHEN tipo='saida'   AND status='realizado' THEN valor ELSE 0 END) AS saidas_realizadas,
                SUM(CASE WHEN tipo='entrada' AND status='previsto' THEN valor ELSE 0 END) AS entradas_previstas,
                SUM(CASE WHEN tipo='saida'   AND status='previsto' THEN valor ELSE 0 END) AS saidas_previstas
            FROM fin_fluxo_caixa ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        `;
        const r = await dbGet(sql, params);
        return {
            ...r,
            saldo_previsto: (r.total_entradas || 0) - (r.total_saidas || 0),
            saldo_realizado: (r.entradas_realizadas || 0) - (r.saidas_realizadas || 0),
        };
    }
}

// ════════════════════════════════════════════════════════════
// 2. CUSTO DE PRODUÇÃO
// ════════════════════════════════════════════════════════════

class CustoProducao {
    static async listar({ produto, periodo, limit = 50, offset = 0 } = {}) {
        const where = [];
        const params = [];
        if (produto) { where.push('produto = ?'); params.push(produto); }
        if (periodo) { where.push('periodo = ?'); params.push(periodo); }
        const sql = `SELECT * FROM fin_custo_producao ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                     ORDER BY periodo DESC, produto ASC LIMIT ? OFFSET ?`;
        params.push(limit, offset);
        return await dbAll(sql, params);
    }

    static async criar({ produto, periodo, materia_prima, embalagem, mao_de_obra, outros_custos, saldo_inicial = 0 }) {
        if (!produto || !periodo) throw new Error('produto e periodo são obrigatórios');
        const custo_total = (materia_prima || 0) + (embalagem || 0) + (mao_de_obra || 0) + (outros_custos || 0);
        const r = await dbRun(
            `INSERT INTO fin_custo_producao (produto, periodo, materia_prima, embalagem, mao_de_obra, outros_custos, custo_total, saldo_inicial, saldo_final)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [produto, periodo, materia_prima || 0, embalagem || 0, mao_de_obra || 0, outros_custos || 0,
             custo_total, saldo_inicial, saldo_inicial + custo_total]
        );
        return { id: r.lastID, custo_total };
    }

    static async resumoPorProduto({ periodo } = {}) {
        const where = [];
        const params = [];
        if (periodo) { where.push('periodo = ?'); params.push(periodo); }
        const sql = `
            SELECT produto,
                   SUM(custo_total) AS custo_total,
                   SUM(materia_prima) AS materia_prima,
                   SUM(embalagem) AS embalagem,
                   SUM(mao_de_obra) AS mao_de_obra,
                   SUM(outros_custos) AS outros_custos,
                   COUNT(*) AS periodos_registrados
            FROM fin_custo_producao ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
            GROUP BY produto
            ORDER BY custo_total DESC
        `;
        return await dbAll(sql, params);
    }
}

// ════════════════════════════════════════════════════════════
// 3. CONCILIAÇÃO BANCÁRIA
// ════════════════════════════════════════════════════════════

class Conciliacao {
    static async listar({ dataInicio, dataFim, origem_tipo, conciliado, limit = 200, offset = 0 } = {}) {
        const where = [];
        const params = [];
        if (dataInicio) { where.push('data >= ?'); params.push(dataInicio); }
        if (dataFim) { where.push('data <= ?'); params.push(dataFim); }
        if (origem_tipo) { where.push('origem_tipo = ?'); params.push(origem_tipo); }
        if (conciliado !== undefined) { where.push('conciliado = ?'); params.push(conciliado ? 1 : 0); }
        const sql = `SELECT * FROM fin_conciliacao ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                     ORDER BY data DESC, id DESC LIMIT ? OFFSET ?`;
        params.push(limit, offset);
        return await dbAll(sql, params);
    }

    static async criar({ data, descricao, forma_pagamento, origem, destino, valor, origem_tipo, banco_id, categoria, tenant_id }) {
        if (!origem_tipo) throw new Error('origem_tipo (interno | extrato) é obrigatório');
        const r = await dbRun(
            `INSERT INTO fin_conciliacao (data, descricao, forma_pagamento, origem, destino, valor, origem_tipo, banco_id, categoria, tenant_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [data, descricao, forma_pagamento, origem, destino, valor, origem_tipo, banco_id, categoria, tenant_id]
        );
        return { id: r.lastID };
    }

    static async marcarConciliado(id) {
        await dbRun(`UPDATE fin_conciliacao SET conciliado = 1 WHERE id = ?`, [id]);
        return { success: true };
    }

    /**
     * Compara o balancete (interno) com extrato (banco) por categoria
     */
    static async comparar({ dataInicio, dataFim } = {}) {
        const sql = `
            SELECT categoria,
                   SUM(CASE WHEN origem_tipo='interno' AND valor > 0 THEN valor ELSE 0 END) AS debito_interno,
                   SUM(CASE WHEN origem_tipo='extrato'  AND valor > 0 THEN valor ELSE 0 END) AS debito_extrato,
                   SUM(CASE WHEN origem_tipo='interno' AND valor < 0 THEN -valor ELSE 0 END) AS credito_interno,
                   SUM(CASE WHEN origem_tipo='extrato'  AND valor < 0 THEN -valor ELSE 0 END) AS credito_extrato,
                   COUNT(*) AS total_lancamentos
            FROM fin_conciliacao
            ${dataInicio ? 'WHERE data >= ?' : ''} ${dataFim ? 'AND data <= ?' : ''}
            GROUP BY categoria
            ORDER BY categoria
        `;
        const params = [];
        if (dataInicio) params.push(dataInicio);
        if (dataFim) params.push(dataFim);
        const rows = await dbAll(sql, params);
        return rows.map(r => ({
            ...r,
            diferenca_debito: (r.debito_interno || 0) - (r.debito_extrato || 0),
            diferenca_credito: (r.credito_interno || 0) - (r.credito_extrato || 0),
        }));
    }
}

// ════════════════════════════════════════════════════════════
// 4. PRECIFICAÇÃO
// ════════════════════════════════════════════════════════════

class Precificacao {
    static async listar({ tipo, categoria, competencia_mes, limit = 100, offset = 0 } = {}) {
        const where = [];
        const params = [];
        if (tipo) { where.push('tipo = ?'); params.push(tipo); }
        if (categoria) { where.push('categoria = ?'); params.push(categoria); }
        if (competencia_mes) { where.push('competencia_mes = ?'); params.push(competencia_mes); }
        const sql = `SELECT * FROM fin_precificacao ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                     ORDER BY tipo ASC, competencia_mes DESC LIMIT ? OFFSET ?`;
        params.push(limit, offset);
        return await dbAll(sql, params);
    }

    static async criar({ tipo, categoria, descricao, valor = 0, competencia_mes, ativo = 1, tenant_id }) {
        if (!['fixa', 'variavel'].includes(tipo)) throw new Error('tipo deve ser fixa ou variavel');
        const r = await dbRun(
            `INSERT INTO fin_precificacao (tipo, categoria, descricao, valor, competencia_mes, ativo, tenant_id)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [tipo, categoria, descricao, valor, competencia_mes, ativo ? 1 : 0, tenant_id]
        );
        return { id: r.lastID };
    }

    /**
     * Calcula o preço de venda sugerido com base no markup
     * Markup = (custo_desejado * (1 + margem)) * (1 + impostos)
     */
    static async calcularPreco({ custo_produto, margem_percent = 30, impostos_percent = 15, competencia_mes }) {
        // Busca despesas do período
        const fixas = await dbAll(
            `SELECT COALESCE(SUM(valor), 0) AS total FROM fin_precificacao
             WHERE tipo = 'fixa' ${competencia_mes ? "AND competencia_mes = ? OR competencia_mes IS NULL" : ""}
             AND ativo = 1`,
            competencia_mes ? [competencia_mes] : []
        );
        const variaveis = await dbAll(
            `SELECT COALESCE(SUM(valor), 0) AS total FROM fin_precificacao
             WHERE tipo = 'variavel' ${competencia_mes ? "AND competencia_mes = ? OR competencia_mes IS NULL" : ""}
             AND ativo = 1`,
            competencia_mes ? [competencia_mes] : []
        );
        const total_despesas_fixas = fixas.reduce((s, r) => s + (r.total || 0), 0);
        const total_despesas_variaveis = variaveis.reduce((s, r) => s + (r.total || 0), 0);

        const custo_total = (custo_produto || 0) + total_despesas_fixas + total_despesas_variaveis;
        const com_margem = custo_total * (1 + margem_percent / 100);
        const preco_final = com_margem * (1 + impostos_percent / 100);

        return {
            custo_produto: custo_produto || 0,
            despesas_fixas: total_despesas_fixas,
            despesas_variaveis: total_despesas_variaveis,
            custo_total,
            margem_percent,
            impostos_percent,
            preco_sugerido: preco_final,
            preco_sem_impostos: com_margem,
        };
    }
}

// ════════════════════════════════════════════════════════════
// 5. CONTAS A PAGAR E RECEBER
// ════════════════════════════════════════════════════════════

class Contas {
    static async listar({ tipo, status, cliente_id, dataInicio, dataFim, limit = 100, offset = 0 } = {}) {
        const where = [];
        const params = [];
        if (tipo) { where.push('tipo = ?'); params.push(tipo); }
        if (status) { where.push('status = ?'); params.push(status); }
        if (cliente_id) { where.push('cliente_id = ?'); params.push(cliente_id); }
        if (dataInicio) { where.push('data_vencimento >= ?'); params.push(dataInicio); }
        if (dataFim) { where.push('data_vencimento <= ?'); params.push(dataFim); }
        const sql = `SELECT * FROM fin_contas ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                     ORDER BY data_vencimento ASC LIMIT ? OFFSET ?`;
        params.push(limit, offset);
        return await dbAll(sql, params);
    }

    static async criar({ tipo, descricao, cliente_id, fornecedor, valor_inicial, juros_por_dia = 0, data_vencimento, categoria, tenant_id }) {
        if (!['pagar', 'receber'].includes(tipo)) throw new Error('tipo deve ser pagar ou receber');
        if (!valor_inicial || valor_inicial <= 0) throw new Error('valor_inicial deve ser positivo');
        const r = await dbRun(
            `INSERT INTO fin_contas (tipo, descricao, cliente_id, fornecedor, valor_inicial, valor_final, juros_por_dia, data_vencimento, categoria, tenant_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [tipo, descricao, cliente_id, fornecedor, valor_inicial, valor_inicial, juros_por_dia, data_vencimento, categoria, tenant_id]
        );
        return { id: r.lastID };
    }

    static async registrarPagamento(id, { data_pagamento, valor_pago } = {}) {
        const conta = await dbGet(`SELECT * FROM fin_contas WHERE id = ?`, [id]);
        if (!conta) throw new Error('Conta não encontrada');
        const data = data_pagamento || new Date().toISOString().split('T')[0];
        const pago = valor_pago || conta.valor_final;
        // Calcula juros
        const venc = new Date(conta.data_vencimento);
        const pagto = new Date(data);
        const dias_atraso = Math.max(0, Math.floor((pagto - venc) / (1000 * 60 * 60 * 24)));
        const juros = dias_atraso * (conta.juros_por_dia || 0) * (conta.valor_inicial / 100);
        const valor_final = conta.valor_inicial + juros;

        await dbRun(
            `UPDATE fin_contas SET data_pagamento = ?, valor_final = ?, dias_atraso = ?, status = 'pago' WHERE id = ?`,
            [data, valor_final, dias_atraso, id]
        );
        return { id, valor_final, juros, dias_atraso };
    }
}

// ════════════════════════════════════════════════════════════
// 6. CONTROLE DE INADIMPLÊNCIA
// ════════════════════════════════════════════════════════════

class Inadimplencia {
    static async listar({ cliente_id, status, diasMin, limit = 100, offset = 0 } = {}) {
        const where = [];
        const params = [];
        if (cliente_id) { where.push('cliente_id = ?'); params.push(cliente_id); }
        if (status) { where.push('status = ?'); params.push(status); }
        if (diasMin) { where.push('dias_atraso >= ?'); params.push(diasMin); }
        const sql = `SELECT * FROM fin_inadimplencia ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                     ORDER BY dias_atraso DESC, valor_total DESC LIMIT ? OFFSET ?`;
        params.push(limit, offset);
        return await dbAll(sql, params);
    }

    static async criar({ cliente_id, conta_id, valor_original, valor_juros = 0, valor_multa = 0, data_vencimento, observacoes, tenant_id }) {
        const valor_total = (valor_original || 0) + (valor_juros || 0) + (valor_multa || 0);
        const hoje = new Date();
        const venc = new Date(data_vencimento);
        const dias_atraso = Math.max(0, Math.floor((hoje - venc) / (1000 * 60 * 60 * 24)));
        const r = await dbRun(
            `INSERT INTO fin_inadimplencia (cliente_id, conta_id, valor_original, valor_juros, valor_multa, valor_total, dias_atraso, data_vencimento, observacoes, tenant_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [cliente_id, conta_id, valor_original, valor_juros, valor_multa, valor_total, dias_atraso, data_vencimento, observacoes, tenant_id]
        );
        return { id: r.lastID };
    }

    static async registrarCobranca(id) {
        const r = await dbRun(
            `UPDATE fin_inadimplencia
             SET tentativas_cobranca = tentativas_cobranca + 1,
                 ultima_cobranca = datetime('now')
             WHERE id = ?`,
            [id]
        );
        return { success: true };
    }

    static async resumo() {
        const total = await dbGet(`SELECT
            COUNT(DISTINCT cliente_id) AS clientes_inadimplentes,
            COALESCE(SUM(valor_total), 0) AS valor_total,
            COALESCE(SUM(CASE WHEN dias_atraso > 30 THEN valor_total ELSE 0 END), 0) AS valor_mais_30_dias,
            COALESCE(SUM(CASE WHEN dias_atraso > 60 THEN valor_total ELSE 0 END), 0) AS valor_mais_60_dias,
            COALESCE(SUM(CASE WHEN dias_atraso > 90 THEN valor_total ELSE 0 END), 0) AS valor_mais_90_dias,
            COALESCE(AVG(dias_atraso), 0) AS media_dias_atraso
            FROM fin_inadimplencia WHERE status = 'em_aberto'`);
        return total;
    }
}

// ════════════════════════════════════════════════════════════
// 7. BALANÇO PATRIMONIAL
// ════════════════════════════════════════════════════════════

class Balanco {
    static async listar({ tipo, trimestre, limit = 100, offset = 0 } = {}) {
        const where = [];
        const params = [];
        if (tipo) { where.push('tipo = ?'); params.push(tipo); }
        if (trimestre) { where.push('trimestre = ?'); params.push(trimestre); }
        const sql = `SELECT * FROM fin_balanco ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                     ORDER BY trimestre DESC, tipo ASC, categoria ASC LIMIT ? OFFSET ?`;
        params.push(limit, offset);
        return await dbAll(sql, params);
    }

    static async criar({ tipo, categoria, subcategoria, valor = 0, trimestre, observacoes, tenant_id }) {
        if (!['ativo', 'passivo'].includes(tipo)) throw new Error('tipo deve ser ativo ou passivo');
        const r = await dbRun(
            `INSERT INTO fin_balanco (tipo, categoria, subcategoria, valor, trimestre, observacoes, tenant_id)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [tipo, categoria, subcategoria, valor, trimestre, observacoes, tenant_id]
        );
        return { id: r.lastID };
    }

    static async resumoTrimestre(trimestre) {
        const ativos = await dbGet(`SELECT COALESCE(SUM(valor), 0) AS total FROM fin_balanco WHERE tipo = 'ativo' AND trimestre = ?`, [trimestre]);
        const passivos = await dbGet(`SELECT COALESCE(SUM(valor), 0) AS total FROM fin_balanco WHERE tipo = 'passivo' AND trimestre = ?`, [trimestre]);
        const total = await dbGet(`SELECT
            COALESCE(SUM(CASE WHEN tipo='ativo' AND categoria='circulante' THEN valor ELSE 0 END), 0) AS ativo_circulante,
            COALESCE(SUM(CASE WHEN tipo='ativo' AND categoria='nao_circulante' THEN valor ELSE 0 END), 0) AS ativo_nao_circulante,
            COALESCE(SUM(CASE WHEN tipo='passivo' AND categoria='circulante' THEN valor ELSE 0 END), 0) AS passivo_circulante,
            COALESCE(SUM(CASE WHEN tipo='passivo' AND categoria='nao_circulante' THEN valor ELSE 0 END), 0) AS passivo_nao_circulante
            FROM fin_balanco WHERE trimestre = ?`, [trimestre]);
        return {
            trimestre,
            ...total,
            total_ativos: ativos.total,
            total_passivos: passivos.total,
            patrimonio_liquido: ativos.total - passivos.total,
        };
    }
}

// ════════════════════════════════════════════════════════════
// 8. ORÇAMENTO
// ════════════════════════════════════════════════════════════

class Orcamento {
    static async listar({ status, cliente_id, tipo, limit = 100, offset = 0 } = {}) {
        const where = [];
        const params = [];
        if (status) { where.push('status = ?'); params.push(status); }
        if (cliente_id) { where.push('cliente_id = ?'); params.push(cliente_id); }
        if (tipo) { where.push('tipo = ?'); params.push(tipo); }
        const sql = `SELECT * FROM fin_orcamento ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                     ORDER BY data_emissao DESC LIMIT ? OFFSET ?`;
        params.push(limit, offset);
        return await dbAll(sql, params);
    }

    static async criar({ numero, cliente_id, titulo, descricao, tipo, valor_custos_fixos = 0, valor_custos_variaveis = 0, valor_materiais = 0, valor_mao_de_obra = 0, margem_lucro_percent = 30, impostos_percent = 0, data_emissao, data_validade, status = 'rascunho', tenant_id, itens = [] }) {
        const custo_total = (valor_custos_fixos || 0) + (valor_custos_variaveis || 0) + (valor_materiais || 0) + (valor_mao_de_obra || 0);
        const com_margem = custo_total * (1 + (margem_lucro_percent || 0) / 100);
        const valor_total = com_margem * (1 + (impostos_percent || 0) / 100);

        const r = await dbRun(
            `INSERT INTO fin_orcamento (numero, cliente_id, titulo, descricao, tipo, valor_custos_fixos, valor_custos_variaveis, valor_materiais, valor_mao_de_obra, margem_lucro_percent, valor_total, impostos_percent, data_emissao, data_validade, status, tenant_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [numero, cliente_id, titulo, descricao, tipo, valor_custos_fixos, valor_custos_variaveis, valor_materiais, valor_mao_de_obra, margem_lucro_percent, valor_total, impostos_percent, data_emissao, data_validade, status, tenant_id]
        );
        const orcamento_id = r.lastID;
        // Adicionar itens
        for (const it of itens) {
            await dbRun(
                `INSERT INTO fin_orcamento_itens (orcamento_id, descricao, tipo, quantidade, valor_unitario, valor_total, observacoes)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [orcamento_id, it.descricao, it.tipo, it.quantidade || 1, it.valor_unitario, (it.quantidade || 1) * it.valor_unitario, it.observacoes]
            );
        }
        return { id: orcamento_id, valor_total };
    }

    static async buscarPorId(id) {
        const orcamento = await dbGet(`SELECT * FROM fin_orcamento WHERE id = ?`, [id]);
        if (!orcamento) return null;
        const itens = await dbAll(`SELECT * FROM fin_orcamento_itens WHERE orcamento_id = ?`, [id]);
        return { ...orcamento, itens };
    }

    static async atualizarStatus(id, status) {
        const valid = ['rascunho', 'enviado', 'aprovado', 'rejeitado', 'convertido'];
        if (!valid.includes(status)) throw new Error(`status inválido: ${status}`);
        await dbRun(`UPDATE fin_orcamento SET status = ? WHERE id = ?`, [status, id]);
        return { success: true };
    }
}

// ════════════════════════════════════════════════════════════
// 9. DRE (Demonstração de Resultado do Exercício)
// ════════════════════════════════════════════════════════════

class DRE {
    static async listar({ tipo, categoria, mes, dataInicio, dataFim, limit = 200, offset = 0 } = {}) {
        const where = [];
        const params = [];
        if (tipo) { where.push('tipo = ?'); params.push(tipo); }
        if (categoria) { where.push('categoria = ?'); params.push(categoria); }
        if (mes) { where.push('mes = ?'); params.push(mes); }
        if (dataInicio) { where.push('data >= ?'); params.push(dataInicio); }
        if (dataFim) { where.push('data <= ?'); params.push(dataFim); }
        const sql = `SELECT * FROM fin_dre ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                     ORDER BY data ASC LIMIT ? OFFSET ?`;
        params.push(limit, offset);
        return await dbAll(sql, params);
    }

    static async criar({ tipo, categoria, descricao, valor, data, observacoes, tenant_id }) {
        if (!['receita', 'despesa'].includes(tipo)) throw new Error('tipo deve ser receita ou despesa');
        const mes = data.substring(0, 7);  // 'YYYY-MM'
        const r = await dbRun(
            `INSERT INTO fin_dre (tipo, categoria, descricao, valor, mes, data, observacoes, tenant_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [tipo, categoria, descricao, valor, mes, data, observacoes, tenant_id]
        );
        return { id: r.lastID };
    }

    static async calcularDRE(mes) {
        const receitas = await dbGet(`SELECT COALESCE(SUM(valor), 0) AS total FROM fin_dre WHERE tipo='receita' AND mes = ?`, [mes]);
        const despesas = await dbGet(`SELECT COALESCE(SUM(valor), 0) AS total FROM fin_dre WHERE tipo='despesa' AND mes = ?`, [mes]);
        const lucro_bruto = receitas.total - despesas.total;
        const imposto = Math.max(0, lucro_bruto * 0.15);  // 15% simplificado
        const lucro_liquido = lucro_bruto - imposto;
        const margem = receitas.total > 0 ? (lucro_liquido / receitas.total) * 100 : 0;
        return {
            mes,
            receitas: receitas.total,
            despesas: despesas.total,
            lucro_bruto,
            imposto_renda_csll_15: imposto,
            lucro_liquido,
            margem_liquida_percent: margem,
        };
    }

    static async resumoAnual(ano) {
        const meses = Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, '0')}`);
        const resumos = await Promise.all(meses.map(m => this.calcularDRE(m)));
        const totais = resumos.reduce((acc, r) => ({
            receitas: acc.receitas + r.receitas,
            despesas: acc.despesas + r.despesas,
            lucro_bruto: acc.lucro_bruto + r.lucro_bruto,
            imposto: acc.imposto + r.imposto_renda_csll_15,
            lucro_liquido: acc.lucro_liquido + r.lucro_liquido,
        }), { receitas: 0, despesas: 0, lucro_bruto: 0, imposto: 0, lucro_liquido: 0 });
        return { ano, meses: resumos, totais };
    }
}

module.exports = {
    FluxoCaixa,
    CustoProducao,
    Conciliacao,
    Precificacao,
    Contas,
    Inadimplencia,
    Balanco,
    Orcamento,
    DRE,
};
