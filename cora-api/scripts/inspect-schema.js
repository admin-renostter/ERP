// Inspect schema do banco para entender colunas faltantes
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, '..', 'cora.sqlite');
const db = new sqlite3.Database(dbPath);

const TABLES_TO_INSPECT = ['clientes', 'contratos', 'logs_auditoria', 'audit_acessos'];

function tableInfo(name) {
  return new Promise((resolve, reject) => {
    db.all(`PRAGMA table_info(${name})`, (err, cols) => {
      if (err) return reject(err);
      resolve(cols);
    });
  });
}

(async () => {
  try {
    // Lista todas as tabelas
    const tables = await new Promise((res, rej) => {
      db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name", (e, r) => e ? rej(e) : res(r));
    });
    console.log('=== TODAS AS TABELAS ===');
    tables.forEach(t => console.log('  ' + t.name));

    for (const t of TABLES_TO_INSPECT) {
      const cols = await tableInfo(t);
      console.log(`\n=== COLUNAS ${t} (${cols.length}) ===`);
      cols.forEach(c => console.log(`  ${c.name} (${c.type}${c.pk ? ', PK' : ''}${c.notnull ? ', NOT NULL' : ''})`));
    }

    // Sample data
    console.log('\n=== SAMPLE clientes (3 rows) ===');
    db.all("SELECT id, nome, email, telefone FROM clientes LIMIT 3", (e, r) => {
      if (e) console.error('err:', e.message);
      else r.forEach(x => console.log(JSON.stringify(x)));
    });

    console.log('\n=== SAMPLE contratos (3 rows) ===');
    db.all("SELECT id, cliente_id, status, valor_mensal FROM contratos LIMIT 3", (e, r) => {
      if (e) console.error('err:', e.message);
      else r.forEach(x => console.log(JSON.stringify(x)));
    });

    setTimeout(() => db.close(), 500);
  } catch (e) {
    console.error('ERRO:', e.message);
    db.close();
  }
})();
