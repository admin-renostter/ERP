#!/bin/bash
set -e
export HOME="/root"
cd /opt/renostter-erp

echo "== Testando autenticação SSH com o GitHub =="
ssh -T git@github.com 2>&1 || true
echo ""

echo "== git log -1 (commit já pronto localmente) =="
git log -1 --oneline
echo ""

echo "== Push =="
git push origin main
echo ""

echo "== git log -1 (após push) =="
git log -1 --stat
