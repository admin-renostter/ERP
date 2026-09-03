const { injectTenantFilter } = require('../infra/tenantAwareDb');
const cases = [
    'SELECT * FROM clientes',
    'SELECT * FROM clientes ORDER BY nome',
    'SELECT * FROM clientes LIMIT 10',
    'SELECT * FROM clientes;',
    'SELECT * FROM clientes WHERE status = 1',
    'SELECT * FROM clientes WHERE status = 1 ORDER BY nome',
    'SELECT c.*, COUNT(co.id) FROM clientes c LEFT JOIN cobrancas co ON co.client_id = c.id GROUP BY c.id',
    'SELECT c.* FROM clientes c INNER JOIN contratos ct ON ct.cliente_id = c.id WHERE c.ativo = 1',
    'SELECT c.* FROM clientes c LEFT JOIN cobrancas co ON co.client_id = c.id AND co.created_at > date("now") WHERE c.ativo = 1',
    'SELECT * FROM chamados WHERE id = ?',
    'SELECT ct.*, c.nome FROM contratos ct LEFT JOIN clientes c ON ct.cliente_id = c.id WHERE ct.status = "Ativo"',
    'SELECT * FROM clientes WHERE status = 1 OR status = 2',
];
for (const sql of cases) {
    const r = injectTenantFilter(sql, 'tnt_xyz');
    console.log('IN: ' + sql);
    console.log('OUT:', r.sql);
    console.log();
}
