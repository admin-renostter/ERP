# 🤖 MCP + LLM + OpenClaw — Integração de IA no Renostter CRM

**Sprint 6 — Diferencial competitivo**

Este documento explica como o Renostter CRM expõe suas funcionalidades para sistemas de IA (LLMs, agentes, OpenClaw) através do **Model Context Protocol (MCP)**.

---

## 🎯 Visão Geral

```
┌──────────┐    ┌─────────────┐    ┌──────────────┐
│ Cliente  │───▶│  OpenClaw   │───▶│ LLM (Claude) │
│ WhatsApp │    │  Gateway    │    │ + MCP tools  │
└──────────┘    └─────────────┘    └──────┬───────┘
                                        │
                                        ▼
                              ┌──────────────────┐
                              │  Renostter CRM   │
                              │  MCP Server      │
                              │  (8 tools)       │
                              └──────────────────┘
```

**O que muda:** seu ERP deixa de ser um sistema passivo (esperando o humano abrir o painel) e vira um **sistema ativo** que pode ser **chamado por IAs** em qualquer canal.

---

## 🧰 Os 8 Tools MCP Expostos

| Tool | Categoria | O que faz |
|---|---|---|
| `listar_faturas_cliente` | financeiro | Lista boletos/faturas com status, valor, vencimento, PDF |
| `consultar_status_chamado` | atendimento | "Como está meu chamado?" — status, técnico, SLA |
| `abrir_chamado` | atendimento | Cria OS a partir do relato do cliente |
| `consultar_cliente` | clientes | Busca cliente por ID, email ou telefone |
| `listar_equipamentos_cliente` | clientes | Lista ar-condicionados do cliente (marca, BTU, local) |
| `agendar_visita_tecnica` | atendimento | Agenda data/período para visita técnica |
| `solicitar_segunda_via_boleto` | financeiro | Reenvia boleto por email + retorna link do PDF |
| `consultar_contrato` | contratos | Tipo de plano, valor, SLA, data de renovação |

**Tools que exigem confirmação** (marcados com `requires_confirmation: true`):
- `abrir_chamado`
- `agendar_visita_tecnica`
- `solicitar_segunda_via_boleto`

O LLM deve **confirmar com o cliente antes** de executar essas ações.

---

## 🚀 Como funciona na prática

### Cenário 1 — Cliente pergunta sobre boleto no WhatsApp

```
Cliente: "oi, tô com problema pra pagar meu boleto, vc consegue me mandar de novo?"

OpenClaw (gateway): recebe o áudio/texto, envia pro LLM

LLM (Claude) pensa:
  "O cliente quer segunda via do boleto. Preciso primeiro identificar quem é ele."
  → Tool: consultar_cliente(telefone="+5511958918398")
  → Resposta: { id: "cli-123", nome: "João Silva" }
  "Agora vou buscar a fatura em aberto."
  → Tool: listar_faturas_cliente(cliente_id="cli-123", status="PENDING")
  → Resposta: [{ id: "cob_abc", valor: 350, vencimento: "2026-08-30" }]
  "Vou enviar a segunda via."
  → Tool: solicitar_segunda_via_boleto(cobranca_id="cob_abc")
  → Resposta: { pdf_url: "https://...", barcode: "..." }

LLM responde: "Claro João! Te enviei o boleto no seu email. 
              Aqui também está o link: https://..."

OpenClaw: formata e envia no WhatsApp
```

### Cenário 2 — Cliente relata problema

```
Cliente (áudio): "meu ar condicionado do escritório tá pingando água, 
                 já tem 3 dias assim, tô preocupado"

OpenClaw transcreve (Whisper) → texto

LLM:
  → consultar_cliente(telefone="...")
  → listar_equipamentos_cliente(cliente_id="...")
  → Resposta: [{ id: "eq-789", marca: "Carrier", modelo: "X", local: "Escritório" }]
  "Vou abrir um chamado de manutenção corretiva, prioridade alta."
  → abrir_chamado(cliente_id="cli-123", categoria="Manutenção Corretiva",
                  prioridade="Alta", descricao="Equipamento pingando há 3 dias no escritório",
                  equipamento_id="eq-789")

LLM: "Abri o chamado #chm_4567. Um técnico vai te ligar nas próximas 2 horas."
```

---

## 🦅 Integração com OpenClaw (clawd.bot)

### Setup

#### 1. Gerar Service Token

```bash
cd cora-api
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Adicione ao .env:
echo "MCP_SERVICE_TOKEN=<valor_gerado>" >> .env
```

#### 2. Deploy do OpenClaw

Você pode rodar o OpenClaw na mesma VPS onde já tem o N8N (209.50.227.39).

```bash
# SSH na VPS
ssh usuario@209.50.227.39

# Instalar OpenClaw
npm install -g clawd
# ou via Docker
docker run -d --name openclaw \
  -p 3000:3000 \
  -e RENOSTTER_API_URL=https://api.renostter.com \
  -e MCP_SERVICE_TOKEN=<seu_token> \
  clawd/openclaw:latest
```

#### 3. Configurar o agent Renostter no OpenClaw

Acesse `https://api.renostter.com/mcp/openclaw.yaml` para pegar o YAML pronto.

```bash
# Crie a pasta de config do OpenClaw
mkdir -p ~/.config/openclaw/agents

# Copie o YAML
curl -H "Authorization: Bearer <MCP_SERVICE_TOKEN>" \
  https://api.renostter.com/mcp/openclaw.yaml \
  > ~/.config/openclaw/agents/renostter.yaml

# Edite o token
sed -i 's/${MCP_SERVICE_TOKEN}/<seu_token>/' \
  ~/.config/openclaw/agents/renostter.yaml

# Reinicie o OpenClaw
systemctl restart openclaw
```

#### 4. Conectar WhatsApp

```bash
# No OpenClaw
openclaw channel add whatsapp --qr
# Escaneie o QR Code com o app do WhatsApp Business
```

#### 5. Testar

```bash
# De outro número, mande uma mensagem pro WhatsApp Business:
"oi, quero ver meus boletos"

# O OpenClaw recebe → LLM processa → ERP responde
```

---

## 🧪 Como testar a integração

### 1. Listar tools disponíveis

```bash
curl -H "Authorization: Bearer <MCP_SERVICE_TOKEN>" \
  https://api.renostter.com/mcp/tools
```

Resposta:
```json
{
  "success": true,
  "provider": "renostter-crm",
  "version": "0.1.0",
  "total": 8,
  "tools": [...]
}
```

### 2. Executar uma tool manualmente

```bash
curl -X POST \
  -H "Authorization: Bearer <MCP_SERVICE_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"tool":"listar_faturas_cliente","arguments":{"cliente_id":"cli-123","status":"PENDING"}}' \
  https://api.renostter.com/mcp/exec
```

### 3. Health check

```bash
curl https://api.renostter.com/mcp/health
# {"success":true,"mcp_server":"renostter-crm","tools_available":8,"uptime_s":1234}
```

### 4. Testar com Claude Desktop (stdio)

Adicione em `~/Library/Application Support/Claude/claude_desktop_config.json`:

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

Reinicie o Claude Desktop. Agora você pode perguntar coisas como:
- "Liste os clientes com faturas em atraso"
- "Crie um chamado para o cliente X sobre ar-condicionado com barulho"

---

## 🔐 Segurança

### Service Token

- Token dedicado (separado do JWT de usuários)
- Pode ser rotacionado a qualquer momento (invalida TODAS as sessões OpenClaw)
- **NÃO compartilhe** com ninguém além do OpenClaw
- Não tem `userId` (todas as ações são registradas como `source: 'openclaw'`)

### Audit Log

Cada invocação é registrada em `mcp_invocations`:

```sql
SELECT * FROM mcp_invocations ORDER BY created_at DESC LIMIT 50;
```

Colunas:
- `tool` — qual tool foi chamado
- `args_json` — argumentos (sanitizados, sem senhas/CPF)
- `result` — 'ok' ou 'error'
- `error` — mensagem se erro
- `duration_ms` — duração
- `source` — 'mcp' ou 'openclaw'
- `created_at` — timestamp

### Rate Limit no LLM

- Por userId: 100 chamadas/hora
- Budget diário: $10 USD (configurável via `LLM_DAILY_BUDGET_USD`)
- Se exceder, retorna 429 com mensagem clara

---

## 💰 Custos Estimados (LLM)

**Claude Sonnet 4.5:**
- Input: $3 / 1M tokens
- Output: $15 / 1M tokens

**Cenário médio (1 conversa WhatsApp):**
- ~500 tokens input (system + tools + contexto)
- ~200 tokens output (resposta)
- **Custo por conversa: ~$0.005** (meio centavo)

**Com 1.000 conversas/mês:** ~$5/mês
**Com 10.000 conversas/mês:** ~$50/mês

Para reduzir custo, use `claude-haiku-4-5`:
- Input: $0.80 / 1M tokens
- Output: $4.00 / 1M tokens
- **Custo: 4x mais barato**, qualidade ligeiramente inferior

---

## 🚦 Próximos passos

| Tarefa | Esforço | Prioridade |
|---|---|:---:|
| Speech-to-text (Whisper) para áudios WhatsApp | 1 dia | 🟠 Alta |
| Adicionar tools: `cancelar_chamado`, `reagendar`, `criar_orcamento` | 1-2 dias | 🟠 Alta |
| RAG com base de conhecimento (já implementado, falta UI) | 2 dias | 🟡 Média |
| Streaming de respostas (SSE) | 1 dia | 🟡 Média |
| Multi-tenant (cada cliente vê só seus dados) | 2 dias | 🟠 Alta |
| Cache de embeddings no Postgres (pgvector) | 1 dia | 🟡 Média |
| Fine-tuning do prompt do agente | contínuo | 🟢 Baixa |

---

## 📞 Suporte

- Docs MCP: https://modelcontextprotocol.io/
- OpenClaw: https://docs.clawd.bot/
- Anthropic: https://docs.anthropic.com/
- Issues: `cora-api/mcp/` no repositório
