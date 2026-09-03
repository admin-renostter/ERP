# 🧪 Guia de Teste Local — Renostter CRM

**Validação end-to-end do Sprint 0 → Sprint 4 → Sprint 6**

Este documento mostra como você pode validar **toda a stack** no seu ambiente (Linux/Mac/VPS) sem precisar de UI.

---

## 🎯 O que você pode validar aqui

| # | Validação | Comando | Espera |
|---|---|---|---|
| 1 | Estrutura de arquivos OK | `ls -la cora-api/{mcp,llm,openclaw,infra,routes,middleware,scripts}/` | Pastas existem |
| 2 | Sintaxe de todos os JS | `node --check cora-api/server.js` (e outros) | Exit 0 |
| 3 | Sprint 0 (segurança) | `npm run verify:sprint0` | 23/23 OK |
| 4 | Smoke test (boot) | `npm run smoke` | 41/41 OK |
| 5 | Simulação Claude ↔ MCP | `node scripts/simulate-conversation.js` | 3 cenários |
| 6 | Subir stack completo | `docker compose up -d` | Containers rodando |
| 7 | Health check | `curl http://localhost:3000/health/ready` | status: ready |
| 8 | Login JWT | `curl -X POST .../api/auth/login` | accessToken |
| 9 | Listar tools MCP | `curl .../mcp/tools -H Bearer` | 8 tools |
| 10 | Test MCP end-to-end | `npm run test:mcp` | 13/13 OK |
| 11 | OpenClaw YAML | `curl .../mcp/openclaw.yaml` | YAML válido |
| 12 | Backup validado | — | ZIP descompacta |

---

## 🚀 Passo-a-passo (no seu Linux/Mac/VPS)

### Pré-requisitos

- Node.js 20+ (`node --version`)
- Docker 20+ + Docker Compose v2 (`docker --version` e `docker compose version`)
- 8 GB RAM disponível
- 5 GB de disco

### 1. Clonar/copiar o projeto

```bash
# Se você ainda não tem, copie o workspace do Windows
# (ou use scp/rsync pra trazer pra VPS)
scp -r renostter-crm usuario@sua-vps:/opt/
cd /opt/renostter-crm
```

### 2. Validação rápida (sem subir nada)

```bash
# Smoke test (não precisa de DB/rede)
cd cora-api
npm install
npm run smoke
# Esperado: "✅ Smoke test passou. Sistema pronto para subir." (41/41)

# Verificar Sprint 0
npm run verify:sprint0
# Esperado: "✅ Todos os critérios de aceite do Sprint 0 foram satisfeitos." (23/23)

# Simular conversa Claude (não precisa de LLM/DB)
node scripts/simulate-conversation.js
# Esperado: 3 cenários exibidos, com payloads JSON reais
```

### 3. Subir o stack completo (Docker Compose)

```bash
cd /opt/renostter-crm

# Copia env vars
cp cora-api/.env.example cora-api/.env

# Gera chaves fortes
node -e "console.log('DB_ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'))" >> cora-api/.env
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(64).toString('base64'))" >> cora-api/.env
node -e "console.log('WEBHOOK_WEBHOOK_SECRET=' + require('crypto').randomBytes(32).toString('hex'))" >> cora-api/.env
node -e "console.log('MCP_SERVICE_TOKEN=' + require('crypto').randomBytes(32).toString('hex'))" >> cora-api/.env

# Sobe o stack (API + Postgres + Redis + MinIO + Frontend)
docker compose up -d

# Acompanha os logs
docker compose logs -f cora-api
```

### 4. Validar saúde

```bash
# Aguarda ~30s pro Postgres inicializar
sleep 30

# Health check básico
curl http://localhost:3000/health
# {"status":"ok","timestamp":"...","services":{"database":"ok","redis":"ok"}}

# Liveness
curl http://localhost:3000/health/live
# {"status":"ok","uptime_s":42,...}

# Readiness
curl http://localhost:3000/health/ready
# {"status":"ready","checks":{"db":"ok","redis":"ok"}}
```

### 5. Criar usuários de teste

```bash
docker compose exec cora-api node scripts/seed-users.js
# Senha padrão: Renostter@2026
# (mude com: docker compose exec cora-api node scripts/seed-users.js -- --password=MinhaS3nha!)
```

### 6. Testar login JWT

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@renostter.com","password":"Renostter@2026"}'
```

Resposta esperada:
```json
{
  "success": true,
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "tokenType": "Bearer",
  "expiresIn": "2h",
  "user": {
    "id": "usr-admin-001",
    "email": "admin@renostter.com",
    "name": "Administrador",
    "role": "admin"
  }
}
```

### 7. Testar o MCP

```bash
# Pega o token de serviço
MCP_TOKEN=$(grep MCP_SERVICE_TOKEN cora-api/.env | cut -d= -f2)

# Health do MCP
curl http://localhost:3000/mcp/health

# Lista tools
curl -H "Authorization: Bearer $MCP_TOKEN" http://localhost:3000/mcp/tools

# Gera config OpenClaw
curl -H "Authorization: Bearer $MCP_TOKEN" http://localhost:3000/mcp/openclaw.yaml

# Test suite completa
cd cora-api
MCP_SERVICE_TOKEN=$MCP_TOKEN npm run test:mcp
```

### 8. Instalar Claude Desktop (opcional — para testar IA real)

#### macOS
```bash
# Baixa de https://claude.ai/download
# Configura em ~/Library/Application Support/Claude/claude_desktop_config.json:
```

#### Config JSON
```json
{
  "mcpServers": {
    "renostter": {
      "command": "node",
      "args": ["/opt/renostter-crm/cora-api/mcp/server.js"],
      "env": {
        "MCP_SERVICE_TOKEN": "<seu_token>",
        "RENOSTTER_API_URL": "http://localhost:3000"
      }
    }
  }
}
```

Reinicie o Claude Desktop. Agora você pode pedir:
- "Liste os clientes ativos do Renostter"
- "Crie um chamado para o cliente João Silva sobre ar com barulho"
- "Quais são as faturas em aberto?"

### 9. Conectar OpenClaw (opcional)

```bash
# 1. Pega o YAML
curl -H "Authorization: Bearer $MCP_TOKEN" \
  http://localhost:3000/mcp/openclaw.yaml > ~/.config/openclaw/agents/renostter.yaml

# 2. Substitui o token
sed -i "s/\${MCP_SERVICE_TOKEN}/$MCP_TOKEN/" ~/.config/openclaw/agents/renostter.yaml

# 3. Conecta WhatsApp
openclaw channel add whatsapp --qr

# 4. Manda um "oi" do seu celular pro WhatsApp Business
```

---

## 🐛 Troubleshooting

### API não sobe

```bash
# Logs
docker compose logs --tail=200 cora-api

# Variáveis
docker compose exec cora-api env | grep -E "DB_|JWT_|MCP_"
```

### Postgres demora pra inicializar

```bash
# Normal na primeira vez (~30s)
docker compose logs -f postgres
# Esperado: "database system is ready to accept connections"
```

### "MCP_SERVICE_TOKEN not configured"

```bash
# Adicione ao .env
echo "MCP_SERVICE_TOKEN=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")" >> cora-api/.env
docker compose restart cora-api
```

### Claude Desktop não vê o MCP

```bash
# Caminho do config:
#   macOS:   ~/Library/Application Support/Claude/claude_desktop_config.json
#   Windows: %APPDATA%/Claude/claude_desktop_config.json

# Verifique se o caminho do node está absoluto
which node
# Use o caminho completo no config, ex: /usr/local/bin/node
```

### OpenClaw não conecta

```bash
# Verifique:
# 1. WhatsApp Business está ativo
# 2. Token MCP está correto no YAML
# 3. API está acessível de fora (Cloudflare Tunnel ou expor porta)
```

---

## ✅ Checklist de Validação

Antes de declarar "funcionando em prod":

- [ ] `npm run smoke` passa (41/41)
- [ ] `npm run verify:sprint0` passa (23/23)
- [ ] `docker compose up -d` sobe sem erro
- [ ] `curl /health/ready` retorna `status: ready`
- [ ] Login JWT retorna `accessToken`
- [ ] `curl /mcp/tools` lista 8 tools
- [ ] `npm run test:mcp` passa (13/13)
- [ ] Claude Desktop vê as tools e responde a uma pergunta
- [ ] OpenClaw conecta WhatsApp e responde a um "oi"
- [ ] Backup `BACKUPS/pre-sprint4-20260824-012041.zip` descompacta e tem MANIFEST + RESTORE

---

## 📞 Reportar problemas

Ao reportar um bug, inclua:
- Saída de `npm run smoke`
- Saída de `npm run verify:sprint0`
- `docker compose logs cora-api --tail=200`
- Versão do Node (`node --version`)
- SO e versão (`uname -a` ou `ver`)
