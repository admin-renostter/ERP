// Sobe o server em PORT=3099 em subprocesso
const { spawn } = require('child_process');
const path = require('path');
const child = spawn('node', ['server.js'], {
    cwd: path.resolve(__dirname, '..', '..', 'cora-api'),
    env: { ...process.env, PORT: '3099' },
    stdio: 'inherit'
});
child.on('exit', (code) => process.exit(code));
