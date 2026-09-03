const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('cora.sqlite');

db.all("SELECT sql FROM sqlite_master WHERE name='cora_recorrencia'", (e, r) => {
    console.log('CREATE statement:', JSON.stringify(r, null, 2));
    db.all("PRAGMA table_info(cora_recorrencia)", (e2, r2) => {
        console.log('Columns:', JSON.stringify(r2, null, 2));
        db.all("SELECT * FROM cora_recorrencia LIMIT 3", (e3, r3) => {
            console.log('Sample rows:', JSON.stringify(r3, null, 2));
            db.close();
        });
    });
});
