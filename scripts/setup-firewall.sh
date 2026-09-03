#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# setup-firewall.sh — Renostter CRM (Sprint Security Infra)
#
# Configura o firewall de HOST (UFW) + fail2ban na VPS de produção.
# Rode como root (ou via sudo) DIRETO NA VPS — não dentro de container.
#
# O que faz:
#   1. Instala ufw + fail2ban
#   2. Política padrão: nega tudo que entra, libera tudo que sai
#   3. Libera SSH com rate-limit (protege contra brute force)
#   4. Libera 80/443 SOMENTE para as faixas de IP do Cloudflare
#      (se USE_CLOUDFLARE_TUNNEL=true, nem libera 80/443 — o
#      cloudflared faz conexão de saída, não precisa de porta aberta)
#   5. Configura fail2ban pro sshd
#
# USO:
#   chmod +x scripts/setup-firewall.sh
#   sudo USE_CLOUDFLARE_TUNNEL=true ./scripts/setup-firewall.sh
#
# Variáveis de ambiente:
#   SSH_PORT               — porta do SSH (default: 22)
#   USE_CLOUDFLARE_TUNNEL  — "true" se usa cloudflared (recomendado,
#                             ver DEPLOY-DOCKER.md). Se "true", 80/443
#                             ficam FECHADOS (o tunnel não precisa).
# ═══════════════════════════════════════════════════════════════════

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SSH_PORT="${SSH_PORT:-22}"
USE_CLOUDFLARE_TUNNEL="${USE_CLOUDFLARE_TUNNEL:-false}"

banner() {
    echo -e "${BLUE}"
    echo "═══════════════════════════════════════════════════════════════"
    echo "  Renostter CRM — Firewall de Host (Sprint Security Infra)"
    echo "═══════════════════════════════════════════════════════════════"
    echo -e "${NC}"
}

require_root() {
    if [ "$(id -u)" -ne 0 ]; then
        echo -e "${RED}✗ Rode como root (sudo).${NC}"
        exit 1
    fi
}

install_packages() {
    echo -e "${YELLOW}→ Instalando ufw e fail2ban...${NC}"
    if command -v apt-get &> /dev/null; then
        apt-get update -qq
        apt-get install -y -qq ufw fail2ban
    else
        echo -e "${RED}✗ Este script assume Ubuntu/Debian (apt-get). Adapte para sua distro.${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ Pacotes instalados${NC}"
}

configure_ufw_base() {
    echo -e "${YELLOW}→ Configurando política padrão do UFW...${NC}"
    ufw default deny incoming
    ufw default allow outgoing

    echo -e "${YELLOW}→ Liberando SSH (porta ${SSH_PORT}) com rate-limit...${NC}"
    # 'limit' bloqueia IP que tentar >6 conexões em 30s — proteção
    # extra contra brute force além do fail2ban
    ufw limit "${SSH_PORT}/tcp" comment 'SSH rate-limited'
    echo -e "${GREEN}✓ SSH liberado com limite${NC}"
}

configure_web_access() {
    if [ "$USE_CLOUDFLARE_TUNNEL" = "true" ]; then
        echo -e "${YELLOW}→ USE_CLOUDFLARE_TUNNEL=true → NÃO abrindo 80/443${NC}"
        echo -e "${YELLOW}  O cloudflared conecta de dentro pra fora; a origem fica"
        echo -e "${YELLOW}  invisível na internet pública. Confirme que o tunnel está"
        echo -e "${YELLOW}  ativo (systemctl status cloudflared) antes de aplicar isso.${NC}"
        return
    fi

    echo -e "${YELLOW}→ Buscando faixas de IP do Cloudflare (ips-v4/ips-v6)...${NC}"
    local CF_V4 CF_V6
    CF_V4="$(curl -fsSL https://www.cloudflare.com/ips-v4)"
    CF_V6="$(curl -fsSL https://www.cloudflare.com/ips-v6)"

    if [ -z "$CF_V4" ]; then
        echo -e "${RED}✗ Não consegui baixar as faixas de IP do Cloudflare.${NC}"
        echo -e "${RED}  Não vou abrir 80/443 sem allowlist — rode de novo depois.${NC}"
        exit 1
    fi

    echo -e "${YELLOW}→ Liberando 80/443 SOMENTE para IPs do Cloudflare...${NC}"
    while IFS= read -r cidr; do
        [ -z "$cidr" ] && continue
        ufw allow from "$cidr" to any port 80 proto tcp comment 'Cloudflare HTTP'
        ufw allow from "$cidr" to any port 443 proto tcp comment 'Cloudflare HTTPS'
    done <<< "$CF_V4"$'\n'"$CF_V6"

    echo -e "${GREEN}✓ 80/443 liberados só para Cloudflare${NC}"
    echo -e "${YELLOW}⚠ As faixas de IP do Cloudflare mudam raramente, mas mudam.${NC}"
    echo -e "${YELLOW}  Reagende este script (cron mensal) ou monitore${NC}"
    echo -e "${YELLOW}  https://www.cloudflare.com/ips/ para atualizar.${NC}"
}

configure_fail2ban() {
    echo -e "${YELLOW}→ Configurando fail2ban para sshd...${NC}"
    cat > /etc/fail2ban/jail.local <<EOF
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5
backend  = systemd

[sshd]
enabled = true
port    = ${SSH_PORT}
EOF
    systemctl enable fail2ban
    systemctl restart fail2ban
    echo -e "${GREEN}✓ fail2ban ativo (5 tentativas / 10min → ban de 1h)${NC}"
}

enable_ufw() {
    echo -e "${YELLOW}→ Ativando UFW...${NC}"
    # --force evita o prompt interativo (já garantimos a regra de SSH acima)
    ufw --force enable
    echo -e "${GREEN}✓ UFW ativo${NC}"
    ufw status verbose
}

main() {
    banner
    require_root
    install_packages
    configure_ufw_base
    configure_web_access
    configure_fail2ban
    enable_ufw
    echo -e "${GREEN}"
    echo "═══════════════════════════════════════════════════════════════"
    echo "  Firewall configurado. Teste o acesso (SSH + site) ANTES de"
    echo "  fechar esta sessão — se algo travar, use o console da VPS"
    echo "  (não o SSH) pra rodar: ufw disable"
    echo "═══════════════════════════════════════════════════════════════"
    echo -e "${NC}"
}

main
