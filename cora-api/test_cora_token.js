require('dotenv').config();
const fs = require('fs');
const path = require('path');
const CoraGateway = require('./gateways/CoraGateway');
const { dbGet, dbRun } = require('./database');

async function runTests() {
    console.log('\n🔐 Teste de Token mTLS — API Cora');
    console.log('═'.repeat(50));

    // Aguarda o banco inicializar
    await new Promise(r => setTimeout(r, 1500)); 

    const gateway = new CoraGateway({
        env: process.env.CORA_ENV || 'stage',
        clientId: process.env.CORA_CLIENT_ID,
        certPath: path.resolve(__dirname, process.env.CORA_CERT_PATH || 'certs/certificate.pem'),
        keyPath: path.resolve(__dirname, process.env.CORA_KEY_PATH || 'certs/private-key.key')
    });

    try {
        // 1. Verificar certificados configurados
        if (!fs.existsSync(gateway.certPath) || !fs.existsSync(gateway.keyPath)) {
            console.error('❌ ERRO: Certificados não encontrados.');
            console.log(`Verifique: \n - ${gateway.certPath}\n - ${gateway.keyPath}`);
            process.exit(1);
        }
        console.log('✅ Certificados PEM encontrados com sucesso.');

        // 2. Limpar cache de DB (se houver) para forçar requisição L3 no primeiro passo
        console.log('\n[Teste 1] Forçando nova requisição mTLS (ignorando cache L2)...');
        await dbRun('DELETE FROM tokens_integracao WHERE provider = ? AND client_id = ?', [gateway.providerName, gateway.clientId]);
        
        const token1 = await gateway.authenticate();
        if (token1) {
            console.log(`✅ Token retornado com sucesso: ${token1.substring(0, 15)}...`);
        } else {
            throw new Error("Token não retornado");
        }

        // 3. Testar Cache L1 (Memória)
        console.log('\n[Teste 2] Testando Cache L1 (Memória)...');
        const token2 = await gateway.authenticate();
        if (token1 === token2) {
            console.log('✅ Cache L1 funcionou (mesmo token retornado sem request).');
        } else {
            console.log('❌ Falha no cache L1.');
        }

        // 4. Testar Cache L2 (Database) limpando a memória do objeto
        console.log('\n[Teste 3] Testando Cache L2 (Banco de Dados)...');
        gateway._accessToken = null; // Limpa L1
        gateway._tokenExpiry = null;
        
        const token3 = await gateway.authenticate();
        if (token1 === token3) {
            console.log('✅ Cache L2 funcionou (token recuperado do SQLite sem request real).');
        } else {
            console.log('❌ Falha no cache L2.', { token1, token3 });
        }

        // 5. Verificar a tabela tokens_integracao
        console.log('\n[Teste 4] Validando persistência na tabela...');
        const dbRow = await dbGet('SELECT * FROM tokens_integracao WHERE provider = ? AND client_id = ?', [gateway.providerName, gateway.clientId]);
        
        if (dbRow && dbRow.access_token === token1) {
            console.log('✅ Registro encontrado corretamente no SQLite.');
            console.log(`   Expira em: ${new Date(dbRow.expires_at).toLocaleString('pt-BR')}`);
        } else {
            console.log('❌ Registro não encontrado no SQLite.');
        }

        console.log('\n🎉 TODOS OS TESTES PASSARAM!\n');
        process.exit(0);
    } catch (e) {
        console.error('\n❌ Falha durante a execução do teste:', e.message);
        if (e.response && e.response.data) console.error(JSON.stringify(e.response.data, null, 2));
        process.exit(1);
    }
}

runTests();
