const axios = require('axios');
const { dbRun, dbGet } = require('./database');

const BANKS_URL = 'https://raw.githubusercontent.com/marcosantdm/bancos-br-ispb/main/banks.json';

async function syncBanks() {
    console.log('[Sync] Iniciando sincronização de bancos brasileiros...');
    let inserted = 0;
    let updated = 0;
    let total = 0;

    try {
        const response = await axios.get(BANKS_URL);
        const banks = response.data;
        total = banks.length;
        
        console.log(`[Sync] ${total} bancos encontrados. Processando...`);
        
        for (const bank of banks) {
            const ispb = bank.ISPB;
            const shortName = bank.Nome_Reduzido;
            const compe = bank.Número_Código ? bank.Número_Código.toString().padStart(3, '0') : null;
            const fullName = bank.Nome_Extenso;

            const exists = await dbGet('SELECT id FROM bancos_referencia WHERE ispb = ?', [ispb]);
            
            if (exists) {
                await dbRun(`
                    UPDATE bancos_referencia 
                    SET nome_reduzido = ?, codigo_comp = ?, nome_extenso = ?
                    WHERE ispb = ?
                `, [shortName, compe, fullName, ispb]);
                updated++;
            } else {
                await dbRun(`
                    INSERT INTO bancos_referencia (ispb, nome_reduzido, codigo_comp, nome_extenso)
                    VALUES (?, ?, ?, ?)
                `, [ispb, shortName, compe, fullName]);
                inserted++;
            }
        }
        
        const summary = `Sincronização concluída: ${total} bancos processados (${inserted} novos, ${updated} atualizados).`;
        console.log(`[Sync] ${summary}`);
        return { success: true, inserted, updated, total, summary };
    } catch (error) {
        console.error('[Sync] Falha ao sincronizar bancos:', error.message);
        return { success: false, error: error.message };
    }
}

// Permitir execução manual via CLI: node sync_banks.js
if (require.main === module) {
    syncBanks().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = { syncBanks };
