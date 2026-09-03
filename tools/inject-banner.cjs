/**
 * Inject approval-banner.js em todos os admin/*.html que ainda não têm.
 * Idempotente — pula arquivos que já contém o banner.
 *
 * Uso: node tools/inject-banner.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ADMIN_DIR = path.join(ROOT, 'admin');

const SCRIPT_TAG = '<script src="../js/approval-banner.js"></script>';

const SKIP_FILES = new Set([
    'aprovacoes.html'  // já tem sua própria visualização de pendência
]);

function processFile(file) {
    const filename = path.basename(file);
    if (SKIP_FILES.has(filename)) return { skipped: true, reason: 'skip-list' };
    let html = fs.readFileSync(file, 'utf8');

    // Já tem o banner?
    if (html.includes('approval-banner.js')) {
        return { skipped: true, reason: 'already-exists' };
    }

    // Inserir o <script> antes do <script src="../js/utils.js"> ou do </body>
    const insertionPoints = [
        '<script src="../js/utils.js"></script>',
        '</body>'
    ];
    let inserted = false;
    for (const marker of insertionPoints) {
        if (html.includes(marker)) {
            html = html.replace(marker, SCRIPT_TAG + '\n    ' + marker);
            inserted = true;
            break;
        }
    }
    if (!inserted) {
        return { skipped: true, reason: 'no-insertion-point' };
    }

    fs.writeFileSync(file, html);
    return { skipped: false, filename };
}

const files = fs.readdirSync(ADMIN_DIR)
    .filter(f => f.endsWith('.html'))
    .map(f => path.join(ADMIN_DIR, f));

console.log('Injetando approval-banner.js em admin/*.html (idempotente)...\n');

let added = 0, skipped = 0;
for (const file of files) {
    const result = processFile(file);
    const filename = path.basename(file);
    if (result.skipped) {
        console.log(`  skip  ${filename.padEnd(30)}  (${result.reason})`);
        skipped++;
    } else {
        console.log(`  add   ${filename.padEnd(30)}`);
        added++;
    }
}

console.log(`\nTotal: ${added} modificados, ${skipped} pulados.`);
