# Reformulação do Módulo de Cobrança — Análise + Plano Arquitetural

**Data:** 2026-07-03
**Solicitante:** João (CRM Renostter)
**Escopo:** Reformular o módulo de Cobranças com base na imagem de referência, incluindo fluxo de geração de fatura em atendimento técnico e a estrutura de gateway de pagamentos. Manter o pattern Strategy já existente.

---

## 1. Contexto Atual (Mapeamento)

### 1.1 Backend (`cora-api/`)

| Componente | Estado | Observação |
|---|---|---|
| `PaymentGatewayInterface.js` | ✅ Strategy pattern | Base abstrata bem feita |
| `gateways/CoraGateway.js` | ✅ Real (mTLS) | OAuth2 + Idempotency-Key + retry + cache L1/L2 (memória + DB) |
| `gateways/ItauGateway.js` | ⚠️ Mock | Simula erro de 10%; útil pra testes |
| `CobrancaManager.js` | ✅ Completo | `emitirCobranca`, `cancelarCobranca`, `aprovarFatura`, `processarWebhook`, `executarRecorrencias` |
| `server.js` | ⚠️ 967 linhas, monolítico | 50+ rotas inline, aliases legados `/api/cora/*` |
| `database.js` | ✅ Schema completo | 13 tabelas + índices + triggers; `tokens_integracao` cacheia OAuth |
| `ReminderService.js` | ✅ Régua D-5/D-1/D+1 | E-mail + WhatsApp mock |
| `NotificationService.js` | ⚠️ SMTP opcional | Cai em "log mode" se não configurado |
| `WhatsAppService.js` | ❌ Mock puro | Não envia nada — só delay de 800ms |

### 1.2 Frontend (módulos atuais)

| Arquivo | Tamanho | Responsabilidade |
|---|---|---|
| `admin/cobrancas.html` | 83.8 KB | Dark mode. KPIs + tabela + Chart.js + modal de emissão + logs |
| `admin/bancos.html` | 25 KB | CRUD de gateways (Cora, Itaú) — autocomplete BACEN + mTLS |
| `client/faturas.html` | 15 KB | Portal cliente: ver + aprovar/reprovar faturas |
| `js/proposals.js` | 285 linhas | Sync de peças aprovadas → fatura → API |
| `js/cora_integration.js` | 331 linhas | Bridge localStorage ↔ API Cora |
| `tech/tickets.html` | — | Técnico adiciona peça (gera stock_movement com status pendente) |

### 1.3 Fluxo Ponta-a-Ponta Atual (como peças viram boletos)

```
[Técnico adiciona peça]
   └─> stock_movement.status = "pendente"
        └─> ticket.status = "aguardando_aprovacao_pecas"

[Cliente recebe notificação]
   └─> Proposals.sendForApproval() — proposalExpiresAt = D+10

[Técnico envia para aprovação]
   └─> POST /api/faturas { chamadoId, clienteId, itens[] }  ← cria fatura em "AGUARDANDO_AUTORIZACAO"

[Cliente aprova/reprova]
   └─> PATCH /api/faturas/:id/aprovar
        └─> CobrancaManager.aprovarFatura()
             ├─ 1. Cria fatura FAT-YYYY-NNNN
             ├─ 2. Insere itens_fatura
             └─ 3. NÃO chama API ainda!

[Admin aciona aprovação] (???)                    ← GAP: cliente aprova, mas quem chama o gateway?
   └─> CobrancaManager.aprovarFatura()
        └─> Manager.emitirCobranca() → gateway.createInvoice()
             └─> Cobrança real criada no Cora
                  └─> Webhook → webhook_paid → status PAID
```

### 1.4 Gaps identificados

| # | Gap | Severidade |
|---|---|---|
| **G1** | `syncFinancial()` chama `CoraIntegration.emitirBoleto()` com um `mockContract` — bypassa o caminho oficial `aprovarFatura` do CobrancaManager. Resultado: **duas fontes de verdade** para o mesmo evento. | 🔴 Crítico |
| **G2** | `proposals.js` mantém `client.pendingBalance` em paralelo a `financial_transactions` e `cobrancas` — três ledgers que podem divergir. | 🔴 Crítico |
| **G3** | `admin/cobrancas.html` (dark) não bate com a imagem (light, novo visual) — reformulação visual é quase completa. | 🟠 Alto |
| **G4** | Ações em massa (Excluir/Imprimir/Reenviar Selecionados) **não existem** — só ações individuais. | 🟠 Alto |
| **G5** | Adicionar novo gateway exige código de programador — não há tela "Adicionar Provider" (Bradesco, Santander, PIX, Mercado Pago, etc). | 🟠 Alto |
| **G6** | Status da fatura no frontend (`faturas`: `pendente/pago/vencido`) **não bate** com o do backend (`cobrancas`: `PENDING/OPEN/PAID/OVERDUE/CANCELLED`). | 🟡 Médio |
| **G7** | O conceito "Fatura ↔ Cobrança" não está claro no fluxo — o cliente aprova "Fatura" e a Cobrança real é gerada como efeito colateral. | 🟡 Médio |
| **G8** | Webhook do Cora pode forjar `PAID` para qualquer `charge_id` (— resolvido pelo C9 do hotfix Camada 1 com HMAC, mas o frontend confia cego nos dados). | 🟢 Baixo (já mitigado) |
| **G9** | `ItauGateway` é mock — se virar produção assim, vai falhar silenciosamente. | 🟢 Baixo |
| **G10** | Não existe ledger imutável (audit log dedicado a movimentações financeiras). | 🟡 Médio |

---

## 2. Imagem de Referência — Análise Visual

A imagem tem **2 painéis lado a lado**:

### Painel 1 — "Gestão de Boletos" (light, minimal)

**Estrutura:**
- Topbar: ícone sidebar + "Gestão de Boletos" + avatar + chip "ADMIN" (vermelho)
- Card branco com sombra, padding generoso
- Header do card: "📋 Lista de Boletos" + botão primário "+ Novo Boleto"
- Barra de ações em massa: `🗑️ Excluir (0)` `🖨️ Imprimir (0)` `📧 Reenviar (0)` 🔍 Consultar (com contador por seleção)
- Filtros horizontais: "Nome, CPF ou nosso número…" | "Todos" (select) | dois datepickers dd/mm/aaaa | botão `≡ Filtrar`
- Dica inline: "42 cliente(s) com boletos. Clique no nome para expandir."
- Lista vertical expansível (accordion):
  - Avatar + nome + badges (boletos / carnês / registrados / vencidos) + valor + chevron
  - 5 entradas visíveis no print, com dados censurados

**Diferenças do atual:**
- ❌ Light, sem sidebar fixa (toggle)
- ❌ Ações em massa com contador dinâmico
- ❌ Accordion vertical (não tabela)
- ❌ Endpoint "Imprimir Selecionados" + "Reenviar por e-mail"

### Painel 2 — "Dashboard — Painel Financeiro — Boletos"

**Estrutura:**
- Topbar: "📊 Dashboard" + avatar + ADMIN
- Header: "💳 Painel Financeiro — Boletos" (com gradiente lateral)
- **6 KPIs em grid 3×2** (coloridos por tipo):
  - `💳 TOTAL EM ABERTO` — **R$ 1.248.390,74** — 1.347 boletos pendentes/registrados
  - `📅 A VENCER NO MÊS` — **R$ 84.170,50** — 63 boletos em Mai/2026
  - `⚠️ VENCIDOS` — **R$ 17.305,88** — 22 boletos atrasados (vermelho)
  - `✅ RECEBIDOS NO MÊS` — **R$ 53.890,20** — 47 boletos pagos em Mai/2026 (verde)
  - `⏰ A RECEBER (EM DIA)` — **R$ 1.213.779,66** — 1.298 boletos (verde grande)
  - `📊 A RECEBER EM 30 DIAS` — **R$ 98.430,00** — 188 boletos próximos 30 dias
- Card "❌ CANCELADOS NO MÊS" — **3** boletos baixados em Mar/2026
- **Footer de stats** (linha horizontal): `Total Boletos: 1.347 | Em Dia: 1.298 | Vencidos: 22 | Pagos (Mês): 47 | Taxa Recebimento: 3.5% | botão 🧾 Ver Boletos`

**Diferenças do atual:**
- ❌ Layout **grid 3×2** com bordas coloridas no topo de cada card (azul, vermelho, verde, laranja, etc)
- ❌ "A Vencer no Mês" não existe separado de "Total"
- ❌ "A Receber (Em Dia)" + "A Receber (30 Dias)" como KPIs distintos
- ❌ Taxa de Recebimento calculada

---

## 3. Arquitetura Proposta

### 3.1 Modelo de Domínio — Reorganização

**Decisão:** tratar **Fatura** e **Cobrança** como **uma única entidade com estados** (em vez de duas tabelas paralelas).

```
┌─────────────────────────────────────────────────────────────────┐
│                  INVOICE (fatura + cobrança — única)              │
│                                                                  │
│  id: inv_xxxxxx                                                  │
│  ticket_id: t1 | null          ← opcional (vinda de atendimento)│
│  client_id: c1                                                  │
│  provider: 'cora' | 'itau' | 'pix' | 'bradesco' | ...           │
│  ── Montante ──                                                  │
│  subtotal: 3800.00                                               │
│  discount: 0                                                     │
│  total: 3800.00                                                  │
│  due_date: 2026-06-15                                            │
│  ── Identificadores do Provider ──                               │
│  provider_charge_id: ch_abc123         ← após emissão no gateway │
│  provider_invoice_id: inv_xyz         ← se aplicável             │
│  barcode: 23793...                                               │
│  digitable_line: 23793...                                        │
│  pix_qrcode: 00020126...                                         │
│  pdf_url: https://...                                            │
│  ── Status (uma máquina de estado, não enum solto) ──             │
│  status: 'DRAFT' | 'PENDING_APPROVAL' | 'OPEN' |                 │
│          'PAID' | 'OVERDUE' | 'CANCELLED'                        │
│  ── Modo ──                                                      │
│  approval_mode: 'REQUIRED' | 'AUTO' | 'NONE'                    │
│  ── Auditoria ──                                                 │
│  issued_by: u1                                                   │
│  approved_by: null | u4                                          │
│  approved_at: null | ISO                                         │
│  paid_at: null | ISO                                             │
│  cancelled_by: null | u1                                         │
│  cancelled_at: null | ISO                                        │
│  cancelled_reason: null | string                                 │
│  ── Origem ──                                                    │
│  source: 'manual' | 'contract' | 'service_order' | 'parts'      │
│  source_ref: ID do contrato/chamado/peça                        │
│  items: [{desc, qty, unit_price, total, kind, ref}]             │
│  ── Timestamps ──                                                │
│  created_at, updated_at                                          │
└─────────────────────────────────────────────────────────────────┘
```

**Tabela `invoices` substitui `cobrancas` + `faturas`** (migration). As tabelas legadas ficam deprecated + `sync_view_invoices` faz ponte.

### 3.2 Tabela de status — máquina finita

```
DRAFT ──(submit)──> PENDING_APPROVAL ──(approve)──> OPEN ──(pay)──> PAID
  │                       │                       │          (cancel)
  │                       │                       └──> CANCELLED
  └────────────────────── (reject) ───────────────────> CANCELLED
                          
PENDING_APPROVAL ──(timeout 10d)──> CANCELLED ("expirado")
OPEN ──(due_date < today + grace)──> OVERDUE
OVERDUE ──(pay)──> PAID
```

### 3.3 Endpoint surface (novo + legado)

| Verbo | Endpoint novo | Endpoint legado (deprecated) |
|---|---|---|
| Listar | `GET /api/invoices?status&clientId&provider&page&size` | `GET /api/cobrancas` + `GET /api/faturas` |
| Detalhe | `GET /api/invoices/:id` | `GET /api/cobrancas/:id` + `GET /api/faturas/:id` |
| Criar (manual) | `POST /api/invoices/manual` | `POST /api/cora/boleto` |
| Criar (de peças) | `POST /api/invoices/from-parts` | `POST /api/faturas` (atual, limitada) |
| Aprovar | `POST /api/invoices/:id/approve` | `PATCH /api/faturas/:id/aprovar` |
| Reprovar | `POST /api/invoices/:id/reject` | `PATCH /api/faturas/:id/reprovar` |
| Cancelar | `POST /api/invoices/:id/cancel` | `DELETE /api/cobrancas/:id` |
| Reenviar email | `POST /api/invoices/:id/resend-email` | — (NOVO) |
| Imprimir lote | `POST /api/invoices/batch/print` | — (NOVO) |
| Ações em massa | `POST /api/invoices/batch/cancel` | — (NOVO) |
| Webhook | `POST /api/webhooks/:provider` (com HMAC) | `POST /api/cobrancas/webhook` |
| Extrato provider | `GET /api/invoices/statements/:provider` | `GET /api/cobrancas/extrato` |
| Gateways | `GET/POST /api/invoices/gateways` | `/api/bancos/cadastrados` + `/api/configuracoes` |
| Testar gateway | `POST /api/invoices/gateways/:id/test` | `/api/bancos/testar` |
| **Provisionar** novo | `POST /api/invoices/gateways/:provider/register` | — (NOVO, chama factory) |
| KPIs financeiros | `GET /api/invoices/kpis` | `/api/cobrancas/kpis` |

### 3.4 Strategy de Gateway — Camada nova

```
┌────────────────────────────────────────────────────────────────┐
│              PaymentProviderRegistry                            │
│                                                                  │
│  register(providerName, GatewayClass)                           │
│  get(providerName): PaymentGateway                              │
│  list(): [{name, displayName, capabilities, status}]            │
│  testConnection(name, config): { ok, latency_ms }              │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│           PaymentGatewayInterface (já existe)                    │
│                                                                  │
│  + createInvoice(payload)                                       │
│  + cancelInvoice(id)                                            │
│  + parseWebhookEvent(raw)                                       │
│  + registerWebhook(url, triggers)         ← NOVO                │
│  + capabilities(): { pix, card, billet, recurring } ← NOVO     │
│  + healthCheck(): { ok, latency_ms, region }         ← NOVO     │
└────────────────────────────────────────────────────────────────┘
                              ▲        ▲         ▲
                              │        │         │
              ┌───────────────┘        │         └───────────────┐
              │                        │                          │
        CoraGateway              ItauGateway              BradescoGateway
                                                              PixGateway
                                                              MercadoPagoGateway
                                                              StripeGateway
```

### 3.5 Frontend — Estrutura proposta

```
admin/
├── financeiro.html              ← Dashboard Financeiro (Painel — Boletos)
│   └── 6 KPIs + footer stats + "Ver Boletos"
├── cobrancas.html               ← Gestão de Boletos (light, novo visual)
│   ├── Sidebar esquerdo FIXO (não toggle — visível sempre)
│   ├── Topbar branco com avatar + chip ADMIN
│   ├── Card "Lista de Boletos" com accordion expansível
│   ├── Barra de ações em massa (Excluir/Imprimir/Reenviar selecionados)
│   ├── Filtros horizontais (Nome/CPF, Status, Período, Filtrar)
│   └── Modal "Novo Boleto"
│
├── gateway-config.html          ← (rebanho do admin/bancos.html)
│   ├── Lista de providers (Cora, Itaú, novo)
│   ├── "+ Adicionar Provider" (Novo!) — wizard com discovery automático
│   ├── Credenciais criptografadas (mTLS, OAuth, API Key)
│   └── Health-check por provider
│
└── invoices-dashboard.html      ← (opcional, pode viver dentro do financeiro.html)

client/
└── faturas.html                 ← já existe (atualizar UI leve)

tech/
└── tickets.html                 ← adicionar seção "Gerar Fatura" após aprovação de peça
```

### 3.6 Fluxo reformulado: Peça → Boleto

```
ETAPA 1 — Técnico inclui peça (já existe)
─────────────────────────────────────────
[tech/tickets.html] Adiciona "Capacitor" qty=1
   ↓
stock_movements.status = "pendente"
ticket.status = "aguardando_aprovacao_pecas"
Proposals.checkAndNotify() → modal pro cliente


ETAPA 2 — Cliente aprova peça
─────────────────────────────────────────
[client/faturas.html] "🛠️ Aprovação Pendente" → modal
   ↓ Aprova item
Proposals.approveItem(id) → status: "aprovado"
Proposals.syncFinancial() (refatorar):
   ├─ chama CobrancaManager.service.criarDePecas(ticketId, itemIds[])
   │     └─ POST /api/invoices/from-parts { ticketId, items[] }
   │          └─ Service consolida em uma fatura (não várias)
   └─ Removido: client.pendingBalance duplicado


ETAPA 3 — Aprovação final da Fatura (se necessário)
─────────────────────────────────────────
[client/faturas.html] → PATCH /api/invoices/:id/approve
   ↓
DRAFT → PENDING_APPROVAL → OPEN (cria no gateway selecionado)
   ├─ ProviderRegistry.get(providerName).createInvoice(payload)
   ├─ Retorna provider_charge_id, barcode, pdf_url
   ├─ (Opcional) Envia e-mail com boleto — POST /api/invoices/:id/resend-email
   └─ Audit log: aprovador, IP, timestamp


ETAPA 4 — Pagamento (assíncrono via webhook)
─────────────────────────────────────────
Cora → POST /api/webhooks/cora (com HMAC validado)
   ↓
CobrancaManager.processarWebhook(gateway, raw)
   ├─ update invoices SET status='PAID', paid_at=NOW WHERE provider_charge_id=?
   ├─ audit_log: pagamento recebido
   └─ (Opcional) Notificação cliente


ETAPA 5 — Cancelamento / Reenvio (ações admin)
─────────────────────────────────────────
[admin/cobrancas.html] Seleciona N boletos → "🗑️ Excluir" / "🖨️ Imprimir" / "📧 Reenviar"
   ↓
POST /api/invoices/batch { ids[], action }
   ├─ 'cancel': para cada ID, gateway.cancelInvoice(), status='CANCELLED'
   ├─ 'print': retorna { pdf_urls[], printable: true }
   └─ 'resend': CobrancaManager.enviarEmailCobranca(id) por ID
```

---

## 4. Plano de Implementação em Fases

### Fase 0 — Preparação (1 dia)
**Sem quebrar nada:**
- [ ] Criar nova tabela `invoices` com schema unificado (sem migrar ainda — paralelo)
- [ ] Criar view `vw_invoices_unified` juntando `cobrancas` ∪ `faturas` (read-only)
- [ ] Adicionar `InvoiceProviderRegistry` carregando providers dinamicamente
- [ ] Adicionar capabilities + healthCheck ao `PaymentGatewayInterface`

**✅ Entregue em 2026-07-03 — Banco Cora configurado para emissão de boletos:**
- [x] `bancos_cadastrados.id=1` atualizado com paths relativos `cora-api/certificate.pem` e `cora-api/private-key.key`
- [x] `webhook_url = http://localhost:3000/api/webhooks/cora` registrado
- [x] Ambiente alterado de `production` para `stage` (sandbox) — credenciais locais batem com sandbox
- [x] Flags `is_primary=1` e `ativo=1` mantidas
- [x] Interface `admin/gateway-config.html` substituindo `admin/bancos.html` — focada no Cora
  - Card "🏦 Cora Bank — Provider Principal" com badge PROVEDOR PRINCIPAL
  - 6 detalhes (Ambiente, Client ID mascarado, Cert, Key, Webhook, Último Token)
  - Health check com botão "Testar Conexão" → `POST /api/bancos/testar`
  - Modais: Atualizar Certificados · Reconfigurar Webhook · Trocar Ambiente · Emitir Boleto Teste
  - Bloco "+ Adicionar Novo Provider" com tiles para Itaú, Bradesco, Santander, Mercado Pago, PIX Direto, Stripe
  - Lista de logs recentes do gateway (`GET /api/cora/logs`)
- [x] Link do sidebar `admin/cobrancas.html` atualizado para `gateway-config.html`

### Fase 1 — Backend paralelo (3-4 dias)
**Cria novos endpoints sem remover os antigos:**
- [ ] `/api/invoices/*` (10 endpoints novos, ver tabela acima)
- [ ] `/api/invoices/gateways/*` (register, test, list capabilities)
- [ ] `/api/invoices/from-parts` — consolida múltiplas peças em uma fatura
- [ ] `/api/invoices/batch/*` (cancel, print, resend em lote)
- [ ] `/api/invoices/kpis` — KPIs estruturados (Total em Aberto, A Vencer no Mês, Vencidos, etc.)
- [ ] Manter `/api/cobrancas/*` e `/api/faturas/*` retornando dados via view unificada
- [ ] Adicionar header `Deprecation: true` nas rotas legadas

### Fase 2 — Frontend reformulado (5-7 dias)
**Mantém o módulo atual ativo até validar:**

| Dia | Entrega |
|---|---|
| D1 | Criar `admin/financeiro.html` (Dashboard — Painel Financeiro — Boletos) com 6 KPIs + footer |
| D2 | Criar `admin/cobrancas.html` reformulado (light, accordion, ações em massa) |
| D3 | Criar `admin/gateway-config.html` (lista providers + "+ Adicionar Provider") |
| D4 | Wireframe JS para chamar novos endpoints; integrar com Financeiro + Cobranças |
| D5 | Atualizar `client/faturas.html` (consumir novo endpoint) |
| D6 | Refatorar `js/proposals.js` para chamar `from-parts` em vez de `emitirBoleto` direto |
| D7 | Smoke test E2E do fluxo peça→boleto |

### Fase 3 — Validação e Migração (2-3 dias)
- [ ] Teste paralelo: dados novos via tabela `invoices` devem aparecer na tabela `cobrancas` (read-only)
- [ ] Smoke test: gerar fatura de peça → aprovar → ver boleto no admin/cobrancas → pagar via webhook → ver status PAID
- [ ] Teste de gateway novo (mock): adicionar um provider fake, ver se aparece nas opções
- [ ] Migration script: copia dados de `cobrancas` + `faturas` + `itens_fatura` para `invoices`
- [ ] Adicionar `Sunset` header com data futura nas rotas legadas

### Fase 4 — Remoção e Clean-up (1 dia)
- [ ] Remover aliases `/api/cora/*`
- [ ] Remover tabela `cobrancas_recorrentes` (substituir por campo `recurring` em `invoices`)
- [ ] Renomear tabelas legadas com prefixo `_legacy_`
- [ ] Atualizar documentação

---

## 5. Decisões pendentes (preciso de você)

Antes de codar, queria confirmar:

### 5.1 Onde mora o estado de aprovação do boleto?
- (A) Cliente aprova no portal → fatura vai direto para o gateway (sem intervenção admin)
- (B) Cliente aprova → admin precisa dar OK final antes de gerar boleto real (workflow mais conservador)
- (C) Aprovação condicional: depende do **valor** (ex: >R$5k requer aprovação admin, <R$5k auto)

### 5.2 Que providers vamos suportar oficialmente?
Mínimo viável: **Cora + Itaú** (já existem)
Potencial real: **PIX direto** (sem gateway), **Bradesco**, **Santander**, **Mercado Pago**, **Stripe**, **Asaas**
Pergunta: Fora **Cora + Itaú**, quais você quer ver na primeira release?

### 5.3 Onde fica o "Imprimir Selecionados"?
- (A) Gera um PDF único consolidado dos N boletos via Puppeteer/pdfkit
- (B) Apenas retorna um ZIP com os N PDFs já existentes
- (C) Abre janela de impressão do browser com HTML formatado (light, sem JS)

### 5.4 "Reenviar por e-mail" — quem recebe?
- (A) Apenas o cliente (reenvio do boleto original)
- (B) Quem fez upload do boleto (auditoria)
- (C) Ambos, com cópia interna

### 5.5 Persistência da decisão
Hoje, `client.pendingBalance` é mantido em paralelo com `financial_transactions`. Como resolver?
- (A) Eliminar `pendingBalance` do cliente — calcular on-demand
- (B) Manter `pendingBalance` mas sincronizar via trigger/log (mais conservador)

### 5.6 Light mode × Dark mode
A imagem é **light**, o resto do projeto é **dark**. Conflito?
- (A) Migrar **toda** a aplicação para light (tema claro)
- (B) Manter dark como padrão, mas criar temas visuais alternativos (--theme-light aplicado em cobranças.html)
- (C) Light só para os 2 módulos novos (financeiro.html + cobrancas.html reformulado), dark para o resto

---

## 6. Riscos

| Risco | Mitigação |
|---|---|
| Refator massivo quebra o que funciona | Manter `/api/cobrancas/*` e `/api/faturas/*` ativos durante transição; testes E2E paralelos |
| Light mode quebra CSS global dos outros módulos | Variáveis CSS em `:root[data-theme="light"]` isoladas em cobrancas/financeiro |
| Performance ao consolidar faturas em uma única tabela | Índices em `(client_id, status, due_date)` + archive de cobranças pagas |
| Migração de dados legados | Script idempotente + dry-run + rollback |
| Reconciliation de saldos ao unificar | Serviço de auditoria que compara `cobrancas.sum` vs `invoices.sum` por cliente |

---

## 7. Entregáveis esperados

Quando tudo estiver codado e validado:

1. **Backend:**
   - `cora-api/services/InvoiceService.js` (~400 linhas)
   - `cora-api/registry/ProviderRegistry.js` (~150 linhas)
   - `cora-api/routes/invoices.js` (~500 linhas)
   - `cora-api/migrations/2026_07_invoices_unified.sql` (schema + view)
   - `cora-api/middleware/batchActions.js` (~80 linhas)
   - **Plus:** `BradescoGateway.js`, `PixGateway.js` (stubs, com TODO claro)

2. **Frontend:**
   - `admin/financeiro.html` (~25 KB)
   - `admin/cobrancas.html` (~50 KB) — substituindo o atual
   - `admin/gateway-config.html` (~30 KB) — substituindo `admin/bancos.html`
   - `client/faturas.html` (refator leve)
   - `js/invoiceService.js` (~200 linhas)
   - `js/gatewayConfig.js` (~100 linhas)

3. **Documentação:**
   - `docs/MODULE-COBRANCA-V2.md` (arquitetura + fluxos)
   - `docs/CHANGELOG-INVOICE-UNIFICATION.md`
   - `docs/API-INVOICES.md` (OpenAPI/Swagger para os novos endpoints)

---

## TL;DR

**O trabalho é grande (~12-15 dias úteis)**, mas **fragmentável em 4 fases independentes** que podem ser mergeadas incrementalmente sem quebrar nada.

Vou precisar das suas respostas às 6 perguntas acima (5.1 a 5.6) para começar a Fase 0/1.

Após aprovação, começo pelas alterações **menos invasivas** primeiro (novos endpoints lado-a-lado com legados) pra você poder validar sem medo, e só depois migro o frontend.
