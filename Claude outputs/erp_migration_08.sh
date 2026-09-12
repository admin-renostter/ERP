#!/bin/bash
set -e
cd /opt/renostter-erp

echo "== docker-compose.override.yml (checagem de segredos) =="
# Sinaliza linhas que pareçam ter um valor literal atribuído a uma chave
# sensível (não uma referência ${VAR} vinda do .env)
if grep -EiIn '(PASSWORD|SECRET|TOKEN|_KEY|PRIVATE_KEY|API_KEY)\s*[:=]\s*[^$][^\s]{6,}' docker-compose.override.yml; then
  echo ""
  echo "⚠️  Possível valor literal sensível encontrado acima — NÃO prosseguir com o commit sem revisar manualmente."
else
  echo "✅ Nenhum valor literal suspeito encontrado (apenas referências \${VAR} ou nada sensível)."
fi
echo ""

echo "== Conteúdo completo (para revisão) =="
cat docker-compose.override.yml
echo ""

echo "== Diff de health.js =="
git diff -- cora-api/routes/health.js
