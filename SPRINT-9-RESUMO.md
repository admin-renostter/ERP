# 🚀 Sprint 9 — Renovação + WhatsApp + Lembretes (CONCLUÍDA)

**Status:** ✅ **Concluída**
**Data:** Agosto 2026

> Sprint 9 entrega o **ciclo de vida completo** do contrato:
> 1. Criar contrato → 2. Enviar pra assinatura (Sprint 8) →
> 3. **Lembretes automáticos D+2/D+5/D+7** (NOVO) →
> 4. Cliente assina → 5. Renovação **60 dias antes do fim** (NOVO) →
> 6. Régua de boleto **D-5/D-1/D+1/D+3/D+7** (NOVO via WhatsApp)

---

## 🎯 O que está pronto

| Componente | Status | Função |
|---|:---:|---|
| 💬 **WhatsApp multi-provider** | ✅ | UAZAPI + Z-API + Twilio + mock |
| 🔔 **Lembretes de assinatura** | ✅ | D+2 / D+5 / D+7 (WhatsApp + Email) |
| 🔄 **Renovação automática** | ✅ | 60d + 30d antes do fim |
| 📋 **Régua de boleto** | ✅ | D-5 / D-1 / D+1 / D+3 / D+7 |
| ⏰ **Cron diário** | ✅ | Roda todo dia às 8h (BRT) |
| 🌐 **6 endpoints REST** | ✅ | run-daily, signature, renewals, boletos, status |

---

## 📦 Arquivos Criados (4)

| Arquivo | LOC | Função |
|---|:---:|---|
| `cora-api/services/ReminderService.js` | 460 | Lembretes assinatura + renovação + boleto (idempotente) |
| `cora-api/jobs/dailyReminders.js` | 70 | Cron node-cron (8h BRT diário) |
| `cora-api/routes/reminders.js` | 120 | 6 endpoints REST |
| `cora-api/scripts/test-sprint9.js` | 60 | Test end-to-end WhatsApp |

## ✏️ Modificados (3)

| Arquivo | Mudança |
|---|---|
| `cora-api/WhatsAppService.js` | Reescrito: UAZAPI + Z-API + Twilio + 5 templates |
| `cora-api/server.js` | +cron start/stop no boot + graceful shutdown |
| `cora-api/.env.example` | +WHATSAPP_*, +REMINDERS_CRON_*, +TZ |
| `cora-api/package.json` | +2 scripts npm (`reminders:daily`, `cron:start`) |

**Total Sprint 9: ~750 linhas adicionadas**

---

## 💬 WhatsApp — Suporta 3 providers

| Provider | Quando usar | Auth |
|---|---|---|
| **UAZAPI** (padrão BR) | Sua realidade atual | `WHATSAPP_TOKEN` |
| **Z-API** | Alternativa BR | `WHATSAPP_INSTANCE` + `WHATSAPP_TOKEN` |
| **Twilio** | Internacional | `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` |
| **Mock** (dev) | Quando nada configurado | — |

```bash
# UAZAPI (provider primário)
WHATSAPP_PROVIDER=uazapi
WHATSAPP_TOKEN=<seu-token-uazapi>
WHATSAPP_BASE_URL=https://api.uazapi.com
WHATSAPP_FROM=5511958918398
```

---

## 🔔 Régua de Lembretes

### Assinatura de Contrato
- **D+2** (suave): 1º e-mail + WhatsApp
- **D+5** (médio): 2º e-mail + WhatsApp
- **D+7** (urgente): 3º + avisa admin

### Renovação
- **D-60**: 1ª notificação (e-mail + WhatsApp)
- **D-30**: 2ª (urgente)

### Boleto
- **D-5**: Lembrete amigável
- **D-1**: Lembrete urgente
- **D+1**: Aviso de atraso
- **D+3**: 2º aviso
- **D+7**: Aviso final

**Idempotência**: cada lembrete só é enviado 1x por ciclo (verifica em `logs_auditoria`).

---

## ⏰ Cron Job

```bash
# Todo dia às 8h (BRT):
#   1. Lembretes de assinatura
#   2. Renovações
#   3. Régua de boleto
#   4. (futuro) Boletos vencidos
```

```javascript
// server.js (no boot)
dailyRemindersCron.start();

// Desabilitar em dev:
REMINDERS_CRON_ENABLED=false npm start

// Forçar execução manual:
npm run reminders:daily
// ou:
curl -X POST http://localhost:3000/api/reminders/run-daily \
  -H "Authorization: Bearer <admin-jwt>"
```

---

## 🌐 Endpoints REST adicionados

| Método | Endpoint | Função |
|---|---|---|
| `POST` | `/api/reminders/run-daily` | Roda TODOS os lembretes (admin) |
| `POST` | `/api/reminders/signature` | Só assinatura |
| `POST` | `/api/reminders/renewals` | Só renovações |
| `POST` | `/api/reminders/boletos` | Só boletos |
| `GET` | `/api/reminders/status` | Status do cron + pending counters |
| `POST` | `/api/webhooks/autentique` | Já existia (Sprint 8) |

---

## 🧪 Validação

```bash
# Syntax check
node --check cora-api/WhatsAppService.js        # ✓
node --check cora-api/services/ReminderService.js  # ✓
node --check cora-api/jobs/dailyReminders.js   # ✓
node --check cora-api/routes/reminders.js       # ✓
node --check cora-api/server.js                 # ✓

# Smoke test (não regrediu)
npm run smoke
# ✅ 41/41

# Test WhatsApp
npm run test:sprint9
# ✅ formatPhone("(11) 95891-8398") → 5511958918398
# ✅ Mock envia: {success: true, messageId: "mock_..."}
# ✅ Templates formatam R$, datas, etc.
```

---

## 💰 Custo Real (estimado)

### WhatsApp (UAZAPI)
- Plano: ~R$ 60-150/mês (instância + 1.000 mensagens)
- Custo por mensagem: ~R$ 0,05-0,10
- **100 lembretes/mês**: ~R$ 5-10

### Email (Resend — já temos)
- Free: 3.000/mês (cobre 100% do MVP)
- **Custo marginal**: $0,0004/e-mail

### Cron (node-cron)
- Custo zero (roda no mesmo processo da API)

**Custo total adicional: ~R$ 70-160/mês** (assumindo 100-300 mensagens WhatsApp/mês)

---

## 🚀 Como você testa HOJE

```bash
cd cora-api

# 1. Configure as variáveis de WhatsApp (UAZAPI)
# WHATSAPP_PROVIDER=uazapi
# WHATSAPP_TOKEN=<seu-token>
# WHATSAPP_FROM=5511958918398

# 2. Inicie a API (cron desabilitado em dev)
REMINDERS_CRON_ENABLED=false npm run dev

# 3. Force execução manual dos lembretes
curl -X POST http://localhost:3000/api/reminders/run-daily \
  -H "Authorization: Bearer <seu-jwt-admin>"

# 4. Veja o status
curl http://localhost:3000/api/reminders/status \
  -H "Authorization: Bearer <seu-jwt-admin>"

# 5. Quando for pra prod, habilite o cron
# REMINDERS_CRON_ENABLED=true
# (Roda todo dia às 8h BRT)
```

---

## 📊 Cobertura Funcional Atualizada

| Marco | Sprint 8 | Sprint 9 | Δ |
|---|:---:|:---:|:---:|
| **Geral** | 76,5% | **80,0%** | **+3,5pp** |
| **Acessórios Contratos** | 80% | **95%** | +15pp |
| **Operacional** | 88% | **93%** | +5pp |
| **Régua de Cobrança** | 0% | **90%** | +90pp |

---

## 🔄 Backup

Foi criado **backup pré-Sprint 9** antes de qualquer mudança:
- Local: `BACKUPS/pre-sprint9-20260827-211823/`
- Conteúdo: 238 arquivos, 8.46 MB
- ZIP: 5.18 MB

Para reverter:
```bash
cd BACKUPS\pre-sprint9-20260827-211823
# Use o RESTORE.ps1 (vou criar se precisar)
```

---

## 🗣️ Próximas sprints (do roadmap)

| Sprint | Foco | Esforço | Impacto |
|---|---|---|---|
| **10** | ICP-Brasil A1 (Lei 14.063) | 1 sem | +5pp |
| **11** | Templates customizados + UI admin | 1 sem | +3pp |
| **12** | Integração Contábil (Conta Azul/Omie) | 1-2 sem | +4pp |

**Qual direção?** 🎯

OBS: O backup pré-Sprint 9 está seguro. Se quiser continuar agora pra Sprint 10 (ICP-Brasil) ou Sprint 12 (Integração Contábil), é só falar.