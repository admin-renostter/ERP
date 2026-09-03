/**
 * Teste E2E via endpoint HTTP do backend (server.js)
 * Valida: server → gateway → Cora API → resposta
 */
require('dotenv').config();
const http = require('http');

const payload = JSON.stringify({
    contractId: `TEST-E2E-${Date.now()}`,
    clientId: 'cli-teste-001',
    value: 199.90,
    dueDate: '2026-08-20',
    services: ['Manutenção Preventiva Mensal'],
    customerPayload: {
        name: 'Cliente E2E Teste',
        email: 'teste@antgravity.com.br',
        document: { identity: '12345678909', type: 'CPF' },
        address: {
            street: 'Rua Teste',
            number: '100',
            district: 'Centro',
            city: 'São Paulo',
            state: 'SP',
            zip_code: '01001000'
        }
    }
});

const req = http.request({
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/cobrancas/emitir',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'x-user-id': 'test-user',
        'x-user-name': 'Test E2E',
        'x-user-role': 'admin'
    }
}, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
        console.log(`Status: ${res.statusCode}`);
        console.log('Response:', body);
        try {
            const json = JSON.parse(body);
            if (json.success) {
                console.log('\n🎉 ENDPOINT E2E FUNCIONANDO!');
                console.log('   chargeId  :', json.chargeId);
                console.log('   status    :', json.status);
                console.log('   barcode   :', json.barcode || json.cora_barcode || '(n/a)');
                console.log('   pdfUrl    :', json.pdfUrl || '(n/a)');
                process.exit(0);
            } else {
                console.error('\n❌ Endpoint retornou erro:', json.error);
                process.exit(1);
            }
        } catch (e) {
            console.error('❌ Falha ao parsear JSON:', body);
            process.exit(1);
        }
    });
});

req.on('error', (e) => {
    console.error('❌ Erro de conexão:', e.message);
    process.exit(1);
});

req.write(payload);
req.end();
