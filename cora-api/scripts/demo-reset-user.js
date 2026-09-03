const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('cora.sqlite');
db.run("UPDATE usuarios SET failed_login_count = 0, locked_until = NULL WHERE id = 'usr-demo'", () => {
  console.log('User reset');
  db.close();
});
