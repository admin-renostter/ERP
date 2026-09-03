const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('cora.sqlite');
db.all("SELECT event_type, severity, user_email, details_json FROM security_events WHERE user_email='demo@renostter.com' ORDER BY id DESC LIMIT 7", (err, rows) => {
  if (err) { console.error(err.message); return; }
  console.log('  Eventos registrados na tabela security_events:');
  rows.reverse().forEach(r => {
    const det = r.details_json ? JSON.parse(r.details_json) : {};
    const reason = det.reason || det.method || '';
    console.log('    [' + r.severity.padEnd(7) + '] ' + r.event_type.padEnd(22) + ' ' + reason);
  });
  db.close();
});
