const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('cora.sqlite');

db.serialize(() => {
    db.get('SELECT id, nome_exibicao, ambiente, cert_path, key_path, webhook_url, is_primary, ativo FROM bancos_cadastrados WHERE id = 1', (err, row) => {
        if (err) { console.log('Erro leitura antes:', err.message); return; }
        console.log('ANTES:', JSON.stringify(row, null, 2));
    });

    db.run(
        `UPDATE bancos_cadastrados
         SET cert_path = ?,
             key_path = ?,
             webhook_url = ?,
             ambiente = ?,
             base_url = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = 1`,
        [
            'cora-api/certificate.pem',
            'cora-api/private-key.key',
            'http://localhost:3000/api/webhooks/cora',
            'stage'
        ],
        function (err) {
            if (err) { console.log('ERRO UPDATE:', err.message); return; }
            console.log('\nLinhas atualizadas:', this.changes);
            console.log('\nDEPOIS:');
            db.get('SELECT id, nome_exibicao, ambiente, cert_path, key_path, webhook_url, is_primary, ativo FROM bancos_cadastrados WHERE id = 1', (e, r) => {
                console.log(JSON.stringify(r, null, 2));

                // Listar tabelas relacionadas pra diagnóstico
                db.get('SELECT COUNT(*) as c FROM tokens_integracao', (e2, r2) => {
                    console.log('\nTokens cacheados:', r2.c);
                    db.close();
                });
            });
        }
    );
});
