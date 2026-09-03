// Migration: adicionar colunas faltantes + ajustar código SQL
// 1) clientes.ativo (soft delete)
// 2) audit_acessos.recurso (compat errorHandler)
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, '..', 'cora.sqlite');
const db = new sqlite3.Database(dbPath);

function run(sql) {
  return new Promise((resolve, reject) => {
    db.run(sql, (err) => err ? reject(err) : resolve());
  });
}

function hasColumn(table, col) {
  return new Promise((resolve, reject) => {
    db.all(`PRAGMA table_info(${table})`, (err, rows) => {
      if (err) return reject(err);
      resolve(rows.some(r => r.name === col));
    });
  });
}

(async () => {
  try {
    if (!(await hasColumn('clientes', 'ativo'))) {
      await run('ALTER TABLE clientes ADD COLUMN ativo INTEGER DEFAULT 1');
      console.log('+ clientes.ativo adicionada');
    } else console.log('= clientes.ativo já existe');

    if (!(await hasColumn('audit_acessos', 'recurso'))) {
      await run('ALTER TABLE audit_acessos ADD COLUMN recurso TEXT');
      console.log('+ audit_acessos.recurso adicionada');
    } else console.log('= audit_acessos.recurso já existe');

    // Garantir colunas de contrato
    if (!(await hasColumn('contratos', 'servicos_json'))) {
      await run('ALTER TABLE contratos ADD COLUMN servicos_json TEXT');
      console.log('+ contratos.servicos_json adicionada');
    }

    // Audit access: colunas usadas pelo errorHandler
    if (!(await hasColumn('audit_acessos', 'status_code'))) {
      await run('ALTER TABLE audit_acessos ADD COLUMN status_code INTEGER');
      console.log('+ audit_acessos.status_code adicionada');
    }
    if (!(await hasColumn('audit_acessos', 'correlation_id'))) {
      await run('ALTER TABLE audit_acessos ADD COLUMN correlation_id TEXT');
      console.log('+ audit_acessos.correlation_id adicionada');
    }
    if (!(await hasColumn('audit_acessos', 'detalhes_json'))) {
      await run('ALTER TABLE audit_acessos ADD COLUMN detalhes_json TEXT');
      console.log('+ audit_acessos.detalhes_json adicionada');
    }

    console.log('\nMigration concluída.');
  } catch (e) {
    console.error('ERRO:', e.message);
  } finally {
    db.close();
  }
})();
