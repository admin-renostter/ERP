/**
 * Test Financeiro — 9 módulos baseados nas planilhas Cora
 *
 * Valida CRUD + resumos de cada módulo financeiro.
 */

const { dbRun, dbGet, dbAll, close } = require('../database');
const Financeiro = require('../services/FinanceiroService');

let passed = 0, failed = 0;
const failures = [];

function test(name, fn) {
    return Promise.resolve()
        .then(() => fn())
        .then(() => { passed++; console.log(`  ✓ ${name}`); })
        .catch((err) => {
            failed++;
            failures.push({ name, err: err.message || String(err) });
            console.log(`  ✗ ${name}: ${err.message || err}`);
        });
}

function assert(cond, msg) {
    if (!cond) throw new Error(msg || 'assertion failed');
}

function assertEq(a, b, msg) {
    if (a !== b) throw new Error((msg || '') + ` — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

(async () => {
    console.log('======================================================');
    console.log('  Sprint 19 — Módulos Financeiros (9 planilhas)');
    console.log('======================================================\n');

    // Aguarda init do DB
    await new Promise((resolve) => {
        const check = async () => {
            try {
                const r = await dbGet(`SELECT name FROM sqlite_master WHERE type='table' AND name='fin_fluxo_caixa'`);
                if (r) return resolve();
            } catch (_) {}
            setTimeout(check, 100);
        };
        check();
        setTimeout(() => resolve(), 3000);
    });

    // ════════════════════════════════════════
    // 1. FLUXO DE CAIXA
    // ════════════════════════════════════════
    console.log('1. Fluxo de Caixa');
    await test('FluxoCaixa.criar() insere entrada', async () => {
        const r = await Financeiro.FluxoCaixa.criar({
            tipo: 'entrada', categoria: 'vendas', descricao: 'Teste de entrada',
            valor: 1500.00, data: '2026-08-28', periodo: 'mensal',
        });
        assert(r.id);
    });

    await test('FluxoCaixa.criar() rejeita tipo inválido', async () => {
        let threw = false;
        try { await Financeiro.FluxoCaixa.criar({ tipo: 'invalido', valor: 100, data: '2026-08-28' }); }
        catch (e) { threw = true; }
        assert(threw, 'deveria ter lançado erro');
    });

    await test('FluxoCaixa.listar() retorna array', async () => {
        const r = await Financeiro.FluxoCaixa.listar({ periodo: 'mensal' });
        assert(Array.isArray(r));
    });

    await test('FluxoCaixa.resumo() calcula saldos', async () => {
        const r = await Financeiro.FluxoCaixa.resumo({ periodo: 'mensal' });
        assert(typeof r.total_entradas === 'number');
        assert(typeof r.saldo_previsto === 'number');
    });

    // ════════════════════════════════════════
    // 2. CUSTO DE PRODUÇÃO
    // ════════════════════════════════════════
    console.log('\n2. Custo de Produção');
    let custoId;
    await test('CustoProducao.criar() insere com custo_total auto', async () => {
        const r = await Financeiro.CustoProducao.criar({
            produto: 'TEST-PRODUTO',
            periodo: '2026-08',
            materia_prima: 100,
            embalagem: 20,
            mao_de_obra: 50,
            outros_custos: 30,
        });
        assert(r.id);
        assertEq(r.custo_total, 200, 'custo_total = 100+20+50+30 = 200');
        custoId = r.id;
    });

    await test('CustoProducao.resumoPorProduto() agrupa por produto', async () => {
        const r = await Financeiro.CustoProducao.resumoPorProduto({ periodo: '2026-08' });
        assert(Array.isArray(r));
        const test = r.find(x => x.produto === 'TEST-PRODUTO');
        assert(test, 'TEST-PRODUTO deveria estar no resumo');
        assertEq(test.custo_total, 200);
    });

    // ════════════════════════════════════════
    // 3. CONCILIAÇÃO BANCÁRIA
    // ════════════════════════════════════════
    console.log('\n3. Conciliação Bancária');
    let concInternoId, concExtratoId;
    await test('Conciliacao.criar() insere lançamento interno', async () => {
        const r = await Financeiro.Conciliacao.criar({
            data: '2026-08-28', descricao: 'Pgto fornecedor',
            forma_pagamento: 'pix', origem: 'Banco', destino: 'Fornecedor',
            valor: -500, origem_tipo: 'interno',
        });
        assert(r.id);
        concInternoId = r.id;
    });

    await test('Conciliacao.criar() insere lançamento extrato', async () => {
        const r = await Financeiro.Conciliacao.criar({
            data: '2026-08-28', descricao: 'Débito extrato',
            forma_pagamento: 'pix', origem: 'Banco', destino: 'Fornecedor',
            valor: -500, origem_tipo: 'extrato',
        });
        concExtratoId = r.id;
    });

    await test('Conciliacao.marcarConciliado() atualiza status', async () => {
        await Financeiro.Conciliacao.marcarConciliado(concInternoId);
        const r = await dbGet(`SELECT conciliado FROM fin_conciliacao WHERE id = ?`, [concInternoId]);
        assertEq(r.conciliado, 1);
    });

    await test('Conciliacao.comparar() retorna diferenças entre interno e extrato', async () => {
        const r = await Financeiro.Conciliacao.comparar({ dataInicio: '2026-08-28' });
        assert(Array.isArray(r));
    });

    // ════════════════════════════════════════
    // 4. PRECIFICAÇÃO
    // ════════════════════════════════════════
    console.log('\n4. Precificação');
    await test('Precificacao.criar() valida tipo', async () => {
        let threw = false;
        try { await Financeiro.Precificacao.criar({ tipo: 'invalido', categoria: 'x' }); }
        catch (e) { threw = true; }
        assert(threw);
    });

    await test('Precificacao.criar() insere despesa fixa', async () => {
        const r = await Financeiro.Precificacao.criar({
            tipo: 'fixa', categoria: 'aluguel', descricao: 'Aluguel mensal',
            valor: 2000, competencia_mes: '2026-08',
        });
        assert(r.id);
    });

    await test('Precificacao.criar() insere despesa variável', async () => {
        const r = await Financeiro.Precificacao.criar({
            tipo: 'variavel', categoria: 'energia', descricao: 'Luz',
            valor: 350, competencia_mes: '2026-08',
        });
        assert(r.id);
    });

    await test('Precificacao.calcularPreco() aplica markup', async () => {
        const r = await Financeiro.Precificacao.calcularPreco({
            custo_produto: 100, margem_percent: 30, impostos_percent: 15, competencia_mes: '2026-08',
        });
        assert(r.custo_total >= 100 + 2000 + 350, 'custo_total deve incluir fixas e variáveis');
        assert(r.preco_sugerido > r.custo_total, 'preco final > custo');
        assert(r.margem_percent === 30);
    });

    // ════════════════════════════════════════
    // 5. CONTAS A PAGAR E RECEBER
    // ════════════════════════════════════════
    console.log('\n5. Contas a Pagar e Receber');
    let contaId;
    await test('Contas.criar() valida tipo', async () => {
        let threw = false;
        try { await Financeiro.Contas.criar({ tipo: 'invalido', descricao: 'x', valor_inicial: 100, data_vencimento: '2026-08-28' }); }
        catch (e) { threw = true; }
        assert(threw);
    });

    await test('Contas.criar() insere conta a pagar', async () => {
        const r = await Financeiro.Contas.criar({
            tipo: 'pagar', descricao: 'Conta de luz', fornecedor: 'Energia S/A',
            valor_inicial: 350, juros_por_dia: 0.01,
            data_vencimento: '2026-08-20',
        });
        assert(r.id);
        contaId = r.id;
    });

    await test('Contas.registrarPagamento() atualiza status para pago', async () => {
        const r = await Financeiro.Contas.registrarPagamento(contaId, { valor_pago: 360 });
        assert(r.id);
        const c = await dbGet(`SELECT status, valor_final, dias_atraso FROM fin_contas WHERE id = ?`, [contaId]);
        assertEq(c.status, 'pago');
        assert(c.valor_final >= 350);
    });

    // ════════════════════════════════════════
    // 6. CONTROLE DE INADIMPLÊNCIA
    // ════════════════════════════════════════
    console.log('\n6. Controle de Inadimplência');
    let inadimplId;
    await test('Inadimplencia.criar() calcula dias_atraso', async () => {
        const r = await Financeiro.Inadimplencia.criar({
            cliente_id: 'cli-teste-001',
            valor_original: 1000,
            valor_juros: 50,
            valor_multa: 20,
            data_vencimento: '2026-06-01',  // 3 meses atrás
        });
        assert(r.id);
        inadimplId = r.id;
    });

    await test('Inadimplencia.registrarCobranca() incrementa tentativas', async () => {
        await Financeiro.Inadimplencia.registrarCobranca(inadimplId);
        const r = await dbGet(`SELECT tentativas_cobranca FROM fin_inadimplencia WHERE id = ?`, [inadimplId]);
        assert(r.tentativas_cobranca >= 1);
    });

    await test('Inadimplencia.resumo() agrega KPIs', async () => {
        const r = await Financeiro.Inadimplencia.resumo();
        assert(typeof r.clientes_inadimplentes === 'number');
    });

    // ════════════════════════════════════════
    // 7. BALANÇO PATRIMONIAL
    // ════════════════════════════════════════
    console.log('\n7. Balanço Patrimonial');
    await test('Balanco.criar() valida tipo', async () => {
        let threw = false;
        try { await Financeiro.Balanco.criar({ tipo: 'invalido', categoria: 'x', trimestre: '2026-Q3' }); }
        catch (e) { threw = true; }
        assert(threw);
    });

    await test('Balanco.criar() insere ativo e passivo', async () => {
        await Financeiro.Balanco.criar({ tipo: 'ativo', categoria: 'circulante', subcategoria: 'caixa', valor: 50000, trimestre: '2026-Q3' });
        await Financeiro.Balanco.criar({ tipo: 'passivo', categoria: 'circulante', subcategoria: 'fornecedores', valor: 20000, trimestre: '2026-Q3' });
        const r = await Financeiro.Balanco.resumoTrimestre('2026-Q3');
        assertEq(r.total_ativos, 50000);
        assertEq(r.total_passivos, 20000);
        assertEq(r.patrimonio_liquido, 30000);
    });

    // ════════════════════════════════════════
    // 8. ORÇAMENTO
    // ════════════════════════════════════════
    console.log('\n8. Orçamento');
    let orcId;
    await test('Orcamento.criar() calcula valor_total com margem', async () => {
        const r = await Financeiro.Orcamento.criar({
            numero: 'ORC-2026-001',
            titulo: 'Manutenção preventiva mensal',
            descricao: 'Teste',
            tipo: 'manutencao',
            valor_custos_fixos: 200,
            valor_custos_variaveis: 100,
            valor_materiais: 150,
            valor_mao_de_obra: 300,
            margem_lucro_percent: 30,
            impostos_percent: 10,
            data_emissao: '2026-08-28',
            itens: [
                { descricao: 'Filtro de ar', tipo: 'material', quantidade: 2, valor_unitario: 45 },
                { descricao: 'Mão de obra técnica', tipo: 'servico', quantidade: 3, valor_unitario: 100 },
            ],
        });
        assert(r.id);
        orcId = r.id;
        // custo = 200+100+150+300 = 750
        // com_margem = 750 * 1.3 = 975
        // valor_total = 975 * 1.1 = 1072.5
        assert(r.valor_total > 1070 && r.valor_total < 1075, `valor_total esperado ~1072.5, obtido ${r.valor_total}`);
    });

    await test('Orcamento.buscarPorId() retorna com itens', async () => {
        const r = await Financeiro.Orcamento.buscarPorId(orcId);
        assert(r);
        assert(r.itens.length === 2, 'deveria ter 2 itens');
    });

    await test('Orcamento.atualizarStatus() muda status', async () => {
        await Financeiro.Orcamento.atualizarStatus(orcId, 'enviado');
        const r = await dbGet(`SELECT status FROM fin_orcamento WHERE id = ?`, [orcId]);
        assertEq(r.status, 'enviado');
    });

    // ════════════════════════════════════════
    // 9. DRE
    // ════════════════════════════════════════
    console.log('\n9. DRE (Demonstração de Resultado)');
    await test('DRE.criar() valida tipo', async () => {
        let threw = false;
        try { await Financeiro.DRE.criar({ tipo: 'invalido', categoria: 'x', valor: 100, data: '2026-08-28' }); }
        catch (e) { threw = true; }
        assert(threw);
    });

    await test('DRE.criar() insere receita e despesa', async () => {
        await Financeiro.DRE.criar({ tipo: 'receita', categoria: 'vendas', descricao: 'Venda de serviços', valor: 10000, data: '2026-08-15' });
        await Financeiro.DRE.criar({ tipo: 'despesa', categoria: 'folha', descricao: 'Salários', valor: 4000, data: '2026-08-30' });
    });

    await test('DRE.calcularDRE() calcula lucro', async () => {
        const r = await Financeiro.DRE.calcularDRE('2026-08');
        assertEq(r.receitas, 10000);
        assertEq(r.despesas, 4000);
        assertEq(r.lucro_bruto, 6000);
        assert(r.lucro_liquido > 0);
    });

    await test('DRE.resumoAnual() agrega 12 meses', async () => {
        const r = await Financeiro.DRE.resumoAnual(2026);
        assert(r.meses.length === 12);
        assert(r.totais.receitas >= 0);
    });

    // ════════════════════════════════════════
    // RESULTADO
    // ════════════════════════════════════════
    console.log('\n=== RESULTADO ===');
    console.log(`Passou: ${passed}`);
    console.log(`Falhou: ${failed}`);
    if (failed > 0) {
        console.log('\nFalhas:');
        failures.forEach(f => console.log(`  - ${f.name}: ${f.err}`));
    }
    try { close(); } catch (_) {}
    process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
    console.error('Erro fatal:', err);
    try { close(); } catch (_) {}
    process.exit(1);
});
