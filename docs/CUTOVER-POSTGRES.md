# Cutover Postgres — Passo a passo

**Status do código (17/07/2026):** ✅ Tudo pronto. Os passos abaixo são **manuais** —
dependem da sua conta Supabase/Postgres e do seu aval para o flip em produção.

**Estimativa total:** ~3-4h (incluindo janela de observação pós-cutover).

---

## 0. Pré-requisitos

- [x] `pg` instalado (`cora-api/package.json`)
- [x] Driver Postgres com API idêntica ao SQLite (`cora-api/db/postgres.js`)
- [x] Schema completo (`cora-api/schema-postgres.sql`)
- [x] Feature flag `DB_DRIVER` em `database.js`
- [x] Auto-adapter SQLite→Postgres (regex) — **11/11 testes passando**
- [x] Script de migração de dados (`tools/migrate-sqlite-to-postgres.cjs`)
- [x] `envValidator.js` valida `DB_DRIVER` + `DATABASE_URL` (7/7 testes)
- [x] `.env.example` documenta todas as variáveis
- [x] Servidor smoke-approvals: 29/31 OK em SQLite
- [x] Perf-audit: P95 < 200ms em todos endpoints (SQLite)
- [x] **BUGFIX 17/07:** `database.js` agora exporta `dbRun/dbGet/dbAll/close` no branch SQLite
       (antes só exportava no branch Postgres — a request `dbAll is not a function`
        que aparecia no smoke era exatamente isso)

---

## 1. Provisionar Postgres (você, ~20-30 min)

### Opção A — Supabase (recomendado, free tier)

1. Crie conta em https://supabase.com (login GitHub é o mais rápido).
2. **New project** → nome `renostter-crm` → senha forte do DB (anote!) → região São Paulo.
3. Após o provisionamento (~2 min), vá em **SQL Editor** → **New query**.
4. Cole **TODO** o conteúdo de `cora-api/schema-postgres.sql` → **Run**.
   - Deve terminar com `Total esperado: ~12 tabelas, ~20 índices, ~5 triggers` (comentário).
   - Se der erro de permissão nas extensões, é normal no free tier (`pg_trgm` exige
     upgrade); pode continuar sem ela, é só otimização de busca.
5. Vá em **Settings → Database → Connection string → URI (modo Transaction / pooling)**.
   Copie a string.
   - Formato: `postgres://postgres.[ref]:[SENHA]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`
6. **Guarde a string** — você vai colar no `.env` na seção 2.

### Opção B — Neon / RDS / outro

- **Neon:** crie projeto, copie "Pooled connection" string.
- **RDS:** crie instance PostgreSQL 15+ na mesma VPC do app, libera SG,
  copie endpoint + monte a URL manualmente.

---

## 2. Plug no `.env` (~2 min)

Edite `cora-api/.env`:

```bash
# Trocar de sqlite para postgres
DB_DRIVER=postgres

# Colar a connection string que você copiou no passo 1
DATABASE_URL=postgres://postgres.[ref]:[SENHA]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres

# Supabase/Neon exigem SSL — não setar PGSSLMODE (driver já habilita SSL por padrão)
# PG_POOL_MAX=10
```

**Não** setar `PGSSLMODE=disable` em produção (o envValidator vai te avisar).

---

## 3. Rodar migração de dados (~5-30 min dependendo do volume)

```bash
# Mata qualquer server rodando em :3000 antes
cd renostter-crm
node tools/migrate-sqlite-to-postgres.cjs
```

Saída esperada:
```
╔════════════════════════════════════════════════════════════╗
║   Migração SQLite → Postgres (Supabase)                   ║
╚════════════════════════════════════════════════════════════╝

SQLite: ...\cora-api\cora.sqlite
Postgres: postgres://postgres.***:***@...

✅ Conexão Postgres OK

→ Migrando bancos_referencia...
   ✅ 200 inseridos, 0 pulados (de 200 total)
→ Migrando bancos_cadastrados...
   ...
→ Migrando cobrancas...
   ✅ 1013 inseridos, 0 pulados (de 1013 total)
   ...

Total: 1013 inseridos, 0 pulados, em Xs
```

> **Atenção:** o script NÃO é idempotente. Rodar 2x duplica dados. Se precisar
> rerodar, faça `TRUNCATE` em todas as tabelas no SQL Editor do Supabase antes.

---

## 4. Smoke test em modo Postgres (~15 min)

```bash
cd renostter-crm/cora-api
# Sobe server em :3099 com Postgres
PORT=3099 node server.js
```

Em outro terminal:
```bash
cd renostter-crm
node cora-api/tools/smoke-approvals.cjs
```

**Critério:** mesmo resultado de antes (29/31 OK, com as 2 falhas conhecidas de count acumulado).

Se algum teste **específico do Postgres** falhar (ex: INSERT com `RETURNING id`),
verifique:
- Logs do server: `[Postgres] Erro inesperado no pool: ...`
- Painel do Supabase → **Table Editor** → ver se a linha foi criada
- Se der erro de trigger (`RAISE EXCEPTION` no lugar de `RAISE ABORT`),
  é porque o script de migração rodou mas alguma constraint custom não foi adaptada

---

## 5. Perf-audit em modo Postgres (~10 min)

```bash
# Mata o server do passo 4
cd renostter-crm/cora-api
PORT=3000 node server.js     # perf-audit usa :3000
```

Em outro terminal:
```bash
cd renostter-crm
node tools/perf-audit.cjs
```

**Critério de aceitação (do roadmap original):**
- ✅ Todos endpoints P95 < 50ms (roadmap previa ganho de 30-50% vs SQLite)
- ✅ Sem erros 5xx em 100+ requests concorrentes

Se P95 ficar > 50ms, verificar:
- Connection pool size: `PG_POOL_MAX=20` (default 10)
- Latência até o Postgres: Supabase free tier pode ter 30-50ms de latência
  pura; considere `pgbouncer` transaction mode (já é o que a "Transaction" URL usa)

---

## 6. Cutover em produção (~30 min + 1 sprint de monitoramento)

### Decisão recomendada: **flag em produção, monitoramento ativo**

```bash
# No servidor de produção (depois de validar tudo acima):
# 1. Agendar janela de manutenção curta (~10 min) ou fazer hot-swap
# 2. Atualizar .env de produção: DB_DRIVER=postgres + DATABASE_URL
# 3. Restart do processo node
# 4. Monitorar logs:
#    - "[DB] Driver: POSTGRES" deve aparecer no boot
#    - Ausência de "[Postgres] Erro inesperado no pool"
#    - Smoke via curl nos endpoints principais (/api/cobrancas, /api/approvals/pending)
# 5. Manter DB_DRIVER=sqlite como rollback (só trocar o .env e reiniciar)
```

### Rollback instantâneo (se algo der errado)

```bash
# Editar .env de produção:
DB_DRIVER=sqlite
# Reiniciar node. Volta pro SQLite em <30s.
```

---

## 7. Pós-cutover (1 sprint, ~2 semanas)

- [ ] Comparar logs de erro antes/depois
- [ ] Validar contagens de cobranças/approvals no Supabase Table Editor
- [ ] Ativar PITR (Point In Time Recovery) no Supabase: Settings → Database → PITR enabled
- [ ] Habilitar `pg_cron` para limpeza de logs antigos (opcional, ver schema-postgres.sql
      linha do `cron.schedule`)
- [ ] Decidir se mantém o SQLite como fallback de emergência (recomendo sim por 1 mês)
- [ ] Após 1 mês estável: opcionalmente remover o driver SQLite do `database.js`
      (fica 1 branch a menos para manter)

---

## Troubleshooting

### Erro: `password authentication failed for user "postgres"`
→ URL errada. Verifique se copiou a senha certa do painel do Supabase.

### Erro: `ENOTFOUND ...supabase.com`
→ DNS/Proxy/VPN. Teste `nslookup aws-0-sa-east-1.pooler.supabase.com` do servidor.

### Erro: `SSL connection required`
→ Você está com `PGSSLMODE=disable` setado. Remova essa linha (driver já faz SSL por padrão).

### Erro: `relation "cobrancas" does not exist`
→ Você não rodou o `schema-postgres.sql` no SQL Editor. Volte no passo 1.5.

### Erro: `permission denied for table ...`
→ Está usando a connection string do `postgres` (admin) e não do `service_role`.
   No Supabase, use Settings → API → service_role key, ou use a URI "Transaction" do passo 1.5.

### Tudo conecta mas requests falham
→ Ative `console.log(process.env.DATABASE_URL)` no `db/postgres.js` (linha 23)
   temporariamente e veja se a URL chegou certa (sem a senha, claro).

---

## Contato/Suporte

- Documentação interna: `docs/MIGRACAO-POSTGRES-ROADMAP.md`
- Schema: `cora-api/schema-postgres.sql`
- Driver: `cora-api/db/postgres.js`
- Validador: `cora-api/envValidator.js`
- Migration script: `tools/migrate-sqlite-to-postgres.cjs`
- Sanity tests: `tools/dev/test-adapter.cjs` (11 testes) e `tools/dev/test-env-validator.cjs` (7 testes)
