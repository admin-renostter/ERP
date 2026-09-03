const fs = require('fs');
const content = fs.readFileSync('cora-api/database.js', 'utf8');

// Encontra o início da função initDb() — onde começa o código original
const idx = content.indexOf('    function initDb()');
if (idx === -1) {
    console.error('Não encontrei initDb()');
    process.exit(1);
}
console.log('initDb() na posição:', idx);

// Truncar TUDO a partir do initDb
const head = content.substring(0, idx).trimEnd();
console.log('Mantém até posição:', idx, 'de', content.length);

// Adiciona o fecha-bloco do if (sqlite)
const final = head + '\n}\n';

fs.writeFileSync('cora-api/database.js', final, 'utf8');
console.log('Arquivo limpo, total:', final.length, 'bytes');
