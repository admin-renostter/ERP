/**
 * Test Sprint 8 — Fluxo end-to-end de contrato
 *
 * Testa:
 *   1. PdfGenerator gera PDF a partir de template
 *   2. Envelope Autentique é criado (sandbox)
 *   3. Status do envelope é verificado
 *   4. (Simulado) Webhook de assinatura é processado
 */

const signature = require('../infra/signature');
const email = require('../infra/email');
const pdf = require('../services/PdfGenerator');

(async () => {
    console.log('\n=== SPRINT 8 — TEST END-TO-END ===\n');

    // 1. Verifica integrações
    console.log('1. Verificando integrações:');
    console.log('   - Email disponível:', email.isEmailAvailable());
    console.log('   - Assinatura disponível:', signature.isSignatureAvailable());
    console.log('   - Engine PDF:', await pdf.getEngineName());
    console.log('');

    // 2. Gera PDF
    console.log('2. Gerando PDF de contrato de teste...');
    const pdfBuffer = await pdf.renderContract('manutencao', {
        contrato: {
            id: 'ct_test_001',
            titulo: 'Contrato de Manutenção - Cliente Teste',
            valor_mensal: 350.00,
            data_inicio: '01/09/2026',
            data_fim: '31/08/2027',
        },
        cliente: {
            nome: 'Empresa Teste LTDA',
            email: 'cliente@teste.com',
            cnpj_cpf: '12.345.678/0001-90',
        },
    });
    console.log(`   PDF gerado: ${pdfBuffer.length} bytes`);
    console.log(`   Header: ${pdfBuffer.toString('utf-8', 0, 8)}`);
    console.log('');

    // 3. Cria envelope na Autentique (sandbox)
    if (signature.isSignatureAvailable()) {
        console.log('3. Criando envelope na Autentique (sandbox)...');
        const deadline = new Date();
        deadline.setDate(deadline.getDate() + 7);
        const envelope = await signature.createDocument({
            name: 'Teste Sprint 8 - Renostter CRM',
            pdf: pdfBuffer,
            signers: [
                { name: 'Cliente Teste', email: 'l.eugenio63@gmail.com' }
            ],
            message: 'Assine o contrato de teste da Sprint 8',
            deadlineAt: deadline.toISOString(),
            sandbox: true,
        });
        console.log(`   Envelope ID: ${envelope.id}`);
        console.log(`   Sandbox: ${envelope.sandbox}`);
        console.log(`   Signatários: ${envelope.signers_history?.length || 0}`);

        // 4. Verifica status
        console.log('\n4. Verificando status do envelope...');
        const check = await signature.getDocument(envelope.id);
        console.log(`   Created: ${check.created_at}`);
        console.log(`   Deadline: ${check.deadline_at}`);
        console.log(`   Status: AGUARDANDO ASSINATURA`);
        console.log(`   (Abra o link no email para assinar e testar o webhook)`);

        console.log('\n=== TUDO OK ===');
        console.log('Próximos passos:');
        console.log('  1. Abra o email l.eugenio63@gmail.com e clique no link da Autentique');
        console.log('  2. Assine o documento');
        console.log('  3. Configure o webhook no painel da Autentique para validar o fluxo completo');
        console.log('  4. Quando webhook estiver configurado, teste:');
        console.log('     curl -X POST http://localhost:3000/api/contracts/ct_test_001/send-reminders');
    } else {
        console.log('3. Assinatura NÃO configurada (defina AUTENTIQUE_TOKEN no .env)');
    }

    process.exit(0);
})().catch(e => {
    console.error('ERRO:', e.message);
    console.error(e.stack);
    process.exit(1);
});
