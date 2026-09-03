# 🔍 Análise Profunda — Renostter CRM

**Escopo analisado:** 53 arquivos (HTML/CSS/JS/Node.js), cobrindo frontend estático, API Express, integração Cora (mTLS), worker Cloudflare, testes E2E e worker de reset de senha.

**Tamanho total do código próprio:** ~3.000 linhas backend + ~4.500 linhas frontend (sem contar seeds e HTMLs administrativos).

---

## 🚨 RESUMO EXECUTIVO

| Categoria | Qtd de achados | Severidade |
|---|---|---|
| 🔴 Críticos (segurança) | **9** | Bloqueio produção |
| 🟠 Altos | 11 | Resolver em 1-2 sprints |
| 🟡 Médios | 14 | Melhoria contínua |
| 🟢 Baixos / DX | 12 | Backlog |

**Positivos a preservar:** Idempotency-Key bem implementado, token cache em 3 níveis, abstração multi-gateway, UI dark mode consistente, audit log estruturado, migração de dados legados, Aging Report, WhatsApp + Email templates.

---

## 🔴 CRÍTICOS — Segurança (bloqueio de produção)

### C1. Credenciais bancárias versionadas no projeto
**Arquivo:** `cora-api/.env`, `cora-api/certificate.pem`, `cora-api/private-key.key`
**Problema:** Não há `.gitignore` na raiz do projeto, apenas em `cora-api/`. Os arquivos sensíveis aparecem no workspace e podem ter sido commitados:
- `.env` com `DB_ENCRYPTION_KEY`, `CORA_CLIENT_ID`, `SMTP_PASS`
- `private-key.key` (chave privada mTLS da Cora — equivale a uma senha bancária)
- `certificate.pem`

**Ação imediata:**
1. Criar `.gitignore` na raiz cobrindo: `cora-api/.env`, `cora-api/*.pem`, `cora-api/*.key`, `cora-api/cora.sqlite*`, `node_modules`, `playwright-report`, `test-results`, `.idea`, `*.log`
2. **Rotacionar imediatamente** o `client_id` Cora e gerar novos certificados (assumir comprometimento se houve commit)
3. Mover credenciais para um cofre (Vault, AWS Secrets Manager, ou mesmo Doppler)

---

### C2. Helmet + CSP desabilitados (com comentário de placeholder)
**Arquivo:** `cora-api/server.js:138-154`
**Problema:** O bloco `helmet(...)` está comentado. Sem CSP, HSTS, X-Frame-Options, o frontend fica exposto a clickjacking, XSS via CDN e downgrade attacks.

**Ação:** Descomentar, ajustar `connectSrc` para incluir a origem real do frontend e o endpoint do worker Cloudflare. Manter `'unsafe-inline'` só se scripts inline forem inevitáveis (e revisar isso).

---

### C3. CORS totalmente permissivo
**Arquivo:** `cora-api/server.js:179`
```js
app.use(cors()); // Temporariamente permissivo para depuração de E2E
```
**Problema:** O middleware aceita **qualquer origem**. Qualquer site malicioso aberto no navegador do usuário pode fazer requests à API Cora usando a sessão dele.

**Ação:**
```js
app.use(cors({
  origin: process.env.CRM_FRONTEND_URL.split(','),
  credentials: true
}));
```

---

### C4. Autorização via headers manipuláveis pelo cliente
**Arquivo:** `cora-api/server.js:157-177`
```js
req.auditInfo = {
  userId: req.headers['x-user-id'] || 'anonymous',
  role:   req.headers['x-user-role'] || 'guest'
};
```
**Problema:** O cliente (JS no browser) envia os headers `x-user-id` e `x-user-role`. **Qualquer pessoa pode abrir DevTools e escrever `x-user-role: admin`** para acessar endpoints críticos como `DELETE /api/cobrancas/:id`, `PATCH /api/faturas/:id/aprovar`, `POST /api/bancos/cadastrados`.

O `authorize()` é executado **antes** de qualquer autenticação real, então é totalmente burlável.

**Ação:**
1. Implementar JWT com assinatura HMAC/RS256 — tokens emitidos no login
2. Validar assinatura em todo request
3. Derivar `userId` e `role` do payload do token, nunca dos headers
4. Invalidar tokens via blacklist ou usar access tokens de curta duração + refresh

---

### C5. 2FA fake — código armazenado no próprio navegador
**Arquivo:** `js/auth.js:76-93`
**Problema:** O "2FA" gera um código no próprio cliente (`Math.random`), salva em `sessionStorage` e mostra na tela. O usuário lê e digita. **Não há segundo fator — é UX theater.** Pior: como o código fica no `sessionStorage`, qualquer script XSS lê.

**Ação:**
1. Mover geração e verificação 2FA para o backend
2. Enviar código por e-mail/SMS/authenticator (TOTP padrão RFC 6238)
3. Senha + código precisam ir juntos no login

---

### C6. Senhas em plain text no localStorage
**Arquivo:** `js/storage.js:274-282`, `js/auth.js:30-44`
**Problema:** Os usuários são seedados com senha plain text (`password: 'admin123'`) e a função `auth.login()` compara direto. Em qualquer XSS, o atacante lê **todas as senhas**.

**Ação:**
1. Substituir por hash + salt no backend (bcrypt/argon2)
2. No frontend, após autenticação, armazenar apenas um token de sessão (opaco, não user data)
3. Considerar trocar o stack de auth para um provedor (Auth0, Supabase, Clerk, ou pelo menos Firebase Auth)

---

### C7. mTLS com fallback silencioso para HTTP sem TLS
**Arquivo:** `cora-api/CoraGateway.js:40-55`
```js
} catch (error) {
    console.warn(`[Cora mTLS] Certificados não encontrados... Modo MOCK ativado.`);
    this._httpsAgent = new https.Agent();
}
```
**Problema:** Se o certificado não estiver presente, o sistema **falha para um agente HTTPS sem certificado**, enviando a requisição sem mTLS. A Cora vai rejeitar, mas o sistema não bloqueia a operação — ela prossegue e gera cobrança em "modo mock" silenciosamente, sem alerta para o usuário.

**Ação:** Lançar erro em produção se o cert não existir. MOCK só pode existir se `NODE_ENV !== 'production'`.

---

### C8. Chave de criptografia com default público
**Arquivo:** `cora-api/crypto.js:13`
```js
const ENCRYPTION_KEY = Buffer.from(process.env.DB_ENCRYPTION_KEY || 'renostter_super_secret_key_32bytes!', 'utf8').slice(0, 32);
```
**Problema:** Se `DB_ENCRYPTION_KEY` não estiver setado, o sistema usa uma chave conhecida que está **literalmente no código-fonte** (já commitada). Todos os segredos criptografados no banco podem ser descriptografados por qualquer pessoa com acesso ao repo.

**Ação:** Falhar no boot se a chave não estiver configurada em produção:
```js
if (process.env.NODE_ENV === 'production' && !process.env.DB_ENCRYPTION_KEY) {
  throw new Error('DB_ENCRYPTION_KEY obrigatória em produção');
}
```

---

### C9. Webhook sem verificação de assinatura
**Arquivo:** `cora-api/server.js:413-423`, `CoraGateway.js:289-321`
**Problema:** O endpoint `/api/cobrancas/webhook` aceita qualquer payload e atualiza o status de cobranças. Não há validação de assinatura HMAC nem verificação de origem. Um atacante pode forjar `INVOICE.PAID` para qualquer `charge_id` e marcar boletos como pagos.

**Ação:**
1. Implementar verificação de assinatura do header `X-Cora-Signature` usando o `webhook_secret` (já tem coluna no banco)
2. Rejeitar webhooks sem assinatura válida
3. Implementar tolerância a reentrega (idempotência por `event_id`)

---

## 🟠 ALTOS

### A1. Risco de SQL Injection em queries dinâmicas
**Arquivo:** `CobrancaManager.js:181-193`, `server.js:495-505, 670-689`
**Problema:** Maioria usa `?` corretamente, mas há concatenações em queries de stats (`/api/cobrancas/stats`) que usam interpolação de strings em `strftime('%Y-%m', ...)`. Embora não sejam user input, é um padrão perigoso para o time manter.

**Ação:** Padronizar todas as queries com prepared statements. Criar um helper `buildWhere(filters)` que retorna `{ sql, params }`.

---

### A2. Server.js monolítico (967 linhas, ~50 rotas inline)
**Arquivo:** `cora-api/server.js`
**Problema:** Todas as rotas estão num arquivo só. Middleware, autorização, lógica de negócio, queries — tudo misturado. Dificulta testes unitários e revisão.

**Ação:** Quebrar em:
```
routes/
  cobrancas.js
  faturas.js
  bancos.js
  webhooks.js
  notifications.js
middlewares/
  auth.js          (JWT validation)
  audit.js         (logging)
  errorHandler.js
controllers/
  CobrancaController.js
  ...
services/
  CobrancaManager.js (já existe)
  ...
```

---

### A3. Duplicação massiva de rotas (alias `/api/cora/*`)
**Arquivo:** `cora-api/server.js:749-924`
**Problema:** Há ~12 rotas duplicadas como alias das novas (`/api/cora/boleto` → `/api/cobrancas/emitir`, etc.). Dobra a superfície de ataque, dificulta manutenção e gera bugs divergentes.

**Ação:** Depreciar com `Deprecation` header e `Sunset` na data futura. Migrar frontend e remover alias após 2 releases.

---

### A4. Access token Cora armazenado em plain text
**Arquivo:** `cora-api/CoraGateway.js:99-107`, schema `tokens_integracao`
**Problema:** O access_token é salvo no SQLite em texto puro. Quem acessar o banco (que está no projeto!) consegue o token Cora e pode fazer requests em nome da empresa.

**Ação:** Criptografar o token usando o `crypto.encrypt()` (que já existe) antes de persistir.

---

### A5. Express 5 ainda em beta
**Arquivo:** `cora-api/package.json:23`
**Problema:** `"express": "^5.2.1"` — Express 5 saiu do beta recentemente mas o ecossistema ainda não se estabilizou totalmente. Há mudanças incompatíveis (error handling async, etc.).

**Ação:** Avaliar migration completa para Express 5 e fazer audit de breaking changes. Se preferir estabilidade, voltar para Express 4 LTS (4.21.x).

---

### A6. Sem rate limit no backend
**Arquivo:** `cora-api/server.js` (ausente)
**Problema:** Endpoints como `/api/cobrancas/emitir` (que cria cobrança real) e `/api/cobrancas/webhook` não têm rate limit. Um cliente pode disparar centenas de cobranças em segundos.

**Ação:** Adicionar `express-rate-limit` com limites por IP + por userId (ex: 30 emissões/hora).

---

### A7. Sem validação de input centralizada
**Problema:** Cada rota faz sua própria validação (`if (!contractId || !clientId ...)`) com mensagens diferentes. Sem schema.

**Ação:** Usar `zod`, `joi` ou `ajv`. Definir schemas compartilhados entre rotas.

---

### A8. Botão "🔓 Usar" com credenciais demo no HTML de produção
**Arquivo:** `index.html:166-198`
**Problema:** As credenciais hardcoded aparecem na própria página de login. Qualquer visitante vê `admin@renostter.com` / `admin123`.

**Ação:** Compilar via flag de ambiente — `if (IS_DEMO)` mostrar o bloco, `else` ocultar. Ou simplesmente remover (o ambiente demo pode usar variável `?demo=1`).

---

### A9. Auto-seed no browser apaga dados existentes
**Arquivo:** `js/storage.js:266-272`
```js
if (db.isSeeded()) {
    COLLECTIONS.forEach(c => localStorage.removeItem(db._store(c)));
}
```
**Problema:** Se a versão do seed muda (`SEED_VERSION = 'v10'`), o sistema **apaga todos os dados do usuário** sem aviso. Bom pra dev, péssimo pra prod.

**Ação:** Migrations com preservação. Banco real no backend, não localStorage.

---

### A10. ID de cobrança previsível
**Arquivo:** `CobrancaManager.js:119`
```js
const cobrancaId = 'cob_' + crypto.randomUUID().split('-')[0];
```
**Problema:** 8 caracteres hex = ~4 bilhões de combinações. Parece muito, mas com volume real, colisão possível. UUID completo é gratuito.

**Ação:** Usar o UUID inteiro, ou até adicionar um prefixo do ano/mês para sorting.

---

### A11. Cron em processo único
**Arquivo:** `cora-api/server.js:941-956`
**Problema:** `node-cron` no processo Express. Se rodar 2 instâncias (ex: PM2 cluster), os jobs rodam duplicados.

**Ação:** Mover para um worker separado, ou usar BullMQ/Agenda com lock distribuído. No curto prazo, usar `cluster.isMaster` para rodar cron só na master.

---

## 🟡 MÉDIOS

### M1. localStorage como "banco" principal
**Arquivo:** `js/storage.js`, todos os HTMLs admin/tech/client
**Problema:** Todo o CRM vive no localStorage do navegador. Sem sincronização entre dispositivos, sem backup, com limite de ~5MB. Se o usuário limpar cache, perde tudo.

**Ação:** Migrar para API real (já existe `cora-api/`, falta o resto). Estrutura sugerida:
- SQLite local (offline-first) com sync
- Ou Postgres com cache local

---

### M2. Frontend sem framework — HTMLs gigantes
**Arquivos maiores:**
- `admin/inventory.html`: 163 KB
- `admin/reports.html`: 99 KB
- `admin/tickets.html`: 90 KB
- `admin/cobrancas.html`: 84 KB

**Problema:** HTML + CSS + JS inline. Repetição brutal. Manutenção lenta.

**Ação:** Migrar para React/Vue/Svelte (ou pelo menos extrair JS para módulos). Considerar HTMX se quiser manter minimalismo.

---

### M3. CSS global de 1.754 linhas
**Arquivo:** `css/global.css`
**Problema:** Design system razoável, mas tudo num arquivo só. Falta scoping (CSS variables para temas, módulos).

**Ação:** Separar em `tokens.css`, `reset.css`, `components/*.css`. Considerar Tailwind se quiser padronizar.

---

### M4. Sem testes unitários no backend
**Problema:** Só existe `test.js` (testes manuais via fetch) e `tests-e2e/financial-flow.spec.js` (1 cenário E2E pesado).

**Ação:** Adicionar Jest/Vitest para unit tests de `CobrancaManager`, gateways, crypto, etc. Meta: 70% coverage nos services críticos.

---

### M5. Migração de schema manual por PRAGMA
**Arquivo:** `cora-api/database.js:172-179, 248-253`
**Problema:** Adicionar coluna = `ALTER TABLE`. Isso vai se acumular e criar um caos. Não há arquivo de migrations versionado.

**Ação:** Usar `node-pg-migrate`, `knex migrations`, ou pelo menos `umzug`. Versionar cada migration.

---

### M6. Sem logger estruturado
**Problema:** ~100+ `console.log` espalhados com formatos diferentes.

**Ação:** Adicionar `pino` ou `winston`. JSON logs vão direto pra Loki/Datadog/CloudWatch.

---

### M7. Avatar com innerHTML sem sanitização
**Arquivo:** `js/utils.js:135`
```js
return `<img src="${u.photo}" class="avatar-sm" ... title="${esc(u.name)}">`;
```
**Problema:** Se `u.photo` for `javascript:alert(1)` ou similar, passa direto. `esc()` é aplicado no title, mas não no src.

**Ação:** Validar `u.photo` para começar com `data:image/` ou `https://`.

---

### M8. WhatsApp é 100% mock
**Arquivo:** `cora-api/WhatsAppService.js`
**Problema:** Toda a lógica de WhatsApp é simulada com `Math.random` e delay de 800ms. Vai pra produção assim é desastre (cliente não recebe a cobrança).

**Ação:** Implementar provedor real (Twilio, Z-API, WhatsApp Business API). Marcar claramente como TODO.

---

### M9. SMTP "log mode" sem alerta
**Arquivo:** `cora-api/NotificationService.js:115-122`
**Problema:** Se SMTP não estiver configurado, o sistema apenas faz `console.log` simulando envio. Cliente não recebe o boleto.

**Ação:** Retornar erro se SMTP não configurado em produção, ou usar serviço gerenciado (Resend, SendGrid, SES).

---

### M10. Endpoints admin sem autorização
**Arquivo:** `server.js:495-526, 583-600, 670-716`
**Problema:** Rotas como `/api/bancos/cadastrados`, `/api/bancos/testar`, `/api/configuracoes` não usam `authorize()`. Combinado com C4, qualquer um lê/edita.

**Ação:** Aplicar `authorize(['admin', 'superadmin'])` em todas.

---

### M11. N+1 em algumas queries
**Arquivo:** `CobrancaManager.js:529-531`
```js
fatura.itens = await dbAll('SELECT * FROM itens_fatura WHERE fatura_id = ?', [faturaId]);
```
**Problema:** OK aqui (1 + 1), mas `listarFaturas` poderia ter JOIN.

**Ação:** Em `listarFaturas`, retornar contagem de itens via subquery ou segunda chamada em batch.

---

### M12. Worker reset tem rate limit em memória
**Arquivo:** `worker-reset/worker.js:58-67`
**Problema:** Map em memória = zero resiliência. Em deploy com múltiplas regiões (failover), não compartilha.

**Ação:** Migrar para Cloudflare Rate Limiting Rules (nativo na plataforma) ou KV com TTL.

---

### M13. CSAT/comments/audit no localStorage
**Problema:** Mesma fragilidade de M1. Comentários técnicos importantes sobre ordens de serviço evaporam se o usuário limpar cache.

---

### M14. PDFs/contratos como base64 em localStorage
**Arquivo:** `js/storage.js:512-543` (seed `documents.data: ''`)
**Problema:** Storing PDFs em base64 no localStorage = viola o limite de 5MB rapidamente. Upload real precisa de backend com storage S3-compatible.

---

## 🟢 BAIXOS / DX

| # | Item | Sugestão |
|---|---|---|
| B1 | Sem README raiz | Criar `README.md` com setup, arquitetura, comandos |
| B2 | Sem LICENSE | Adicionar MIT/Apache |
| B3 | Sem TypeScript | Migrar gradualmente — começar por `gateways/` |
| B4 | Versões com `^` | Fixar com `~` ou exatas em produção |
| B5 | Sem `eslint`/`prettier` | Padronizar (`.eslintrc`, `.prettierrc`) |
| B6 | Comentários PT/EN misturados | Padronizar em PT-BR |
| B7 | Sem `.editorconfig` | Adicionar |
| B8 | Falta CHANGELOG | Iniciar com Conventional Commits |
| B9 | Sync sem paginação | `GET /api/cobrancas/sync` retorna tudo |
| B10 | Toast time hardcoded | Tornar configurável |
| B11 | Mensagens i18n | Erros backend em inglês, frontend PT |
| B12 | PDF/A styling | `@media print` em `cobrancas.html` está bom, mas vale cobrir mais páginas |

---

## ⚙️ PERFORMANCE

1. **`GET /api/cobrancas/sync`** — retorna todas as cobranças sem `LIMIT`. Em 6 meses de uso = download enorme.
2. **`localStorage.getItem('users')` + `JSON.parse`** em todo `auth.protect()` — para de escalar.
3. **5 queries em `getKPIs`** — bom o `Promise.all`, mas adicione Redis cache por 60s.
4. **Bootstrap inicial** — 60+ registros seed na primeira carga trava UX.
5. **Test E2E inicia 2 webServers** — pesado pro CI. Considerar mocks/service workers.

---

## 🏗️ ARQUITETURA — Sugestões

### Estado atual (assimetria)
```
Browser (localStorage) ←→ Node.js API (SQLite) ←→ Cora (mTLS)
              ↘                                  ↗
              Worker Cloudflare (password reset)
```

### Estado sugerido
```
Browser (PWA + IndexedDB cache)
       ↓ JWT
Node.js API (Express)
       ├→ Service: CobrancaManager (já existe, refatorar)
       ├→ Service: Notification (e-mail + WhatsApp provider)
       ├→ Repository: Postgres/SQLite
       ├→ Queue: BullMQ (jobs assíncronos)
       └→ Worker: Cron + lembretes
       
Independente:
- Cloudflare Worker (reset) ✓ OK
```

### Padrões a aplicar
- **Repository pattern** entre `CobrancaManager` e `database.js`
- **Strategy** já tem pra gateways ✓
- **Factory** pra providers de notificação (SMTP, Twilio, Resend)
- **Command/Query Separation** — separar leitura (`/api/cobrancas`) de escrita (`/api/cobrancas/emitir`)
- **Event sourcing** no webhook — persistir evento bruto antes de processar (já tem mas pode melhorar)

---

## 🧪 OBSERVABILIDADE

1. **Health check raso** — `/health` só retorna OK. Adicionar:
   ```json
   {
     "status": "ok",
     "db": "ok",
     "cora": "ok|degraded|down",
     "smtp": "ok|degraded|down",
     "version": "x.y.z",
     "uptime_s": 1234
   }
   ```

2. **Sem correlation-id** — request chega, log de auditoria, log de gateway, log de notificação — não dá pra correlacionar.

3. **Sem métricas** — Prometheus metrics (`/metrics` endpoint) ou OpenTelemetry.

4. **Sem tracing** — OpenTelemetry entre Express → Cora → SMTP.

---

## 🚀 DEVOPS

1. **Sem Docker** — ambientes divergem. Criar `Dockerfile` e `docker-compose.yml`.
2. **CI só roda Playwright** — adicionar `eslint`, `node --check`, type-check (se migrar pra TS).
3. **Sem deploy documentado** — adicionar `docs/deploy.md` (Cloud Run, Railway, VPS, etc).
4. **Sem backup automático** do SQLite.

---

## ✅ PLANO DE AÇÃO SUGERIDO

### Sprint 0 (essa semana) — Bloqueios
- [ ] **C1** Criar `.gitignore` raiz + rotacionar credenciais Cora
- [ ] **C4** Implementar JWT real (mesmo que rápido, com `jsonwebtoken`)
- [ ] **C8** Falhar no boot se `DB_ENCRYPTION_KEY` ausente em prod
- [ ] **C9** Adicionar verificação de assinatura no webhook

### Sprint 1 — Fundação de segurança
- [ ] **C2** Reativar Helmet + CSP
- [ ] **C3** CORS restrito por origin
- [ ] **C5** 2FA real (TOTP ou e-mail)
- [ ] **C6** Hash de senha no backend
- [ ] **C7** Bloquear modo MOCK em produção

### Sprint 2 — Refatoração arquitetural
- [ ] **A2** Quebrar `server.js` em routes/controllers
- [ ] **A3** Depreciar alias `/api/cora/*`
- [ ] **A4** Criptografar tokens no SQLite
- [ ] **A7** Validação com Zod
- [ ] **A10** Gerar UUIDs completos

### Sprint 3 — Qualidade
- [ ] **M1/M13/M14** Migrar dados do localStorage para API
- [ ] **M4** Testes unitários (Jest)
- [ ] **M5** Sistema de migrations
- [ ] **M6** Logger estruturado (pino)
- [ ] **A6** Rate limiting

### Backlog contínuo
- M2 (framework frontend), A11 (TypeScript), Docker, observability, M8 (WhatsApp real), M9 (SMTP gerenciado)

---

## 💡 PONTOS POSITIVOS A PRESERVAR

1. **Idempotency-Key** obrigatória em mutações — muito bem feito
2. **Token cache em 3 níveis** (memória, DB, request) com TTL e margem de segurança
3. **Aging Report com buckets** (0-30, 31-60, 61-90, 90+)
4. **KPIs consolidados** com breakdown por gateway
5. **Migration legada** (`cora_boletos` → `cobrancas`) com preservação de dados
6. **Abstração multi-gateway** (PaymentGatewayInterface) — permite adicionar Bradesco, Santander, etc
7. **Régua de cobrança** (D-5, D-1, D+1) automatizada
8. **Audit log estruturado** com IP, user, ação, detalhes JSON
9. **Triggers SQLite** para `updated_at` automático e CHECK de status
10. **Retry com backoff exponencial** no `CoraGateway._request()`
11. **Recorrência** com suporte a monthly/bimonthly/quarterly/semiannual/annual
12. **Worker Cloudflare independente** para reset de senha — boa separação
13. **Design system** consistente com CSS variables, dark mode, badges padronizados
14. **SLA matrix** com fallback explícito para combinações não mapeadas
15. **Roles bem definidos** (superadmin, admin, tecnico, cliente) com hierarquia

---

**Conclusão:** O projeto tem uma base sólida de negócio (modelagem de domínio boa, features alinhadas com o que uma assistência técnica de climatização precisa). Mas **a camada de segurança precisa de atenção imediata antes de produção** — os 9 críticos são todos relacionados a autenticação/autorização e exposição de credenciais. Depois de resolver isso, é um candidato natural a uma refatoração arquitetural (separar rotas, substituir localStorage, adicionar testes).

Se quiser, posso começar a resolver qualquer um desses — o JWT (C4) e o .gitignore raiz (C1) são os primeiros candidatos óbvios. É só falar.