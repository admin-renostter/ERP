#!/bin/bash
set -e
cd /opt/renostter-erp

echo "== Remote (mascarado) =="
git remote -v | sed -E 's#https://[^@]+@#https://***@#g'
echo ""

BRANCH=$(git branch --show-current)
echo "== Branch atual =="
echo "$BRANCH"
if [ -z "$BRANCH" ]; then
  echo "❌ Não foi possível determinar a branch atual (HEAD destacado?). Abortando."
  exit 1
fi
echo ""

echo "== git status (porcelain) =="
git status --porcelain
echo ""

EXPECTED_FILE="cora-api/scripts/migrate-sqlite-to-postgres.js"
CHANGED=$(git status --porcelain | awk '{print $2}')
UNEXPECTED=$(echo "$CHANGED" | grep -v -x "$EXPECTED_FILE" | grep -v '^$' || true)

if [ -n "$UNEXPECTED" ]; then
  echo "⚠️  Há mudanças além do arquivo esperado ($EXPECTED_FILE). Abortando o commit automático para revisão manual:"
  echo "$UNEXPECTED"
  exit 1
fi

if [ -z "$CHANGED" ]; then
  echo "Nada para commitar — o arquivo já está igual ao do repositório."
  exit 0
fi

echo "== Commitando =="
git add "$EXPECTED_FILE"
git commit -m "$(cat <<'EOF'
fix(migration): restringe escopo do cora-api e corrige conversão booleana

- migrate-sqlite-to-postgres.js não cria mais tabelas fora do escopo do
  cora-api (evita importar as ~45 tabelas do renostter-crm que compartilham
  o mesmo cora.sqlite); tabelas sem correspondente no schema Postgres são
  puladas e listadas no relatório final.
- Conexão Postgres com ssl explícito, mesmo padrão de db/postgres.js.
- SQLite aberto em modo OPEN_READONLY (evita SQLITE_READONLY em bancos
  WAL sem permissão de escrita no diretório de destino).
- Conversão 0/1 -> boolean agora só ocorre quando a coluna de destino no
  Postgres é realmente boolean (antes convertia qualquer coluna
  integer/smallint com valor 0/1, causando "invalid input syntax for
  type smallint: false" em bancos_referencia, logs_auditoria e
  webhooks_recebidos).
- Adiciona verificação pós-migração (compara contagens SQLite vs Postgres)
  e modo DRY_RUN=1 opcional.

Validado em produção: 499 linhas migradas, 0 erros, todas as contagens
batendo entre SQLite e Postgres.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KS2TuKhGRwEzcUsRg73or4
EOF
)"
echo ""

echo "== Push =="
git push origin "$BRANCH"
echo ""

echo "== git log -1 =="
git log -1 --oneline
