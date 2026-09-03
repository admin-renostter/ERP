/**
 * Inclui <script src="../js/approval-flow.js"></script> antes de proposals.js.
 * Idempotente. Foca em admin/*.html (cliente não emite boleto).
 *
 * Uso: node tools/inject-approval-flow.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ADMIN_DIR = path.join(ROOT, 'admin');

const FLOW_TAG = '<script src="../js/approval-flow.js"></script>';
const PROPOSALS_TAG = '<script src="../js/proposals.js"></script>';

function processFile(file) {
    let html = fs.readFileSync(file, 'utf8');

    if (!html.includes('js/proposals.js')) {
        return { skipped: true, reason: 'no-proposals' };
    }
    if (html.includes('js/approval-flow.js')) {
        return { skipped: true, reason: 'already-injected' };
    }

    // Insere antes do proposals.js
    const replaced = html.replace(
        /(\s*)<script src="\.\.\/js\/proposals\.js"><\/script>/,
        `\n    ${FLOW_TAG}$1<script src="../js/proposals.js"></script>`
    );

    if (replaced === html) {
        return { skipped: true, reason: 'replace-failed' };
    }

    fs.writeFileSync(file, replaced);
    return { skipped: false };
}

const files = fs.readdirSync(ADMIN_DIR)
    .filter(f => f.endsWith('.html'))
    .map(f => path.join(ADMIN_DIR, f));

// Também tenta em raiz para tickets.html e dashboard.html de cliente
const rootFiles = ['tickets.html', 'dashboard.html']
    .filter(f => fs.existsSync(path.join(ROOT, f)))
    .map(f => path.join(ROOT, f));

const allFiles = [...files, ...rootFiles];

console.log('Injetando approval-flow.js antes de proposals.js...\n');

let added = 0, skipped = 0;
for (const file of allFiles) {
    const result = processFile(file);
    const filename = path.relative(ROOT, file);
    if (result.skipped) {
        console.log(`  skip  ${filename.padEnd(35)} (${result.reason})`);
        skipped++;
    } else {
        console.log(`  add   ${filename.padEnd(35)}`);
        added++;
    }
}

console.log(`\nTotal: ${added} modificados, ${skipped} pulados.`);