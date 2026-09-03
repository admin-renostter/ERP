// Security scan: find dangerous patterns
const fs = require('fs');
const path = require('path');

function scan(dir) {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const f of files) {
        const fp = path.join(dir, f.name);
        if (f.isDirectory()) {
            if (f.name === 'node_modules' || f.name === '.git') continue;
            scan(fp);
        } else if (f.name.endsWith('.js')) {
            const c = fs.readFileSync(fp, 'utf8');
            if (c.includes('password ==') || c.includes('password==')) console.log('CRITICAL: ' + fp + ' usa == para password');
            if (c.match(/eval\s*\(/)) console.log('CRITICAL: ' + fp + ' usa eval()');
            // innerHTML com variavel
            const innerMatch = c.match(/innerHTML\s*=\s*[^'"`\s]/g);
            if (innerMatch) {
                console.log('WARN: ' + fp + ' tem innerHTML com variavel (' + innerMatch.length + 'x)');
            }
        }
    }
}
scan(process.cwd());
console.log('Scan OK');
