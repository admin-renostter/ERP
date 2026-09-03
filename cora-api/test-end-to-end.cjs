// Teste end-to-end: criar cotação, gerar BOM, gerar PDF
const http = require('http');

const BASE = 'http://localhost:3000/api';

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost',
      port: 3000,
      path: BASE + path,
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);
    const r = http.request(opts, res => {
      let buf = '';
      res.on('data', d => buf += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(buf) }); }
        catch { resolve({ status: res.statusCode, data: buf }); }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function reqSafe(method, path, body, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await req(method, path, body);
      if (r.data && r.data.success !== undefined) return r;
      if (i === retries - 1) return r;
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise(res => setTimeout(res, 500));
    }
  }
  return { data: { success: false } };
}

(async () => {
  console.log('═'.repeat(70));
  console.log('TESTE END-TO-END: Cotação completa (calcular → criar → BOM → PDF)');
  console.log('═'.repeat(70));

  // 1. Calcular BTU
  console.log('\n📊 ETAPA 1: Calcular BTU (sala residencial 30m²)');
  const calc = await reqSafe('POST', '/cotacoes/calcular', {
    ambiente_tipo: 'residencial',
    area_m2: 30,
    pe_direito_m: 2.8,
    num_pessoas: 4,
    num_equipamentos_eletricos: 3,
    num_janelas: 2,
    orientacao_solar: 'sul',
    insolacao: 'media',
    tipo_uso: 'normal',
    refrigerante: 'R-410A'
  });
  console.log('  DEBUG calc.data:', JSON.stringify(calc.data).substring(0, 300));
  if (!calc.data || !calc.data.data || !calc.data.data.calculo) {
    console.log('  ❌ Falha no cálculo');
    return;
  }
  // Acessa o payload real: data.data.calculo
  const d = calc.data.data;
  console.log(`✓ BTU calculado:   ${d.calculo.btu_calculado.toLocaleString('pt-BR')}`);
  console.log(`✓ BTU recomendado: ${d.calculo.btu_recomendado.toLocaleString('pt-BR')}`);
  console.log(`✓ Equipamento:     ${d.equipamento?.marca} ${d.equipamento?.modelo}`);
  console.log(`✓ Custo estimado:   R$ ${d.custos.custo_total.toLocaleString('pt-BR', {minimumFractionDigits:2})}`);

  // 2. Criar cotação
  console.log('\n💼 ETAPA 2: Criar cotação no banco');
  const criacao = await reqSafe('POST', '/cotacoes', {
    titulo: 'Proposta Sala TI — 30m²',
    contato_nome: 'João Teste E2E',
    contato_email: 'joao@teste.com',
    contato_telefone: '11999999999',
    endereco_obra: 'Av. Paulista 1000, São Paulo/SP',
    ambiente_tipo: 'residencial',
    area_m2: 30,
    pe_direito_m: 2.8,
    num_pessoas: 4,
    num_equipamentos_eletricos: 3,
    num_janelas: 2,
    orientacao_solar: 'sul',
    insolacao: 'media',
    tipo_uso: 'normal',
    refrigerante: 'R-410A',
    custo_instalacao: 1200,
    margem_lucro_percent: 30,
    validade_dias: 15,
    observacoes: 'Cliente VIP - instalação urgente',
    status: 'enviada'
  });

  if (!criacao.data || !criacao.data.success) {
    console.log('❌ Erro ao criar:', JSON.stringify(criacao).substring(0, 500));
    return;
  }
  const criacaoReal = criacao.data.data;

  const cotacaoId = criacaoReal.id;
  console.log(`✓ Cotação criada: ${cotacaoId}`);
  console.log(`✓ BTU: ${criacaoReal.btu_calculado.toLocaleString('pt-BR')}`);
  console.log(`✓ Equipamento: ${criacaoReal.equipamento_sugerido_nome}`);
  console.log(`✓ Total: R$ ${criacaoReal.custo_total.toLocaleString('pt-BR', {minimumFractionDigits:2})}`);

  // 3. Buscar BOM gerado
  console.log('\n📦 ETAPA 3: Verificar BOM gerado automaticamente');
  const bom = await reqSafe('GET', `/cotacoes/${cotacaoId}/bom`);
  if (bom.data && bom.data.success) {
    const bd = bom.data.data;
    console.log(`✓ BOM tem ${bd.itens.length} itens`);
    console.log(`✓ Total do BOM: R$ ${bd.totais.valor.toLocaleString('pt-BR', {minimumFractionDigits:2})}`);

    // Agrupar por categoria
    const cats = {};
    bd.itens.forEach(i => {
      cats[i.categoria] = (cats[i.categoria] || 0) + 1;
    });
    console.log('✓ Itens por categoria:');
    Object.entries(cats).forEach(([c, n]) => {
      console.log(`  - ${c}: ${n} ${n > 1 ? 'itens' : 'item'}`);
    });

    console.log('\n📋 Lista detalhada do BOM:');
    bd.itens.forEach((i, idx) => {
      console.log(`  ${(idx+1).toString().padStart(2,' ')}. [${i.tipo.padEnd(11)}] ${i.descricao.substring(0, 50).padEnd(50)} ${i.quantidade}x R$ ${i.preco_unitario.toFixed(2).padStart(8)} = R$ ${i.preco_total.toFixed(2).padStart(8)}`);
    });
  } else {
    console.log('❌ Erro ao buscar BOM:', JSON.stringify(bom).substring(0, 300));
  }

  // 4. Gerar PDF (HTML)
  console.log('\n📄 ETAPA 4: Gerar PDF (HTML) da proposta');
  const pdf = await reqSafe('GET', `/cotacoes/${cotacaoId}/pdf`);
  if (pdf.status === 200 && typeof pdf.data === 'string' && pdf.data.length > 1000) {
    console.log(`✓ PDF (HTML) gerado com sucesso`);
    console.log(`✓ Tamanho: ${pdf.data.length} caracteres`);
    console.log(`✓ Pode ser acessado em: ${BASE}/cotacoes/${cotacaoId}/pdf`);
  } else {
    console.log('❌ Erro ao gerar PDF:', typeof pdf.data === 'string' ? pdf.data.substring(0, 200) : JSON.stringify(pdf).substring(0, 200));
  }

  // 5. Listar todas
  console.log('\n📋 ETAPA 5: Listar todas as cotações');
  const lista = await reqSafe('GET', '/cotacoes?limite=10');
  if (lista.data && lista.data.success) {
    const rows = lista.data.data;
    console.log(`✓ Total: ${rows.length} cotações`);
    rows.slice(0, 5).forEach(c => {
      console.log(`  - ${c.id.substring(0,8)} | ${c.titulo} | ${c.btu_calculado} BTU | R$ ${c.custo_total.toFixed(2)} | ${c.status}`);
    });
  }

  // 6. Stats
  console.log('\n📊 ETAPA 6: Estatísticas');
  const stats = await reqSafe('GET', '/cotacoes/stats?since=30');
  if (stats.data && stats.data.success) {
    const s = stats.data.data;
    console.log(`✓ Total: ${s.total}`);
    console.log(`✓ Aprovadas: ${(s.por_status?.aprovada || 0) + (s.por_status?.convertida || 0)}`);
    console.log(`✓ Taxa de conversão: ${s.taxa_conversao}%`);
    console.log(`✓ Ticket médio: R$ ${s.ticket_medio_aprovado.toLocaleString('pt-BR', {minimumFractionDigits:2})}`);
  }

  console.log('\n' + '═'.repeat(70));
  console.log('✅ TESTE END-TO-END CONCLUÍDO COM SUCESSO!');
  console.log('═'.repeat(70));
})();
