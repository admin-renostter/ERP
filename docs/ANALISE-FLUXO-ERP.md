# Análise: Fluxo ERP de Faturamento Automático × Renostter CRM

**Data:** 2026-07-03
**Solicitante:** João
**Material analisado:**
- 2 imagens (`WhatsApp Image 2026-07-03 at 03.30.06.jpeg` e `(1).jpeg`)
- Estado atual do projeto Renostter CRM (analisado previamente)

---

## TL;DR

**O fluxo ERP é viável mas exige ajustes para o contexto do Renostter.**

✅ Vale aplicar: a **separação Atendimento × Contrato**, a **etapa de conciliação** e a **máquina de estado explícita**.
⚠️ Traz armadilhas: a integração **fiscal (NF-e/NFS-e)** está fora do escopo atual e exige certificado digital A1/A3 + homologação SEFAZ.
❌ Não vale copiar: o pressuposto de **"humano concilia manualmente"** — Renostter pode automatizar via webhook (já tem).

Recomendação: aplicar **em 2 fases separadas** — Fase A (já viável, ~5 dias) replica o fluxo de boletos; Fase B (fiscal, ~3-4 semanas) adiciona NF-e/NFS-e após robustez.

---

## 1. Mapeamento: Fluxo ERP × Estado Atual

### 1.1 Imagem 1 — Visão geral do fluxo de "Faturamento Automático"

| Etapa ERP | Equivalente no Renostter | Estado |
|---|---|---|
| Atendimento Técnico | `tech/tickets.html` (chamado + inclusão de peça) | ✅ Existe |
| Ordem de Serviço (OS) | `stock_movements` com `ticketId` | ✅ Existe (parcial) |
| Geração da Fatura NF-e/NFS-e | `CobrancaManager.criarFatura()` + tabela `faturas` | 🟡 Existe mas fiscal = **ZERO** |
| Emissão do Boleto | `CobrancaManager.emitirCobranca()` via CoraGateway | ✅ Existe (Cora configurado) |
| Envio ao Cliente | `NotificationService.enviarCobranca()` | 🟡 Existe mas SMTP opcional |
| **Integração Fiscal (SEFAZ/Prefeitura)** | — | ❌ **Não existe** |
| **Integração Bancária** | `CoraGateway.getStatement()` | ✅ Existe |
| **Conciliação Bancária** (humano) | — | ❌ Não existe |
| **Controle Financeiro** (Relatórios & Caixa) | `admin/cobrancas.html` + `admin/financeiro.html` (refactor em andamento) | 🟡 Parcial |
| **Cobrança & Alertas** (Inadimplência) | `ReminderService` (D-5, D-1, D+1) | ✅ Existe |
| **Conciliação Bancária** → Pagamentos & Recebimentos | webhooks (Cora) já processam `INVOICE.PAID` | ✅ Existe |

### 1.2 Imagem 2 — Dois caminhos paralelos (Atendimento vs Contrato)

**Lado esquerdo (Atendimento Técnico):**
```
OS Concluída → Emitir Fatura (NF-e/NFS-e) → Gerar Boleto Bancário
   → Enviar Boleto (e-mail + portal)
   → Atualizar Contas a Receber (aguardando pgto)
   → Conciliação Bancária (pagamento recebido)
```

**Lado direito (Contrato Recorrente):**
```
Contrato Ativo → Gerar Fatura Recorrente → Emitir Boleto Mensal
   → Enviar Boleto (e-mail + portal)
   → Atualizar Contas a Receber (aguardando pgto)
   → Conciliação Bancária (pagamento recebido)
```

**Comparação com o Renostter:**

| Etapa | Implementação atual | Lacuna |
|---|---|---|
| **OS Concluída** | `ticket.status = "fechado"` ou "resolvido" | Falta gatilho automático "se status→fechado && tem peça aprovada → gerar fatura" |
| **Emitir Fatura NF-e/NFS-e** | `criarFatura()` cria row na tabela `faturas` com status `AGUARDANDO_AUTORIZACAO` | ❌ Não emite NF-e real (sem SEFAZ) |
| **Gerar Boleto Bancário** | `emitirCobranca()` → Cora API | ✅ OK |
| **Enviar Boleto** | `NotificationService.enviarCobranca()` | 🟡 SMTP opcional, WhatsApp mock |
| **Atualizar Contas a Receber** | Paralelo em `client.pendingBalance` + `financial_transactions` + `cobrancas` | 🟡 Bug G2 (3 ledgers) |
| **Conciliação Bancária** | Manual pelo admin hoje | ❌ Falta serviço automatizado |
| **Gerar Fatura Recorrente** | `executarRecorrencias()` no cron job | ✅ Existe |
| **Emitir Boleto Mensal** | Mesmo `emitirCobranca()` | ✅ Existe |
| **Pagamento Recebido** | Webhook `INVOICE.PAID` | ✅ Existe, mas **HMAC já implementado (Camada 1 hotfix)** |

---

## 2. Pontos **BONS** — vale aplicar

### ✅ B1. Separação Atendimento × Contrato (Imagem 2)

**O que trás:** clareza arquitetural — atende **2 fontes distintas de receita** que o Renostter claramente tem (atendimento avulso + contrato mensal PMOC/preventiva).

**Como aplicar no Renostter:**
- A tabela `cobrancas` (futura `invoices`) ganha coluna `source` com valores `'service_order' | 'contract' | 'manual'`
- Dashboard mostra métricas separadas (KPIs atualmente não separam)
- Relatórios financeiros quebram receita por origem

**Esforço:** 1 sprint (já está parcialmente na implementação `source` proposta em `REFORMULACAO-COBRANCA.md`)

### ✅ B2. Etapa explícita "Emitir Fatura" entre OS e Boleto

**O que trás:** hoje no Renostter, **cliente aprova a Fatura no portal mas admin precisa disparar a emissão manualmente** (gap G7 já mapeado). A imagem deixa explícito que "Emitir Fatura" é o gatilho.

**Como aplicar:**
- Adicionar evento `status_changed` no ticket (`fechado` ou `resolvido`) que automaticamente:
  1. Cria Fatura (status `PENDING_APPROVAL` ou `OPEN` dependendo do `approval_mode`)
  2. Dispara `emitirCobranca()` no gateway Cora
  3. Envia e-mail com boleto
  4. Registra auditoria completa

**Esforço:** já mapeado na Fase 1 do plano de reformulação

### ✅ B3. "Atualizar Contas a Receber" — visão contábil explícita

**O que trás:** hoje o fluxo Renostter mistura 3 representações:
- `client.pendingBalance` (paralelo, bug G2)
- `financial_transactions` (ledger)
- `cobrancas` (status de cobrança)

A imagem ERP obriga ter **uma única posição contábil** "Contas a Receber" que é atualizada em eventos discretos:
- Boleto emitido → +R$valor (provisionado)
- Pagamento recebido → -R$valor (baixa)
- Cancelamento → -R$valor (estorno)

**Como aplicar:**
- Eliminar `client.pendingBalance` (resolve bug G2)
- Criar view SQL `vw_contas_receber` agregando `invoices` por `client_id + status`
- Relatórios leem da view (sempre consistente)

**Esforço:** pequeno, mas essencial p/ evitar Bug G2

### ✅ B4. "Conciliação Bancária" como serviço automatizado

**O que trás:** a imagem diz "Conciliação Bancária" mas no ERP tradicional isso é **manual** — humano confere extrato do banco vs sistema. O Renostter pode **automatizar 100%** porque:

- Webhook Cora → atualiza `cobrancas.status='PAID'` automaticamente (já existe)
- `CoraGateway.getStatement()` puxa extrato via API (já existe)
- **Falta:** script diário que cruza `cobrancas WHERE status='PAID'` vs `webhooks_recebidos WHERE event_type='INVOICE.PAID'`
- Detecta divergências (pagamentos recebidos sem boleto, ou boletos PAID sem webhook)

**Como aplicar:**
- Novo `cora-api/services/ConciliationService.js`
- Cron diário (3h da manhã) chama `reconcileDaily()`
- Relatório `admin/cobrancas.html` aba "Conciliação" mostra divergências

**Esforço:** 3-4 dias. Diferencial competitivo vs ERP tradicional.

### ✅ B5. Notificações em duas vias (e-mail + Portal)

**O que trás:** ERP padrão manda boleto por **e-mail e portal** (Imagem 2 mostra os dois caminhos saindo de "Enviar Boleto ao Cliente"). Renostter tem:
- ✅ E-mail (com template Renostter pronto em `NotificationService.js`)
- ❌ WhatsApp (mock, não envia)
- ⚠️ Portal cliente (`client/faturas.html`) — já mostra, mas exige login

**Como aplicar:**
- Curto prazo: corrigir envio real (SMTP gerenciado tipo Resend/SendGrid)
- Médio prazo: substituir mock WhatsApp por Twilio ou Z-API
- Já existe o template `cobranca` em `NotificationService.js` — funciona, falta configurar SMTP

### ✅ B6. Régua de Inadimplência (Cobrança & Alertas)

**O que trás:** Imagem 1 mostra "Cobrança & Alertas" como pilar de saída. Renostter já tem `ReminderService.js` com D-5 / D-1 / D+1.

**Falta:** após D+30, não tem nível mais agressivo (D+60, D+90). ERP tradicional costuma ter 4-5 níveis. Vale adicionar.

**Esforço:** 1-2 dias, baixa complexidade.

---

## 3. Pontos **RUINS** — armadilhas a evitar

### ⚠️ R1. Integração Fiscal (NF-e/NFS-e) **fora do escopo atual**

**O que a imagem promete:** emissão de Nota Fiscal Eletrônica (NF-e) ou Nota Fiscal de Serviços Eletrônica (NFS-e) integrada ao fluxo.

**Por que NÃO aplicar agora:**
- Requer **certificado digital A1 ou A3** (e-CNPJ) da Renostter — coisa **separada** do certificado mTLS do Cora
- Homologação SEFAZ (estadual) + prefeitura (municipal) para NFS-e — Renostter está em SP capital, então usa NFS-e da Prefeitura de SP (exige credenciais + ambiente de homologação específico)
- Numeração sequencial obrigatória (NF-e tem validade jurídica — duplicar número = infração fiscal)
- Backup de XML por 5 anos (legislação)
- Contingência (modo offline de NF-e)
- **Volumetria baixa do Renostter** (~10-50 chamados/mês) não justifica investimento imediato

**Recomendação:** tratar como **fase separada, fase B**. Implementar primeiro boleto + conciliação. Fiscal é mês de projeto + jurídico envolvido.

**Esforço se for aplicar:** 3-4 semanas + R$ 1-3k/ano de certificado A1.

### ⚠️ R2. Dois caminhos paralelos duplicam muita coisa

**O que a imagem tem:** Atendimento (esquerdo) e Contrato (direito) com **mesmos últimos 4 passos** (Enviar Boleto + Atualizar Contas + Conciliação).

**Risco:** se você implementar cada caminho separadamente (como sugere a imagem), você duplica código. Toda mudança no boleto, nas notificações, na conciliação precisa ser feita em 2 lugares.

**Como aplicar bem:**
- Modela como **uma única máquina de estado** (já proposto em `REFORMULACAO-COBRANCA.md`)
- Parâmetro `source` indica Atendimento vs Contrato
- A UI mostra origem mas a lógica é única

**Esforço:** evitar isso é o que já planejamos — manter a Fase 1 (`/api/invoices`) agnóstica de origem.

### ⚠️ R3. "Conciliação Bancária" manual (no ERP tradicional)

**O que a imagem implica:** alguém confere extrato vs sistema manualmente.

**Por que é ruim:**
- Trabalho repetitivo (Renostter tem ~50 boletos/mês → ~600/ano)
- Risco humano de erro (esquecer de conferir)
- Não escala

**Por que Renostter não precisa disso:** webhooks Cora já automatizam (já tem com HMAC da Camada 1). Pode ser **100% automático com detecção de divergência** (R4).

### ⚠️ R4. Não tem camada de erro explícita

**O que a imagem NÃO mostra:** o que acontece se a NF-e falha? Se o boleto falha? Se o e-mail falha?

**Risco se você seguir à risca:** fluxo "felizes para sempre" assume tudo funciona — na produção, falha de:
- API Cora retorna 500 → boleto não emitido mas ticket já foi "fechado"
- SMTP fora → cliente não recebe boleto
- SEFAZ fora → NF-e não autorizada

**Como evitar:**
- Implementar **event sourcing** (já sugerido no plano)
- Tudo que falhar fica numa tabela `failed_events`
- Retry assíncrono (BullMQ ou similar)
- Alerta no admin dashboard para falhas

**Esforço:** integrado à Fase 1 da reformulação (~2 dias extras)

### ⚠️ R5. Compliance fiscal + responsabilidade civil

**Risco:** NF-e emitida com erro de valor ou cliente tem implicações fiscais reais. Multa de 1-3% do valor da nota + possibilidade de cancelar CNPJ em casos extremos.

**Por isso não fazer agora:** sem consultoria jurídica + contador no projeto, erro é responsabilidade do dev.

**Recomendação:**
- Fase A (sem NF-e): boleto é "documento particular" (recibo) — não exige nota
- Fase B (com NF-e): envolver contador + homologação

### ⚠️ R6. Numeração de OS e Fatura precisa ser sequencial

**O que a imagem não diz:** NF-e tem numeração sequencial autorizada pela SEFAZ (sem "saltos", sem "duplicatas"). Se você emite NF-e "1" duas vezes, é infração.

**Implicação no schema:** tabela `faturas` (futura `invoices`) precisa de `numero_fiscal INTEGER UNIQUE` com constraint de unicidade no banco. Hoje o Renostter gera `cob_` + UUID split (aleatório) — incompatível com numeração fiscal.

**Esforço:** já está mapeado em `REFORMULACAO-COBRANCA.md` no `source_ref` — bom.

### ⚠️ R7. Conceito "Contas a Receber" ≠ Banco de Dados (imagem)

**O que a imagem sugere:** "Atualizar Contas a Receber" é uma ação única (uma tabela).

**Risco:** se você modelar "contas a receber" como tabela, vira mais um ledger (Bug G2 amplificado).

**Como aplicar bem:**
- "Contas a Receber" = **view SQL** sobre `invoices`
- Não persistir "contas a receber" — calcular
- Receita: `SUM(valor) WHERE status='PAID' AND paid_at BETWEEN ?` — sempre consistente

**Esforço:** 2 horas no SQL + 4 horas na UI

---

## 4. Pontos **DESAFIOS TÉCNICOS** específicos

### 🎯 D1. Certificado A1/A3 ≠ certificado mTLS Cora

Cuidado pra não confundir:
- **mTLS Cora**: par `certificate.pem` + `private-key.key` para autenticação com API Cora
- **e-CNPJ A1/A3**: certificado digital ICP-Brasil para NF-e, com **outras chaves + cadeia diferente**

**Recomendação:** se for pra NF-e (Fase B), comprar A1 separado (~R$200/ano para A1 de Pessoa Jurídica).

### 🎯 D2. Sincronização 3 fontes (banco ↔ fiscal ↔ sistema)

NF-e autorizada pela SEFAZ é fonte de verdade legal. Boleto do banco é fonte de verdade comercial. Sistema interno é fonte de verdade operacional. Se 3 fontes divergirem:
- Sistema diz "pago" + banco não reconheceu → falso positivo (alarme falso)
- Banco diz "pago" + sistema não reconheceu → divergência invisível (perda dinheiro)
- SEFAZ autorizou NF-e + boleto não emitido → NF-e emitida sem o cliente receber

**Solução:** event sourcing + reconciliação noturna (R4 + B4 juntos).

### 🎯 D3. Idempotência fiscal (legislação)

NF-e não pode ser duplicada. Hoje o Renostter tem `idempotency_key` no boleto (bom), mas para NF-e precisa ser **muito mais rigoroso** — retries com mesmo número fiscal = erro.

**Como aplicar:** fila dedicada + lock pessimista + retry manual só.

### 🎯 D4. Retenção legal de NF-e (5 anos)

NF-e emitida precisa ser guardada por 5 anos (XML + protocolo de autorização). LocalStorage do navegador não serve — precisa de **S3 ou storage equivalente**. Hoje Renostter guarda `documents.data` em base64 local — não escala.

### 🎯 D5. Renovação de certificado A1

A1 vence em 1-3 anos. Esquecer de renovar = emissão de NF-e para. Alerta operacional que o Renostter não tem.

---

## 5. Roadmap de Aplicação Recomendado

### **Fase A — Boleto + Conciliação (já viável, ~5 dias úteis)**

Aplica o fluxo ERP **sem NF-e**. É o que já temos mastigado:

| Dia | Entrega |
|---|---|
| D1 | Schema `invoices` (paralelo a `cobrancas`), view `vw_contas_receber` |
| D2 | `CobrancaManager.aprovarFatura()` chama automaticamente `emitirCobranca()` (resolve G7) |
| D3 | `ConciliationService.js` — cruza `cobrancas PAGO` vs `webhooks_recebidos` |
| D4 | Hook `ticket.status → resolvido` dispara fatura automaticamente |
| D5 | Smoke test E2E do fluxo completo |

**Resultado:** o fluxo da Imagem 2 **exceto a fatura NF-e/NFS-e**. Já é 80% do caminho.

### **Fase B — Fiscal (com contador + consultor jurídico, ~3-4 semanas)**

| Semana | Entrega |
|---|---|
| S1 | Compra de certificado A1 da Renostter (CNPJ). Setup do ambiente de homologação SEFAZ/Prefeitura SP. |
| S2 | Adapter `FiscalGateway` (interface igual a `PaymentGatewayInterface`). Implementação do provedor NF-e (NFePHP ou similar) e/ou NFS-e (SP-e com WSDL SOAP). |
| S3 | Numeração sequencial + contingência offline + backup S3. Schemas `nfe_emitidas` + `nfe_eventos`. |
| S4 | Integração com o fluxo de boletos: `Emitir Fatura NF-e` antes de `Gerar Boleto`. Teste em homologação + produtivo. |

**Resultado:** fluxo ERP completo (Imagem 2 inteira). Diferencial competitivo.

### **Fase C — Diferenciação (opcional, depois da B)**

- Régua de cobrança inteligente (4-5 níveis: D-5, D-1, D+1, D+15, D+30)
- Conciliação preditiva (machine learning detecta padrões de pagamento)
- Integração contábil (exportar para TOTVS, Omie, etc — contadores do cliente usam)

---

## 6. Decisões recomendadas

| Decisão | Recomendação | Por quê |
|---|---|---|
| Implementar Fase A agora? | ✅ Sim | Já tem infra (Cora) + remove bug G7 + automatiza 80% |
| Implementar Fase B (NF-e) agora? | ❌ Não — próximo trimestre | Risco fiscal + esforço alto + beneficiário é o contador, não o cliente final |
| Modelar "Contas a Receber" como tabela? | ❌ Não — usar view SQL | Elimina bug G2 por design |
| Manter `client.pendingBalance`? | ❌ Não — eliminar | Bug G2, fonte de divergência |
| Quais campos copiar da imagem? | Tudo (etiquetas conceituais) sem voltar etapas manuais | Imagem mostra conceito, não prescritivo |
| Boleto único por OS ou múltiplo? | Múltiplo (mais flexível) | Permite reemissão, partial payments, descontos |

---

## 7. Conclusão

**O fluxo ERP é totalmente aplicável ao Renostter, mas precisa de duas adaptações críticas:**

1. **Substituir a "Conciliação manual" por conciliação automatizada via webhook** (já temos 90% disso).
2. **Postergar a integração fiscal (NF-e/NFS-e) para Fase B** — não é viável sem consultoria jurídica + homologação + certificado A1.

**A Fase A é viável em uma semana** e resolve os 4 bugs críticos que já mapeei no plano de reformulação (G1, G2, G7 + adiciona R3 → conciliação automática). É o caminho natural já acordado.

**Quando for hora da Fase B**, será um projeto distinto com requisitos legais próprios, contador no loop, e provavelmente entre 6-12 meses de operação estável da Fase A.

---

## Próximo passo

Recomendo seguir exatamente o que já planejamos em `REFORMULACAO-COBRANCA.md`:
1. ✅ **Fase 0** entregue (Banco Cora configurado)
2. → **Fase 1**: backend paralelo (`/api/invoices/*`) + ConciliationService
3. → **Fase 2**: frontend light + UI reformulada
4. → **Fase 3**: validar + migrar
5. → **Fase B**: NF-e/NFS-e (próximo trimestre)

Quer que eu prossiga com a Fase 1 (backend), ou prefere fazer adaptações antes com base no que apontei aqui?

<media src="C:\Users\joaop\OneDrive\Documentos\ANTGRAVITY\renostter-crm\docs\ANALISE-FLUXO-ERP.md" caption="Análise completa do fluxo ERP de Faturamento Automático aplicada ao Renostter CRM — pontos bons, ruins e roadmap recomendado" />

<media src="C:\Users\joaop\.mavis\uploads\erp-1.jpeg" caption="Imagem 1: Fluxo ERP Faturamento Automático (visão geral)" />

<media src="C:\Users\joaop\.mavis\uploads\erp-2.jpeg" caption="Imagem 2: Fluxograma ERP Atendimento e Contrato (dois caminhos paralelos)" />

---

## 📋 Resumo rápido (pra você decidir)

| Categoria | Quantos | TL;DR |
|---|---|---|
| **Pontos bons** que valem aplicar | **6** (B1-B6) | Separação Atendimento×Contrato · Conciliação automática · Contas a Receber como view · Régua de inadimplência |
| **Pontos ruins/armadilhas** a evitar | **7** (R1-R7) | NF-e fora do escopo · Conciliação manual · Sem camada de erro · Compliance fiscal |
| **Desafios técnicos** específicos | **5** (D1-D5) | Certificado A1 ≠ mTLS Cora · 3 fontes de verdade · Idempotência rigorosa · Retenção 5 anos · Renovação |
| **Roadmap** | 2 fases | Fase A (1 semana) boleto+conciliação / Fase B (3-4 semanas) NF-e |

**Recomendação final:** vá com Fase A agora (já tem 80% da infra), guarde Fase B fiscal pro próximo trimestre com contador/jurídico no loop. A imagem ERP como **referência conceitual** (etapas, separação), não como prescrição técnica.

Quer que eu siga pra Fase 1 agora, ou prefere primeiro uma call pra alinhar com a equipe sobre quais decisões pendentes você topa já resolver?
erb-2.jpeg" caption="Imagem 2: Fluxograma ERP Atendimento e Contrato (dois caminhos paralelos)" />

---

## 📋 Resumo rápido (pra você decidir)

| Categoria | Quantos | TL;DR |
|---|---|---|
| **Pontos bons** que valem aplicar | **6** (B1-B6) | Separação Atendimento×Contrato · Conciliação automática · Contas a Receber como view · Régua de inadimplência |
| **Pontos ruins/armadilhas** a evitar | **7** (R1-R7) | NF-e fora do escopo · Conciliação manual · Sem camada de erro · Compliance fiscal |
| **Desafios técnicos** específicos | **5** (D1-D5) | Certificado A1 ≠ mTLS Cora · 3 fontes de verdade · Idempotência rigorosa · Retenção 5 anos · Renovação |
| **Roadmap** | 2 fases | Fase A (1 semana) boleto+conciliação / Fase B (3-4 semanas) NF-e |

**Recomendação final:** vá com Fase A agora (já tem 80% da infra), guarde Fase B fiscal pro próximo trimestre com contador/jurídico no loop. A imagem ERP como **referência conceitual** (etapas, separação), não como prescrição técnica.

Quer que eu siga pra Fase 1 agora, ou prefere primeiro uma call pra alinhar com a equipe sobre quais decisões pendentes você topa já resolver?