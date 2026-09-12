#!/bin/bash
set -e
cd /opt/renostter-erp

echo "== Reiniciando erp-app =="
docker compose -f docker-compose.yml -f docker-compose.override.yml restart erp-app

echo "== Aguardando healthcheck =="
sleep 5
docker compose -f docker-compose.yml -f docker-compose.override.yml ps erp-app

echo ""
echo "== /health (interno) =="
curl -sf http://localhost:3000/health || echo "❌ curl falhou"

echo ""
echo "== Teste externo via HTTPS público =="
curl -sf https://erp.renostter.com/health || echo "❌ curl externo falhou"
