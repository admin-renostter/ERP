# Guia de Uso — Garantia

> **Módulo:** Garantia
> **Status:** ✅ 100% operacional · Versão 1.0 (Jul/2026)
> **Prazos padrão:** 90 dias instalação / 1 ano fabricante
> **Documentação visual:** [`guia-garantia.html`](./guia-garantia.html)

---

## Sumário

1. [Visão geral](#1-visão-geral)
2. [Tipos de garantia](#2-tipos-de-garantia)
3. [O que está coberto](#3-o-que-está-coberto)
4. [Acesso rápido](#4-acesso-rápido)
5. [Lista de garantias ativas](#5-lista-de-garantias-ativas)
6. [Como solicitar garantia](#6-como-solicitar-garantia)
7. [Reabertura de chamado](#7-reabertura-de-chamado)
8. [Regras de reabertura automática](#8-regras-de-reabertura-automática)
9. [Workflow típico](#9-workflow-típico)
10. [Boas práticas](#10-boas-práticas)
11. [API reference](#11-api-reference)

---

## 1. Visão geral

O módulo de **Garantia** rastreia todas as garantias ativas dos equipamentos instalados pela Renostter, gerencia solicitações de cobertura e automatiza a reabertura de chamados quando há recorrência do mesmo problema.

### Por que existe

Garantia é um tema crítico em HVAC. Sem sistema:

- Cliente liga reclamando "está na garantia" mas ninguém sabe a data exata de início/fim
- Técnico vai ao local, descobre que o problema é *uso indevido* (não coberto) — visita perdida
- Mesmo problema recorrente em 30 dias = defeito de fábrica, mas ninguém rastreia
- Reabertura de chamado é feita manualmente, sem histórico

O módulo resolve com: rastreio automático de prazos, regras claras de cobertura, alertas de vencimento, e reabertura automática quando o problema volta.

### Quem usa

- **Cliente** — consulta se o serviço está na garantia, abre solicitação
- **Técnico** — verifica cobertura antes de ir ao local
- **Coordenador** — aprova/rejeita solicitações de garantia
- **Gerente** — KPIs de garantia (cobertura, reaberturas, custo)

---

## 2. Tipos de garantia

A Renostter oferece 3 tipos de garantia em cada serviço:

| Tipo | Cobertura | Prazo padrão | Quando aplicar |
|------|-----------|--------------|----------------|
| `Instalação` | Defeitos de mão-de-obra (vazamentos, mau contato, fixação) | 90 dias | Toda instalação nova |
| `Fabricante` | Defeitos de fábrica do equipamento (compressor, placa, sensor) | 1 ano (ou conforme fabricante) | Equipamento novo |
| `Estendida` | Cobertura adicional além do fabricante (vendida como upgrade) | +1 ou +2 anos | Cliente compra (geralmente 10-15% do valor) |

> ℹ️ **Como o sistema sabe o prazo?**: Quando o técnico fecha o chamado de **instalação** (categoria = "instalacao") ou **PMOC**, o sistema cria automaticamente uma garantia com a data de início = data de fechamento e prazo conforme tipo.

---

## 3. O que está coberto (e o que não está)

### ✅ Coberto

- Defeito de fabricação (compressor não liga, placa queimada, sensor falha)
- Mão-de-obra mal executada (tubo mal soldado, suporte mal fixado)
- Peça com defeito trocada na garantia do fornecedor (Renostter repõe)

### ❌ Não coberto

- **Uso indevido** — cliente mexeu no aparelho, usou em ambiente inadequado
- **Falha elétrica externa** — raio, queda de energia, surto
- **Falta de manutenção** — filtro sujo há 2 anos, gás acabou por vazamento antigo
- **Desgaste natural** — após 5 anos, compressor com barulho é normal
- **Instalação por terceiros** — se outro técnico mexeu, garantia Renostter é perdida

---

## 4. Acesso rápido

1. **Sidebar** → menu *Operacional* → *Garantia*
2. **URL direta**: `http://localhost:3000/crm/admin/garantia.html`
3. **PWA técnico** — consulta rápida em campo

---

## 5. Lista de garantias ativas

A lista mostra todas as garantias ainda dentro do prazo, com:

- **Cliente** + equipamento (modelo, BTU, número de série)
- **Tipo de garantia** (instalação / fabricante / estendida)
- **Data de início** e **dias restantes** (com barra de progresso)
- **Técnico que instalou**
- **Status** (ativa, vencendo, expirada, reclamada)
- **Ações**: ver OS original, abrir solicitação, renovar

### Status visual

| Cor | Status | Quando | Ação |
|-----|--------|--------|------|
| Verde | Ativa (dias > 30 restantes) | Mais de 30 dias pela frente | Nenhuma |
| Amarelo | Vencendo (≤ 30 dias) | 30 dias ou menos restantes | Oferecer estendida ao cliente |
| Vermelho | Expirada | Prazo passou | Cobra visita técnica normal |
| Roxo | Reclamada | Em análise de cobertura | Avaliar e aprovar/rejeitar |

---

## 6. Como solicitar garantia

Quando o cliente liga dizendo "está na garantia":

1. Na lista, encontre o equipamento dele (busque por cliente ou número de série)
2. Clique no **botão "Solicitar Garantia"**
3. Preencha o **motivo** (ex: "compressor não liga após 2 meses")
4. Anexe **fotos/vídeo** do defeito (obrigatório para análise)
5. Selecione a **categoria** (defeito, mau funcionamento, etc)
6. Confirme — sistema abre um **novo chamado** marcado como "Garantia" e status "Reclamada"

Quando o sistema cria o chamado a partir da garantia:

- Já puxa dados do cliente, equipamento, histórico
- Marca prioridade como **Alta** (não crítica, mas importante)
- Notifica o coordenador para aprovar antes de enviar técnico

---

## 7. Reabertura de chamado

Se o cliente abre um **novo chamado** com a mesma categoria do mesmo equipamento em até **30 dias** após o fechamento do anterior, o sistema:

1. Detecta o padrão (mesmo cliente + mesmo equipamento + mesma categoria + < 30 dias)
2. Marca automaticamente como **"Reabertura"**
3. Associa ao chamado original (link visível)
4. Eleva a **prioridade para Crítica** (defeito recorrente = problema sério)
5. Alerta o coordenador + gerente técnico

> ⚠️ **Por que isso importa**: 3+ reaberturas em 90 dias = provável defeito de fábrica. Aciona processo de **RMA** (devolução ao fabricante) + **troca do equipamento** sem custo ao cliente (reputação).

---

## 8. Regras de reabertura automática

Configuráveis em *Configurações > Regras de Garantia*:

| Regra | Default | O que faz |
|-------|---------|-----------|
| Janela de reabertura (dias) | 30 | Considera reabertura se chamado novo abrir em até N dias |
| Prioridade automática de reabertura | Crítica | Força prioridade alta para reabertura |
| Reaberturas para RMA | 3 | Após N reaberturas, sistema sugere RMA ao fabricante |
| Notificar gerente técnico | Sim | Envia alerta a cada reabertura |
| Bloquear OS se garantia expirada | Não | Se sim, coordenador precisa aprovar antes de técnico ir |

---

## 9. Workflow típico

Cenário: cliente instala split em janeiro, em março reclama que não gela.

1. **Cliente liga** reclamando — atendente pergunta "quando instalou?"
2. Atendente consulta o módulo **Garantia** — vê que está dentro do prazo (60 dias restantes)
3. Atendente clica **"Solicitar Garantia"**, preenche motivo, anexa foto
4. Sistema abre **chamado #00013** marcado como "Reabertura" (se aplicável) ou "Garantia"
5. Coordenador **aprova** e atribui ao técnico disponível
6. Técnico vai ao local, **diagnostica** — se for defeito coberto, executa sem cobrar
7. Se for mau uso, técnico marca como "Não coberto" — cliente é informado via OS
8. Técnico fecha o chamado — sistema marca garantia como "Utilizada" e atualiza histórico

---

## 10. Boas práticas

### ✅ Faça

- **Sempre verifique a garantia** antes de aceitar visita particular (pode ser coberta)
- **Documente bem a OS original** — facilita provar uso indevido se necessário
- **Anexe fotos no fechamento** da instalação (estado do equipamento) — evidência em disputa
- **Ofereça garantia estendida** proativamente 30 dias antes de vencer
- **Monitore reaberturas** — 3+ em 90 dias = RMA

### ❌ Evite

- **Não estenda garantia verbalmente** sem registrar no sistema
- **Não negue cobertura sem investigar** — pode ser defeito de fábrica mesmo
- **Não delete garantias do histórico** — é prova legal em caso de processo

---

## 11. API reference

### GET /api/garantias

Lista garantias com filtros: `status` (ativa/vencendo/expirada), `cliente_id`, `tipo` (instalacao/fabricante/estendida), `equipamento_id`.

### GET /api/garantias/:id

Detalhe completo + histórico de chamados relacionados.

### POST /api/garantias

Cria nova garantia (geralmente automático quando instalação/PMOC é fechado).

```http
POST /api/garantias
{
  "equipamento_id": "<uuid>",
  "tipo": "fabricante",
  "data_inicio": "2026-07-21",
  "prazo_dias": 365,
  "nota_fiscal": "NF-12345"
}
```

### POST /api/garantias/:id/solicitar

Abre uma solicitação de garantia (cria chamado + marca como "Reclamada").

```http
POST /api/garantias/:id/solicitar
{
  "motivo": "Compressor não liga após 2 meses",
  "categoria": "defeito",
  "fotos": ["https://..."]
}
```

### POST /api/garantias/:id/aprovar

Coordenador aprova solicitação (autoriza visita técnica sem cobrança).

### POST /api/garantias/:id/rejeitar

Rejeita solicitação (mau uso, fora do prazo, etc). Gera notificação ao cliente.

```http
POST /api/garantias/:id/rejeitar
{
  "motivo": "mau_uso",
  "observacoes": "Filtro sujo há 2 anos, falta de manutenção"
}
```

### POST /api/garantias/:id/renovar

Estende a garantia (venda de upgrade).

```http
POST /api/garantias/:id/renovar
{
  "novo_prazo_dias": 365,
  "valor_cobrado": 450
}
```

### GET /api/garantias/reaberturas?cliente_id=<uuid>

Detecta padrões de reabertura (mesmo equipamento + mesma categoria + < 30 dias).

### GET /api/garantias/stats

KPIs: `ativas`, `vencendo_30d`, `expiradas`, `reaberturas_90d`, `taxa_cobertura`. Alimenta o BI.
