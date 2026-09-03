// Popula inventário de peças HVAC usando o mesmo padrão do projeto
const { dbRun } = require('./database');

const pecasIniciais = [
  { sku: 'AC-LG-09K', nome: 'Split Hi-Wall LG Dual Inverter 9.000 BTU', categoria: 'equipamento', subcategoria: 'split', marca: 'LG', modelo: 'Dual Inverter', potencia_btu: 9000, refrigerante: 'R-410A', preco_custo: 1400, preco_venda: 2199, estoque_atual: 12, localizacao: 'Depósito A1' },
  { sku: 'AC-LG-12K', nome: 'Split Hi-Wall LG Dual Inverter 12.000 BTU', categoria: 'equipamento', subcategoria: 'split', marca: 'LG', modelo: 'Dual Inverter', potencia_btu: 12000, refrigerante: 'R-410A', preco_custo: 1700, preco_venda: 2799, estoque_atual: 10, localizacao: 'Depósito A1' },
  { sku: 'AC-LG-15K', nome: 'Split Hi-Wall LG Dual Inverter 15.000 BTU', categoria: 'equipamento', subcategoria: 'split', marca: 'LG', modelo: 'Dual Inverter', potencia_btu: 15000, refrigerante: 'R-410A', preco_custo: 2200, preco_venda: 3499, estoque_atual: 8, localizacao: 'Depósito A1' },
  { sku: 'AC-SAM-18K', nome: 'Split Hi-Wall Samsung Wind-Free 18.000 BTU', categoria: 'equipamento', subcategoria: 'split', marca: 'Samsung', modelo: 'Wind-Free', potencia_btu: 18000, refrigerante: 'R-410A', preco_custo: 2700, preco_venda: 4299, estoque_atual: 6, localizacao: 'Depósito A2' },
  { sku: 'AC-SAM-24K', nome: 'Split Hi-Wall Samsung Wind-Free 24.000 BTU', categoria: 'equipamento', subcategoria: 'split', marca: 'Samsung', modelo: 'Wind-Free', potencia_btu: 24000, refrigerante: 'R-410A', preco_custo: 3700, preco_venda: 5799, estoque_atual: 5, localizacao: 'Depósito A2' },
  { sku: 'AC-LG-30K', nome: 'Split Hi-Wall LG Dual Inverter 30.000 BTU', categoria: 'equipamento', subcategoria: 'split', marca: 'LG', modelo: 'Dual Inverter', potencia_btu: 30000, refrigerante: 'R-410A', preco_custo: 4500, preco_venda: 7299, estoque_atual: 4, localizacao: 'Depósito A1' },
  { sku: 'AC-CAR-36K', nome: 'Split Piso-Teto Carrier X-Power 36.000 BTU', categoria: 'equipamento', subcategoria: 'piso-teto', marca: 'Carrier', modelo: 'X-Power', potencia_btu: 36000, refrigerante: 'R-410A', preco_custo: 5800, preco_venda: 8999, estoque_atual: 3, localizacao: 'Depósito B1' },
  { sku: 'AC-TRN-60K', nome: 'VRF Trane 60.000 BTU', categoria: 'equipamento', subcategoria: 'vrf', marca: 'Trane', modelo: 'VRF', potencia_btu: 60000, refrigerante: 'R-410A', preco_custo: 9800, preco_venda: 15999, estoque_atual: 2, localizacao: 'Depósito C1' },
  { sku: 'TB-CU-1-4', nome: 'Tubo de Cobre 1/4" (6.35mm) — 15m', categoria: 'tubulacao', subcategoria: 'cobre', preco_custo: 180, preco_venda: 320, estoque_atual: 50, localizacao: 'Depósito D1' },
  { sku: 'TB-CU-3-8', nome: 'Tubo de Cobre 3/8" (9.53mm) — 15m', categoria: 'tubulacao', subcategoria: 'cobre', preco_custo: 240, preco_venda: 420, estoque_atual: 40, localizacao: 'Depósito D1' },
  { sku: 'TB-CU-1-2', nome: 'Tubo de Cobre 1/2" (12.7mm) — 15m', categoria: 'tubulacao', subcategoria: 'cobre', preco_custo: 320, preco_venda: 580, estoque_atual: 30, localizacao: 'Depósito D1' },
  { sku: 'TB-CU-5-8', nome: 'Tubo de Cobre 5/8" (15.88mm) — 15m', categoria: 'tubulacao', subcategoria: 'cobre', preco_custo: 450, preco_venda: 780, estoque_atual: 25, localizacao: 'Depósito D1' },
  { sku: 'SP-1-4', nome: 'Suporte para Condensadora 9-24k BTU', categoria: 'suporte', subcategoria: 'aco', preco_custo: 80, preco_venda: 150, estoque_atual: 30, localizacao: 'Depósito E1' },
  { sku: 'SP-2', nome: 'Suporte Reforçado 30-60k BTU', categoria: 'suporte', subcategoria: 'aco', preco_custo: 180, preco_venda: 320, estoque_atual: 15, localizacao: 'Depósito E1' },
  { sku: 'CB-AL-15', nome: 'Cabo Alimentação 4mm² 15m (PP)', categoria: 'cabo', subcategoria: 'pp', preco_custo: 95, preco_venda: 165, estoque_atual: 40, localizacao: 'Depósito F1' },
  { sku: 'CB-AL-25', nome: 'Cabo Alimentação 6mm² 25m (PP)', categoria: 'cabo', subcategoria: 'pp', preco_custo: 180, preco_venda: 320, estoque_atual: 25, localizacao: 'Depósito F1' },
  { sku: 'DR-3M', nome: 'Dreno 3m PVC 25mm', categoria: 'dreno', subcategoria: 'pvc', preco_custo: 25, preco_venda: 50, estoque_atual: 80, localizacao: 'Depósito G1' },
  { sku: 'IS-CL-1', nome: 'Isolamento Térmico 1/4" + 3/8" (rolo 6m)', categoria: 'isolamento', subcategoria: 'borracha', preco_custo: 45, preco_venda: 85, estoque_atual: 60, localizacao: 'Depósito G1' },
  { sku: 'FT-50', nome: 'Fita de Aço Perfurada 50m', categoria: 'fixacao', subcategoria: 'aco', preco_custo: 35, preco_venda: 65, estoque_atual: 40, localizacao: 'Depósito G1' },
  { sku: 'GF-2', nome: 'Gás R-410A 2kg (adicional)', categoria: 'refrigerante', subcategoria: 'r410a', preco_custo: 280, preco_venda: 480, estoque_atual: 12, localizacao: 'Depósito H1' },
  { sku: 'GF-5', nome: 'Gás R-410A 5kg (carga completa)', categoria: 'refrigerante', subcategoria: 'r410a', preco_custo: 650, preco_venda: 1100, estoque_atual: 8, localizacao: 'Depósito H1' },
  { sku: 'CN-1', nome: 'Conexões + Porcas + Anilhas (kit completo)', categoria: 'conexao', subcategoria: 'cobre', preco_custo: 45, preco_venda: 85, estoque_atual: 100, localizacao: 'Depósito D1' },
  { sku: 'DS-30A', nome: 'Disjuntor 30A Mono', categoria: 'eletrica', subcategoria: 'protecao', preco_custo: 35, preco_venda: 70, estoque_atual: 50, localizacao: 'Depósito F1' },
  { sku: 'DS-50A', nome: 'Disjuntor 50A Mono', categoria: 'eletrica', subcategoria: 'protecao', preco_custo: 55, preco_venda: 110, estoque_atual: 30, localizacao: 'Depósito F1' }
];

(async () => {
  let count = 0;
  for (const p of pecasIniciais) {
    const id = `INV-${String(pecasIniciais.indexOf(p) + 1).padStart(4, '0')}`;
    try {
      await dbRun(`INSERT INTO inventory
        (id, sku, nome, categoria, subcategoria, marca, modelo, potencia_btu, refrigerante, preco_custo, preco_venda, estoque_atual, localizacao, ativo, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))`,
      [id, p.sku, p.nome, p.categoria, p.subcategoria, p.marca || null, p.modelo || null,
       p.potencia_btu || null, p.refrigerante || null,
       p.preco_custo, p.preco_venda, p.estoque_atual, p.localizacao]);
      count++;
    } catch (e) {
      console.error(`Erro em ${p.sku}:`, e.message);
    }
  }
  console.log(`✓ ${count} peças inseridas no inventário`);

  // Verifica
  const { dbGet } = require('./database');
  const total = await dbGet('SELECT COUNT(*) as n FROM inventory');
  console.log(`✓ Total no banco: ${total.n} peças`);
  process.exit(0);
})();
