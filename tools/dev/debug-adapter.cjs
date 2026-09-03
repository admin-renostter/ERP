const path = require('path');
const pg = require(path.resolve('cora-api/db/postgres.js'));
const in_sql = `AND created_at < datetime('now', '-24 hours')`;
const out = pg.adaptSqliteToPostgres(in_sql);
console.log('in:  ', in_sql);
console.log('out: ', out);