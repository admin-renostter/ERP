#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# install-wazuh-agent-host.sh — Renostter CRM (Sprint Security Infra)
#
# Instala o agente Wazuh NATIVO no sistema operacional da VPS (fora
# de container). Esta é a parte que realmente entrega EDR:
#   - FIM (File Integrity Monitoring) em binários do sistema, /etc,
#     chaves SSH e nos arquivos de config deste projeto
#   - Rootcheck (detecção de rootkit / anomalias no SO)
#   - Monitoramento de log do próprio SO (auth.log, sudo, etc.)
#   - Active response (pode banir IP automaticamente em conjunto com
#     o fail2ban/UFW já configurados em setup-firewall.sh)
#
# Um agente dentro de container Docker NÃO consegue enxergar o host
# por fora dele — por isso este script instala fora do Docker.
#
# Pré-requisito: Wazuh manager já rodando (scripts/setup-wazuh.sh),
# na MESMA VPS (usa 127.0.0.1) ou em outra (defina WAZUH_MANAGER_IP).
#
# USO:
#   chmod +x scripts/install-wazuh-agent-host.sh
#   sudo WAZUH_MANAGER_IP=127.0.0.1 \
#        WAZUH_REGISTRATION_PASSWORD='<mesma senha do docker-compose.wazuh-agent.yml>' \
#        RENOSTTER_PROJECT_DIR=/opt/renostter-crm \
#        ./scripts/install-wazuh-agent-host.sh
# ═══════════════════════════════════════════════════════════════════

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

WAZUH_MANAGER_IP="${WAZUH_MANAGER_IP:-127.0.0.1}"
RENOSTTER_PROJECT_DIR="${RENOSTTER_PROJECT_DIR:-/opt/renostter-crm}"

banner() {
    echo -e "${BLUE}"
    echo "═══════════════════════════════════════════════════════════════"
    echo "  Renostter CRM — Agente Wazuh no Host (Sprint Security Infra)"
    echo "═══════════════════════════════════════════════════════════════"
    echo -e "${NC}"
}

require_root() {
    if [ "$(id -u)" -ne 0 ]; then
        echo -e "${RED}✗ Rode como root (sudo).${NC}"
        exit 1
    fi
}

require_env() {
    if [ -z "$WAZUH_REGISTRATION_PASSWORD" ]; then
        echo -e "${RED}✗ WAZUH_REGISTRATION_PASSWORD não definido.${NC}"
        echo "  Use a mesma senha configurada no manager / docker-compose.wazuh-agent.yml"
        exit 1
    fi
}

install_agent() {
    echo -e "${YELLOW}→ Adicionando repositório oficial da Wazuh...${NC}"
    curl -s https://packages.wazuh.com/key/GPG-KEY-WAZUH | gpg --no-default-keyring --keyring gnupg-ring:/usr/share/keyrings/wazuh.gpg --import
    chmod 644 /usr/share/keyrings/wazuh.gpg
    echo "deb [signed-by=/usr/share/keyrings/wazuh.gpg] https://packages.wazuh.com/4.x/apt/ stable main" \
        | tee /etc/apt/sources.list.d/wazuh.list

    echo -e "${YELLOW}→ Instalando wazuh-agent...${NC}"
    apt-get update -qq
    WAZUH_MANAGER="$WAZUH_MANAGER_IP" \
    WAZUH_AGENT_NAME="renostter-vps-host" \
    WAZUH_REGISTRATION_PASSWORD="$WAZUH_REGISTRATION_PASSWORD" \
        apt-get install -y -qq wazuh-agent
    echo -e "${GREEN}✓ Agente instalado e registrado${NC}"
}

configure_fim() {
    echo -e "${YELLOW}→ Configurando FIM (File Integrity Monitoring)...${NC}"
    local OSSEC_CONF="/var/ossec/etc/ossec.conf"
    if [ ! -f "$OSSEC_CONF" ]; then
        echo -e "${RED}✗ ${OSSEC_CONF} não encontrado — instalação falhou?${NC}"
        exit 1
    fi

    # Insere um bloco <syscheck> customizado com os diretórios que
    # importam pra este projeto, antes do </ossec_config> final.
    # (idempotente: só insere se ainda não existir a tag do projeto)
    if ! grep -q "RENOSTTER-FIM-CUSTOM" "$OSSEC_CONF"; then
        python3 - "$OSSEC_CONF" "$RENOSTTER_PROJECT_DIR" <<'PYEOF'
import sys
conf_path, project_dir = sys.argv[1], sys.argv[2]
block = f"""
  <!-- RENOSTTER-FIM-CUSTOM (Sprint Security Infra) -->
  <syscheck>
    <directories check_all="yes" report_changes="yes" realtime="yes">/etc/ufw,/etc/fail2ban,/etc/ssh</directories>
    <directories check_all="yes" report_changes="no">/etc,/usr/bin,/usr/sbin,/bin,/sbin</directories>
    <directories check_all="yes" report_changes="yes">{project_dir}/docker-compose.yml,{project_dir}/nginx,{project_dir}/scripts</directories>
    <!-- .env NUNCA tem o conteúdo enviado (report_changes=no) — só
         alerta que o arquivo mudou (hash), sem vazar segredos -->
    <directories check_all="yes" report_changes="no">{project_dir}/.env,{project_dir}/cora-api/.env</directories>
    <ignore>/etc/mtab</ignore>
    <ignore>/etc/hosts.deny</ignore>
    <ignore type="sregex">.log$|.swp$</ignore>
    <scan_on_start>yes</scan_on_start>
    <frequency>43200</frequency>
  </syscheck>
"""
with open(conf_path, "r") as f:
    content = f.read()
content = content.replace("</ossec_config>", block + "</ossec_config>", 1)
with open(conf_path, "w") as f:
    f.write(content)
PYEOF
        echo -e "${GREEN}✓ Bloco <syscheck> customizado inserido${NC}"
    else
        echo -e "${YELLOW}  Bloco já existe, pulando.${NC}"
    fi
}

enable_service() {
    echo -e "${YELLOW}→ Ativando o serviço...${NC}"
    systemctl daemon-reload
    systemctl enable wazuh-agent
    systemctl restart wazuh-agent
    echo -e "${GREEN}✓ wazuh-agent rodando${NC}"
    systemctl status wazuh-agent --no-pager -l | head -10
}

main() {
    banner
    require_root
    require_env
    install_agent
    configure_fim
    enable_service
    echo -e "${GREEN}"
    echo "═══════════════════════════════════════════════════════════════"
    echo "  Agente nativo instalado. Confirme que ele aparece 'Active'"
    echo "  no dashboard do Wazuh (Agents management)."
    echo "═══════════════════════════════════════════════════════════════"
    echo -e "${NC}"
}

main
