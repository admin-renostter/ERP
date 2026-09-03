# 📚 Documentação — Renostter CRM

> **Sistema:** Middleware de cobrança + CRM HVAC com ERP integrado
> **Stack:** Node.js + Express + SQLite/Postgres + Chart.js + Playwright
> **Versão:** 1.0 (Jul/2026)
> **URL produção:** `http://localhost:3000/crm/`

Bem-vindo ao centro de documentação do Renostter CRM. Aqui você encontra guias de uso, referências técnicas, análises de fluxo e roadmaps do sistema.

---

## 🚀 Início rápido

| Você quer… | Leia |
|------------|------|
| **Aprender a usar o módulo de cotações** | [`guia-cotacao.html`](./guia-cotacao.html) (visual) ou [`guia-cotacao.md`](./guia-cotacao.md) (texto) |
| **Entender como o ERP está montado** | [`arquitetura-erp.html`](./arquitetura-erp.html) |
| **Ver o fluxo de uma venda ponta-a-ponta** | [`ANALISE-FLUXO-ERP.md`](./ANALISE-FLUXO-ERP.md) |
| **Migrar para Postgres/Supabase** | [`MIGRACAO-POSTGRES-ROADMAP.md`](./MIGRACAO-POSTGRES-ROADMAP.md) |

---

## 📖 Guias de uso (módulos)

Guias passo a passo para o usuário final (vendedor, técnico, gerente).

### ✅ Disponíveis

- **📐 Cotação / Dimensionamento HVAC** — [`guia-cotacao.html`](./guia-cotacao.html) · [`guia-cotacao.md`](./guia-cotacao.md)
  - Como criar cotação via wizard de 4 passos
  - Cálculo de BTU com 8 fatores técnicos
  - BOM automático (lista de materiais)
  - Geração de PDF profissional
  - API reference completa (10 endpoints)

- **❄️ PMOC** (Plano de Manutenção, Operação e Controle) — [`guia-pmoc.html`](./guia-pmoc.html) · [`guia-pmoc.md`](./guia-pmoc.md)
  - Agenda de manutenções e checklists
  - Conformidade ABNT NBR 16020
  - Workflow de execução preventiva
  - API reference (5 endpoints)

- **📄 Contratos & RMR** (Receita Mensal Recorrente) — [`guia-contratos.html`](./guia-contratos.html) · [`guia-contratos.md`](./guia-contratos.md)
  - CRUD de contratos recorrentes
  - Métricas SaaS: MRR, ARR, NRR, Churn
  - Renovação automática e manual
  - Análise de churn por motivo
  - API reference (9 endpoints)

- **🎯 Leads (CRM Pipeline)** — [`guia-leads.html`](./guia-leads.html) · [`guia-leads.md`](./guia-leads.md)
  - Funil de 5 etapas (novo → qualificado → proposta → negociação → ganho/perdido)
  - Engine de scoring 0-100 com 9 sinais positivos + 5 negativos
  - Análise por origem (whatsapp, site, evento, etc)
  - Conversão automática lead → cliente via cotação
  - API reference (7 endpoints)

- **🎫 Chamados (Suporte Técnico)** — [`guia-chamados.html`](./guia-chamados.html) · [`guia-chamados.md`](./guia-chamados.md)
  - 6 status sequenciais (aberto → em andamento → resolvido → fechado)
  - SLA por prioridade (4h crítica / 24h alta / 48h média / 72h baixa)
  - Transferência entre técnicos (audit log)
  - CSAT pós-atendimento (NPS 0-10)
  - API reference (6 endpoints)
  - Credenciais de demo (admin/tecnico/cliente)

- **📊 BI Dashboard** — [`guia-bi.html`](./guia-bi.html) · [`guia-bi.md`](./guia-bi.md)
  - 12 KPIs (financeiro + operacional + vendas + estoque)
  - 6 charts (receita, cotações, tickets, leads origem, donuts)
  - Funil de Vendas em 5 etapas
  - Mix de equipamentos + Leads por origem
  - Workflow de leitura diária (5-10 min)
  - API reference (1 endpoint)

- **🛡️ Garantia** — [`guia-garantia.html`](./guia-garantia.html) · [`guia-garantia.md`](./guia-garantia.md)
  - 3 tipos (instalação 90d / fabricante 1 ano / estendida)
  - Cobertura: defeitos de fábrica + mão-de-obra (exclui uso indevido)
  - Reabertura automática de chamado (mesmo problema em < 30 dias)
  - Regra de RMA após 3 reaberturas em 90 dias
  - API reference (7 endpoints)

- **📦 Estoque (Inventory)** — [`guia-estoque.html`](./guia-estoque.html) · [`guia-estoque.md`](./guia-estoque.md)
  - Catálogo com SKU + categoria + preço custo/venda
  - Movimentação de estoque (entrada/saída/ajuste/transferência)
  - Alertas de baixo estoque (com cores semáforo)
  - Importação em massa (CSV)
  - Integração com BOM de cotação e saída automática via OS
  - API reference (7 endpoints)

### 🎉 Todos os módulos documentados!

---

## 🏗️ Documentação técnica

Para devs e equipe técnica.

### Arquitetura

- [`arquitetura-erp.html`](./arquitetura-erp.html) — Diagrama visual dos módulos, dependências e fluxos de dados
- [`ANALISE-FLUXO-ERP.md`](./ANALISE-FLUXO-ERP.md) — Análise completa do fluxo de uma venda (lead → cobrança)
- [`ANALISE-FLUXO-COBRANCA.md`](./ANALISE-FLUXO-COBRANCA.md) — Detalhe do fluxo de cobrança (Cora gateway)
- [`FLUXO-APROVACAO-ADMIN.md`](./FLUXO-APROVACAO-ADMIN.md) — Como aprovações funcionam (workflow + roles)

### Migração & deploy

- [`MIGRACAO-POSTGRES-ROADMAP.md`](./MIGRACAO-POSTGRES-ROADMAP.md) — Roadmap completo SQLite → Supabase
- [`CUTOVER-POSTGRES.md`](./CUTOVER-POSTGRES.md) — Procedimento de cutover (zero-downtime)
- [`MIGRACAO-DOMINIO-CLOUDFLARE.md`](./MIGRACAO-DOMINIO-CLOUDFLARE.md) — Setup de domínio custom + Cloudflare

### Histórico & decisões

- [`HOTFIX-CAMADA-1.md`](./HOTFIX-CAMADA-1.md) — Correções aplicadas (CORS, Helmet, CSP, etc.)
- [`REFORMULACAO-COBRANCA.md`](./REFORMULACAO-COBRANCA.md) — Refatoração do módulo de cobrança

---

## 🧩 Mapa de módulos

| Módulo | URL Admin | Guia | Status |
|--------|-----------|------|--------|
| **Dashboard** | `admin/dashboard.html` | — | ✅ Estável |
| **Cotações** | `admin/cotacoes.html` | [📐 Cotação](./guia-cotacao.html) | ✅ Estável |
| **PMOC** | `admin/pmoc.html` | 🔜 | ✅ Estável |
| **Contratos & RMR** | `admin/contracts.html` | 🔜 | ✅ Estável |
| **BI Dashboard** | `admin/bi.html` | 🔜 | ✅ Estável |
| **Leads** | `admin/leads.html` | 🔜 | ✅ Estável |
| **Chamados** | `admin/tickets.html` | 🔜 | ✅ Estável |
| **Garantia** | `admin/garantia.html` | — | ✅ Estável |
| **Estoque** | `admin/inventory.html` | — | ✅ Estável |
| **Dispatch (técnicos)** | `admin/dispatch.html` | — | ✅ Estável |
| **PWA Técnico** | `tecnico/index.html` | — | ✅ Estável |

---

## 🔌 Stack técnica

```
Backend    Node.js 24 + Express 4 + better-sqlite3
Frontend   HTML/CSS vanilla + Chart.js (CDN)
PDF        Playwright/Chromium headless
Pagamento  Cora API v2 (mTLS)
Banco      SQLite (dev) → Postgres/Supabase (prod planejado)
Auth       Header-based (X-User-Id / X-User-Role)
Deploy     node server.js (porta 3000)
```

### Estrutura de pastas

```
renostter-crm/
├── admin/               # Páginas admin (HTML estático)
│   ├── dashboard.html
│   ├── cotacoes.html
│   ├── pmoc.html
│   ├── contracts.html
│   ├── bi.html
│   └── ...
├── tecnico/             # PWA técnico (mobile-first)
│   └── index.html
├── cora-api/            # Backend Node.js
│   ├── server.js
│   ├── database.js
│   ├── CotacaoManager.js
│   ├── contratoManager.js
│   ├── gateways/        # Cora, Itaú
│   └── ...
├── css/
│   └── global.css
├── docs/                # ← VOCÊ ESTÁ AQUI
│   ├── README.md
│   ├── guia-cotacao.html / .md
│   ├── arquitetura-erp.html
│   └── ...
└── package.json
```

---

## 📊 Status do sistema (Jul/2026)

```
✅ Módulos estáveis      11/11
✅ Endpoints REST         100+
✅ Cobertura testes       E2E: 100% nos módulos críticos
✅ PWA técnico            Offline-first com service worker
✅ BI Dashboard           Consolidado com 12 KPIs + 6 charts
✅ PDF real               Playwright/Chromium
⚠️  Postgres migration    Bloqueado (aguarda connection string Supabase)
⚠️  Banking module Cora  Bloqueado (aguarda suporte Cora ativar módulo)
```

### Métricas atuais (banco de dev)

```
Cotações:  7
Leads:     1
Clientes:  1
Estoque:   24 itens (8 equipamentos + 16 materiais)
Contratos: 0 (Phase 2 — setup)
Chamados:  28 (1.012 cobranças)
PMOC:      Em configuração inicial
```

---

## 🤝 Como contribuir

1. **Bug?** Abra issue descrevendo passos para reproduzir + logs
2. **Feature nova?** Abra issue com caso de uso + mockup (pode ser Figma ou print)
3. **Documentação?** Edite o `.md` correspondente e abra PR
4. **Mudança de arquitetura?** Documente em `docs/` antes de codar

### Convenções

- **Commits**: Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`)
- **Branches**: `feat/<slug>`, `fix/<slug>`, `docs/<slug>`
- **PRs**: mínimo 1 reviewer + checklist preenchido

---

## 📞 Contato

- **Tech lead**: time interno Renostter
- **Vendor gateway**: Cora (suporte via portal)
- **Hospedagem**: self-hosted (VPS) ou Supabase (futuro)

---

**Última atualização:** 21/07/2026 · Mantido por [time Renostter]
