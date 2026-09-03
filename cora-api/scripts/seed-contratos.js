// Seed: garante cli-techcorp + usr-demo (idempotente)
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

const dbPath = path.resolve(__dirname, '..', 'cora.sqlite');
const db = new sqlite3.Database(dbPath);

function addColIfMissing(t, col, def, cb) {
  db.all(`PRAGMA table_info(${t})`, (err, rows) => {
    if (err) return cb(err);
    if (!rows.some(r => r.name === col)) {
      db.run(`ALTER TABLE ${t} ADD COLUMN ${col} ${def}`, (err) => {
        if (err) return cb(err);
        console.log(`+ ${t}.${col} adicionada`);
        cb();
      });
    } else {
      cb();
    }
  });
}

(async () => {
  try {
    // Garante coluna `name` em usuarios
    await new Promise((res, rej) => addColIfMissing('usuarios', 'name', 'TEXT', (e) => e ? rej(e) : res()));

    // Verifica se cliente existe
    const cliente = await new Promise((res, rej) => {
      db.get('SELECT id FROM clientes WHERE id = ?', ['cli-techcorp'], (e, r) => e ? rej(e) : res(r));
    });

    if (!cliente) {
      await new Promise((res, rej) => {
        db.run(`INSERT INTO clientes (id, nome, cnpj, email, telefone, ativo, created_at)
                VALUES (?, ?, ?, ?, ?, 1, datetime('now'))`,
          ['cli-techcorp', 'TechCorp Solutions', '12.345.678/0001-99', 'contato@techcorp.com', '11999887766'],
          (e) => e ? rej(e) : res());
      });
      console.log('+ cli-techcorp criado');
    } else {
      console.log('= cli-techcorp já existe');
    }

    // Verifica se usuario existe
    const usuario = await new Promise((res, rej) => {
      db.get('SELECT id FROM usuarios WHERE id = ?', ['usr-demo'], (e, r) => e ? rej(e) : res(r));
    });

    if (!usuario) {
      const hash = bcrypt.hashSync('senha123', 10);
      await new Promise((res, rej) => {
        db.run(`INSERT INTO usuarios (id, nome, name, email, username, password, role, ativo, created_at)
                VALUES (?, ?, ?, ?, ?, ?, 'admin', 1, datetime('now'))`,
          ['usr-demo', 'Demo User', 'Demo User', 'demo@renostter.com', 'demo', hash],
          (e) => e ? rej(e) : res());
      });
      console.log('+ usr-demo criado');
    } else {
      console.log('= usr-demo já existe');
      // Atualiza name se necessário
      await new Promise((res, rej) => {
        db.run('UPDATE usuarios SET name = nome WHERE id = ? AND (name IS NULL OR name = "")', ['usr-demo'], (e) => e ? rej(e) : res());
      });
    }

    console.log('\nSeed OK!');
  } catch (e) {
    console.error('ERRO:', e.message);
  } finally {
    db.close();
  }
})();
