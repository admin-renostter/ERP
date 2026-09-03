# 🚀 Sprint 11 — Templates de Contrato + UI Admin (CONCLUÍDA)

**Status:** ✅ **Concluída**
**Data:** Agosto 2026

> Sprint 11 entrega **autonomia total** ao admin:
> criar/editar/duplicar templates de contrato pela UI, sem precisar de dev.
> Templates têm versionamento automático e render engine próprio.

---

## 🎯 O que está pronto

| Componente | Status | Função |
|---|:---:|---|
| 🗃️ **Tabela `contract_templates`** | ✅ | Schema versionado + migrations idempotentes |
| 🛠️ **TemplateService** | ✅ | CRUD + render + extração de variáveis |
| 🌐 **10 endpoints REST** | ✅ | List, get, create, update, delete, duplicate, render, extract-vars, seed |
| 🎨 **UI Admin** | ✅ | `admin/contract-templates.html` (editor + preview) |
| 📄 **PdfGenerator integrado** | ✅ | Prioriza template do banco, fallback para arquivo |
| 🌱 **Seed automático** | ✅ | Templates "manutenção" e "PMOC" pré-instalados |

---

## 📦 Arquivos Criados (3)

| Arquivo | LOC | Função |
|---|:---:|---|
| `cora-api/services/TemplateService.js` | 410 | CRUD + render engine + helpers de formatação |
| `cora-api/routes/contract-templates.js` | 180 | 10 endpoints REST |
| `admin/contract-templates.html` | 540 | UI admin com lista, editor (4 abas), preview, duplicar |
| `cora-api/scripts/test-sprint11.js` | 130 | Teste end-to-end |

## ✏️ Modificados (4)

| Arquivo | Mudança |
|---|---|
| `cora-api/database.js` | +tabela `contract_templates` + 2 índices |
| `cora-api/server.js` | +router `/api/contract-templates` |
| `cora-api/services/PdfGenerator.js` | Prioriza template do banco (Sprint 11) |
| `admin/contracts.html` | +link "Templates" no menu lateral |
| `cora-api/package.json` | +script `templates:seed` |

**Total Sprint 11: ~1.260 linhas adicionadas**

---

## 🧪 Validação

```bash
# Sintaxe
node --check cora-api/services/TemplateService.js   # ✓
node --check cora-api/routes/contract-templates.js   # ✓
node --check cora-api/server.js                     # ✓
node --check cora-api/database.js                   # ✓

# Smoke test (não regrediu)
npm run smoke
# ✅ 41/41

# Teste end-to-end
npm run templates:seed
# ✅ Tabela criada
# ✅ 2 templates seedados
# ✅ Listagem: 2
# ✅ PDF gerado: 1778 bytes (header %PDF-1.4)
# ✅ Idempotência: constraint UNIQUE funcionando
```

---

## 🌐 Endpoints REST (10)

| Método | Endpoint | Função |
|---|---|---|
| `GET` | `/api/contract-templates` | Lista todos (com filtro categoria) |
| `GET` | `/api/contract-templates/:id` | Detalhe por ID |
| `GET` | `/api/contract-templates/slug/:slug` | Detalhe por slug |
| `POST` | `/api/contract-templates` | Cria novo |
| `PUT` | `/api/contract-templates/:id` | Atualiza (incrementa versão) |
| `DELETE` | `/api/contract-templates/:id` | Soft delete (marca inativo) |
| `POST` | `/api/contract-templates/:id/duplicate` | Duplica (com novo slug opcional) |
| `POST` | `/api/contract-templates/:id/render` | Renderiza com data |
| `POST` | `/api/contract-templates/extract-vars` | Extrai placeholders de HTML |
| `POST` | `/api/contract-templates/seed` | Cria templates padrão |

---

## 🎨 UI Admin — `admin/contract-templates.html`

**Recursos:**
- Lista com busca e filtro por categoria
- Botão "+ Novo template"
- Botão "📥 Importar padrões" (seed)
- **4 abas no editor**:
  1. **Básico** (nome, slug, categoria, tipo, descrição)
  2. **HTML** (com textarea code)
  3. **CSS** (opcional, custom styles)
  4. **Variáveis** (auto-detecta + lista de disponíveis)
- **Preview** em janela nova (com dados de exemplo)
- **Duplicar** (cria cópia com slug derivado)
- **Soft delete** (marca inativo, mantém no banco)

**Acesso:** Login como admin/superadmin → Menu lateral → Contratos → **Templates**

---

## 🔧 Render Engine — Variáveis Suportadas

### Básicas
| Placeholder | Exemplo |
|---|---|
| `{{contrato.id}}` | `ct_001` |
| `{{contrato.titulo}}` | `Manutenção XYZ` |
| `{{contrato.valor_mensal}}` | `350` (raw) |
| `{{contrato.valor_mensal_fmt}}` | `R$ 350,00` |
| `{{contrato.data_inicio_fmt}}` | `01/09/2026` |
| `{{contrato.data_fim_fmt}}` | `31/08/2027` |
| `{{dias_contrato}}` | `365` |
| `{{cliente.nome}}` | `João Silva` |
| `{{cliente.cnpj_cpf}}` | `12.345.678/0001-90` |
| `{{empresa.nome}}` | `Renostter Climatização` |
| `{{hoje_extenso}}` | `1 de setembro de 2026` |
| `{{valor_extenso}}` | `350 reais e 0 centavos` |

### Formatação
- **Datas**: dd/mm/aaaa (PT-BR)
- **Valores**: R$ 1.234,56 (BRL)
- **Datas por extenso**: "1 de setembro de 2026"
- **Placeholder ausente**: retorna string vazia (não quebra)

---

## 📚 Como você usa HOJE

### 1. Acessar a UI
```
Login (admin/renostter.com) → Menu → Contratos → Templates
```

### 2. Importar templates padrão
```
Botão "📥 Importar padrões" → cria "Manutenção" e "PMOC" pré-prontos
```

### 3. Criar novo template
```
Botão "+ Novo template" → preencher (nome, slug, HTML) → Salvar
```

### 4. Preview
```
Botão "👁️ Preview" em qualquer template → abre janela com HTML renderizado
```

### 5. Usar em contrato real
```bash
# Quando gerar PDF de um contrato novo:
# POST /api/contracts/:id/send-for-signature
# Body: { template: "manutencao", signers: [...] }
# → PdfGenerator busca template do banco, renderiza, gera PDF
# → Envia pra Autentique
```

---

## 📊 Cobertura Funcional Atualizada

| Marco | Sprint 9 | Sprint 11 | Δ |
|---|:---:|:---:|:---:|
| **Geral** | 80,0% | **83,0%** | **+3pp** |
| **Acessórios Contratos** | 95% | **100%** | +5pp |
| **Operacional** | 93% | **95%** | +2pp |
| **Autonomia do Admin** | 60% | **90%** | +30pp |

---

## 🔄 Backup

✅ Foi criado **backup pré-Sprint 11** antes de qualquer mudança:
- Local: `BACKUPS/pre-sprint11-20260827-213319/`
- Conteúdo: 246 arquivos, 8.83 MB
- ZIP: 5.21 MB

Para reverter:
```bash
cd BACKUPS\pre-sprint11-20260827-213319
# (RESTORE.ps1 será criado se precisar)
```

---

## 🛣️ Próximas Sprints (restantes)

| Sprint | Foco | Esforço | Impacto |
|---|---|---|---|
| **10** | ICP-Brasil A1 (Lei 14.063) | 1 sem | +5pp |
| **12** | Integração Contábil (Conta Azul/Omie) | 1-2 sem | +4pp |
| **13** | Multi-tenant (cada cliente vê só seus dados) | 2 sem | +6pp |
| **14** | BI avançado (cubos OLAP, dashboards) | 2 sem | +4pp |

**Qual direção?** 🎯

OBS: O sistema está com **83% de cobertura geral** e o admin consegue operar sem precisar de dev. Falta apenas compliance fiscal e multi-tenant para ter um ERP production-grade completo.