#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# update-cloudflare-realip.sh — Renostter CRM (Sprint Security Infra)
#
# Gera nginx/conf.d/00-cloudflare-realip.conf com as faixas de IP
# atuais do Cloudflare, pra que o nginx troque o IP de origem
# (sempre o IP de borda do Cloudflare) pelo IP real do visitante
# (header CF-Connecting-IP). Sem isso, TODO o rate-limit do nginx
# (limit_req_zone $binary_remote_addr, já configurado em nginx.conf)
# e os logs de acesso enxergam só os IPs do Cloudflare — inútil pra
# detectar abuso e pra correlacionar com o Wazuh/SIEM.
#
# Rode na VPS (tem que ter acesso à internet). Reagende via cron —
# as faixas do Cloudflare mudam raramente, mas mudam:
#   0 4 1 * * cd /opt/renostter-crm && ./scripts/update-cloudflare-realip.sh && docker compose restart nginx
#
# USO:
#   chmod +x scripts/update-cloudflare-realip.sh
#   ./scripts/update-cloudflare-realip.sh
#   docker compose restart nginx
# ═══════════════════════════════════════════════════════════════════

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

OUT_FILE="nginx/conf.d/00-cloudflare-realip.conf"

echo -e "${YELLOW}→ Buscando faixas de IP do Cloudflare...${NC}"
CF_V4="$(curl -fsSL https://www.cloudflare.com/ips-v4)"
CF_V6="$(curl -fsSL https://www.cloudflare.com/ips-v6)"

if [ -z "$CF_V4" ]; then
    echo -e "${RED}✗ Não consegui baixar as faixas do Cloudflare. Nada foi alterado.${NC}"
    exit 1
fi

{
    echo "# Gerado por scripts/update-cloudflare-realip.sh — NÃO EDITE À MÃO"
    echo "# Última atualização: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "#"
    echo "# Troca o IP de origem (edge do Cloudflare) pelo IP real do"
    echo "# visitante (CF-Connecting-IP), pra rate-limit e logs do nginx"
    echo "# refletirem o cliente de verdade — e pro Wazuh conseguir"
    echo "# correlacionar IP de ataque entre nginx e a aplicação."
    echo
    while IFS= read -r cidr; do
        [ -z "$cidr" ] && continue
        echo "set_real_ip_from ${cidr};"
    done <<< "$CF_V4"$'\n'"$CF_V6"
    echo
    echo "real_ip_header CF-Connecting-IP;"
    echo "real_ip_recursive on;"
} > "$OUT_FILE"

echo -e "${GREEN}✓ ${OUT_FILE} atualizado${NC}"
echo -e "${YELLOW}→ Rode 'docker compose restart nginx' pra aplicar.${NC}"
echo -e "${RED}⚠ Isso só é seguro se 80/443 estiverem abertos SÓ pro Cloudflare${NC}"
echo -e "${RED}  (scripts/setup-firewall.sh) — senão qualquer um pode forjar${NC}"
echo -e "${RED}  o header CF-Connecting-IP e falsificar o IP de origem.${NC}"
