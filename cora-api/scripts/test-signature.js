/**
 * Test signature — cria documento de teste no Autentique (sandbox)
 */
const s = require('../infra/signature');
const fs = require('fs');

// Cria um PDF mínimo (sem pdfkit) — só para teste
function makeMinimalPdfBuffer() {
    // PDF mínimo válido: 1 página, 1 linha "Hello"
    const pdf = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj
4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
5 0 obj << /Length 60 >> stream
BT /F1 24 Tf 100 700 Td (Test PDF - Renostter CRM) Tj ET
endstream endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000056 00000 n
0000000111 00000 n
0000000202 00000 n
0000000257 00000 n
trailer << /Size 6 /Root 1 0 R >>
startxref
370
%%EOF`;
    return Buffer.from(pdf, 'utf-8');
}

(async () => {
    console.log('1. Gerando PDF de teste...');
    const pdfBuffer = makeMinimalPdfBuffer();
    fs.writeFileSync('/tmp/test-contrato.pdf', pdfBuffer);  // opcional
    console.log('   PDF gerado:', pdfBuffer.length, 'bytes');

    console.log('\n2. Criando documento no Autentique (sandbox)...');
    const doc = await s.createDocument({
        name: 'Teste Sandbox - Contrato Renostter',
        pdf: pdfBuffer,
        signers: [
            { name: 'Eugenio Francisco', email: 'l.eugenio63@gmail.com' }
        ],
        message: 'Olá! Por favor, assine o contrato de teste do Renostter CRM.',
        sandbox: true,
    });
    console.log('   Doc criado:', JSON.stringify(doc, null, 2));

    console.log('\n3. Verificando com getDocument...');
    const check = await s.getDocument(doc.id);
    console.log('   Status:', check.signed ? 'ASSINADO' : 'AGUARDANDO');
    console.log('   Signatários:', check.signers.length);
    check.signers.forEach(s => {
        console.log(`     - ${s.name} (${s.email}): ${s.signed ? 'assinado' : 'pendente'}`);
        if (s.link?.short_link) console.log(`       Link: ${s.link.short_link}`);
    });

    process.exit(0);
})().catch(e => {
    console.error('ERRO:', e.message);
    process.exit(1);
});
