#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# setup-wazuh.sh — Renostter CRM (Sprint Security Infra)
#
# Sobe o Wazuh (EDR + SIEM open source) num nó único, usando o
# docker-compose OFICIAL mantido pela Wazuh Inc. Não reescrevemos a
# stack (manager+indexer+dashboard) na mão — ela envolve geração de
# certificados internos que só o instalador oficial garante corretos.
# Este script só automatiza clonar, gerar certs e subir, e depois
# amarra a rede local pra o agente (docker-compose.wazuh-agent.yml e
# scripts/install-wazuh-agent-host.sh) conseguir falar com o manager.
#
# Rode NA VPS (mesma máquina do docker-compose.yml principal), fora
# de qualquer container.
#
# USO:
#   chmod +x scripts/setup-wazuh.sh
#   ./scripts/setup-wazuh.sh
#
# Depois de subir:
#   - Dashboard:  https://<ip-da-vps>:8443  (usuário admin, senha
#                 gerada — ver output do script / wazuh-siem/single-node)
#   - Manager (p/ agentes): <ip-da-vps>:1514/tcp (eventos) e
#                 1515/tcp (registro)
#
# ⚠️ Isso sobe MAIS containers (indexer é pesado — recomenda-se pelo
#    menos 4GB de RAM livres além do que o stack principal já usa).
#    Se a VPS for pequena, considere subir o Wazuh numa VPS separada
#    e ajustar WAZUH_MANAGER_HOST no agente para o IP dela.
# ═══════════════════════════════════════════════════════════════════

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

WAZUH_VERSION="${WAZUH_VERSION:-v5.0.1}"
WAZUH_DIR="${WAZUH_DIR:-./wazuh-siem}"
DASHBOARD_HOST_PORT="${DASHBOARD_HOST_PORT:-8443}"   # 443 já é do nginx do app

banner() {
    echo -e "${BLUE}"
    echo "═══════════════════════════════════════════════════════════════"
    echo "  Renostter CRM — Wazuh (EDR+SIEM) Setup (Sprint Security Infra)"
    echo "═══════════════════════════════════════════════════════════════"
    echo -e "${NC}"
}

check_requirements() {
    echo -e "${YELLOW}→ Verificando requisitos...${NC}"
    command -v git &> /dev/null || { echo -e "${RED}✗ git não encontrado${NC}"; exit 1; }
    command -v docker &> /dev/null || { echo -e "${RED}✗ docker não encontrado${NC}"; exit 1; }
    docker compose version &> /dev/null || { echo -e "${RED}✗ docker compose (v2) não encontrado${NC}"; exit 1; }

    # Requisito do OpenSearch/indexer
    local current_map_count
    current_map_count="$(sysctl -n vm.max_map_count 2>/dev/null || echo 0)"
    if [ "$current_map_count" -lt 262144 ]; then
        echo -e "${YELLOW}→ Ajustando vm.max_map_count (exigido pelo wazuh-indexer)...${NC}"
        sysctl -w vm.max_map_count=262144
        if ! grep -q "vm.max_map_count" /etc/sysctl.conf 2>/dev/null; then
            echo "vm.max_map_count=262144" >> /etc/sysctl.conf
        fi
    fi
    echo -e "${GREEN}✓ Requisitos OK${NC}"
}

clone_official_repo() {
    if [ -d "$WAZUH_DIR" ]; then
        echo -e "${YELLOW}→ ${WAZUH_DIR} já existe, pulando clone (delete a pasta pra clonar de novo)${NC}"
        return
    fi
    echo -e "${YELLOW}→ Clonando wazuh-docker (${WAZUH_VERSION}, repo oficial)...${NC}"
    git clone --depth 1 --branch "$WAZUH_VERSION" \
        https://github.com/wazuh/wazuh-docker.git "${WAZUH_DIR}_repo"
    mv "${WAZUH_DIR}_repo/single-node" "$WAZUH_DIR"
    rm -rf "${WAZUH_DIR}_repo"
    echo -e "${GREEN}✓ Clonado em ${WAZUH_DIR}${NC}"
}

generate_certs() {
    echo -e "${YELLOW}→ Gerando certificados internos (root-ca, manager, indexer, dashboard)...${NC}"
    cd "$WAZUH_DIR"
    if [ -d "config/wazuh_indexer_ssl_certs" ] || [ -d "config/root-ca" ]; then
        echo -e "${YELLOW}  Certificados já existem, pulando geração.${NC}"
    else
        docker compose -f generate-indexer-certs.yml run --rm generator
    fi
    cd - > /dev/null
    echo -e "${GREEN}✓ Certificados prontos${NC}"
}

harden_default_passwords() {
    echo -e "${RED}⚠ AÇÃO MANUAL OBRIGATÓRIA:${NC}"
    echo -e "${RED}  O compose oficial vem com senha padrão (admin/admin,${NC}"
    echo -e "${RED}  kibanaserver/kibanaserver). NÃO deixe isso em produção.${NC}"
    echo -e "${YELLOW}  Depois do 'docker compose up -d', rode dentro de ${WAZUH_DIR}:${NC}"
    echo -e "${YELLOW}    docker compose exec wazuh.indexer bash /usr/share/wazuh-indexer/plugins/opensearch-security/tools/wazuh-passwords-tool.sh --change-all${NC}"
    echo -e "${YELLOW}  (o comando exato varia por versão — confira a doc oficial:${NC}"
    echo -e "${YELLOW}   https://documentation.wazuh.com/current/deployment-options/docker/reference.html )${NC}"
}

expose_dashboard_port() {
    echo -e "${YELLOW}→ Remapeando porta do dashboard pra ${DASHBOARD_HOST_PORT} (443 é do nginx do app)...${NC}"
    if [ -f "${WAZUH_DIR}/docker-compose.yml" ]; then
        sed -i.bak "s/- 443:5601/- ${DASHBOARD_HOST_PORT}:5601/" "${WAZUH_DIR}/docker-compose.yml" || true
    fi
    echo -e "${GREEN}✓ Dashboard vai ficar em https://<ip-da-vps>:${DASHBOARD_HOST_PORT}${NC}"
}

start_stack() {
    echo -e "${YELLOW}→ Subindo Wazuh (manager + indexer + dashboard)...${NC}"
    cd "$WAZUH_DIR"
    docker compose up -d
    cd - > /dev/null
    echo -e "${GREEN}✓ Stack no ar (pode levar 1-2min pro indexer ficar 'healthy')${NC}"
}

main() {
    banner
    check_requirements
    clone_official_repo
    expose_dashboard_port
    generate_certs
    start_stack
    harden_default_passwords
    echo -e "${GREEN}"
    echo "═══════════════════════════════════════════════════════════════"
    echo "  Wazuh no ar. Próximos passos:"
    echo "  1. Troque as senhas padrão (instruções acima)"
    echo "  2. Rode: docker compose -f docker-compose.wazuh-agent.yml up -d"
    echo "     (agente que envia os logs do app/nginx pro Wazuh)"
    echo "  3. Rode: ./scripts/install-wazuh-agent-host.sh"
    echo "     (agente nativo no host — FIM/rootcheck de verdade, o"
    echo "      container não enxerga o SO por fora dele)"
    echo "  4. Acesse https://<ip-da-vps>:${DASHBOARD_HOST_PORT} pra ver os dashboards"
    echo "═══════════════════════════════════════════════════════════════"
    echo -e "${NC}"
}

main
