# 🚀 Sprint 8 — Automação de Contratos (CONCLUÍDA)

**Status:** ✅ **Concluída** (Email + Assinatura Digital + Automação + Webhook)
**Data:** Agosto 2026
**Owner:** Time Renostter

> Sprint 8 entrega o **fluxo automatizado de contrato**:
> cria contrato → gera PDF → envia pra Autentique → cliente assina → webhook
> → ativa contrato → emite 1ª cobrança → tudo auditado.

---

## 🎯 O que está pronto

| Componente | Status | Função |
|---|:---:|---|
| 📧 **Email (Resend)** | ✅ | 3.000/mês grátis, API moderna |
| ✍️ **Assinatura (Autentique)** | ✅ | R$ 0,073/contrato, GraphQL + upload multipart |
| 📄 **PDF Generator** | ✅ | Templates HTML → PDF (3 engines: puppeteer, pdf-lib, minimal) |
| 🔄 **ContractAutomation** | ✅ | Orquestra todo o ciclo de vida |
| 🌐 **6 endpoints REST** | ✅ | Send/sign/status/reminders/renewals/templates |
| 🪝 **Webhook Autentique** | ✅ | HMAC + eventos: signed/refused/expired |
| 📚 **Auditoria completa** | ✅ | Cada passo registrado |

---

## 📦 Arquivos Criados (7)

| Arquivo | LOC | Função |
|---|:---:|---|
| `cora-api/infra/email.js` | 260 | Resend wrapper + 4 templates (for-signature, signed, reminder, renewal) |
| `cora-api/infra/signature.js` | 220 | Autentique GraphQL + upload multipart |
| `cora-api/services/PdfGenerator.js` | 230 | Template → PDF (3 engines) com fallbacks |
| `cora-api/services/ContractAutomation.js` | 350 | Orquestra: criar contrato → enviar → webhook → ativar |
| `cora-api/routes/contracts-automation.js` | 180 | 6 endpoints REST |
| `cora-api/routes/webhooks-signature.js` | 120 | POST /api/webhooks/autentique com HMAC |
| `cora-api/scripts/test-sprint8.js` | 90 | Teste end-to-end |

## ✏️ Modificados (3)

| Arquivo | Mudança |
|---|---|
| `cora-api/server.js` | +2 routers registrados |
| `cora-api/.env.example` | +RESEND_API_KEY, AUTENTIQUE_TOKEN, AUTENTIQUE_WEBHOOK_SECRET, PDF_ENGINE |
| `cora-api/package.json` | +2 scripts npm (`test:sprint8`, `rotate:autentique`, `rotate:resend`) |

**Total Sprint 8: ~1.450 linhas adicionadas**

---

## 🧪 Validação

```bash
# Syntax check
node --check cora-api/infra/email.js
node --check cora-api/infra/signature.js
node --check cora-api/services/PdfGenerator.js
node --check cora-api/services/ContractAutomation.js
node --check cora-api/routes/contracts-automation.js
node --check cora-api/routes/webhooks-signature.js
node --check cora-api/server.js
# Todos passam: ✅

# Test end-to-end
npm run test:sprint8
# ✅ Cria envelope real na Autentique (sandbox)
# ✅ ID: 87d828f6c7d98d671fafae67a6e95f2fccd6cfef620ef9a5f
# ✅ PDF gerado: 1354 bytes
# ✅ Email enviado (Resend)
```

---

## 🌐 Endpoints REST adicionados

| Método | Endpoint | Função |
|---|---|---|
| `POST` | `/api/contracts/:id/send-for-signature` | Envia contrato pra Autentique + e-mail |
| `GET` | `/api/contracts/:id/signature-status` | Status do envelope (signatários, deadline) |
| `POST` | `/api/contracts/:id/send-reminders` | Reenvia e-mail de lembrete |
| `POST` | `/api/contracts/process-renewals` | (cron) Processa renovações 60d antes |
| `GET` | `/api/contracts/templates` | Lista templates disponíveis |
| `GET` | `/api/contracts/integrations/status` | Informa se Email/Assinatura estão OK |
| `POST` | `/api/webhooks/autentique` | Recebe eventos da Autentique (HMAC) |

---

## 📧 Templates de E-mail (4 prontos)

| Template | Quando | Cor |
|---|---|---|
| `sendContractForSignature` | Quando envia pra assinatura | 🔵 Azul (ação) |
| `sendContractSigned` | Quando todos assinam | 🟢 Verde (sucesso) |
| `sendSignatureReminder` | D+2, D+5, D+7 sem assinar | 🟠 Laranja (alerta) |
| `sendContractRenewal` | 60 dias antes do vencimento | 🔵 Azul (renovação) |

Todos responsivos, dark mode, com CTA claro e link de fallback.

---

## 🔄 Fluxo End-to-End

```
[Admin] Cria contrato (ContratoManager)
        ↓
[Admin] POST /api/contracts/:id/send-for-signature
        ↓
[ContractAutomation.sendForSignature]
  ├─ 1. PdfGenerator: template HTML → PDF (1.3KB)
  ├─ 2. Autentique: cria envelope (sandbox=false)
  ├─ 3. Salva envelope_id no contrato (observacoes)
  └─ 4. Audit: SEND_FOR_SIGNATURE_COMPLETED
        ↓
[Autentique] Envia e-mail ao cliente com link
        ↓
[Cliente] Assina via SMS/WhatsApp/Email
        ↓
[Autentique] POST /api/webhooks/autentique
        ↓
[ContractAutomation.processWebhook]
  ├─ 1. Verifica assinatura HMAC
  ├─ 2. Busca contrato por envelope_id
  ├─ 3. Marca como Ativo (todos assinaram)
  ├─ 4. E-mail de confirmação ao cliente
  └─ 5. Trigger: emitir 1ª cobrança (CobrancaManager)
        ↓
[Admin] Vê no painel: contrato ATIVO + 1ª cobrança gerada
```

---

## 💰 Custo Real (validação com API real)

### Resend
- **Teste enviado**: ✅ ID `a6d9dc78-7043-4022-ba53-342a21b2f4a4`
- Plano free: 3.000/mês (100/dia) — cobre o MVP
- Custo por e-mail: **$0** em dev, **$0.0004** em produção

### Autentique
- **Teste criado**: ✅ ID `87d828f6c7d98d671fafae67a6e95f2fccd6cfef620ef9a5f`
- Modo: sandbox (não conta na fatura)
- Custo por contrato com 1 signatário: **R$ 0,073**
- Custo por contrato com 2 signatários: **R$ 0,086**

---

## 🔐 Próximos passos de Segurança

⚠️ **IMPORTANTE — As chaves de API foram compartilhadas via chat e ficaram expostas no histórico da conversa.**

**Rotacione IMEDIATAMENTE:**

1. **Resend** — `https://resend.com/api-keys`
   - Clique "Delete" na chave atual
   - Crie nova chave
   - Atualize `RESEND_API_KEY` no `.env`

2. **Autentique** — `https://painel.autentique.com.br/perfil/api`
   - Clique "Revogar" no token atual
   - Gere novo token
   - Atualize `AUTENTIQUE_TOKEN` no `.env`

3. **Webhook Secret** (se você for usar webhook real):
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   Coloque em `AUTENTIQUE_WEBHOOK_SECRET` no `.env`

**Após rotacionar, rode novamente para validar:**
```bash
npm run test:sprint8
```

---

## 📚 Para usar em produção (próximos passos)

1. **Configurar webhook no painel Autentique**
   - URL: `https://api.renostter.com/api/webhooks/autentique`
   - Eventos: `document.signed`, `document.refused`, `document.expired`
   - Secret: mesmo do `AUTENTIQUE_WEBHOOK_SECRET`

2. **Verificar domínio no Resend**
   - Adicionar registros DNS (DKIM, SPF, DMARC)
   - Trocar `RESEND_FROM` para `noreply@renostter.com.br`

3. **Instalar puppeteer** (PDF melhor)
   ```bash
   npm install puppeteer
   ```
   PDF agora usa fallback "minimal". Puppeteer renderiza HTML/CSS completo.

4. **Criar templates customizados**
   - Pasta: `cora-api/templates/contracts/`
   - Formato: HTML com placeholders `{{cliente.nome}}`, `{{contrato.id}}`
   - Listar com: `GET /api/contracts/templates`

5. **Ativar cron de renovações**
   - Adicionar no `server.js`:
     ```js
     cron.schedule('0 9 * * *', () => require('./services/ContractAutomation').processRenewals());
     ```
   - Roda todo dia às 9h, processa contratos vencendo em 30-60 dias

---

## 🛠️ Como você testa HOJE

```bash
# 1. Configure .env com as chaves (você já me mandou)
# 2. Rode o teste end-to-end
cd cora-api
npm run test:sprint8

# 3. Verifica o envelope na Autentique
# Abra https://app.autentique.com.br/contracts/<id>
# (use o ID retornado pelo teste)

# 4. Assine o documento
# 5. Veja a auditoria no SQLite
sqlite3 cora.sqlite "SELECT * FROM logs_auditoria WHERE entidade='contrato_automation' ORDER BY created_at DESC LIMIT 10"
```

---

## 🗣️ Próximas sprints sugeridas

| Sprint | Foco | Esforço |
|---|---|---|
| 9 | Renovação + WhatsApp + Lembrete | 1 semana |
| 10 | ICP-Brasil A1 (assinatura qualificada Lei 14.063) | 1 semana |
| 11 | Templates customizados + UI admin para gerenciar | 1 semana |
| 12 | Integração Contabil (Conta Azul/Omie) | 1-2 semanas |

**Qual direção?** 🎯

OBS: O backup em `BACKUPS/pre-sprint4-20260824-012041/` continua válido. Se quiser, crio um **terceiro backup** (pré-Sprint 8) antes de qualquer mudança grande. É só falar.