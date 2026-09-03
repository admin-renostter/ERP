const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('cora.sqlite');
db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name", (e, r) => {
    console.log('Tables:', JSON.stringify(r.map(t => t.name)));
    db.close();
});
