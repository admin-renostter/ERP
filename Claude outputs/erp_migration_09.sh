#!/bin/bash
set -e
cd /opt/renostter-erp

BRANCH=$(git branch --show-current)
if [ -z "$BRANCH" ]; then
  echo "❌ Não foi possível determinar a branch atual. Abortando."
  exit 1
fi

EXPECTED_FILES="cora-api/scripts/migrate-sqlite-to-postgres.js cora-api/routes/health.js docker-compose.override.yml"

echo "== git status (porcelain) =="
git status --porcelain
echo ""

CHANGED=$(git status --porcelain | awk '{print $2}')
UNEXPECTED=""
for f in $CHANGED; do
  MATCH=0
  for e in $EXPECTED_FILES; do
    if [ "$f" = "$e" ]; then MATCH=1; fi
  done
  if [ "$MATCH" -eq 0 ]; then
    UNEXPECTED="$UNEXPECTED $f"
  fi
done

if [ -n "$UNEXPECTED" ]; then
  echo "⚠️  Há mudanças além dos 3 arquivos esperados. Abortando para revisão manual:"
  echo "$UNEXPECTED"
  exit 1
fi

if [ -z "$CHANGED" ]; then
  echo "Nada para commitar."
  exit 0
fi

echo "== Commitando =="
git add $EXPECTED_FILES
git commit -m "$(cat <<'EOF'
fix(erp): corrige migração de dados, healthcheck do Redis e isola deploy do ERP

- cora-api/scripts/migrate-sqlite-to-postgres.js:
  - Restringe a migração ao escopo real do cora-api: tabelas do cora.sqlite
    sem correspondente no schema Postgres do ERP são puladas (não mais
    criadas automaticamente), evitando importar as ~45 tabelas do
    renostter-crm que compartilham o mesmo arquivo .sqlite.
  - Conexão Postgres com ssl explícito, mesmo padrão de db/postgres.js.
  - SQLite aberto em modo OPEN_READONLY, evitando SQLITE_READONLY em
    bancos WAL sem permissão de escrita no diretório de destino.
  - Corrige conversão 0/1 -> boolean: só ocorre quando a coluna de
    destino no Postgres é realmente boolean (antes convertia qualquer
    coluna integer/smallint com valor 0/1, quebrando bancos_referencia,
    logs_auditoria e webhooks_recebidos com "invalid input syntax for
    type smallint: false").
  - Adiciona verificação pós-migração (SQLite vs Postgres) e modo
    DRY_RUN=1 opcional.
  - Validado em produção: 499 linhas migradas, 0 erros, todas as
    contagens batendo entre SQLite e Postgres.

- cora-api/routes/health.js:
  - checkRedis() aceita pong === true além de pong === 'PONG', corrigindo
    falso status "degraded" no healthcheck com o cliente Redis em uso.

- docker-compose.override.yml (novo):
  - Isola o ERP (containers erp-app/erp-postgres/erp-redis/erp-nginx/
    erp-adminer/erp-backup, rede erp-net, volumes erp-*) de outro projeto
    já rodando na mesma VPS.
  - Publica o ERP via subdomínio (erp.renostter.com) através do túnel
    Cloudflare compartilhado (rede externa renostter_renostter-net), sem
    publicar portas no host.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KS2TuKhGRwEzcUsRg73or4
EOF
)"
echo ""

echo "== Push =="
git push origin "$BRANCH"
echo ""

echo "== git log -1 =="
git log -1 --stat
