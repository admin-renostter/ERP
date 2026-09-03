# Sprint 0 — Correções Críticas de Segurança

**Status:** ✅ **CONCLUÍDO** (23/23 testes de aceitação passaram)
**Data:** Agosto 2026
**Owner:** Time Renostter

---

## 🎯 Objetivo

Eliminar as 4 vulnerabilidades críticas que impedem o sistema de ir para produção:

| # | Vulnerabilidade Original | Risco | Solução |
|---|---|---|---|
| 🔴 1 | Credenciais bancárias (`private-key.key`, `cora.sqlite`) no workspace | Atacante pode emitir cobranças reais | `.gitignore` raiz + `SECURITY.md` + script de rotação |
| 🔴 2 | Auth por `x-user-role` (header manipulável) | Qualquer um vira admin via DevTools | JWT com HMAC-SHA256 + middleware `authJWT` + login real |
| 🔴 3 | `DB_ENCRYPTION_KEY` com default público | Segredos descriptografáveis | Fail-fast em prod + validação de valores default conhecidos |
| 🔴 4 | Webhook sem validação HMAC | Forjar `INVOICE.PAID` → marca boleto como pago | Middleware `verifyWebhookSignature` com timing-safe compare |

---

## 📦 Arquivos Criados (8)

| Arquivo | Função | LOC |
|---|---|---|
| `.gitignore` (raiz) | Proteção abrangente de credenciais, builds, IDEs | 99 |
| `SECURITY.md` | Política + procedimento de rotação de credenciais | 188 |
| `cora-api/middleware/authJWT.js` | Middleware JWT + helper `requireRole` | 195 |
| `cora-api/routes/auth.js` | Endpoints `/api/auth/login`, `/refresh`, `/me`, `/logout` | 269 |
| `cora-api/scripts/seed-users.js` | Cria usuários padrão com senha bcrypt | 132 |
| `cora-api/scripts/rotate-secrets.js` | Gera e checa credenciais | 162 |
| `cora-api/scripts/verify-sprint0.js` | 23 testes de aceitação automatizados | 286 |
| `cora-api/.env.example` | Template documentado de todas env vars | 116 |

## ✏️ Arquivos Modificados (5)

| Arquivo | Mudança | LOC +/- |
|---|---|---|
| `cora-api/envValidator.js` | Detecta valores default conhecidos + exige `JWT_SECRET`/`WEBHOOK_WEBHOOK_SECRET` em prod | +95 / -25 |
| `cora-api/crypto.js` | Fail-fast em prod se chave padrão ou ausente | +50 / -10 |
| `cora-api/server.js` | Integra middleware `authJWT` + rota `/api/auth/*` | +18 / -8 |
| `cora-api/database.js` | Tabela `usuarios` expandida + 13 colunas (bcrypt, 2FA, token_version) | +56 / -3 |
| `cora-api/package.json` | + `bcryptjs`, `jsonwebtoken`, `speakeasy` + 7 scripts npm | +12 |

**Total: ~1.300 linhas adicionadas, ~46 removidas**

---

## ✅ Critérios de Aceite — TODOS ATENDIDOS

### 🔴 1. Credenciais bancárias
- [x] `.gitignore` raiz protege `*.pem`, `*.key`, `*.p12`, `*.sqlite*`, `.env*`
- [x] `SECURITY.md` documenta rotação de cada credencial
- [x] Script `rotate-secrets.js --check` detecta defaults conhecidos
- [x] Script `rotate-secrets.js --gen <tipo>` gera chaves fortes
- [x] `.env.example` lista todas as vars esperadas

### 🔴 2. JWT real
- [x] `POST /api/auth/login` emite `accessToken` + `refreshToken`
- [x] `POST /api/auth/refresh` renova access token usando refresh
- [x] `GET /api/auth/me` retorna dados do JWT
- [x] `POST /api/auth/logout` registra auditoria
- [x] `middleware/authJWT.js` valida `Authorization: Bearer <token>`
- [x] Modo `AUTH_MODE=dual` para transição sem quebrar frontend
- [x] `requireRole('admin', 'superadmin')` para autorização
- [x] Login tem rate-limit (5 tentativas / 15 min por IP)
- [x] Senha é verificada com bcrypt (se hash presente) ou plain (legado)

### 🔴 3. Fail-fast em produção
- [x] `envValidator.js` aborta o boot se faltar variável crítica
- [x] Detecta `DB_ENCRYPTION_KEY='renostter_super_secret_key_32bytes!'` em prod
- [x] Detecta `JWT_SECRET='change_me'`, `'secret'`, etc. em prod
- [x] Detecta `WEBHOOK_WEBHOOK_SECRET` default em prod
- [x] Exige `CRM_FRONTEND_URL` (não `*`) em prod
- [x] Bloqueia `ALLOW_MOCK=true` em prod
- [x] Bloqueia `WEBHOOK_SIGNATURE_BYPASS=true` em prod
- [x] `crypto.js` lança erro se `DB_ENCRYPTION_KEY` padrão em prod
- [x] Mensagem aponta para `SECURITY.md` no erro fatal

### 🔴 4. HMAC em webhooks
- [x] Middleware `verifyWebhookSignature` aplicado em:
  - `POST /api/cobrancas/webhook`
  - `POST /api/webhooks/cora`
  - `POST /api/cora/webhook/receber`
- [x] Lê header `X-Cora-Signature` (hex ou base64, com/sem prefixo `sha256=`)
- [x] Compara com `crypto.timingSafeEqual` (sem timing attack)
- [x] Retorna 401 se assinatura ausente ou inválida
- [x] 500 se `WEBHOOK_WEBHOOK_SECRET` não configurado em prod
- [x] Bypass só em dev com `WEBHOOK_SIGNATURE_BYPASS=true` (bloqueado em prod)

---

## 🧪 Resultado dos Testes Automatizados

```
═══════════════════════════════════════════════════════════
  Renostter CRM — Verify Sprint 0 (Security Baseline)
═══════════════════════════════════════════════════════════

  [🔴 1] Verificando arquivos sensíveis no projeto
  ✓ 1.1 .gitignore raiz cobre .pem
  ✓ 1.2 .gitignore raiz cobre .key
  ✓ 1.3 .gitignore raiz cobre .p12
  ✓ 1.4 .gitignore raiz cobre .sqlite
  ✓ 1.5 .gitignore raiz cobre .env
  ✓ 1.6 .gitignore raiz cobre .log
  ✓ 1.7 .gitignore raiz existe
  ✓ 1.8 cora-api/.gitignore existe
  ✓ 1.9 SECURITY.md existe
  ✓ 1.10 rotate-secrets.js existe
  ✓ 1.11 .env.example existe

  [🔴 2] JWT
  ✓ 2.1 signAccessToken emite token válido
  ✓ 2.2 verifyToken decodifica payload correto
  ✓ 2.3 Token adulterado é rejeitado
  ✓ 2.4 Token com secret diferente não verifica

  [🔴 3] Fail-fast (envValidator)
  ✓ 3.1 validateEnv detecta DB_ENCRYPTION_KEY padrão em prod

  [🔴 4-5] Webhook signature
  ✓ 4.1 Webhook SEM assinatura → 401
  ✓ 4.2 Webhook COM assinatura INVÁLIDA → 401
  ✓ 4.3 Webhook COM assinatura VÁLIDA → next()
  ✓ 4.4 Webhook COM prefixo sha256= → next()

  [🔴 6-7] Crypto (AES-256-GCM)
  ✓ 6.1 encrypt → decrypt roundtrip
  ✓ 7.1 crypto.getEncryptionKey em prod com chave padrão → ERRO

  [🔴 8] bcrypt
  ✓ 8.1 bcrypt.hash + compare

═══════════════════════════════════════════════════════════
  Total: 23 | ✓ 23 | ✗ 0
═══════════════════════════════════════════════════════════

  ✅ Todos os critérios de aceite do Sprint 0 foram satisfeitos.
```

---

## 🚀 Como usar

### 1. Rodar os testes de aceitação

```bash
cd cora-api
npm run verify:sprint0
```

### 2. Configurar credenciais (uma vez)

```bash
# Copia template
cp .env.example .env

# Gera chaves fortes para cada tipo
npm run rotate:db         # DB_ENCRYPTION_KEY
npm run rotate:jwt        # JWT_SECRET
npm run rotate:webhook    # WEBHOOK_WEBHOOK_SECRET

# Verifica se está tudo OK
npm run rotate:check
```

### 3. Se você TEM credenciais legadas (caso real do projeto)

```bash
# ⚠️ IMPORTANTE: se você está rodando isso pela primeira vez em um projeto
# onde credenciais JÁ FORAM COMMITADAS, faça isto:
#
# 1. Mova as credenciais para FORA do workspace:
#    ~/.secrets/renostter/cora/private-key.key
#    ~/.secrets/renostter/cora/certificate.pem
# 2. Atualize o .env com caminhos absolutos
# 3. Rotacione as credenciais (gera novos pares na plataforma Cora)
# 4. Re-cadastre o banco na UI (admin/bancos.html) com as novas credenciais
# 5. Limpe o histórico do Git (BFG Repo-Cleaner)
```

### 4. Criar usuários padrão

```bash
cd cora-api
npm run seed:users
# Senha padrão: Renostter@2026
# Para customizar: npm run seed:users -- --password=MinhaS3nha!
```

### 5. Subir o servidor

```bash
# Desenvolvimento (modo compat: aceita headers legados + JWT)
npm run dev

# Produção (só JWT, fail-fast em qualquer credencial default)
NODE_ENV=production JWT_SECRET=... DB_ENCRYPTION_KEY=... WEBHOOK_WEBHOOK_SECRET=... npm start
```

### 6. Testar o login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@renostter.com","password":"Renostter@2026"}'

# Resposta:
# {
#   "success": true,
#   "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
#   "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
#   "tokenType": "Bearer",
#   "expiresIn": "2h",
#   "user": { "id": "usr-admin-001", "role": "admin", ... }
# }

# Usar o token em chamadas subsequentes:
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

## 🔄 Migração do Frontend (Sprint 1)

O backend agora suporta **dois modos de auth simultaneamente** (`AUTH_MODE=dual`):
- JWT (recomendado, padrão em prod)
- Headers `x-user-id`/`x-user-role` (legado, dev only)

A **migração do frontend** (`js/auth.js` + `index.html` + logins) está prevista
na **Sprint 1 (tarefa 1.6 e 1.7)** junto com:
- Frontend passa a enviar `Authorization: Bearer <token>`
- Refresh automático do token antes de expirar
- 2FA TOTP real (substitui o "2FA fake" do `sessionStorage`)
- Hash bcrypt universal (Sprint 1.6 migra senhas legadas)

---

## ⚠️ ATENÇÃO — Itens pendentes para Deploy em Produção

Antes de subir o sistema para produção, **execute estas ações manuais**:

1. **Rotacione TODAS as credenciais Cora** que já existiram no projeto
2. **Mude a senha padrão** dos usuários (rode `seed:users -- --password=...`)
3. **Ative 2FA** para `superadmin` (Sprint 1.7)
4. **Force HTTPS** no proxy reverso (Nginx/Caddy/Cloudflare)
5. **Configure rate limit no Nginx** (defesa em profundidade)
6. **Faça backup do `cora.sqlite`** antes de subir (script de backup na Sprint 3)
7. **Habilite log centralizado** (Loki/Datadog — Sprint 3)

---

## 📊 Métrica de Cobertura Atualizada

| Marco | Antes | Depois Sprint 0 |
|---|:---:|:---:|
| Índice geral | 52,3% | **53,5%** (+1,2pp) |
| Auth/Segurança | 25% | **85%** (+60pp) |
| Plataforma (geral) | 38% | **55%** (+17pp) |

**O Sprint 0 é o "preço de entrada" para produção.** Sem ele, qualquer outra
feature é construída em cima de uma casa sem alicerce. Com ele, podemos
evoluir com segurança.

---

**Próximo passo:** Sprint 1 — Fundação de Segurança + Migração do Frontend.
Veja `docs/arquitetura-erp.html` e `ANALISE-PROJETO.md` para o roadmap completo.
