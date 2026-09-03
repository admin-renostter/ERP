#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# setup.sh — Renostter CRM (Sprint 22 — Fase 0)
#
# Script de setup inicial para VPS novo.
# Rode uma vez após clonar o repositório.
#
# USO:
#   chmod +x scripts/setup.sh
#   ./scripts/setup.sh
# ═══════════════════════════════════════════════════════════════════

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

banner() {
    echo -e "${BLUE}"
    echo "═══════════════════════════════════════════════════════════════"
    echo "  Renostter CRM — Setup Inicial (Sprint 22 — Fase 0)"
    echo "═══════════════════════════════════════════════════════════════"
    echo -e "${NC}"
}

check_requirements() {
    echo -e "${YELLOW}→ Verificando requisitos...${NC}"

    local MISSING=0

    if ! command -v docker &> /dev/null; then
        echo -e "${RED}✗ Docker não encontrado${NC}"
        echo "  Instale: https://docs.docker.com/engine/install/"
        MISSING=1
    else
        echo -e "${GREEN}✓ Docker $(docker --version | cut -d' ' -f3 | tr -d ',')${NC}"
    fi

    if ! docker compose version &> /dev/null; then
        echo -e "${RED}✗ Docker Compose (v2) não encontrado${NC}"
        echo "  Instale: https://docs.docker.com/compose/install/"
        MISSING=1
    else
        echo -e "${GREEN}✓ Docker Compose $(docker compose version --short)${NC}"
    fi

    if ! command -v openssl &> /dev/null; then
        echo -e "${RED}✗ OpenSSL não encontrado${NC}"
        MISSING=1
    else
        echo -e "${GREEN}✓ OpenSSL $(openssl version | cut -d' ' -f2)${NC}"
    fi

    if [ $MISSING -eq 1 ]; then
        echo -e "${RED}Instale os requisitos antes de continuar.${NC}"
        exit 1
    fi
}

setup_env() {
    if [ -f .env ]; then
        echo -e "${YELLOW}⚠️  .env já existe. Mantendo.${NC}"
        return
    fi

    echo -e "${YELLOW}→ Criando .env a partir de .env.example...${NC}"
    cp .env.example .env

    # Gera secrets fortes
    JWT_SECRET=$(openssl rand -hex 64)
    DB_ENCRYPTION_KEY=$(openssl rand -base64 32 | head -c 32)
    POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr -d '=+/' | head -c 24)
    REDIS_PASSWORD=$(openssl rand -base64 24 | tr -d '=+/' | head -c 24)
    BACKUP_ENCRYPTION_KEY=$(openssl rand -base64 32 | head -c 32)

    sed -i "s|JWT_SECRET=.*|JWT_SECRET=$JWT_SECRET|" .env
    sed -i "s|DB_ENCRYPTION_KEY=.*|DB_ENCRYPTION_KEY=$DB_ENCRYPTION_KEY|" .env
    sed -i "s|POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$POSTGRES_PASSWORD|" .env
    sed -i "s|REDIS_PASSWORD=.*|REDIS_PASSWORD=$REDIS_PASSWORD|" .env
    sed -i "s|BACKUP_ENCRYPTION_KEY=.*|BACKUP_ENCRYPTION_KEY=$BACKUP_ENCRYPTION_KEY|" .env

    echo -e "${GREEN}✓ .env criado com secrets fortes${NC}"
    echo -e "${YELLOW}  ⚠️  NÃO commite o .env — está no .gitignore/.dockerignore${NC}"
}

setup_directories() {
    echo -e "${YELLOW}→ Criando diretórios...${NC}"

    mkdir -p nginx/certs
    mkdir -p nginx/conf.d
    mkdir -p logs
    mkdir -p backups/postgres
    mkdir -p backups/local

    # Gera certificados self-signed para dev (em prod, use Let's Encrypt)
    if [ ! -f nginx/certs/fullchain.pem ]; then
        echo -e "${YELLOW}→ Gerando certificado self-signed para dev...${NC}"
        openssl req -x509 -newkey rsa:4096 -nodes \
            -keyout nginx/certs/privkey.pem \
            -out nginx/certs/fullchain.pem \
            -days 365 \
            -subj "/C=BR/ST=SP/L=Sao Paulo/O=Renostter/CN=localhost" 2>/dev/null
        echo -e "${GREEN}✓ Certificado self-signed gerado (apenas dev!)${NC}"
        echo -e "${YELLOW}  ⚠️  Para prod, use: certbot certonly --nginx -d seu-dominio.com.br${NC}"
    fi

    echo -e "${GREEN}✓ Diretórios criados${NC}"
}

build_and_up() {
    echo -e "${YELLOW}→ Subindo containers (Postgres + Redis + App + Nginx)...${NC}"

    docker compose pull 2>/dev/null || true
    docker compose build --no-cache
    docker compose up -d postgres redis

    echo -e "${YELLOW}→ Aguardando Postgres inicializar (30s)...${NC}"
    sleep 30
    docker compose ps postgres

    echo -e "${YELLOW}→ Subindo app e nginx...${NC}"
    docker compose up -d app nginx

    echo -e "${GREEN}✓ Containers up${NC}"
}

migrate_database() {
    if [ ! -f cora-api/cora.sqlite ]; then
        echo -e "${YELLOW}⚠️  Sem cora-api/cora.sqlite — pulando migration${NC}"
        return
    fi

    echo -e "${YELLOW}→ Encontrado banco SQLite. Deseja migrar para Postgres? [y/N]${NC}"
    read -r RESP
    if [ "$RESP" = "y" ] || [ "$RESP" = "Y" ]; then
        echo -e "${YELLOW}→ Rodando migration SQLite → Postgres...${NC}"
        docker compose exec -T app node scripts/migrate-sqlite-to-postgres.js
    else
        echo -e "${YELLOW}  Pulando. Rode depois: docker compose exec app node scripts/migrate-sqlite-to-postgres.js${NC}"
    fi
}

show_summary() {
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  ✅ Setup completo!${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "Próximos passos:"
    echo ""
    echo "  1. Ver logs:"
    echo "     docker compose logs -f app"
    echo ""
    echo "  2. Acessar aplicação:"
    echo "     http://localhost           (dev, HTTP)"
    echo "     https://localhost          (com certificado self-signed)"
    echo ""
    echo "  3. Ver health check:"
    echo "     curl http://localhost:3000/health"
    echo ""
    echo "  4. Acessar Adminer (UI do Postgres):"
    echo "     http://localhost:8080     (profile: dev)"
    echo ""
    echo "  5. Rodar backup automatizado:"
    echo "     docker compose --profile backup up -d"
    echo ""
    echo "  6. Ver logs do sistema:"
    echo "     tail -f logs/*.log"
    echo ""
    echo -e "${YELLOW}Lembre-se:${NC}"
    echo "  - Editar .env para configurar SMTP, Stripe, etc"
    echo "  - Para prod real, usar Let's Encrypt (certbot)"
    echo "  - Backups diários rodam automaticamente se profile 'backup' ativo"
    echo "  - Documentação completa: README-DOCKER.md"
}

# ── MAIN ──
banner
check_requirements
setup_env
setup_directories
build_and_up
migrate_database
show_summary
