require('dotenv').config();
const http = require('http');

function req(method, path, body) {
    return new Promise((resolve) => {
        const payload = body ? JSON.stringify(body) : '';
        const opts = {
            hostname: '127.0.0.1', port: 3000, path, method,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
                'x-user-id': 'test', 'x-user-name': 'Test'
            }
        };
        const r = http.request(opts, res => {
            let d = ''; res.on('data', c => d += c);
            res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(d) }); } catch { resolve({ status: res.statusCode, body: d }); } });
        });
        r.on('error', e => resolve({ status: 0, body: e.message }));
        if (payload) r.write(payload);
        r.end();
    });
}

async function main() {
    // Pega configs
    const cfgs = await req('GET', '/api/chamados/configs');
    console.log('Configs:', JSON.stringify(cfgs.body.data));

    // Cria chamado
    const criar = await req('POST', '/api/chamados', {
        clienteId: 'cli-teste-001', tecnicoId: 'tec-001',
        titulo: 'Debug', descricao: '', categoria: 'Manutenção Corretiva', prioridade: 'Média'
    });
    const id = criar.body.data.id;
    console.log('Criado:', id);

    // Resolve + close
    await req('POST', `/api/chamados/${id}/resolve`, { observacoes: 'ok' });
    await req('POST', `/api/chamados/${id}/close`, {});

    // 1ª reabertura
    const r1 = await req('POST', `/api/chamados/${id}/reopen`, { motivo: 'Reincidência', descricaoProblema: '1' });
    console.log('Reabertura 1:', r1.status, r1.body.success, r1.body.data?.id);
    const id2 = r1.body.data.id;

    // Ver config no meio
    const mid = await req('GET', '/api/chamados/configs');
    console.log('Configs (meio):', JSON.stringify(mid.body.data));

    // 2ª reabertura
    const r2 = await req('POST', `/api/chamados/${id2}/reopen`, { motivo: 'Reincidência', descricaoProblema: '2' });
    console.log('Reabertura 2:', r2.status, r2.body.success ? 'OK' : r2.body.error);

    // can-reopen do original
    const can = await req('GET', `/api/chamados/${id}/can-reopen`);
    console.log('can-reopen original:', JSON.stringify(can.body.data));

    // can-reopen do id2
    const can2 = await req('GET', `/api/chamados/${id2}/can-reopen`);
    console.log('can-reopen id2:', JSON.stringify(can2.body.data));

    process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
