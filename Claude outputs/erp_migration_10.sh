#!/bin/bash
set -e

KEY_PATH="$HOME/.ssh/erp_deploy_key"

echo "== Verificando se já existe uma chave de deploy dedicada =="
if [ -f "$KEY_PATH" ]; then
  echo "Já existe uma chave em $KEY_PATH — reutilizando (não vou sobrescrever)."
else
  echo "Gerando nova chave ed25519 dedicada (fica só nesta VPS, nunca é exibida)..."
  ssh-keygen -t ed25519 -f "$KEY_PATH" -N "" -C "erp-deploy@vps11226" -q
  echo "✅ Chave gerada."
fi
echo ""

echo "== Configurando o git para usar essa chave só com github.com =="
mkdir -p "$HOME/.ssh"
SSH_CONFIG="$HOME/.ssh/config"
if ! grep -q "erp_deploy_key" "$SSH_CONFIG" 2>/dev/null; then
  cat >> "$SSH_CONFIG" <<EOF

Host github.com
  HostName github.com
  User git
  IdentityFile $KEY_PATH
  IdentitiesOnly yes
EOF
  chmod 600 "$SSH_CONFIG"
  echo "✅ ~/.ssh/config atualizado."
else
  echo "~/.ssh/config já configurado."
fi
echo ""

echo "== Garantindo github.com nos known_hosts =="
ssh-keyscan -t ed25519 github.com >> "$HOME/.ssh/known_hosts" 2>/dev/null || true
sort -u -o "$HOME/.ssh/known_hosts" "$HOME/.ssh/known_hosts"
echo "✅ known_hosts ok."
echo ""

echo "== CHAVE PÚBLICA (cole isso no GitHub — Settings > Deploy keys > Add deploy key, marque 'Allow write access') =="
echo "───────────────────────────────────────────────────────────────────"
cat "$KEY_PATH.pub"
echo "───────────────────────────────────────────────────────────────────"
