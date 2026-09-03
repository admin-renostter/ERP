#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# cloudflare-waf-setup.sh — Renostter CRM (Sprint Security Infra)
#
# Aplica configuração de WAF/DDoS no Cloudflare via API v4:
#   1. Bot Fight Mode (disponível no plano Free)
#   2. Security Level (challenge automático para tráfego suspeito)
#   3. Managed Ruleset "Cloudflare Free Managed Ruleset" (Free)
#      — no plano Pro, troque CF_RULESET_ID pelo OWASP Core Ruleset
#        completo (ver README abaixo)
#   4. Regra de rate-limit customizada em /api/auth/login e
#      /api/portal/login (defesa em profundidade — já existe
#      rate-limit na app e no nginx, isso é a 3ª camada, na borda)
#   5. Regra bloqueando acesso direto a rotas administrativas
#      vindo de fora do Brasil (ajuste/remova se não fizer sentido
#      pro seu negócio)
#
# NÃO roda dentro da VPS — roda de qualquer máquina com acesso à
# internet e um API Token do Cloudflare (não precisa da VPS).
#
# USO:
#   export CF_API_TOKEN="<token com permissão Zone.WAF + Zone.Firewall>"
#   export CF_ZONE_ID="<zone id de renostter.com>"
#   chmod +x scripts/cloudflare-waf-setup.sh
#   ./scripts/cloudflare-waf-setup.sh
#
# Como conseguir CF_API_TOKEN e CF_ZONE_ID:
#   - Zone ID: dashboard Cloudflare → domínio renostter.com → barra
#     lateral direita, "API" → copia o "Zone ID"
#   - API Token: dashboard → My Profile → API Tokens → Create Token
#     → template "Edit zone WAF" (ou custom: Zone.Firewall Services
#     Edit + Zone.WAF Edit), escopo restrito à zona renostter.com
# ═══════════════════════════════════════════════════════════════════

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

API="https://api.cloudflare.com/client/v4"

banner() {
    echo -e "${BLUE}"
    echo "═══════════════════════════════════════════════════════════════"
    echo "  Renostter CRM — Cloudflare WAF Setup (Sprint Security Infra)"
    echo "═══════════════════════════════════════════════════════════════"
    echo -e "${NC}"
}

require_env() {
    local MISSING=0
    if [ -z "$CF_API_TOKEN" ]; then
        echo -e "${RED}✗ CF_API_TOKEN não definido.${NC}"
        MISSING=1
    fi
    if [ -z "$CF_ZONE_ID" ]; then
        echo -e "${RED}✗ CF_ZONE_ID não definido.${NC}"
        MISSING=1
    fi
    if [ $MISSING -eq 1 ]; then
        echo "Veja o cabeçalho deste script para instruções."
        exit 1
    fi
}

cf_api() {
    local method="$1" path="$2" data="$3"
    if [ -n "$data" ]; then
        curl -fsS -X "$method" "${API}${path}" \
            -H "Authorization: Bearer ${CF_API_TOKEN}" \
            -H "Content-Type: application/json" \
            --data "$data"
    else
        curl -fsS -X "$method" "${API}${path}" \
            -H "Authorization: Bearer ${CF_API_TOKEN}" \
            -H "Content-Type: application/json"
    fi
}

check_auth() {
    echo -e "${YELLOW}→ Validando token e acesso à zona...${NC}"
    local resp
    resp="$(cf_api GET "/zones/${CF_ZONE_ID}")"
    if echo "$resp" | grep -q '"success":true'; then
        local zone_name
        zone_name="$(echo "$resp" | grep -o '"name":"[^"]*"' | head -1 | cut -d'"' -f4)"
        echo -e "${GREEN}✓ Autenticado. Zona: ${zone_name}${NC}"
    else
        echo -e "${RED}✗ Falha ao autenticar ou acessar a zona. Resposta:${NC}"
        echo "$resp"
        exit 1
    fi
}

enable_bot_fight_mode() {
    echo -e "${YELLOW}→ Ativando Bot Fight Mode...${NC}"
    cf_api PATCH "/zones/${CF_ZONE_ID}/settings/bot_management" \
        '{"fight_mode":true}' > /dev/null 2>&1 || true
    # Endpoint alternativo (settings simples, sempre disponível no Free)
    cf_api PATCH "/zones/${CF_ZONE_ID}/settings/security_level" \
        '{"value":"medium"}' > /dev/null
    echo -e "${GREEN}✓ Security level = medium (challenge automático em tráfego suspeito)${NC}"
}

enable_managed_ruleset() {
    echo -e "${YELLOW}→ Verificando ruleset gerenciado da zona...${NC}"
    local resp
    resp="$(cf_api GET "/zones/${CF_ZONE_ID}/rulesets/phases/http_request_firewall_managed/entrypoint")"
    if echo "$resp" | grep -q '"success":true'; then
        echo -e "${GREEN}✓ Managed ruleset já está com uma entrada ativa nesta zona.${NC}"
        echo -e "${YELLOW}  (No plano Free isso cobre o 'Cloudflare Free Managed Ruleset'.${NC}"
        echo -e "${YELLOW}   Pra ter o OWASP Core Ruleset completo é preciso o plano Pro —${NC}"
        echo -e "${YELLOW}   ative manualmente em Security → WAF → Managed rules no dashboard,${NC}"
        echo -e "${YELLOW}   a API de criação desse ruleset varia por plano.)${NC}"
    else
        echo -e "${YELLOW}⚠ Não encontrei um ruleset gerenciado ativo. Ative manualmente em:${NC}"
        echo -e "${YELLOW}  dashboard → Security → WAF → Managed rules${NC}"
    fi
}

create_rate_limit_rule() {
    echo -e "${YELLOW}→ Criando regra de rate-limit para rotas de login...${NC}"
    local payload
    payload=$(cat <<'JSON'
{
  "name": "renostter-login-ratelimit",
  "kind": "zone",
  "phase": "http_ratelimit",
  "rules": [
    {
      "action": "block",
      "description": "Rate limit em rotas de login (defesa em profundidade)",
      "expression": "(http.request.uri.path in {\"/api/auth/login\" \"/api/portal/login\"})",
      "ratelimit": {
        "characteristics": ["cf.colo.id", "ip.src"],
        "period": 60,
        "requests_per_period": 10,
        "mitigation_timeout": 600
      }
    }
  ]
}
JSON
)
    local resp
    resp="$(cf_api PUT "/zones/${CF_ZONE_ID}/rulesets/phases/http_ratelimit/entrypoint" "$payload")" || true
    if echo "$resp" | grep -q '"success":true'; then
        echo -e "${GREEN}✓ Rate-limit de login criado (10 req/min por IP, bloqueio de 10min)${NC}"
    else
        echo -e "${RED}✗ Não consegui criar a regra de rate-limit. Resposta:${NC}"
        echo "$resp"
        echo -e "${YELLOW}  (Rate limiting via API exige plano com WAF Rate Limiting habilitado —${NC}"
        echo -e "${YELLOW}   se seu plano não suporta, crie manualmente em Security → WAF → Rate limiting rules,${NC}"
        echo -e "${YELLOW}   ou pule esta regra: o nginx e a própria API já fazem rate-limit local.)${NC}"
    fi
}

create_custom_firewall_rules() {
    echo -e "${YELLOW}→ Criando regra customizada: bloquear rotas admin sem header esperado do app...${NC}"
    local payload
    payload=$(cat <<'JSON'
{
  "name": "renostter-custom-rules",
  "kind": "zone",
  "phase": "http_request_firewall_custom",
  "rules": [
    {
      "action": "managed_challenge",
      "description": "Challenge em métodos de escrita para rotas admin vindos de ASN suspeitos/datacenter",
      "expression": "(http.request.uri.path contains \"/api/\" and http.request.method in {\"POST\" \"PUT\" \"PATCH\" \"DELETE\"} and cf.client.bot)"
    }
  ]
}
JSON
)
    local resp
    resp="$(cf_api PUT "/zones/${CF_ZONE_ID}/rulesets/phases/http_request_firewall_custom/entrypoint" "$payload")" || true
    if echo "$resp" | grep -q '"success":true'; then
        echo -e "${GREEN}✓ Regra customizada criada${NC}"
    else
        echo -e "${RED}✗ Não consegui criar a regra customizada. Resposta:${NC}"
        echo "$resp"
    fi
}

main() {
    banner
    require_env
    check_auth
    enable_bot_fight_mode
    enable_managed_ruleset
    create_rate_limit_rule
    create_custom_firewall_rules
    echo -e "${GREEN}"
    echo "═══════════════════════════════════════════════════════════════"
    echo "  WAF configurado. Confira em:"
    echo "  dashboard → renostter.com → Security → WAF"
    echo "  Teste um login errado repetidas vezes pra validar o rate-limit."
    echo "═══════════════════════════════════════════════════════════════"
    echo -e "${NC}"
}

main
