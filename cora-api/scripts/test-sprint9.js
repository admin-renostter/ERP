/**
 * Test Sprint 9 — WhatsApp + Lembretes
 */
const wa = require('../WhatsAppService');
const ReminderService = require('../services/ReminderService');

(async () => {
    console.log('\n=== SPRINT 9 — TEST ===\n');

    // 1. WhatsApp
    console.log('1. WhatsApp:');
    console.log('   Provider:', wa.WHATSAPP_PROVIDER);
    console.log('   Disponível:', wa.isWhatsAppAvailable());
    console.log('   formatPhone("(11) 95891-8398"):', wa.formatPhone('(11) 95891-8398'));
    console.log('   formatPhone("+5511987654321"):', wa.formatPhone('+5511987654321'));
    console.log('');

    // 2. Envia mensagem de teste (vai pra mock se não tiver config)
    console.log('2. Enviando mensagem de teste (mock se não configurado)...');
    const r1 = await wa.sendMessage({
        to: '(11) 95891-8398',
        text: 'Olá! Esta é uma mensagem de teste do Renostter CRM via WhatsApp.',
    });
    console.log('   Resultado:', JSON.stringify(r1));
    console.log('');

    // 3. Template de boleto
    console.log('3. Enviando template de boleto...');
    const r2 = await wa.sendBoletoReminder({
        to: '11987654321',
        clientName: 'João da Silva',
        valor: 350.00,
        vencimento: '2026-09-15',
        pdfUrl: 'https://renostter.com/boleto/123.pdf',
        linhaDigitavel: '23793.38128 60082.803526 95000.063005 8 84720000035000',
    });
    console.log('   Resultado:', JSON.stringify(r2));
    console.log('');

    // 4. Reminder Service
    console.log('4. ReminderService (vai falhar sem DB, mas não deve crashar):');
    try {
        const { dbAll } = require('../database');
        // Não vai funcionar sem DB, mas podemos checar se tem conectividade
        const candidates = await dbAll('SELECT 1').catch(() => []);
        console.log('   DB reachable:', candidates.length > 0);
    } catch (e) {
        console.log('   DB não disponível (esperado em dev):', e.message.substring(0, 50));
    }

    console.log('\n=== OK ===');
    process.exit(0);
})().catch(e => {
    console.error('ERRO:', e.message);
    process.exit(1);
});
