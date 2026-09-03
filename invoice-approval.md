# Implementação: Faturas e Aprovação de Cobrança

Este plano detalha a criação do processo de faturamento vinculado a chamados, com fluxo de aprovação pelo cliente e geração automática de cobrança Cora.

## Success Criteria
- [ ] Técnicos podem adicionar peças/serviços a um chamado.
- [ ] Uma fatura (FAT-YYYY-NNNN) pode ser gerada a partir desses itens.
- [ ] O cliente pode visualizar e Aprovar/Reprovar a fatura no portal.
- [ ] A aprovação gera automaticamente uma cobrança real (Cora) com vencimento em D+5.
- [ ] Logs de auditoria registram todo o processo.

## Tech Stack
- **Database**: SQLite (Middleware)
- **Backend**: Node.js/Express (Cora-API)
- **Frontend**: HTML5/Vanilla JS/CSS (Renostter Portals)

## File Structure Changes
- `cora-api/database.js` (Migrations)
- `cora-api/server.js` (Endpoints de Faturas)
- `cora-api/CobrancaManager.js` (Lógica de orquestração Fatura -> Cobrança)
- `client/faturas.html` [NEW] (Portal do Cliente)
- `admin/tickets.html` (UI de Faturamento)
- `tech/tickets.html` (UI de Inclusão de Peças)
- `js/cora_integration.js` (Bridge para Faturas)

## Task Breakdown

### 1. Database & Schema
- [ ] Criar tabelas `faturas` e `itens_fatura`. → Verify: `table_info` no SQLite
- [ ] Adicionar campo `fatura_id` e `chamado_id` (meta) na tabela `cobrancas`.

### 2. Backend Orchestration
- [ ] Endpoint `POST /api/faturas`: Gera fatura a partir de itens do chamado.
- [ ] Endpoint `PATCH /api/faturas/:id/status`: Processa aprovação/reprovação.
- [ ] Integração: Gatilho automático `CobrancaManager.emitirCobranca` na aprovação.

### 3. Portal do Técnico (Faturamento)
- [ ] UI de "Itens do Atendimento" no detalhe do chamado.
- [ ] Botão "Gerar Fatura para Aprovação".

### 4. Portal do Cliente (Aprovação)
- [ ] Novo módulo `faturas.html`.
- [ ] Modal de detalhes com botões Aprovar/Reprovar.
- [ ] Captura de justificativa na reprovação.

### 5. Final Verification
- [ ] Fluxo end-to-end: Técnico insere 2 peças -> Cliente aprova -> Admin vê cobrança Cora.
- [ ] Audit logs: Verificar se "Fatura Gerada" e "Fatura Aprovada" constam no histórico.

## Phase X: Verification
- [ ] `security_scan.py`
- [ ] `ux_audit.py`
- [ ] Final Walkthrough
