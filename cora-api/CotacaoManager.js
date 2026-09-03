// ═══════════════════════════════════════════════════════════════
// CotacaoManager.js — Dimensionamento HVAC + Cotação
// Cálculo de carga térmica baseado em norma brasileira (ABNT NBR 16401)
// ═══════════════════════════════════════════════════════════════

const { dbRun, dbGet, dbAll } = require('./database');
// Sprint 13.8: wrappers tenant-aware
const { dbAllTenant, dbGetTenant, dbRunTenant } = require('./infra/tenantAwareDb');
const { randomUUID } = require('crypto');

// ─── Fatores de cálculo (baseado em norma técnica HVAC) ─────
// BTU base por m² (ambiente residencial padrão)
const FATOR_BASE_BTU_M2 = {
    residencial: 600,   // 600 BTU/m² para residencial
    comercial: 700,     // 700 BTU/m² para comercial
    industrial: 800,    // 800 BTU/m² para industrial (galpão)
    servidor: 1200,     // Salas de servidor / data center
    cozinha: 1000,      // Cozinha industrial
};

// BTU adicional por pessoa (calor metabólico)
const BTU_POR_PESSOA = 600;

// BTU adicional por equipamento elétrico
const BTU_POR_EQUIPAMENTO = {
    pc: 600,            // Computador desktop
    notebook: 200,      // Notebook
    tv_32: 250,         // TV 32"
    tv_50: 500,         // TV 50"+
    impressora: 400,    // Impressora laser
    geladeira: 800,     // Geladeira
    forno: 1500,        // Forno elétrico
    micro_ondas: 600,   // Micro-ondas
    luminaria: 100,     // Luminária
    padrao: 400,        // Padrão (quando não identificado)
};

// Fator de pé-direito (multiplicador)
const FATOR_PE_DIREITO = {
    ate_2_5: 1.00,
    '2_5_3': 1.05,
    '3_3_5': 1.10,
    '3_5_4': 1.15,
    acima_4: 1.20,
};

// Fator de insolação
const FATOR_INSOLACAO = {
    nenhuma: 1.00,      // Sem janelas ou voltada pro sul
    fraca: 1.05,        // Janelas pequenas ou voltadas norte/leste com sombra
    media: 1.10,        // Insolação média
    forte: 1.20,        // Janelas grandes voltadas norte/oeste
};

// Fator de orientação solar
const FATOR_ORIENTACAO = {
    sul: 1.00,          // Melhor orientação (menos sol)
    leste: 1.05,
    norte: 1.10,
    oeste: 1.15,        // Pior orientação (mais sol à tarde)
};

// ─── Engine de cálculo ───────────────────────────────────────
function calcularBTU(params) {
    const {
        ambiente_tipo = 'residencial',
        area_m2 = 0,
        pe_direito_m = 2.8,
        num_janelas = 0,
        num_portas = 0,
        orientacao_solar = 'sul',
        insolacao = 'fraca',
        num_pessoas = 0,
        num_equipamentos_eletricos = 0,
        tipo_uso = 'normal',  // normal, intensivo, leve
    } = params;

    // 1. BTU base = área × fator
    const fatorBase = FATOR_BASE_BTU_M2[ambiente_tipo] || FATOR_BASE_BTU_M2.residencial;
    let btu = area_m2 * fatorBase;

    // 2. Ajusta por pé-direito
    let fatorPD = 1.0;
    if (pe_direito_m <= 2.5) fatorPD = FATOR_PE_DIREITO.ate_2_5;
    else if (pe_direito_m <= 3.0) fatorPD = FATOR_PE_DIREITO['2_5_3'];
    else if (pe_direito_m <= 3.5) fatorPD = FATOR_PE_DIREITO['3_3_5'];
    else if (pe_direito_m <= 4.0) fatorPD = FATOR_PE_DIREITO['3_5_4'];
    else fatorPD = FATOR_PE_DIREITO.acima_4;
    btu *= fatorPD;

    // 3. Adiciona BTU por pessoas
    btu += num_pessoas * BTU_POR_PESSOA;

    // 4. Adiciona BTU por equipamentos (estimativa conservadora)
    btu += num_equipamentos_eletricos * BTU_POR_EQUIPAMENTO.padrao;

    // 5. Ajusta por insolação
    btu *= FATOR_INSOLACAO[insolacao] || 1.0;

    // 6. Ajusta por orientação solar
    btu *= FATOR_ORIENTACAO[orientacao_solar] || 1.0;

    // 7. Adiciona BTU por janelas (estimativa)
    btu += num_janelas * 800;

    // 8. Fator de uso
    const fatorUso = { leve: 0.85, normal: 1.0, intensivo: 1.20 }[tipo_uso] || 1.0;
    btu *= fatorUso;

    // Arredonda para o equipamento comercial mais próximo (BTU padronizado)
    const btus_comerciais = [7000, 9000, 10000, 12000, 15000, 18000, 21000, 24000, 30000, 36000, 48000, 60000];
    const btu_final = btus_comerciais.find(b => b >= btu) || Math.ceil(btu / 6000) * 6000;

    return {
        btu_calculado: Math.round(btu),
        btu_recomendado: btu_final,
        potencia_kw: +(btu_final / 3412).toFixed(2), // 1 kW = 3412 BTU/h
        fator_pe_direito: fatorPD,
        fator_insolacao: FATOR_INSOLACAO[insolacao] || 1.0,
        fator_orientacao: FATOR_ORIENTACAO[orientacao_solar] || 1.0,
        fator_uso: fatorUso,
        btu_pessoas: num_pessoas * BTU_POR_PESSOA,
        btu_equipamentos: num_equipamentos_eletricos * BTU_POR_EQUIPAMENTO.padrao,
        btu_janelas: num_janelas * 800,
    };
}

// ─── Sugerir equipamento do estoque ──────────────────────────
async function sugerirEquipamento(btu, refrigerante = 'R-410A') {
    // Tenta primeiro em uma tabela `inventory` se existir
    try {
        const candidates = await dbAllTenant(
            `SELECT *, ABS(potencia_btu - ?) as diff
             FROM inventory
             WHERE ativo = 1
               AND categoria = 'equipamento'
               AND potencia_btu >= ?
             ORDER BY diff ASC
             LIMIT 5`,
            [btu, btu]
        );
        if (candidates && candidates.length) {
            const c = candidates[0];
            return { id: c.id, sku: c.sku, nome: c.nome, marca: c.marca, modelo: c.modelo, potencia_btu: c.potencia_btu, preco_venda: c.preco_venda, refrigerante: c.refrigerante || refrigerante };
        }
    } catch (_) { /* tabela não existe — fallback */ }

    // Fallback: sugestão genérica baseada no BTU
    const sugestoes = {
        7000:  { marca: 'Samsung', modelo: 'Wind-Free 7.000 BTU',  preco_venda: 1699 },
        9000:  { marca: 'LG',      modelo: 'Dual Inverter 9.000 BTU', preco_venda: 2199 },
        12000: { marca: 'Samsung', modelo: 'Wind-Free 12.000 BTU', preco_venda: 2799 },
        15000: { marca: 'LG',      modelo: 'Dual Inverter 15.000 BTU', preco_venda: 3499 },
        18000: { marca: 'Fujitsu', modelo: 'Inverter 18.000 BTU', preco_venda: 4299 },
        21000: { marca: 'Carrier', modelo: 'X-Power 21.000 BTU', preco_venda: 4999 },
        24000: { marca: 'Samsung', modelo: 'Wind-Free 24.000 BTU', preco_venda: 5799 },
        30000: { marca: 'LG',      modelo: 'Dual Inverter 30.000 BTU', preco_venda: 7299 },
        36000: { marca: 'Carrier', modelo: 'Infinity 36.000 BTU', preco_venda: 8999 },
        48000: { marca: 'Daikin',  modelo: 'Inverter 48.000 BTU', preco_venda: 11999 },
        60000: { marca: 'Trane',   modelo: 'VRF 60.000 BTU', preco_venda: 15999 }
    };

    // Encontra o BTU comercial mais próximo >= btu
    const chaves = Object.keys(sugestoes).map(Number).sort((a, b) => a - b);
    const btuMatch = chaves.find(b => b >= btu) || chaves[chaves.length - 1];
    return { id: null, marca: sugestoes[btuMatch].marca, modelo: sugestoes[btuMatch].modelo, potencia_btu: btuMatch, preco_venda: sugestoes[btuMatch].preco_venda, refrigerante };
}

// ─── Calcular custos ──────────────────────────────────────────
function calcularCustos({ btu, custo_equipamento, custo_instalacao_base, margem_lucro_percent = 30, custo_mao_obra_hora = 80, horas_estimadas = 4 }) {
    const mao_obra = custo_mao_obra_hora * horas_estimadas;
    const subtotal = (custo_equipamento || 0) + (custo_instalacao_base || 0) + mao_obra;
    const lucro = subtotal * (margem_lucro_percent / 100);
    const total = subtotal + lucro;
    return {
        custo_equipamento: custo_equipamento || 0,
        custo_instalacao: custo_instalacao_base || 0,
        custo_mao_obra: mao_obra,
        subtotal,
        margem_lucro_percent,
        lucro,
        custo_total: total
    };
}

// ─── BOM (Bill of Materials) — Peças por BTU ───────────────
async function gerarBOM(btu, equipamento) {
    // Define o tamanho dos tubos de cobre baseado no BTU
    let tamanhoTubo = '1/4" + 3/8"';  // até 18k
    if (btu >= 18000 && btu < 30000) tamanhoTubo = '1/4" + 1/2"';
    else if (btu >= 30000) tamanhoTubo = '3/8" + 5/8"';

    // Define o disjuntor baseado no BTU
    let skuDisjuntor = 'DS-30A';
    if (btu >= 24000) skuDisjuntor = 'DS-50A';

    // Define o cabo baseado na distância média
    let skuCabo = 'CB-AL-15';
    if (btu >= 18000) skuCabo = 'CB-AL-25';

    // Define o suporte baseado no BTU
    let skuSuporte = 'SP-1-4';
    if (btu >= 24000) skuSuporte = 'SP-2';

    // Define o gás refrigerante
    let skuGas = 'GF-2';
    if (btu >= 18000) skuGas = 'GF-5';

    // Monta lista de SKUs a buscar
    const skus = [
        { sku: tamanhoTubo.includes('1/2"') ? 'TB-CU-1-2' : tamanhoTubo.includes('5/8"') ? 'TB-CU-5-8' : tamanhoTubo.includes('3/8"') ? 'TB-CU-3-8' : 'TB-CU-1-4', qty: 1, obs: `Tubos ${tamanhoTubo}` },
        { sku: skuDisjuntor, qty: 1, obs: 'Proteção circuito' },
        { sku: skuCabo, qty: 1, obs: 'Alimentação elétrica' },
        { sku: skuSuporte, qty: 1, obs: 'Suporte condensadora' },
        { sku: 'DR-3M', qty: 1, obs: 'Dreno condensado' },
        { sku: 'IS-CL-1', qty: 1, obs: 'Isolamento térmico' },
        { sku: 'FT-50', qty: 1, obs: 'Fita de aço' },
        { sku: skuGas, qty: 1, obs: 'Carga refrigerante' },
        { sku: 'CN-1', qty: 2, obs: 'Conexões + porcas' }
    ];

    // Se equipamento > 30k, adiciona 1 cabo extra e disjuntor
    if (btu >= 30000) {
        skus.push({ sku: 'CB-AL-25', qty: 1, obs: 'Cabo extra (distância longa)' });
    }

    // Busca no inventário
    const itens = [];
    let ordem = 1;

    // Primeiro: equipamento principal
    if (equipamento && equipamento.sku) {
        itens.push({
            ordem: ordem++,
            tipo: 'equipamento',
            inventory_id: equipamento.id || null,
            sku: equipamento.sku,
            descricao: equipamento.nome || `${equipamento.marca} ${equipamento.modelo}`,
            categoria: 'equipamento',
            quantidade: 1,
            unidade: 'un',
            preco_unitario: equipamento.preco_venda || 0,
            preco_total: equipamento.preco_venda || 0,
            custo_mao_obra_horas: 0,
            observacoes: 'Equipamento principal'
        });
    }

    // Depois: demais peças
    for (const item of skus) {
        try {
            const p = await dbGetTenant('SELECT * FROM inventory WHERE sku = ? AND ativo = 1', [item.sku]);
            if (p) {
                const preco = p.preco_venda || 0;
                itens.push({
                    ordem: ordem++,
                    tipo: 'material',
                    inventory_id: p.id,
                    sku: p.sku,
                    descricao: p.nome,
                    categoria: p.categoria,
                    quantidade: item.qty,
                    unidade: 'un',
                    preco_unitario: preco,
                    preco_total: preco * item.qty,
                    custo_mao_obra_horas: 0,
                    observacoes: item.obs
                });
            }
        } catch (_) { /* pula se não encontrar */ }
    }

    // Mão de obra (não vem do inventário, é item conceitual)
    // Será calculada separadamente em calcularCustos()

    return itens;
}

async function salvarItensBOM(cotacaoId, itens) {
    // Limpa itens anteriores
    await dbRun('DELETE FROM cotacao_itens WHERE cotacao_id = ?', [cotacaoId]);

    // Insere novos
    for (const item of itens) {
        await dbRun(`INSERT INTO cotacao_itens
            (cotacao_id, tipo, inventory_id, sku, descricao, categoria, quantidade, unidade, preco_unitario, preco_total, custo_mao_obra_horas, observacoes, ordem)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [cotacaoId, item.tipo, item.inventory_id || null, item.sku, item.descricao,
         item.categoria, item.quantidade, item.unidade || 'un',
         item.preco_unitario, item.preco_total, item.custo_mao_obra_horas || 0,
         item.observacoes || null, item.ordem]);
    }
    return itens.length;
}

async function obterItensBOM(cotacaoId) {
    return await dbAllTenant('SELECT * FROM cotacao_itens WHERE cotacao_id = ? ORDER BY ordem, id', [cotacaoId]);
}

// ─── CRUD de cotações ────────────────────────────────────────
async function criarCotacao(data) {
    const id = data.id || randomUUID();

    // 1. Calcular BTU
    const calc = calcularBTU(data);

    // 2. Sugerir equipamento
    const equipSugerido = await sugerirEquipamento(calc.btu_recomendado, data.refrigerante);

    // 3. Calcular custos
    const custos = calcularCustos({
        btu: calc.btu_recomendado,
        custo_equipamento: equipSugerido?.preco_venda || data.custo_equipamento || 0,
        custo_instalacao_base: data.custo_instalacao || 800,
        margem_lucro_percent: data.margem_lucro_percent || 30,
        custo_mao_obra_hora: data.custo_mao_obra_hora || 80,
        horas_estimadas: data.horas_estimadas || 4
    });

    // 4. Calcular validade
    const validadeEm = new Date();
    validadeEm.setDate(validadeEm.getDate() + (data.validade_dias || 15));

    // 5. Montar payload
    const payload = {
        id,
        cliente_id: data.cliente_id || null,
        lead_id: data.lead_id || null,
        versao: 1,
        status: data.status || 'rascunho',
        titulo: data.titulo || `Cotação ${equipSugerido?.marca || ''} ${equipSugerido?.modelo || calc.btu_recomendado + ' BTU'}`,
        contato_nome: data.contato_nome || null,
        contato_email: data.contato_email || null,
        contato_telefone: data.contato_telefone || null,
        endereco_obra: data.endereco_obra || null,
        ambiente_tipo: data.ambiente_tipo,
        area_m2: data.area_m2,
        pe_direito_m: data.pe_direito_m || 2.8,
        num_janelas: data.num_janelas || 0,
        num_portas: data.num_portas || 0,
        orientacao_solar: data.orientacao_solar || 'sul',
        insolacao: data.insolacao || 'fraca',
        num_pessoas: data.num_pessoas || 0,
        num_equipamentos_eletricos: data.num_equipamentos_eletricos || 0,
        tipo_uso: data.tipo_uso || 'normal',
        refrigerante: data.refrigerante || 'R-410A',
        ambiente_outros: data.ambiente_outros || null,
        btu_calculado: calc.btu_calculado,
        potencia_kw: calc.potencia_kw,
        equipamento_sugerido_id: equipSugerido?.id || null,
        equipamento_sugerido_nome: equipSugerido ? `${equipSugerido.marca} ${equipSugerido.modelo}` : null,
        custo_equipamento: custos.custo_equipamento,
        custo_instalacao: custos.custo_instalacao,
        custo_total: custos.custo_total,
        custo_mao_obra: custos.custo_mao_obra,
        margem_lucro_percent: custos.margem_lucro_percent,
        validade_dias: data.validade_dias || 15,
        validade_em: validadeEm.toISOString(),
        itens_json: JSON.stringify({
            calculo: calc,
            custos,
            equipamento: equipSugerido
        }),
        observacoes: data.observacoes || null,
        created_by: data.created_by || null,
        updated_at: new Date().toISOString()
    };

    // 6. Gerar BOM automático (peças + acessórios)
    const bomItens = await gerarBOM(calc.btu_recomendado, equipSugerido);
    console.log(`[CotacaoManager] BOM gerado: ${bomItens.length} itens para BTU ${calc.btu_recomendado}`);

    // 7. PRIMEIRO inserir a cotação (pai) — para satisfazer a FK de cotacao_itens
    await dbRun(`INSERT INTO cotacoes (
        id, cliente_id, lead_id, versao, status, titulo,
        contato_nome, contato_email, contato_telefone, endereco_obra,
        ambiente_tipo, area_m2, pe_direito_m, num_janelas, num_portas,
        orientacao_solar, insolacao, num_pessoas, num_equipamentos_eletricos,
        tipo_uso, refrigerante, ambiente_outros, btu_calculado, potencia_kw,
        equipamento_sugerido_id, equipamento_sugerido_nome,
        custo_equipamento, custo_instalacao, custo_total, custo_mao_obra,
        margem_lucro_percent, validade_dias, validade_em, itens_json,
        observacoes, created_by, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
        payload.id, payload.cliente_id, payload.lead_id, payload.versao, payload.status, payload.titulo,
        payload.contato_nome, payload.contato_email, payload.contato_telefone, payload.endereco_obra,
        payload.ambiente_tipo, payload.area_m2, payload.pe_direito_m, payload.num_janelas, payload.num_portas,
        payload.orientacao_solar, payload.insolacao, payload.num_pessoas, payload.num_equipamentos_eletricos,
        payload.tipo_uso, payload.refrigerante, payload.ambiente_outros, payload.btu_calculado, payload.potencia_kw,
        payload.equipamento_sugerido_id, payload.equipamento_sugerido_nome,
        payload.custo_equipamento, payload.custo_instalacao, payload.custo_total, payload.custo_mao_obra,
        payload.margem_lucro_percent, payload.validade_dias, payload.validade_em, payload.itens_json,
        payload.observacoes, payload.created_by, payload.updated_at
    ]);

    // 8. DEPOIS persistir o BOM (filhos) — agora a cotação já existe, FK ok
    await dbRun('DELETE FROM cotacao_itens WHERE cotacao_id = ?', [id]);
    let itensSalvos = 0;
    for (const item of bomItens) {
        try {
            await dbRun(`INSERT INTO cotacao_itens
                (cotacao_id, tipo, inventory_id, sku, descricao, categoria, quantidade, unidade, preco_unitario, preco_total, custo_mao_obra_horas, observacoes, ordem)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, item.tipo, item.inventory_id || null, item.sku, item.descricao,
             item.categoria, item.quantidade, item.unidade || 'un',
             item.preco_unitario, item.preco_total, item.custo_mao_obra_horas || 0,
             item.observacoes || null, item.ordem]);
            itensSalvos++;
        } catch (e) {
            console.error(`[CotacaoManager] Erro ao inserir item ${item.sku}:`, e.message);
        }
    }
    console.log(`[CotacaoManager] BOM persistido: ${itensSalvos}/${bomItens.length} itens salvos`);

    return { id, ...payload, calculo: calc, custos, equipamento_sugerido: equipSugerido, bom: bomItens };
}

async function atualizarCotacao(id, data) {
    const existing = await dbGetTenant('SELECT * FROM cotacoes WHERE id = ?', [id]);
    if (!existing) throw new Error('Cotação não encontrada');

    // Recalcula se dados técnicos mudaram
    let payload = { ...existing, ...data };
    if (data.area_m2 !== undefined || data.num_pessoas !== undefined || data.ambiente_tipo !== undefined) {
        const calc = calcularBTU(payload);
        const custos = calcularCustos({
            custo_equipamento: payload.custo_equipamento || 0,
            custo_instalacao_base: payload.custo_instalacao || 800,
            margem_lucro_percent: payload.margem_lucro_percent || 30
        });
        payload.btu_calculado = calc.btu_calculado;
        payload.potencia_kw = calc.potencia_kw;
        payload.custo_total = custos.custo_total;
        payload.itens_json = JSON.stringify({ calculo: calc, custos });
    }

    payload.updated_at = new Date().toISOString();

    await dbRun(`UPDATE cotacoes SET
        titulo = ?, status = ?, endereco_obra = ?, ambiente_tipo = ?, area_m2 = ?,
        pe_direito_m = ?, num_janelas = ?, num_portas = ?, orientacao_solar = ?,
        insolacao = ?, num_pessoas = ?, num_equipamentos_eletricos = ?,
        tipo_uso = ?, refrigerante = ?, ambiente_outros = ?,
        custo_equipamento = ?, custo_instalacao = ?, custo_total = ?,
        margem_lucro_percent = ?, validade_dias = ?, validade_em = ?,
        observacoes = ?, updated_at = ?
        WHERE id = ?`,
    [
        payload.titulo, payload.status, payload.endereco_obra, payload.ambiente_tipo, payload.area_m2,
        payload.pe_direito_m, payload.num_janelas, payload.num_portas, payload.orientacao_solar,
        payload.insolacao, payload.num_pessoas, payload.num_equipamentos_eletricos,
        payload.tipo_uso, payload.refrigerante, payload.ambiente_outros,
        payload.custo_equipamento, payload.custo_instalacao, payload.custo_total,
        payload.margem_lucro_percent, payload.validade_dias, payload.validade_em,
        payload.observacoes, payload.updated_at, id
    ]);

    return { id, ...payload };
}

async function listarCotacoes(filtros = {}) {
    const { escapeLike } = require('./infra/tenantAwareDb');
    const { status, cliente_id, lead_id, search, limite = 100 } = filtros;
    let sql = 'SELECT c.*, cl.nome as cliente_nome, cl.nome as cliente_fantasia, l.nome as lead_nome FROM cotacoes c LEFT JOIN clientes cl ON cl.id = c.cliente_id LEFT JOIN leads l ON l.id = c.lead_id WHERE 1=1';
    const params = [];
    if (status) { sql += ' AND c.status = ?'; params.push(status); }
    if (cliente_id) { sql += ' AND c.cliente_id = ?'; params.push(cliente_id); }
    if (lead_id) { sql += ' AND c.lead_id = ?'; params.push(lead_id); }
    if (search) {
        // SECURITY FIX V07: escapar wildcards em LIKE
        const safe = escapeLike(search);
        sql += ' AND (c.titulo LIKE ? ESCAPE \'\\\\\' OR c.endereco_obra LIKE ? ESCAPE \'\\\\\' OR c.contato_nome LIKE ? ESCAPE \'\\\\\')';
        params.push(`%${safe}%`, `%${safe}%`, `%${safe}%`);
    }
    sql += ' ORDER BY c.created_at DESC LIMIT ?';
    params.push(parseInt(limite));
    return await dbAllTenant(sql, params);
}

async function obterCotacao(id) {
    const row = await dbGetTenant(
        `SELECT c.*, cl.nome as cliente_nome, cl.nome as cliente_fantasia, cl.telefone as cliente_telefone, cl.email as cliente_email
         FROM cotacoes c LEFT JOIN clientes cl ON cl.id = c.cliente_id WHERE c.id = ?`,
        [id]
    );
    if (!row) return null;
    // Parse itens_json
    if (row.itens_json) {
        try { row.itens = JSON.parse(row.itens_json); } catch (_) { row.itens = null; }
    }
    return row;
}

async function deletarCotacao(id) {
    const r = await dbRun('DELETE FROM cotacoes WHERE id = ?', [id]);
    return { deleted: r.changes || 0 };
}

async function stats(filtros = {}) {
    const { since } = filtros;
    let whereSince = '';
    const params = [];
    if (since) { whereSince = ` AND created_at >= datetime('now', '-${parseInt(since)} days')`; }

    const all = await dbAllTenant(`SELECT * FROM cotacoes WHERE 1=1${whereSince}`, params);
    const total = all.length;
    const total_valor = all.reduce((s, c) => s + (c.custo_total || 0), 0);
    const por_status = all.reduce((acc, c) => {
        acc[c.status] = (acc[c.status] || 0) + 1;
        return acc;
    }, {});
    const valor_aprovadas = all.filter(c => c.status === 'aprovada' || c.status === 'convertida').reduce((s, c) => s + (c.custo_total || 0), 0);
    const taxa_conversao = total > 0 ? ((por_status.aprovada || 0) + (por_status.convertida || 0)) / total * 100 : 0;
    const valor_medio = total > 0 ? total_valor / total : 0;
    const ticket_medio_aprovado = (por_status.aprovada || 0) + (por_status.convertida || 0) > 0
        ? valor_aprovadas / ((por_status.aprovada || 0) + (por_status.convertida || 0))
        : 0;
    const vencidas = all.filter(c => c.status === 'rascunho' || c.status === 'enviada').filter(c => c.validade_em && new Date(c.validade_em) < new Date()).length;

    return {
        total,
        total_valor,
        valor_aprovadas,
        taxa_conversao: +taxa_conversao.toFixed(1),
        valor_medio: +valor_medio.toFixed(2),
        ticket_medio_aprovado: +ticket_medio_aprovado.toFixed(2),
        por_status,
        vencidas
    };
}

module.exports = {
    calcularBTU,
    calcularCustos,
    sugerirEquipamento,
    gerarBOM,
    salvarItensBOM,
    obterItensBOM,
    criarCotacao,
    atualizarCotacao,
    listarCotacoes,
    obterCotacao,
    deletarCotacao,
    stats,
    FATOR_BASE_BTU_M2,
    BTU_POR_PESSOA,
    BTU_POR_EQUIPAMENTO,
    FATOR_INSOLACAO,
    FATOR_ORIENTACAO
};
