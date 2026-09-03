// Limpa contratos de teste (apenas CT-2026-*)
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database(path.resolve(__dirname, '..', 'cora.sqlite'));
db.run('DELETE FROM contratos WHERE id LIKE ?', ['CT-2026-%'], (e) => {
  console.log('Limpeza contratos:', e ? e.message : 'OK');
  db.close();
});
