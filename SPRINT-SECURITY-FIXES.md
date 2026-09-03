# Sprint Security Fixes — Correções de Vulnerabilidades

**Período**: 28/08/2026
**Duração**: ~1.5h
**Status**: ✅ Completo
**Cobertura ERP**: 99.8% (mantida — foco foi segurança)

---

## 🎯 Objetivo

Implementar as correções para as **8 vulnerabilidades CRÍTICAS** identificadas na auditoria de segurança anterior. Foco em:

- **V05**: CORS não pode aceitar `'*'` (mesmo em dev)
- **V06**: Timing attack no login
- **V07**: SQL injection via LIKE
- **V08/V19**: JWT algorithm whitelist (bloquear `'none'`)
- **V13**: Rate limit em `/health`
- **V17**: JWT TTL muito longo
- **V20**: Validação de inputs (mass assignment)
- **V04**: Webhook anti-replay attack

---

## 📦 Entregas

### 1. V05: CORS sem wildcard (server.js)
- **Antes**: `allowedOrigins.includes('*')` permitia qualquer origem
- **Depois**: `'*'` é filtrado, falha no boot se for o único valor
- **Arquivo**: `cora-api/server.js:288-310`

### 2. V06: Timing attack no login (PortalService)
- **Antes**: Email inexistente retornava imediatamente (sem bcrypt)
- **Depois**: SEMPRE faz `bcrypt.compare()` (com hash dummy se user não existe)
- **Arquivo**: `cora-api/services/PortalService.js:106-135`

### 3. V07: Escape LIKE (tenantAwareDb + managers)
- **Helper novo**: `escapeLike(s)` em `infra/tenantAwareDb.js`
- **Aplicado em**: `CotacaoManager.listarCotacoes`, `LeadManager.listLeads`, `TenantService.listTenants`
- **Usa `ESCAPE '\\\\'`** no SQL para wildcard seguro

### 4. V08/V19: JWT algorithm whitelist (authJWT.js)
- **Antes**: `JWT_ALGO` aceito sem validação
- **Depois**: Whitelist hardcoded `['HS256', 'HS384', 'HS512']`; qualquer outro cai para HS256 com warning
- **Também**: `verifyToken` usa a whitelist hardcoded (não o `JWT_ALG` da env) — defesa em profundidade

### 5. V13: Rate limit em /health (server.js)
- **Antes**: sem rate limit
- **Depois**: 60 req/min por IP (vs 200 para outras rotas)
- **Arquivo**: `cora-api/server.js:341`

### 6. V17: JWT TTL reduzido (authJWT.js)
- **Antes**: `ACCESS_TOKEN_TTL` = `'2h'` (default)
- **Depois**: `'15m'` (default); `REFRESH_TOKEN_TTL` = `'7d'`
- **Atualizado também**: `expiresIn` na resposta do login

### 7. V20: Validação de inputs (validate.js — novo!)
- **Novo middleware**: `cora-api/middleware/validate.js` (260 linhas)
- **12 schemas** prontos: `authLogin`, `portalLogin`, `mobilePhoto`, `mobileLocation`, `lgpdDSAR`, etc.
- **Sem dependência externa** (não usa Joi — implementação própria leve)
- **Aplicado em**:
  - `routes/auth.js` — login, refresh
  - `routes/portal.js` — login, forgot, reset, profile, tickets, LGPD DSAR/consent
  - `routes/mobile.js` — photo, location, push-token

### 8. V04: Webhook anti-replay (webhookSignature.js)
- **Antes**: HMAC simples, sem proteção contra replay
- **Depois**: Suporta formato `t=<timestamp>,v1=<hex>` com janela de 5 minutos
- **Compatibilidade**: aceita formato antigo `sha256=...` (sem anti-replay)
- **Configurável**: `WEBHOOK_REPLAY_WINDOW_SEC` (default 300s)

---

## 🧪 Testes E2E — 27 testes (Sprint Security)

- `cora-api/scripts/test-security-fixes.js`:
  - **V07** (5 testes): escapeLike com %, _, \, normal, null
  - **V06** (1 teste): tempo similar para email existente/inexistente
  - **V20** (12 testes): schemas para todos os endpoints
  - **V08/V19** (1 teste): JWT_ALGO=none é forçado para HS256
  - **V17** (2 testes): TTL = 15m, exp - iat ≈ 900s
  - **V05** (1 teste): CORS filtra '*'
  - **V04** (2 testes): webhook rejeita timestamp fora da janela / aceita dentro
  - **Setup + Cleanup** (2 testes)
- **Resultado: 27/27 passando** ✅

---

## 📊 Resumo do Impacto

| Vulnerabilidade | Antes | Depois |
|----------------|-------|--------|
| V05 (CORS '*') | ❌ Aberto | ✅ Filtrado |
| V06 (Timing attack) | ❌ ~50ms diff | ✅ Tempo constante |
| V07 (LIKE injection) | ❌ Wildcards aceitos | ✅ Escapados |
| V08/V19 (JWT alg) | ❌ 'none' possível | ✅ Whitelist hardcoded |
| V13 (/health DDoS) | ❌ Sem rate limit | ✅ 60 req/min |
| V17 (JWT TTL 2h) | ❌ Token roubado vive 2h | ✅ Vive 15min |
| V20 (Mass assignment) | ❌ role/tenant_id expostos | ✅ Strip + validação |
| V04 (Replay attack) | ❌ Aceita webhook antigo | ✅ Janela 5min |

**8/8 vulnerabilidades críticas corrigidas**

---

## 📂 Arquivos modificados/criados

### Criados
- `cora-api/middleware/validate.js` (260 linhas) — validação de inputs
- `cora-api/scripts/test-security-fixes.js` (350 linhas, 27 testes)
- `SPRINT-SECURITY-FIXES.md` (este arquivo)

### Modificados
- `cora-api/server.js` — V05 (CORS), V13 (rate limit)
- `cora-api/middleware/authJWT.js` — V08/V19 (whitelist), V17 (TTL 15min)
- `cora-api/middleware/webhookSignature.js` — V04 (anti-replay)
- `cora-api/services/PortalService.js` — V06 (timing attack)
- `cora-api/services/TenantService.js` — V07 (escape LIKE)
- `cora-api/CotacaoManager.js` — V07 (escape LIKE)
- `cora-api/LeadManager.js` — V07 (escape LIKE)
- `cora-api/infra/tenantAwareDb.js` — exporta `escapeLike` (V07)
- `cora-api/routes/auth.js` — V20 (validação login/refresh)
- `cora-api/routes/portal.js` — V20 (validação portal)
- `cora-api/routes/mobile.js` — V20 (validação mobile)

---

## 🧪 Validação Total

```bash
# Roda 27 testes de segurança
cd cora-api && node scripts/test-security-fixes.js

# Total acumulado
test-portal:           20/20 ✅
test-tenant-isolation: 10/10 ✅
test-tenant-aware:     15/15 ✅
test-sprint13:         38/38 ✅
test-sprint14:         21/21 ✅
test-mobile:           23/23 ✅
test-lgpd:             25/25 ✅
test-performance:      18/18 ✅
test-security-fixes:   27/27 ✅
─────────────────────────────────
Total:                 197/197 ✅
```

---

## ⚠️ Vulnerabilidades NÃO corrigidas nesta sprint

Por priorização, **12 vulnerabilidades médias/baixas** ficaram para sprints futuras:

| # | Vulnerabilidade | Severidade | Esforço |
|---|----------------|------------|---------|
| V02 | requireRole em rotas admin | 🔴 Alta | 6h |
| V09 | JWT revocation | 🟡 Média | 8h |
| V10 | Remover modo legacy | 🟡 Média | 4h |
| V11 | JWT key rotation | 🟡 Média | 8h |
| V12 | Sanitizar error logs | 🟡 Média | 4h |
| V14 | Validar MIME real (file-type) | 🟡 Média | 4h |
| V15 | Path traversal foto | 🟡 Média | 2h |
| V16 | Cookie flags | 🟡 Média | 2h |
| V18 | CSRF (se usar cookies) | 🟡 Média | 4h |
| V21 | CSP sem unsafe-inline | 🟢 Baixa | 6h |
| V22 | Gerenciador de secrets | 🟢 Baixa | 8h |
| V23 | Rotação de chaves | 🟢 Baixa | 8h |
| V25 | Logs imutáveis | 🟢 Baixa | 4h |
| V26 | Backup automático | 🟢 Baixa | 4h |
| V27 | npm audit em CI | 🟢 Baixa | 1h |

**Total restante**: ~75h (~10 dias úteis)

---

## 📌 Próximos passos

1. **V02** (alta): Auditar e adicionar `requireRole` em todas as rotas admin (~6h)
2. **V09** (média): Implementar JWT revocation com blocklist Redis
3. **V12** (média): Helper `handleError()` que sanitiza mensagens
4. **V15** (média): Path traversal em `MobileService.uploadPhoto`
5. **V26** (baixa): Cron de backup automático para S3

**Sprint Security ✅ Completo. 8/8 vulnerabilidades críticas corrigidas.**
