# Renostter CRM — Docker + Postgres + Redis (Sprint 22 — Fase 0)

> Setup completo de produção: app + Postgres 16 + Redis 7 + Nginx (TLS) + backup automatizado.

## 🎯 O que esta Fase 0 entrega

✅ **Dockerfile multi-stage** (Node 20 Alpine, ~150MB final, non-root)
✅ **docker-compose.yml** com 5 serviços orquestrados
✅ **Postgres 16** com extensões + health check
✅ **Redis 7** com senha + persistência
✅ **Nginx** com TLS (Let's Encrypt em prod) + rate limiting
✅ **Migration script** SQLite → Postgres (preserva dados)
✅ **Backup automatizado** cifrado AES-256-GCM (S3-compatible)
✅ **Scripts auxiliares**: setup, healthcheck, backup
✅ **Adminer** (UI Postgres) em dev/staging
✅ **Observability** via logs estruturados JSON

## 📁 Estrutura criada

```
renostter-crm/
├── Dockerfile                      # Build multi-stage Node 20
├── docker-compose.yml              # Orquestração completa
├── .dockerignore                    # Exclude do build
├── .env.example                    # Template de env vars
├── nginx/
│   ├── nginx.conf                  # Config base
│   └── conf.d/default.conf         # HTTP/HTTPS server blocks
├── scripts/
│   ├── setup.sh                    # Setup inicial VPS novo
│   ├── healthcheck.sh              # Diagnóstico rápido
│   ├── backup.sh                   # Backup manual cifrado
│   └── postgres-init/
│       └── 01-extensions.sql        # Extensões Postgres
└── cora-api/scripts/
    └── migrate-sqlite-to-postgres.js   # Migração de dados
```

## 🚀 Quickstart (5 minutos)

### Pré-requisitos
- VPS Linux (Ubuntu 22.04+ recomendado) com Docker + Docker Compose v2
- Domínio apontando para o IP do VPS (opcional em dev)
- Portas 80 e 443 liberadas

### Setup

```bash
# 1. Clonar
git clone <repo> renostter-crm
cd renostter-crm

# 2. Setup (cria .env, certificados self-signed, sobe containers)
chmod +x scripts/setup.sh
./scripts/setup.sh

# 3. Validar
./scripts/healthcheck.sh
```

Acesse:
- **App**: http://localhost (dev) ou https://seudominio.com (prod)
- **Adminer** (dev): http://localhost:8080
- **API health**: http://localhost:3000/health

## 🔧 Comandos úteis

```bash
# Ver logs
docker compose logs -f app
docker compose logs -f postgres

# Reiniciar um serviço
docker compose restart app

# Entrar no container
docker compose exec app sh
docker compose exec postgres psql -U renostter -d renostter_crm

# Rodar migration manualmente
docker compose exec app node scripts/migrate-sqlite-to-postgres.js

# Backup manual
./scripts/backup.sh

# Health check completo
./scripts/healthcheck.sh

# Ativar backup diário (opcional)
docker compose --profile backup up -d

# Subir tudo em background
docker compose up -d

# Parar tudo (preserva volumes)
docker compose down

# Parar e APAGAR volumes (CUIDADO: perde dados)
docker compose down -v
```

## 🔐 Configuração de produção

### 1. Domínio + DNS

Apontar `seudominio.com` para o IP do VPS (registro A).

### 2. HTTPS com Let's Encrypt (Caddy é mais simples)

```bash
# Instalar certbot
sudo apt install certbot

# Parar nginx temporariamente
docker compose stop nginx

# Gerar certificado
sudo certbot certonly --standalone -d seudominio.com -d www.seudominio.com

# Copiar para o volume
sudo cp /etc/letsencrypt/live/seudominio.com/fullchain.pem nginx/certs/
sudo cp /etc/letsencrypt/live/seudominio.com/privkey.pem nginx/certs/

# Renovar automaticamente (cron)
echo "0 0 * * * certbot renew --quiet && cp /etc/letsencrypt/live/seudominio.com/*.pem /path/to/renostter-crm/nginx/certs/ && docker compose restart nginx" | sudo crontab -
```

### 3. Variáveis de produção obrigatórias

Edite `.env`:

```bash
NODE_ENV=production
AUTH_MODE=jwt                    # não use 'dual' em prod!
CORS_ORIGIN=https://seudominio.com
COMPANY_CNPJ=11.222.333/0001-44
COMPANY_NAME="Renostter Climatização"

# Cora (produção real)
CORAFORCE_MOCK=false
CORA_CERT_PATH=/app/certs/cora/certificate.pem
CORA_KEY_PATH=/app/certs/cora/private-key.key

# Autentique (produção)
AUTENTIQUE_TOKEN=seu-token-real
AUTENTIQUE_WEBHOOK_SECRET=secret-real

# Stripe (Fase 1)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Backblaze B2 (Fase 3)
BACKBLAZE_KEY_ID=...
BACKBLAZE_APP_KEY=...
BACKBLAZE_BUCKET=renostter-uploads
BACKBLAZE_ENDPOINT=s3.us-west-002.backblazeb2.com
```

### 4. Firewall

```bash
# UFW (Ubuntu)
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP (redireciona para HTTPS)
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

## 🔄 Migration de dados existentes (SQLite → Postgres)

Se você tem um banco SQLite local com dados:

```bash
# 1. Copie o arquivo cora.sqlite para a raiz do projeto
cp /caminho/antigo/cora.sqlite ./cora-api/cora.sqlite

# 2. Suba o Postgres
docker compose up -d postgres
sleep 30  # aguarda inicialização

# 3. Rode a migration
docker compose exec app node scripts/migrate-sqlite-to-postgres.js

# 4. Verifique as contagens
docker compose exec postgres psql -U renostter -d renostter_crm -c "
  SELECT tablename, n_live_tup
  FROM pg_stat_user_tables
  ORDER BY n_live_tup DESC;
"

# 5. Atualize .env: DB_DRIVER=postgres
# 6. Reinicie a app
docker compose restart app
```

A migration é **idempotente** (não duplica dados) e preserva todos os relacionamentos.

## 💾 Backup e Restore

### Backup automatizado

```bash
# Ativar (sobe container de backup diário)
docker compose --profile backup up -d

# Backups locais ficam em ./backups/postgres/
# Envelhecimento: 7 dias / 4 semanas / 6 meses
# Upload automático para S3 (Backblaze B2) se BACKUP_S3_* configurado
```

### Backup manual

```bash
./scripts/backup.sh
# Cria backups/postgres/renostter-YYYYMMDD-HHMMSS.sql.gz.enc
# Cifrado com AES-256-GCM (chave do .env)
```

### Restore

```bash
# Decifra
KEY=$(grep BACKUP_ENCRYPTION_KEY .env | cut -d= -f2)
BACKUP=backups/postgres/renostter-20260830-120000.sql.gz.enc
# Manual: usar openssl enc -d
# Ou via script de restore (Sprint 22 — futuro)
```

## 📊 Monitoramento

### Health check

```bash
./scripts/healthcheck.sh
# Verifica: containers, /health, Postgres, Redis, volumes, backups, logs
```

### Métricas (próxima sprint)

- Prometheus + Grafana
- OpenTelemetry traces
- Alertas Slack/email para falhas

## 🐛 Troubleshooting

### App não sobe

```bash
docker compose logs app --tail=50
# Verificar JWT_SECRET presente e >= 32 chars
# Verificar DB_DRIVER=postgres
# Verificar DATABASE_URL acessível
```

### Postgres não aceita conexões

```bash
docker compose logs postgres --tail=20
docker compose exec postgres pg_isready -U renostter
# Se falhar, restart: docker compose restart postgres
```

### Migration falhou

```bash
# A migration é idempotente — pode rodar de novo
docker compose exec app node scripts/migrate-sqlite-to-postgres.js

# Para forçar reset (CUIDADO: apaga dados!):
docker compose down -v
docker compose up -d postgres
sleep 30
# Recriar tabelas via app
docker compose up -d app
# Re-rodar migration
```

### Performance ruim

```bash
# Verificar uso de recursos
docker stats
# Aumentar limites no docker-compose.yml (deploy.resources)
# Verificar queries lentas no Postgres
docker compose exec postgres psql -U renostter -d renostter_crm -c "
  SELECT query, calls, mean_exec_time
  FROM pg_stat_statements
  ORDER BY mean_exec_time DESC
  LIMIT 10;
"
```

## 🔄 Próximos passos (Fase 1+)

- [ ] **Fase 1.1**: Integração UAZAPI/Luniochat (WhatsApp)
- [ ] **Fase 1.2**: Integração N8N bidirecional
- [ ] **Fase 2**: OpenClaw + MCP server
- [ ] **Fase 3**: Backblaze B2 storage
- [ ] **Fase 4**: Landing page + Stripe
- [ ] **Fase 5**: Multi-tenant SaaS
- [ ] **Fase 6**: Self-hosted / licença

## 📚 Documentação adicional

- `SPRINT-22-FASE-0-DOCKER.md` — detalhes técnicos desta sprint
- `SPRINT-20-CONTRATOS.md` — pop-up Novo Contrato
- `SPRINT-21-TEMPLATES-AUTENTIQUE.md` — Templates + Autentique
- `SECURITY.md` — práticas de segurança

---

**Última atualização:** Sprint 22 — Fase 0 (Agosto 2026)
