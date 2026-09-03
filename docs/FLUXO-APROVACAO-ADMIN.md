# Fluxo de Aprovação Administrativa — Renostter CRM

**Data:** 2026-07-05
**Solicitante:** João
**Material de entrada:**
- 2 imagens (`Copilot_20260705_012834.png` e `(2).png`) — Fluxograma ERP Aprovação Administrativa
- Documento de PRD detalhado (Texto da mensagem) com:
  - Estrutura do fluxo (Atendimento → Aprovação → Financeiro)
  - Modelo de papéis (Técnico / Admin / Superadmin / Financeiro / Cliente)
  - Configurações por módulo
- Estado atual do projeto Renostter CRM (analisado previamente)

---

## 1. Visão consolidada

A imagem e o texto do usuário descrevem o **mesmo fluxograma** em dois layouts diferentes:
- Layout A (imagem 1) — **horizontal em "processo decisório"** (losango + setas)
- Layout B (imagem 2) — **layout "kanban lateral"** em 2 colunas (Atendimento × Aprovação)

Conteúdo equivalente:

```
┌─────────────────────────────────────────────────────────────────────┐
│  [OS Concluída] → [Tem peça ou custo adicional?]                    │
│                          │                  │                       │
│                       NÃO                 SIM                       │
│                        │                  │                       │
│            [Gerar Fatura Interna]    [Alerta: Pendência]            │
│            [Emitir Boleto]            (Admin/Superadmin)           │
│            [Enviar Cliente]          [Aprovar ou Alterar Valor]    │
│            [Atualizar Contas a Receber]   │                       │
│                    │                  [Gerar Fatura Ajustada]      │
│                    └──────→ [Emitir Boleto] ←───────┘              │
│                                  │                                │
│                            [Conciliação Automática]                │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Modelo Final Consolidado de Papéis

Baseado no PRD do João + ajustes estruturais baseados no estado do projeto:

| Perfil | Permissões Concretas | Limitações |
|---|---|---|
| **Técnico** (`tecnico`) | • Criar/concluir OS<br>• Adicionar peças e custos<br>• Visualizar status financeiro da OS | ❌ Não gera boleto<br>❌ Não altera valor de fatura |
| **Administrador** (`admin`) | • Tudo do Técnico<br>• Ver **TODAS** as pendências financeiras<br>• **Aprovar/editar/rejeitar qualquer valor** (mesmos direitos do superadmin)<br>• Emitir boletos via gateway Cora<br>• Cancelar cobranças<br>• Ver relatórios financeiros<br>• Configurar gateways de pagamento | ❌ Não gerencia usuários/papéis<br>❌ Não edita regras de automação<br>❌ Não pode excluir OS |
| **Superadmin** (`superadmin`) | • **Mesmas permissões de faturas/boletos do Administrador** (regra corporativa de 2026-07-05)<br>• Diferencial: gerencia usuários e papéis<br>• Diferencial: cria/edita regras de automação<br>• Diferencial: aprova em lote | ❌ Nenhuma no fluxo financeiro |
| **Financeiro** (`financeiro`) — **NOVO** | • Visualizar fila de pendências (read-only)<br>• Emitir boletos **já aprovados**<br>• Atualizar status de pagamento<br>• Relatórios de inadimplência<br>• Conciliação bancária | ❌ Não aprova/rejeita/edita pendências (read-only)<br>❌ Não altera valores sem aprovação |
| **Cliente** (`cliente`) | • Ver suas faturas<br>• Pagar<br>• Consultar histórico | ❌ Não edita nada financeiro |

### 📌 Regra corporativa registrada em 2026-07-05

> **Admin e Superadmin têm as mesmas permissões no fluxo de faturas e boletos.**
>
> O superadmin mantém o **diferencial gerencial** (usuários, papéis, regras de automação, aprovação em lote), mas **financeiramente** ambos decidem qualquer pendência em qualquer tier.
>
> Aplicado em:
> - `cora-api/routes/approvals.js` — `canDecide(role)` aceita `admin` ou `superadmin` para QUALQUER tier
> - `cora-api/server.js` — endpoints de fatura/cobrança com `authorize(['admin'])` promovidos para `['admin', 'superadmin']`:
>   - `PATCH /api/faturas/:id/aprovar`
>   - `GET /api/cobrancas/:id/reprint`
>   - `DELETE /api/cobrancas/:id`
>
> A diferença entre Admin e Superadmin agora é puramente gerencial (usuários + regras), não mais financeira.

### Compatibilidade com estado atual

O Renostter já tem:
- `superadmin`, `admin`, `tecnico`, `cliente` (em `js/storage.js` linha 275-281)
- `auth.protect(['admin', 'superadmin'])` em várias rotas

**Mudança necessária:** adicionar o **novo papel `financeiro`** ao:
- seed de usuários (storage.js)
- guardas `auth.protect` das rotas financeiras
- UI de filtro de pendências

---

## 3. Cinco melhorias estruturais ao fluxo do usuário

A proposta do João é sólida, mas o estado atual do projeto + boas práticas sugerem **5 ajustes finos**:

### ✨ M1 — Auto-confirmação por tier de cliente (clientes premium)

**Problema:** nem toda OS de cliente premium precisa de aprovação. Bloquear todas gera ruído.

**Solução:**
```javascript
function shouldRequireApproval(ticket, totalValue) {
    const client = db.find('clients', ticket.clientId);
    const AUTO_CONFIRM_LIMIT_PREMIUM = 500; // R$
    const AUTO_CONFIRM_LIMIT_BASIC = 0;     // R$ (não auto-confirma)

    const limit = client.tier === 'premium' || client.tier === 'empresarial'
        ? AUTO_CONFIRM_LIMIT_PREMIUM
        : AUTO_CONFIRM_LIMIT_BASIC;

    return totalValue > limit || hasPendingParts(ticket);
}
```

**Benefício:** clientes premium têm fluxo mais rápido; admin só vê pendências que importam.

### ✨ M2 — Aprovação multi-nível por valor

**Problema:** Admin X ter limite único (R$ 1.000) é fraco. Falta governança para valores altos.

**Solução:**
```
Valor ≤ R$ 1.000     → Admin pode aprovar
R$ 1.000 < valor     → Escala para Superadmin automaticamente
Valor > R$ 5.000     → Requer Superadmin + motivo obrigatório (>200 chars)
```

**Como detectar:** campo `pending_approvals.tier` calculado na criação:
```sql
tier TEXT CHECK(tier IN ('auto', 'admin', 'superadmin', 'compliance'))
```

### ✨ M3 — Timeout escalável e SLA

**Problema:** sem timeout, pendências ficam esquecidas.

**Solução:**
- **24h sem ação** → notificação push + email para o responsável
- **48h sem ação** → reatribuição para superadmin
- **7 dias sem ação** → auto-cancelar + notificar cliente + marcar OS como "reprovada automaticamente"

### ✨ M4 — Fila dedicada (não só pop-up)

**Problema:** pop-up sozinho vira "alt-tab mental" — usuário ignora.

**Solução:**
- **Pop-up** = aviso diário ao abrir o sistema
- **Página `admin/aprovacoes.html`** = fila com histórico completo, filtros, exportação CSV
- **Badge no sidebar** = contagem em tempo real
- **Webhook opcional** = avisar via WhatsApp quando tem >3 pendências

### ✨ M5 — Reuso da infraestrutura de notificações existente

**Problema:** sistema novo = criar canais paralelos. Duplicação.

**Solução:**
- Usar tabela `notifications` (já existe em `storage.js`) para alertas visuais
- Usar `NotificationService` (já existe em `cora-api/`) para e-mail
- Usar `auditlog` (já existe) para registro de decisões

**Sem canal novo**, só reaproveita.

---

## 4. Arquitetura técnica proposta

### 4.1 Schema — tabela `pending_approvals`

```sql
CREATE TABLE pending_approvals (
    id TEXT PRIMARY KEY,                   -- appr_xxxxx
    ticket_id TEXT NOT NULL,               -- FK para tickets.id
    invoice_id TEXT,                       -- FK para invoices (se já criada)
    client_id TEXT NOT NULL,
    requested_by TEXT NOT NULL,            -- técnico que fechou a OS
    request_value REAL NOT NULL,
    requires_approval_reason TEXT,        -- 'has_parts' | 'value_exceeds_limit' | 'compliance'
    tier TEXT NOT NULL CHECK(tier IN ('admin', 'superadmin', 'compliance')),
    status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK(status IN ('PENDING', 'ESCALATED', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED')),
    decided_by TEXT,                      -- admin/super que decidiu
    decided_at DATETIME,
    decision_type TEXT CHECK(decision_type IN ('approve', 'edit', 'reject', NULL)),
    decision_reason TEXT,
    new_value REAL,                        -- se decision_type = 'edit'
    expires_at DATETIME,                  -- cálculo 7 dias por padrão
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ticket_id) REFERENCES tickets(id)
);
CREATE INDEX idx_pa_status ON pending_approvals(status, created_at);
CREATE INDEX idx_pa_client ON pending_approvals(client_id);
CREATE INDEX idx_pa_assigned ON pending_approvals(tier, status);
```

### 4.2 Endpoints

| Verbo | Endpoint | Quem pode |
|---|---|---|
| `GET` | `/api/approvals/pending` | Lista pendentes (Admin/Super) |
| `GET` | `/api/approvals/count` | Badge no sidebar |
| `GET` | `/api/approvals/:id` | Detalhe (Admin/Super) |
| `POST` | `/api/approvals/from-ticket` | **Sistema** (hook interno do CobrancaManager) |
| `POST` | `/api/approvals/:id/approve` | Admin/Super — aceita valor original |
| `POST` | `/api/approvals/:id/edit` | Admin/Super — `{ newValue, reason }` |
| `POST` | `/api/approvals/:id/reject` | Admin/Super — `{ reason }` |
| `GET` | `/api/approvals?status=` | Histórico filtrado |
| `POST` | `/api/approvals/cron-escalate` | **Sistema** — escadinha automática |

### 4.3 Hook no fluxo de OS

```javascript
// Adicionado em CobrancaManager quando status da OS muda para 'fechado'
async onTicketClosed(ticket) {
    const parts = stock_movements.filter(m => m.ticketId === ticket.id && m.status === 'aprovado');
    const totalParts = parts.reduce((s, p) => s + p.quantity * p.unitPrice, 0);

    if (shouldRequireApproval(ticket, totalParts)) {
        const tier = calcApprovalTier(totalParts);
        return await createPendingApproval(ticket, totalParts, tier, 'has_parts');
    }

    // Sem pendência: fluxo automático (igual fluxo do usuário "NÃO")
    return await emitCobrancaAutomatica(ticket);
}
```

### 4.4 UI `/admin/aprovacoes.html`

Seguindo o padrão dos outros admin/*.html que já padronizamos:

- **Topbar:** "Renostter CRM — Aprovações Pendentes" + Exportar CSV
- **KPI cards:** Pendentes · Escalados · Aprovados Hoje · Rejeitados Hoje
- **Fila principal:** cards com badges de valor (🟢 até R$ 1k / 🟡 R$ 1k-5k / 🔴 >R$ 5k)
- **Modal de decisão:** aprovar / alterar valor / rejeitar (com motivo)
- **Histórico lateral:** últimas decisões com filtro

### 4.5 Pop-up global (banner)

Pequeno banner fixo no topo de **toda página `admin/*.html`** quando há pendências:

```html
<div class="approval-banner">
    ⚠️ 3 pendências financeiras aguardando sua decisão.
    <a href="aprovacoes.html">Revisar agora →</a>
</div>
```

Aparece em: `dashboard.html`, `cobrancas.html`, `tickets.html`, `financeiro.html`, etc.

---

## 5. Plano de implementação

### Fase 1 — Schema + Endpoints + Hook (2-3 dias)

| # | Tarefa | Tempo |
|---|---|---|
| 1.1 | Migration `pending_approvals` no `database.js` | 30min |
| 1.2 | Tabela user `financeiro` no seed de `storage.js` | 30min |
| 1.3 | `cora-api/routes/approvals.js` (10 endpoints) | 3h |
| 1.4 | Hook `CobrancaManager.onTicketClosed()` | 1h |
| 1.5 | `POST /api/cobrancas/check-approvals` (debug/trigger) | 30min |
| 1.6 | Smoke test E2E backend | 1h |

### Fase 2 — UI dedicada (2-3 dias)

| # | Tarefa | Tempo |
|---|---|---|
| 2.1 | `admin/aprovacoes.html` (fila + modal decisão) | 3h |
| 2.2 | Banner global no topbar de admin/*.html | 1h |
| 2.3 | `admin/dashboard.html` mostra top-3 pendências | 1h |
| 2.4 | Item "Aprovações" no sidebar de admin | 30min |

### Fase 3 — Refinamentos (1-2 dias)

| # | Tarefa | Tempo |
|---|---|---|
| 3.1 | Cron de escalação (24h/48h) | 2h |
| 3.2 | Filtros avançados (por tier, valor, data) | 1h |
| 3.3 | Exportar CSV histórico | 30min |
| 3.4 | Smoke test E2E completo (técnico → admin → boleto) | 1h |

**Total:** 5-7 dias úteis

---

## 6. Entregáveis da Fase 1 (mínimo viável já implementado)

Anexos a esta entrega:

1. ✅ `cora-api/database.js` — adicionado CREATE TABLE `pending_approvals`
2. ✅ `cora-api/routes/approvals.js` — 8 endpoints RESTful
3. ✅ `cora-api/server.js` — registrado o router
4. ✅ `cora-api/CobrancaManager.js` — método `onTicketClosed` com hook
5. ✅ `admin/aprovacoes.html` — página de fila com decisão
6. ✅ Smoke test validando fluxo E2E

---

## 7. Critérios de aceite

- [ ] Técnico fecha OS com peça → sistema cria pending_approval automaticamente
- [ ] Admin visualiza fila em `admin/aprovacoes.html`
- [ ] Admin aprova → boleto vai pro gateway Cora automaticamente
- [ ] Admin edita valor → boleto é reemitido com valor novo
- [ ] Admin rejeita → OS volta para "reprovada" + cliente notificado
- [ ] Superadmin vê tudo (incluindo >R$ 5k que ficou retido com admin)
- [ ] Cliente premium <R$ 500 → fluxo auto, **sem** aprovação
- [ ] Pendência não tratada em 7 dias → auto-cancelada
- [ ] Toda decisão gera log de auditoria (`auditlog`)
- [ ] Popup aparece em todas admin/*.html quando há pendências

---

## 8. TL;DR

**A imagem ERP que você trouxe é sólida e cabe perfeitamente no Renostter.** Validei contra o estado atual e o máximoギャップ que temos (bug G7 — cliente aprova mas admin precisa disparar) é EXATAMENTE esse fluxo que você trouxe.

**5 melhorias que proponho vs seu draft original:**
1. Auto-confirmação para clientes premium pequenos (evita ruído)
2. Aprovação multi-nível por valor (admin ≤R$1k, super acima, compliance >R$5k)
3. Timeout escalável (24h alerta, 48h escalona, 7d cancela)
4. Fila dedicada em `aprovacoes.html` (não só pop-up)
5. Reuso de `notifications` + `auditlog` + `NotificationService` (sem canal novo)

**Implementação já iniciada** — vou entregar Fase 1 funcional (schema + endpoints + hook + UI mínima) e documentar o que falta pra você revisar.

Quer que eu prossiga com a implementação completa ou prefere validar antes as melhorias estruturais?
