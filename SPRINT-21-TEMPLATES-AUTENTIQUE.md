# Sprint 21 — Módulo de Templates de Contrato + Integração Autentique

**Data:** 2026-08-29
**Status:** ✅ Completo (19/20 testes E2E passando)

## Resumo

Implementação completa do módulo de Templates de Contrato com integração Autentique para assinatura digital. Resolve o bug "Cannot read properties of undefined (reading 'filter')" e adiciona geração + envio de contratos para assinatura.

## Bug Corrigido

`admin/contract-templates.html` linha 213: `templates.filter(...)` quebrava porque `templates` ficava `undefined` quando a chamada à API falhava.

**Solução:** Defensive coding — `Array.isArray(templates) ? templates : []` antes do filter, try/catch em todos os pontos críticos.

## Backend (6 arquivos)

### Novos
- `cora-api/services/AutentiqueService.js` (6.7KB) — Wrapper GraphQL com modo MOCK
- `cora-api/routes/autentique-webhook.js` (4.5KB) — Recebe webhooks do Autentique
- `cora-api/scripts/test-templates-autentique.js` (6.9KB) — 20 testes E2E

### Modificados
- `cora-api/database.js` — Tabela `contratos_gerados` + 4 índices
- `cora-api/routes/contract-templates.js` (21KB) — 9 endpoints (rotas reordenadas)
- `cora-api/server.js` — Registra webhook
- `cora-api/middleware/authJWT.js` — CUSTOM_AUTH_PATHS inclui /api/webhooks/autentique
- `cora-api/.env` — Bloco AUTENTIQUE comentado (modo MOCK default)

## Frontend

- `admin/contract-templates.html` (modais novos):
  - Modal "Gerar Contrato" — cliente, contrato, signatários dinâmicos, enviar Autentique
  - Modal "Contratos Gerados" — tabela com status, sync, link direto
  - Botão verde "📄 Gerar Contrato" em cada card
  - Botão "📨 Contratos Gerados" no topo

## Endpoints REST (Sprint 21)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/contract-templates/autentique/status` | Healthcheck Autentique |
| POST | `/api/contract-templates/gerar` | Gera contrato + envia Autentique |
| GET | `/api/contract-templates/contratos-gerados` | Lista contratos gerados |
| GET | `/api/contract-templates/contratos-gerados/:id` | Detalhe |
| POST | `/api/contract-templates/contratos-gerados/:id/enviar` | Envia para Autentique |
| GET | `/api/contract-templates/contratos-gerados/:id/status` | Sync status com Autentique |
| POST | `/api/webhooks/autentique` | Webhook (validado com HMAC SHA-256) |
| GET | `/api/webhooks/autentique/health` | Healthcheck webhook |

## Fluxo Completo

1. **Admin cria template** (HTML com placeholders `{{cliente.nome}}`, `{{contrato.valor_mensal}}`, etc.)
2. **Admin clica "Gerar Contrato"** no template
3. **Seleciona cliente** (preenche automaticamente variáveis do cliente)
4. **Adiciona signatários** (nome + email)
5. **Marca "Enviar para Autentique"**
6. **Backend**:
   - Renderiza template substituindo placeholders
   - Salva em `contratos_gerados` (status=pendente)
   - Chama `AutentiqueService.createDocument()` com base64
   - Atualiza com `autentique_document_id` (status=enviado)
7. **Autentique envia emails/SMS para signatários**
8. **Webhook recebe eventos** (signed/rejected/canceled)
9. **Status sincronizado** automaticamente no ERP

## Tabela `contratos_gerados`

```sql
CREATE TABLE contratos_gerados (
    id TEXT PRIMARY KEY,
    template_id TEXT,
    contrato_id TEXT,
    cliente_id TEXT,
    nome_documento TEXT NOT NULL,
    autentique_document_id TEXT,
    autentique_short_url TEXT,
    status TEXT DEFAULT 'pendente',
    signers_json TEXT,
    pdf_path TEXT,
    html_renderizado TEXT,
    erro TEXT,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    data_envio DATETIME,
    data_assinatura DATETIME
);
```

## Testes E2E (19/20 ✅)

- Login, Autentique status, Webhook health
- Listar/seed templates
- Gerar contrato (mock Autentique retorna ID)
- Contratos gerados (lista + detalhe)
- Status sync (sent → enviado)
- 4 validações de erro
- 4 cenários de webhook
- Extract vars

## Modo MOCK vs LIVE

### Modo MOCK (atual, dev)
- `AUTENTIQUE_TOKEN` ausente
- `createDocument()` retorna `{id: 'mock-xxx', short_url: 'https://app.autentique.com.br/mock/...', status: 'sent'}`
- Webhooks sem secret — aceita sem validação
- NÃO envia nada real

### Modo LIVE (produção)
```bash
# .env
AUTENTIQUE_TOKEN=seu-token-do-painel-autentique
AUTENTIQUE_WEBHOOK_SECRET=secret-configurado-no-painel
AUTENTIQUE_SANDBOX=true  # ou false para produção real
```

## Backups

- `BACKUPS/pre-templates-sprint21-20260829-111415/`

## Próximas Melhorias

- HTML → PDF real (PDFLib/Puppeteer) antes de enviar
- Importar templates pré-definidos do Autentique (emailTemplates)
- Painel do cliente para assinar pelo portal Renostter
- Monitoramento de uso da API (limite 60 req/min)
- Versionamento de templates
- Assinatura em lote
