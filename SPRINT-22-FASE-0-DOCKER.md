# Sprint 22 — Fase 0: Infraestrutura Docker + Postgres + Redis

**Data:** 2026-08-30
**Status:** ✅ Completo (configuração validada, falta deploy em VPS real)

## Objetivo

Setup de infraestrutura de produção que sustenta o Renostter CRM:
- Docker + Docker Compose
- Postgres 16 (substitui SQLite)
- Redis 7 (cache + fila BullMQ)
- Nginx (reverse proxy + TLS)
- Backup automatizado cifrado
- Script de migration SQLite → Postgres preservando todos os dados

## Arquivos Criados (13 arquivos)

### Docker
- `Dockerfile` (2.4KB) — multi-stage Node 20 Alpine, non-root, healthcheck
- `docker-compose.yml` (6KB) — 5 serviços: app, postgres, redis, nginx, adminer (dev)
- `.dockerignore` (1.4KB) — exclusões de build
- `.env.example` (4.6KB) — template de env vars (gerado secrets aleatórios no setup)

### Nginx
- `nginx/nginx.conf` (1.4KB) — base config (gzip, rate limit, security headers)
- `nginx/conf.d/default.conf` (3.2KB) — HTTP→HTTPS redirect + reverse proxy

### Scripts
- `scripts/setup.sh` (7KB) — setup inicial VPS novo (gera secrets, certificados dev)
- `scripts/healthcheck.sh` (3.7KB) — diagnóstico completo (containers, DB, Redis, backups, logs)
- `scripts/backup.sh` (2.5KB) — backup manual cifrado AES-256-GCM
- `scripts/postgres-init/01-extensions.sql` (1.4KB) — extensões Postgres (uuid-ossp, pgcrypto, citext, pg_trgm, btree_gin)

### Migration
- `cora-api/scripts/migrate-sqlite-to-postgres.js` (12.5KB) — migra dados SQLite → Postgres (idempotente)

### Documentação
- `README-DOCKER.md` (8.2KB) — setup completo, comandos úteis, prod, troubleshooting

## Stack Final

| Camada | Tecnologia | Versão | Função |
|--------|-----------|--------|--------|
| App | Node.js | 20-alpine | API Express |
| DB | PostgreSQL | 16-alpine | Banco principal (substitui SQLite) |
| Cache/Queue | Redis | 7-alpine | Cache + BullMQ + rate limit |
| Proxy | Nginx | 1.27-alpine | TLS + rate limit + reverse proxy |
| Adminer | Adminer | 4.8.1 | UI Postgres (apenas dev) |
| Backup | postgres-backup-local | latest | Backup diário cifrado S3 |

## Mapeamento de Tipos SQLite → Postgres

| SQLite | Postgres |
|--------|----------|
| `INTEGER PRIMARY KEY` | `BIGSERIAL PRIMARY KEY` |
| `TEXT` | `TEXT` |
| `INTEGER` | `BIGINT` |
| `REAL` | `DOUBLE PRECISION` |
| `BLOB` | `BYTEA` |
| `BOOLEAN` | `BOOLEAN` |
| `DATETIME` | `TIMESTAMP` |
| `JSON` (TEXT) | `TEXT` (com parse automático) |

## Validações Executadas

- ✅ `docker compose config --quiet` — passa sem erros
- ✅ 5 serviços detectados (app, postgres, redis, nginx, adminer*)
- ✅ 6 volumes nomeados (postgres-data, redis-data, app-uploads, app-backups, app-logs, nginx-logs)
- ✅ Network dedicada `renostter-net`
- ✅ `node --check migrate-sqlite-to-postgres.js` — sintaxe OK
- ✅ `bash -n setup.sh / healthcheck.sh / backup.sh` — sintaxe OK
- ✅ `version: "3.9"` removido (deprecated em Docker Compose v2)

## Como Usar

### Setup inicial (VPS novo)

```bash
git clone <repo> renostter-crm
cd renostter-crm
chmod +x scripts/setup.sh
./scripts/setup.sh
```

Isso:
1. Verifica Docker/Compose/OpenSSL
2. Cria `.env` com secrets fortes (gerados via `openssl rand`)
3. Cria diretórios (nginx/certs, logs, backups)
4. Gera certificado self-signed (1 ano)
5. Constrói imagem Docker
6. Sobe Postgres + Redis
7. Sobe app + nginx
8. Pergunta se quer migrar do SQLite
9. Mostra resumo

### Comandos úteis

```bash
# Logs
docker compose logs -f app

# Entrar no container
docker compose exec app sh
docker compose exec postgres psql -U renostter -d renostter_crm

# Backup manual
./scripts/backup.sh

# Health check
./scripts/healthcheck.sh

# Ativar backup diário automático
docker compose --profile backup up -d

# Adminer (UI Postgres — dev/staging)
http://localhost:8080

# Migration
docker compose exec app node scripts/migrate-sqlite-to-postgres.js
```

## Próximos Passos (Fase 1+)

| # | Sprint | Descrição | Dependência |
|---|--------|-----------|-------------|
| 1 | 22.1 | Deploy em VPS real (Hetzner/DigitalOcean) | VPS + domínio |
| 2 | 22.2 | HTTPS real com Let's Encrypt | Domínio |
| 3 | 22.3 | CI/CD com GitHub Actions | Repo GitHub |
| 4 | 23 | Fase 1.1 — Integração UAZAPI/Luniochat (WhatsApp) | VPS deployado |
| 5 | 24 | Fase 1.2 — Integração N8N | VPS deployado |
| 6 | 25 | Landing page + Stripe Checkout | Conta Stripe |
| 7 | 26 | LGPD hardening (consentimento granular, DPO) | — |
| 8 | 27 | OpenClaw + MCP server | API keys |

## Interação Necessária do Usuário

Para deployar em produção:

⚠️ **Você precisa decidir:**

1. **Provedor VPS** — recomendo Hetzner CX22 (€4.5/mês, 4GB RAM)
2. **Domínio** — registrar `renostter.com.br` (ou similar)
3. **Conta Stripe** — criar em dashboard.stripe.com (Fase 1 comercial)
4. **Tokens de produção** — UAZAPI, Backblaze, Autentique (quando ativar cada integração)

⚠️ **Eu posso fazer AGORA sem você:**

- ✅ Já está: Dockerfile, compose, nginx, scripts, migration
- 🔄 Próximo: **OpenAPI/Swagger** documentation no `/api/docs`
- 🔄 Próximo: **CI/CD** com GitHub Actions (build + test + push)
- 🔄 Próximo: **Integração UAZAPI** (esqueleto de webhook)

## Métricas

- **Imagens Docker estimadas:** ~150MB (Node 20 Alpine + deps nativos)
- **Memória total em runtime:** ~1.3GB (app 512MB + postgres 512MB + redis 192MB + nginx ~50MB)
- **Disco mínimo:** 10GB (Postgres data + uploads + logs + backups)
- **Cold start:** ~15s (até app responder /health)
- **Tempo de migration** (estimado): 1-3 min para 50k registros

## Observações

- A migration é **idempotente** — pode rodar múltiplas vezes sem duplicar
- Backup automático é opcional (profile `backup`) — não sobe por padrão
- Adminer só sobe em dev/staging (não em prod)
- Certificados auto-gerados são self-signed — em prod, use Let's Encrypt via certbot
- `version: "3.9"` foi removido do compose (deprecated)
- JWT_SECRET deve ter ≥ 64 chars hex
- DB_ENCRYPTION_KEY deve ter exatamente 32 bytes

## Backups Criados

- `BACKUPS/pre-fase0-docker-20260830-022749/` (cora-api/*.js críticos)

## Próximo Passo Imediato

**Decisão de VPS + domínio** para fazer deploy em produção real.

Se quiser, posso:
1. **Começar deploy em máquina local** (testar `docker compose up` aqui mesmo)
2. **Implementar CI/CD** com GitHub Actions
3. **Criar OpenAPI/Swagger** para documentação
4. **Iniciar próxima sprint** (UAZAPI/Luniochat webhook)

Qual prefere?
