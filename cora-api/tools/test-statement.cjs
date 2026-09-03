require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');
const axios = require('axios');
const sqlite3 = require('sqlite3');

const certPath = path.resolve(__dirname, '..', process.env.CORA_CERT_PATH || 'certificate.pem');
const keyPath  = path.resolve(__dirname, '..', process.env.CORA_KEY_PATH || 'private-key.key');
const baseUrl  = 'https://matls-clients.api.cora.com.br';

const agent = new https.Agent({ cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath), rejectUnauthorized: true });
const db = new sqlite3.Database(path.resolve(__dirname, '..', 'cora.sqlite'));

db.get('SELECT access_token FROM tokens_integracao WHERE provider=? ORDER BY created_at DESC LIMIT 1', ['cora'], async (e, r) => {
    if (e || !r) { console.log('Token não encontrado'); db.close(); return; }
    console.log('Token OK, chamando /v2/banking/statement...');
    try {
        const resp = await axios.get(baseUrl + '/v2/banking/statement', {
            httpsAgent: agent,
            headers: { Authorization: 'Bearer ' + r.access_token },
            timeout: 10000
        });
        console.log('✅ Statement OK!');
        console.log(JSON.stringify(resp.data, null, 2));
    } catch (e2) {
        const s = e2.response?.status;
        const d = e2.response?.data;
        console.log(`❌ Statement erro: ${s}`);
        console.log('   Data:', JSON.stringify(d)?.substring(0, 300));
    }
    db.close();
});
