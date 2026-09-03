# 🐳 Deploy Docker — Renostter CRM

**Sprint 4 — Cloud-Native Stack**

Este documento cobre o deploy local (desenvolvimento) via Docker Compose e o deploy em produção (VPS/AWS) via Docker.

---

## 📋 Pré-requisitos

- Docker Engine 20+ (`docker --version`)
- Docker Compose v2+ (`docker compose version`)
- 4 GB RAM mínimo (recomendado 8 GB)
- Portas livres: 3000 (API), 5432 (Postgres), 6379 (Redis), 9000/9001 (MinIO), 8080 (Frontend)

---

## 🚀 Deploy Local (Desenvolvimento)

### 1. Subir o stack completo

```bash
# Copia env vars
cp cora-api/.env.example cora-api/.env

# Sobe todos os serviços
docker compose up -d

# Acompanha os logs
docker compose logs -f cora-api
```

### 2. Verificar saúde

```bash
# API
curl http://localhost:3000/health
curl http://localhost:3000/health/live
curl http://localhost:3000/health/ready

# Frontend
curl http://localhost:8080/

# Postgres
docker compose exec postgres psql -U renostter -d renostter -c "SELECT 1"

# Redis
docker compose exec redis redis-cli ping
# Esperado: PONG

# MinIO
# Console: http://localhost:9001 (minio / minio123)
```

### 3. Criar usuários padrão

```bash
docker compose exec cora-api node scripts/seed-users.js
# Senha padrão: Renostter@2026
```

### 4. Testar login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@renostter.com","password":"Renostter@2026"}'
```

### 5. Parar e limpar

```bash
# Parar containers (preserva volumes)
docker compose down

# Parar e APAGAR volumes (reset completo)
docker compose down -v
```

---

## 🏭 Deploy em Produção (VPS)

### Opção A — VPS única (Hetzner/DigitalOcean/Linode)

**Setup mínimo recomendado:** 4 vCPU, 8 GB RAM, 80 GB SSD — ~US$ 40-60/mês

#### 1. Instalar Docker na VPS

```bash
# Ubuntu 22.04+
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# Instalar Compose
sudo apt install -y docker-compose-plugin
```

#### 2. Copiar o projeto

```bash
# Na sua máquina
scp -r renostter-crm usuario@sua-vps:/opt/

# Na VPS
cd /opt/renostter-crm
```

#### 3. Configurar SSL/TLS (Cloudflare Tunnel — recomendado)

```bash
# Instalar cloudflared
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared focal main' | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt update && sudo apt install -y cloudflared

# Autenticar
cloudflared tunnel login
cloudflared tunnel create renostter

# Configurar
cat > /etc/cloudflared/config.yml <<EOF
tunnel: <TUNNEL_ID>
credentials-file: /etc/cloudflared/.cert.json
ingress:
  - hostname: api.renostter.com
    service: http://localhost:3000
  - hostname: app.renostter.com
    service: http://localhost:8080
  - service: http_status:404
EOF

# Rodar como serviço
sudo cloudflared service install
sudo systemctl enable cloudflared
sudo systemctl start cloudflared

# Apontar DNS
cloudflared tunnel route dns renostter api.renostter.com
cloudflared tunnel route dns renostter app.renostter.com
```

#### 4. Subir o stack

```bash
cd /opt/renostter-crm

# Gera chaves fortes
node cora-api/scripts/rotate-secrets.js --gen db-encryption
node cora-api/scripts/rotate-secrets.js --gen jwt-secret
node cora-api/scripts/rotate-secrets.js --gen webhook-secret

# Adiciona ao .env (cole os valores gerados)
nano cora-api/.env

# Sobe
docker compose up -d

# Verifica
docker compose ps
docker compose logs --tail=100
```

#### 5. Configurar backup automatizado

```bash
# Backup diário do Postgres
cat > /opt/renostter-backup.sh <<'EOF'
#!/bin/bash
BACKUP_DIR=/opt/backups
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR
docker compose exec -T postgres pg_dump -U renostter renostter | gzip > $BACKUP_DIR/renostter_$DATE.sql.gz
# Manter só últimos 7 dias
find $BACKUP_DIR -name "renostter_*.sql.gz" -mtime +7 -delete
EOF
chmod +x /opt/renostter-backup.sh

# Agendar
(crontab -l 2>/dev/null; echo "0 3 * * * /opt/renostter-backup.sh") | crontab -
```

#### 6. Renovação de certificados (se não usar Cloudflare)

```bash
# Se preferir Let's Encrypt direto na VPS
sudo apt install -y certbot
sudo certbot certonly --standalone -d api.renostter.com -d app.renostter.com

# Auto-renovação (certbot já configura)
```

---

### Opção B — Deploy em AWS (ECS/EKS)

Ver `DEPLOY-AWS.md` (Sprint 5).

---

## 🔐 Checklist de Segurança para Produção

Antes de subir:

- [ ] Senhas aleatórias geradas (não use os defaults)
- [ ] `JWT_SECRET` com ≥ 32 bytes
- [ ] `DB_ENCRYPTION_KEY` com ≥ 32 bytes (não usar o default do código)
- [ ] `WEBHOOK_WEBHOOK_SECRET` configurado
- [ ] `WEBHOOK_SIGNATURE_BYPASS=false` em prod
- [ ] `ALLOW_MOCK=false` em prod
- [ ] `CRM_FRONTEND_URL` configurado (não `*`)
- [ ] TLS/SSL ativo (Cloudflare Tunnel ou Let's Encrypt)
- [ ] `NODE_ENV=production`
- [ ] `AUTH_MODE=jwt` (não `legacy` nem `dual`)
- [ ] Backup automatizado configurado
- [ ] CloudWatch / log centralizado ativo
- [ ] Rate limit no nginx/Cloudflare (defesa em profundidade)

---

## 🛠️ Troubleshooting

### API não sobe

```bash
# Verifica os logs
docker compose logs cora-api

# Verifica se Postgres está pronto
docker compose exec postgres pg_isready -U renostter

# Verifica env vars
docker compose exec cora-api env | grep -E "DB_|JWT_|REDIS_"
```

### Erro "JWT_SECRET not configured"

```bash
# Gera uma chave
node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"

# Adiciona ao .env
echo "JWT_SECRET=<valor>" >> cora-api/.env

# Reinicia
docker compose restart cora-api
```

### Erro "ECONNREFUSED 127.0.0.1:5432"

O Postgres demora ~10s para inicializar na primeira vez. O `wait-for-deps` cuida disso, mas se persistir:

```bash
docker compose down -v
docker compose up -d
```

### Disco cheio (logs, backups)

```bash
# Limpa logs Docker
docker system prune -a --volumes -f

# Limpa backups antigos
find /opt/backups -mtime +30 -delete
```

---

## 📊 Arquitetura resultante

```
┌─────────────────────────────────────────────────┐
│         Cloudflare (CDN + WAF + SSL)            │
└────────────────────┬────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
   api.renostter.com         app.renostter.com
        │                         │
   ┌────▼─────┐              ┌────▼─────┐
   │  cora-api│              │ frontend │
   │  (3000)  │              │  (8080)  │
   └────┬─────┘              └──────────┘
        │
   ┌────┴──────────┬──────────────┐
   │               │              │
┌──▼────┐     ┌────▼────┐    ┌────▼────┐
│Postgres│     │  Redis  │    │ MinIO/  │
│  (5432)│     │  (6379) │    │   S3    │
└────────┘     └─────────┘    └─────────┘
```

---

## 🔄 Atualizando o sistema

```bash
# Na VPS
cd /opt/renostter-crm

# Pull do git (se estiver versionado)
git pull

# Rebuild e restart
docker compose build
docker compose up -d

# Verifica logs
docker compose logs -f cora-api --tail=200

# Roda migrations se houver
docker compose exec cora-api node scripts/migrate.js
```

---

**Próximo passo:** Sprint 5 — Kubernetes (Helm + Terraform AWS) + CI/CD + Observabilidade.
