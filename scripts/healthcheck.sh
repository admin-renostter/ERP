#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# healthcheck.sh — Verifica saúde de todos os serviços
# ═══════════════════════════════════════════════════════════════════

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC}  $1"; }

echo "═══════════════════════════════════════════════════════════"
echo " Renostter CRM — Health Check"
echo "═══════════════════════════════════════════════════════════"
echo ""

# 1. Containers
echo "→ Containers:"
for service in app postgres redis nginx; do
    if docker compose ps $service 2>/dev/null | grep -q "Up"; then
        ok "$service está rodando"
    else
        fail "$service NÃO está rodando"
    fi
done
echo ""

# 2. App health endpoint
echo "→ App health:"
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health 2>/dev/null || echo "000")
if [ "$HEALTH" = "200" ] || [ "$HEALTH" = "401" ]; then
    ok "Endpoint /health responde ($HEALTH)"
else
    fail "Endpoint /health não responde (HTTP $HEALTH)"
fi
echo ""

# 3. Postgres
echo "→ Postgres:"
if docker compose exec -T postgres pg_isready -U renostter 2>/dev/null | grep -q "accepting"; then
    ok "Postgres accepting connections"
    TABLES=$(docker compose exec -T postgres psql -U renostter -d renostter_crm -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public'" 2>/dev/null | tr -d ' ')
    echo "   Tabelas: $TABLES"
else
    fail "Postgres não está pronto"
fi
echo ""

# 4. Redis
echo "→ Redis:"
if docker compose exec -T redis redis-cli ping 2>/dev/null | grep -q "PONG"; then
    ok "Redis respondendo (PONG)"
    KEYS=$(docker compose exec -T redis redis-cli dbsize 2>/dev/null | tr -d ' ')
    echo "   Keys: $KEYS"
else
    fail "Redis não responde"
fi
echo ""

# 5. Disk usage
echo "→ Volumes:"
docker volume ls --filter "name=renostter" --format "{{.Name}}\t{{.Size}}" 2>/dev/null | while read line; do
    name=$(echo "$line" | cut -f1)
    size=$(echo "$line" | cut -f2)
    [ -n "$name" ] && echo "   $name: $size"
done
echo ""

# 6. Backup
echo "→ Backup:"
if docker compose --profile backup ps backup 2>/dev/null | grep -q "Up"; then
    ok "Container de backup rodando"
    BACKUP_COUNT=$(docker compose exec -T backup ls /backups 2>/dev/null | wc -l)
    echo "   Backups: $BACKUP_COUNT"
else
    warn "Container de backup não está ativo (use: docker compose --profile backup up -d)"
fi
echo ""

# 7. Logs recentes
echo "→ Últimos erros nos logs do app (se houver):"
ERRORS=$(docker compose logs --tail=100 app 2>/dev/null | grep -i "error" | wc -l)
if [ "$ERRORS" -gt 0 ]; then
    warn "$ERRORS mensagens de erro nos últimos 100 logs"
    docker compose logs --tail=100 app 2>/dev/null | grep -i "error" | tail -3
else
    ok "Sem erros nos últimos 100 logs"
fi
echo ""

echo "═══════════════════════════════════════════════════════════"
