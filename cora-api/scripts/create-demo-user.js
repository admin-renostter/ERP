const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const db = new sqlite3.Database('cora.sqlite');
const hash = bcrypt.hashSync('senha123', 10);
db.serialize(() => {
  db.run(`DELETE FROM usuarios WHERE id = 'usr-demo'`);
  db.run(`INSERT INTO usuarios (id, nome, email, username, password, role, ativo, created_at)
          VALUES ('usr-demo', 'Demo User', 'demo@renostter.com', 'demo', ?, 'admin', 1, datetime('now'))`,
          [hash], (err) => {
    if (err) console.error('Insert err:', err.message);
    else console.log('OK: usr-demo criado (senha=senha123, role=admin)');
    db.close();
  });
});
