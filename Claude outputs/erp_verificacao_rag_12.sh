#!/bin/bash
# ============================================================================
# Verificação Fase 1.1 (Copiloto RAG) — script 12
#
# O que faz (tudo somente leitura, nada é alterado):
#   1. Verifica se EMBEDDING_API_KEY e LLM_API_KEY estão definidas no
#      container em produção — mostra só PRESENÇA e TAMANHO, nunca o valor.
#   2. Verifica se a tabela `knowledge_base` já existe no Postgres de produção
#      (decide se a Fase 1.1 precisa criá-la do zero ou não).
#
# Nenhuma credencial real é exibida em momento nenhum deste script.
# ============================================================================
set -e
cd /opt/renostter-erp/cora-api || { echo "❌ Diretório /opt/renostter-erp/cora-api não encontrado"; exit 1; }

echo "=== Verificação Fase 1.1 — Copiloto RAG ==="
echo "Data: $(date)"
echo ""

# ---- 1) Chaves de API (só presença + tamanho, nunca o valor) ----
check_secret_var() {
    local varname="$1"
    local value
    value=$(docker compose exec -T app printenv "$varname" 2>/dev/null || true)
    if [ -n "$value" ]; then
        echo "✅ $varname: DEFINIDA (${#value} caracteres)"
    else
        echo "❌ $varname: NÃO DEFINIDA / vazia"
    fi
}

check_plain_var() {
    local varname="$1"
    local value
    value=$(docker compose exec -T app printenv "$varname" 2>/dev/null || true)
    echo "ℹ️  $varname: ${value:-<não definida>}"
}

echo "--- Chaves (presença apenas, valor nunca exibido) ---"
check_secret_var "EMBEDDING_API_KEY"
check_plain_var  "EMBEDDING_PROVIDER"
check_secret_var "LLM_API_KEY"
check_plain_var  "LLM_PROVIDER"
echo ""

# ---- 2) Existência da tabela knowledge_base no Postgres de produção ----
echo "--- Tabela knowledge_base no Postgres ---"
docker compose exec -T app node -e "
const { Pool } = require('pg');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
});
pool.query(\"SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'knowledge_base') as exists\")
    .then(r => { console.log(r.rows[0].exists ? '✅ tabela knowledge_base JÁ EXISTE' : '❌ tabela knowledge_base NÃO EXISTE — precisa ser criada'); process.exit(0); })
    .catch(e => { console.log('⚠️  Erro ao verificar:', e.message); process.exit(0); })
    .finally(() => pool.end());
"

echo ""
echo "=== Fim da verificação ==="
