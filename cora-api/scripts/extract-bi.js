// Extrai e valida o JS do bi.html
const fs = require('fs');
const html = fs.readFileSync('../admin/bi.html', 'utf8');

// Extrai o bloco <script> principal (não o do Chart.js CDN)
const match = html.match(/<script>([\s\S]*?)<\/script>/);
if (!match) {
    console.log('Nenhum <script> encontrado');
    process.exit(1);
}

const js = match[1];

// Tenta parsear como JS usando Node
try {
    new Function(js);
    console.log('✓ JS válido (parsed OK)');
    console.log('Tamanho:', js.length, 'chars');
} catch (e) {
    console.log('✗ JS inválido:', e.message);
    process.exit(1);
}
