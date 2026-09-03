// Verificação rápida do estado pós-migração Sprint 13.5
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(path.resolve(__dirname, '..', 'cora.sqlite'));

const queries = [
    ['Tenants', 'SELECT id, slug, nome, plano, status FROM tenants'],
    ['TenantUsers', 'SELECT tenant_id, usuario_id, role, ativo FROM tenant_users LIMIT 5'],
    ['Cliente sample', 'SELECT id, nome, tenant_id FROM clientes LIMIT 3'],
    ['Contrato sample', 'SELECT id, cliente_id, tenant_id FROM contratos LIMIT 3'],
    ['Cobranca sample', 'SELECT id, contract_id, valor, tenant_id FROM cobrancas LIMIT 3'],
    ['Chamado sample', 'SELECT id, titulo, tenant_id FROM chamados LIMIT 3'],
    ['Null tenant check - clientes', "SELECT COUNT(*) AS n FROM clientes WHERE tenant_id IS NULL"],
    ['Null tenant check - contratos', "SELECT COUNT(*) AS n FROM contratos WHERE tenant_id IS NULL"],
    ['Null tenant check - cobrancas', "SELECT COUNT(*) AS n FROM cobrancas WHERE tenant_id IS NULL"],
    ['Indices tenant', "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%_tenant' ORDER BY name"],
];

let i = 0;
const next = () => {
    if (i >= queries.length) {
        db.close();
        return;
    }
    const [label, q] = queries[i++];
    db.all(q, [], (err, rows) => {
        console.log('\n=== ' + label + ' ===');
        if (err) console.log('ERR:', err.message);
        else console.log(JSON.stringify(rows, null, 2));
        next();
    });
};
next();
