# Hotfix Camada 1 — Segurança Básica

**Data:** 2026-07-01
**Escopo:** Apenas backend (`cora-api/`) e arquivos de config. Frontend intocado.
**Status:** ✅ Implementado e validado

---

## O que foi feito

### 🔒 C1 — `.gitignore` na raiz do projeto
**Arquivos criados:**
- `.gitignore` (raiz) — cobre node_modules, .env, *.pem, *.key, *.sqlite, logs, IDEs
- `cora-api/.gitignore` (reforçado) — adiciona padrões de log, test-output, coverage

**⚠️ AÇÃO MANUAL NECESSÁRIA:**
1. **Rotacionar imediatamente** o `CORA_CLIENT_ID` na plataforma Cora Web
2. **Gerar novos certificados mTLS** (assumir que os atuais foram comprometidos se houve commit)
3. Verificar com `git log --all --full-history -- cora-api/.env cora-api/*.pem cora-api/*.key` se algo vazou
4. Se houver histórico com credenciais, considerar `git filter-repo` para limpar

---

### 🔒 C2 — Helmet reativado com CSP
**Arquivo:** `cora-api/server.js`
- Substituiu o bloco comentado por `app.use(helmet({...}))` ativo
- CSP configurado para o frontend atual: `default-src 'self'`, Chart.js via jsDelivr, Google Fonts
- HSTS habilitado em produção (1 ano + subdomains + preload)
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Frame-Options: SAMEORIGIN` (anti-clickjacking)
- `X-Content-Type-Options: nosniff`

**Limitação conhecida:** `'unsafe-inline'` está liberado para scripts e styles (necessário porque o frontend tem onclick/onkeydown inline). Idealmente, refatorar para event listeners na Camada 3.

---

### 🔒 C3 — CORS restrito por origin
**Arquivo:** `cora-api/server.js`
- Substituiu `app.use(cors())` por configuração com whitelist
- Lista de origens via env `CRM_FRONTEND_URL` (separadas por vírgula)
- Default dev: `http://localhost:8080,http://127.0.0.1:8080`
- Aceita apenas GET, POST, PUT, PATCH, DELETE, OPTIONS
- Headers permitidos: Content-Type, Authorization, X-Cora-Signature, X-Idempotency-Key
- Origem não whitelisted → erro 500 (rejeitada)

**Validação:** confirmado em smoke test — `http://evil.com` bloqueado.

---

### 🔒 C7 — Bloqueio do modo MOCK Cora em produção
**Arquivo:** `cora-api/gateways/CoraGateway.js`
- Se certificados mTLS não existirem e `NODE_ENV=production` → **throw** (bloqueia a operação)
- Em dev, comportamento anterior (warn + modo MOCK) preservado para testes

**Por que isso importa:** antes, se alguém fizesse deploy sem os certs, o sistema silenciosamente passava a usar HTTPS sem TLS — toda a integração bancária degradava sem alarme.

---

### 🔒 C8 — Validação de env vars no boot
**Arquivos:**
- `cora-api/envValidator.js` (novo)
- `cora-api/server.js` (chamada no topo)
- `cora-api/.env.example` (atualizado)

**Variáveis obrigatórias em produção (`NODE_ENV=production`):**
- `DB_ENCRYPTION_KEY` — e não pode conter `change_me`, `super_secret`, etc.
- `CORA_CLIENT_ID`
- `CORA_CERT_PATH`
- `CORA_KEY_PATH`

**Comportamento:**
- Em dev: apenas warns (não bloqueia)
- Em prod: server **não sobe** com mensagem clara indicando quais vars faltam
- Recomendação de tamanho mínimo para `DB_ENCRYPTION_KEY` (≥ 32 chars)

**Como gerar uma chave segura:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

### 🔒 C9 — Verificação de assinatura HMAC nos webhooks
**Arquivos:**
- `cora-api/middleware/webhookSignature.js` (novo)
- `cora-api/server.js` (aplicado nos 3 endpoints webhook)

**Como funciona:**
1. Captura o body raw via `express.json({ verify: ... })`
2. Calcula HMAC-SHA256 do body com o secret da env `WEBHOOK_WEBHOOK_SECRET`
3. Compara (timing-safe) com o header `X-Cora-Signature` (aceita `sha256=...`, `v1=...`, hex puro ou base64)
4. Em produção: **bloqueia** (401) se signature ausente ou inválida
5. Em dev: bypass via `WEBHOOK_SIGNATURE_BYPASS=true`

**Configuração no Cora Web:**
1. Acesse Cora Web → Configurações → Webhooks
2. Crie/Atualize o webhook com a URL: `https://api.seudominio.com/api/cobrancas/webhook`
3. Configure o mesmo secret que você colocou em `WEBHOOK_WEBHOOK_SECRET`
4. Teste o envio — Cora envia header `X-Cora-Signature` no formato `sha256=<hex>`

**Validação:** confirmado em smoke test em produção:
- Sem assinatura → 401 ✓
- Com HMAC válido → 200 ✓

---

## Arquivos modificados / criados

```
✚ .gitignore                                              (NOVO — raiz)
✚ cora-api/envValidator.js                                (NOVO)
✚ cora-api/middleware/webhookSignature.js                 (NOVO)
~ cora-api/.gitignore                                     (reforçado)
~ cora-api/.env.example                                   (atualizado)
~ cora-api/server.js                                      (Helmet, CORS, validator, raw body, webhook sig)
~ cora-api/gateways/CoraGateway.js                        (bloqueio de MOCK em prod)
```

---

## Como usar (deploy)

1. **Copie** `cora-api/.env.example` para `cora-api/.env`
2. **Gere** uma chave forte:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
3. **Configure** as variáveis em produção:
   ```env
   NODE_ENV=production
   DB_ENCRYPTION_KEY=<cole a chave gerada>
   CORA_CLIENT_ID=<seu client id>
   CORA_CERT_PATH=/caminho/absoluto/certificate.pem
   CORA_KEY_PATH=/caminho/absoluto/private-key.key
   WEBHOOK_WEBHOOK_SECRET=<secret do webhook Cora>
   CRM_FRONTEND_URL=https://crm.seudominio.com
   ```
4. **Inicie** o servidor: `npm start`
5. **Teste** o webhook no Cora Web com a URL pública do webhook
6. **Verifique** os logs — se aparecer "Erro fatal — Variáveis de ambiente obrigatórias ausentes", confira o `.env`

---

## Limitações conhecidas (resolver na Camada 2/3)

| Item | Limitação | Onde resolver |
|---|---|---|
| **CORS** | Lista única global, sem rotação dinâmica | Camada 3 |
| **Webhook secret** | Single secret global; ideal seria por banco cadastrado | Camada 2 (usar `bancos_cadastrados.webhook_secret_encrypted`) |
| **Webhook timestamp** | Não valida janela de replay (≤ 5min) | Camada 2 |
| **CSP** | `'unsafe-inline'` para scripts/styles | Camada 3 (refatorar frontend) |
| **Helmet COEP** | Desabilitado para permitir iframes | OK se não usar iframes |
| **CORS 500** | Origem rejeitada retorna 500 (deveria ser 403) | Cosmético |

---

## O que NÃO foi feito (intencionalmente)

### ❌ C4 — JWT real / autenticação forte
**Por que ficou de fora:** sem alterar o frontend, qualquer fix é band-aid. O frontend atual envia `x-user-role` no header e o backend confia. Corrigir isso **exige** mudar o frontend para enviar token assinado.

→ Vai entrar na **Camada 2** (Sprint 1-2) com refator da camada de auth.

### ❌ C5 — 2FA real (TOTP/email)
**Por que ficou de fora:** o "2FA" atual gera o código no próprio cliente (sessionStorage). Corrigir **exige** backend de auth + mudança no fluxo de login.

→ Vai entrar na **Camada 2**.

### ❌ C6 — Hash de senha no backend
**Por que ficou de fora:** todas as senhas hoje estão em plain text no localStorage do navegador. Migrar para hash bcrypt **exige** backend de auth + migration dos usuários + novo fluxo de login.

→ Vai entrar na **Camada 2**.

---

## Próximos passos

1. **Esta semana:** rotacionar credenciais Cora (ação manual) + deploy em staging com NODE_ENV=production
2. **Sprint 1-2:** Camada 2 (refator de auth completo — JWT + bcrypt + 2FA real)
3. **Sprint 3+:** Camada 3 (refator arquitetural — quebrar server.js, migrations, logger, testes)