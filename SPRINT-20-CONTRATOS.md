# Sprint 20 — Pop-up "Novo Contrato"

**Data:** 2026-08-28
**Status:** ✅ Completo (13/13 testes E2E passando)

## Objetivo

Modal de "Novo Contrato" com:
- Busca de cliente com autocomplete
- Preenchimento automático de dados cadastrais
- Histórico de contratos anteriores
- Sugestões inteligentes (tipo, valor, SLA, serviços)
- Validações de regras de negócio
- Geração automática de número sequencial (CT-YYYY-NNNN)
- Integração com fluxo de caixa (Sprint 19)

## Arquivos Criados / Modificados

### Backend
- `cora-api/routes/contratos.js` (440 linhas) — 9 endpoints REST
- `cora-api/scripts/migrate-contratos-fix.js` — migration DB (5 colunas)
- `cora-api/scripts/seed-contratos.js` — seed cli-techcorp + usr-demo (idempotente)
- `cora-api/scripts/clean-contratos.js` — utilitário de limpeza
- `cora-api/scripts/test-contratos-e2e.js` — 13 testes E2E
- `cora-api/middleware/authJWT.js` — remoção de logs de debug
- `cora-api/server.js` — fix dotenv path (`__dirname/.env`)
- `cora-api/.env` — `AUTH_MODE=dual`

### Frontend
- `admin/contracts.html` (65KB) — modal reformulado com autocomplete

## Endpoints REST

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/contratos/options/tipos` | Tipos, frequências, serviços, SLAs |
| GET | `/api/contratos/next-numero` | Próximo número sequencial (CT-YYYY-NNNN) |
| GET | `/api/contratos/cliente/:id` | Contratos de um cliente |
| GET | `/api/contratos/cliente/:id/historico` | Histórico + sugestões inteligentes |
| GET | `/api/contratos` | Lista com filtros (cliente, status, tipo, datas) |
| GET | `/api/contratos/:id` | Detalhes do contrato |
| POST | `/api/contratos` | Criar novo contrato (com numeração auto) |
| PATCH | `/api/contratos/:id` | Atualizar dados |
| DELETE | `/api/contratos/:id` | Cancelar (soft delete) |

## Sugestões Inteligentes

Baseado no histórico do cliente:
- **Tipo de contrato** mais comum
- **Valor mensal** médio histórico (ou valor padrão do tipo)
- **SLA** padrão do tipo
- **Serviços recomendados** baseado no tipo

```json
{
  "sugestoes": {
    "tipo_contrato": "pmoc",
    "valor_mensal": 1800,
    "sla_resposta_horas": 4,
    "sla_resolucao_horas": 24,
    "servicos_recomendados": ["manutencao_preventiva", "higienizacao", "pmoc_relatorio"]
  }
}
```

## Validações Implementadas

| Código | Validação |
|--------|-----------|
| `MISSING_CLIENTE` | cliente_id obrigatório |
| `MISSING_TIPO` | tipo_contrato obrigatório |
| `INVALID_TIPO` | tipo_contrato não está na lista de tipos aceitos |
| `MISSING_DATES` | data_inicio e data_fim obrigatórios |
| `INVALID_DATE_RANGE` | data_fim deve ser posterior a data_inicio |
| `INVALID_VALOR` | valor_mensal deve ser > 0 |
| `CLIENTE_NOT_FOUND` | cliente não existe no DB |

## Bugs Corrigidos Durante a Sprint

1. **DB schema faltando colunas** (`clientes.ativo`, `audit_acessos.recurso/status_code/correlation_id/detalhes_json`, `contratos.servicos_json`)
2. **routes/contratos.js** — query com `cnpj_cpf` (deveria ser `cnpj`)
3. **routes/contratos.js** — query com `ativo` em `clientes` (não existia)
4. **routes/contratos.js** — INSERT em `logs_auditoria` com `usuario_id`/`ip` (deveria ser `user_id`/`ip_address`)
5. **routes/contratos.js** — `ReferenceError: ticket_medio is not defined` (variável era `ticketMedio`)
6. **routes/contratos.js** — `next-numero` pegava ano errado (`SUBSTR(id, 5)` pegava a partir do ano)
7. **routes/contratos.js** — destruturação com `= 'empresarial'` default impedia validação `MISSING_TIPO`
8. **server.js** — `require('dotenv').config()` procurava `.env` no cwd errado (workspace root em vez de `cora-api/`)
9. **.env** — não tinha `AUTH_MODE`, fallback era `legacy` (rejeitava JWT)

## Testes E2E (13/13 ✅)

```
✅ 1. Login usr-demo
✅ 2. Options tipos (7 tipos)
✅ 3. Next número (CT-2026-0001)
✅ 4. Histórico cli-techcorp (com sugestões)
✅ 5. POST contrato (201 + ID criado)
✅ 6. GET /api/contratos (lista)
✅ 7. GET contrato por ID
✅ 8. PATCH contrato
✅ 9a. Rejeita sem tipo (400 MISSING_TIPO)
✅ 9b. Rejeita valor zero (400)
✅ 9c. Rejeita vigência inválida (400)
✅ 9d. Rejeita cliente inexistente (404)
✅ 10. DELETE contrato (200)
```

## Próximos Passos

- [ ] Testar o pop-up no browser (`admin/contracts.html`)
- [ ] Sprint 20 melhorias #5 (Upload de documentos PDF)
- [ ] Sprint 20 melhorias #7 (Notificações automáticas por email)
- [ ] Sprint 20 melhorias #8 (Gerar PDF do contrato)
- [ ] Integração com módulo de Cobranças (gerar primeira fatura)

## Backup

- `BACKUPS/pre-contratos-complete-20260828-*/`
- `BACKUPS/pre-contratos-fix-20260828-121708/`
