/**
 * Análise estrutural das 9 planilhas Cora
 */
const XLSX = require('xlsx');
const path = require('path');

const files = [
  ['Fluxo de Caixa',                'C:\\Users\\joaop\\.minimax\\v2\\assets\\2026\\08\\28\\11-33-08-825-asset_20260828-113308-825_601eed269271_e3661db9-Planilha-de-Fluxo-de-Caixa-Cora-.xlsx'],
  ['Custo de Produção',             'C:\\Users\\joaop\\.minimax\\v2\\assets\\2026\\08\\28\\11-33-08-833-asset_20260828-113308-833_84bb4e917fad_3efc2ca5-Planilha-de-Custo-de-Producao-Cora.xlsx'],
  ['Conciliação Bancária',          'C:\\Users\\joaop\\.minimax\\v2\\assets\\2026\\08\\28\\11-33-08-838-asset_20260828-113308-838_5cbea5a822d1_20512a08-Planilha-de-Conciliacao-Bancaria-Cora.xlsx'],
  ['Precificação',                  'C:\\Users\\joaop\\.minimax\\v2\\assets\\2026\\08\\28\\11-33-08-843-asset_20260828-113308-843_fef2724a3752_054d3fdd-Planilha-Cora-de-Precificacao.xlsx'],
  ['Contas a Pagar e Receber',      'C:\\Users\\joaop\\.minimax\\v2\\assets\\2026\\08\\28\\11-33-08-848-asset_20260828-113308-848_3d1982208197_779f406a-Planilha-Cora-de-Contas-a-Pagar-e-Receber.xlsx'],
  ['Controle de Inadimplência',     'C:\\Users\\joaop\\.minimax\\v2\\assets\\2026\\08\\28\\11-33-08-853-asset_20260828-113308-853_e1e52c0f247a_64396d54-Planilha-de-Controle-de-Inadimplencia-Cora.xlsx'],
  ['Balanço Patrimonial',           'C:\\Users\\joaop\\.minimax\\v2\\assets\\2026\\08\\28\\11-33-08-858-asset_20260828-113308-858_f45abb5b6f90_a91d73f8-Planilha-de-balanco-patrimonial-Cora-.xlsx'],
  ['Orçamento',                     'C:\\Users\\joaop\\.minimax\\v2\\assets\\2026\\08\\28\\11-33-08-865-asset_20260828-113308-865_d348d9f61d22_d0f85928-Planilha-Cora-de-Orcamento-.xlsx'],
  ['Controle Financeiro Empresarial', 'C:\\Users\\joaop\\.minimax\\v2\\assets\\2026\\08\\28\\11-33-08-871-asset_20260828-113308-871_bc7e92311615_64fd282b-Planilha-de-controle-financeiro-empresarial-Cora-.xlsx'],
];

for (const [name, filePath] of files) {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log(`  ${name}`);
  console.log('══════════════════════════════════════════════════════════');
  try {
    const wb = XLSX.readFile(filePath);
    console.log(`Sheets (${wb.SheetNames.length}): ${wb.SheetNames.join(', ')}`);
    for (const sn of wb.SheetNames) {
      const ws = wb.Sheets[sn];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
      console.log(`\n  --- Sheet: ${sn} (${data.length} rows × ${range.e.r + 1}×${range.e.c + 1}) ---`);
      // Imprime primeiras 8 linhas
      for (let i = 0; i < Math.min(8, data.length); i++) {
        const row = data[i].map(c => String(c).substring(0, 40));
        console.log(`    R${i+1}: ${row.slice(0, 10).join(' | ')}`);
      }
    }
  } catch (e) {
    console.log('ERROR:', e.message);
  }
}
