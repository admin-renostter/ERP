/**
 * db/ensureSchema.js — ajustes de schema que o servidor aplica sozinho ao subir.
 *
 * Por que existe: no modo Postgres o database.js nao cria nem altera tabelas
 * (so o modo SQLite fazia isso). Estes ajustes sao pequenos, idempotentes
 * (IF NOT EXISTS) e necessarios para as telas de Clientes e Chamados usarem o
 * banco. Rodar de novo nao muda nada; nenhum dado e apagado.
 */
const STATEMENTS = [
    // Clientes: colunas que o codigo ja usa (busca, cotacoes, equipamentos) e
    // que a tabela de producao nao tinha, mais os dados extras da tela.
    `ALTER TABLE clientes ADD COLUMN IF NOT EXISTS fantasia TEXT`,
    `ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cnpj_cpf TEXT`,
    `ALTER TABLE clientes ADD COLUMN IF NOT EXISTS celular TEXT`,
    `ALTER TABLE clientes ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ativo'`,
    `ALTER TABLE clientes ADD COLUMN IF NOT EXISTS dados_json TEXT`,
    `ALTER TABLE clientes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`,
    // Endereco: o portal do cliente (middleware/portalAuth.js) ja le estas colunas.
    `ALTER TABLE clientes ADD COLUMN IF NOT EXISTS endereco TEXT`,
    `ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cidade TEXT`,
    `ALTER TABLE clientes ADD COLUMN IF NOT EXISTS estado TEXT`,
    `ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cep TEXT`,
    // Chamados: dados extras da tela (SLA, checklists, apontamentos...) e a
    // coluna "deleted" que o app mobile do tecnico ja consulta.
    `ALTER TABLE chamados ADD COLUMN IF NOT EXISTS dados_json TEXT`,
    `ALTER TABLE chamados ADD COLUMN IF NOT EXISTS numero TEXT`,
    `ALTER TABLE chamados ADD COLUMN IF NOT EXISTS deleted INTEGER DEFAULT 0`,
    // Comentarios dos chamados (antes ficavam so no navegador).
    `CREATE TABLE IF NOT EXISTS chamado_comentarios (
        id TEXT PRIMARY KEY,
        chamado_id TEXT NOT NULL,
        autor_id TEXT,
        autor_nome TEXT,
        autor_papel TEXT,
        texto TEXT,
        interno INTEGER DEFAULT 0,
        dados_json TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        tenant_id TEXT DEFAULT 'tnt_default'
    )`,
    `CREATE INDEX IF NOT EXISTS idx_chamado_comentarios_chamado ON chamado_comentarios(chamado_id)`,
    // Empresa padrao. Sem esta linha o tenantContext responde
    // "Tenant não encontrado: tnt_default" (404) para TODA rota autenticada da
    // API. O modo SQLite ja criava esta linha no database.js; o Postgres nao.
    `INSERT INTO tenants (id, slug, nome, plano, status)
        VALUES ('tnt_default', 'default', 'Renostter (Padrão)', 'enterprise', 'ativo')
        ON CONFLICT DO NOTHING`,
    // Vincula os usuarios ativos a empresa padrao (mesma regra do modo SQLite).
    `INSERT INTO tenant_users (id, tenant_id, usuario_id, role, ativo, convidado_por, convidado_em, aceito_em)
        SELECT 'tu_' || u.id, 'tnt_default', u.id,
               CASE WHEN u.role IN ('superadmin', 'admin') THEN 'owner' ELSE 'user' END,
               1, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        FROM usuarios u
        WHERE COALESCE(u.ativo, 1) = 1
          AND NOT EXISTS (SELECT 1 FROM tenant_users tu WHERE tu.usuario_id = u.id AND tu.tenant_id = 'tnt_default')
        ON CONFLICT DO NOTHING`,
];

async function ensureSchema(dbRun) {
    let ok = 0;
    for (const sql of STATEMENTS) {
        try { await dbRun(sql); ok++; }
        catch (e) { console.warn('[ensureSchema] falhou:', sql.split('\n')[0].slice(0, 80), '-', e.message); }
    }
    console.log(`[ensureSchema] ${ok}/${STATEMENTS.length} ajustes de schema conferidos.`);
    return ok;
}

module.exports = { ensureSchema, STATEMENTS };
