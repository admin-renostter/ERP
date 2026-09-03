# 🔍 Análise do Roadmap de Implantação (proposta do integrador)

**Contexto:** roadmap de 9 fases recebido do integrador contratado, para levar o
Renostter CRM/ERP ao GitHub + VPS + integrações (WhatsApp, N8N, OpenClaw, B2,
Maya CRM, Stripe, multi-tenant, self-hosted, escala).

**Metodologia:** cruzei cada fase com o estado real do repositório (código,
`CHANGELOG.md`, os 20+ documentos `SPRINT-*.md`, `SECURITY.md`, testes
existentes) — não com o que o roadmap descreve, mas com o que já existe.

---

## 🚨 Achado mais importante: não existe repositório Git

Verifiquei a pasta do projeto: **não há uma pasta `.git`**. Depois de ~20 sprints
de trabalho (financeiro, contratos, LGPD, multi-tenant, 3 sprints de segurança),
o código nunca foi versionado — o controle de "pontos de rollback" até agora é a
pasta `BACKUPS/` com cópias manuais do projeto inteiro.

Isso muda a leitura da Fase 0: "levar ao GitHub" não é o passo final de deploy,
é o **primeiro passo, e é urgente independente do integrador** — o `.gitignore`
raiz já está pronto e correto (cobre `.env`, certificados, `*.sqlite`,
`BACKUPS/`, logs — não vai vazar segredo nenhum no primeiro commit). Recomendo
fazer isso HOJE, antes do integrador tocar no código, para que todo o trabalho
dele já nasça versionado e revisável (PR, diff, rollback real).

Já existe até o workflow de CI pronto (`.github/workflows/playwright.yml`,
GitHub Actions rodando os testes Playwright em todo push/PR) — só falta o
repositório existir de fato no GitHub para ele ativar.

---

## 📊 Fase a fase: o que o roadmap assume vs. o que já existe

| Fase | Roadmap propõe | Realidade no código | Leitura |
|---|---|---|---|
| **0** — Docker+Postgres+Redis+VPS | 1-2 semanas, do zero | `docker-compose.yml` completo (app+postgres+redis+nginx+backup), `Dockerfile`, `DEPLOY-DOCKER.md`/`README-DOCKER.md` com passo a passo pra VPS, Cloudflare Tunnel documentado, domínio já migrado pro Cloudflare (`docs/MIGRACAO-DOMINIO-CLOUDFLARE.md`) | **Já construído.** O que falta é *executar* (provisionar a VPS de verdade, subir, testar) — não desenvolver. 1-2 semanas é razoável só pra operação, não pra reescrever isso |
| **1.1** — UAZAPI/Luniochat WhatsApp | 2 semanas | Nenhum vestígio no código | **Genuinamente novo.** Estimativa plausível |
| **1.2** — N8N bidirecional | 1 semana | Nenhum vestígio no código | **Genuinamente novo**, mas ver observação abaixo sobre sobreposição com MCP/OpenClaw |
| **2** — OpenClaw + MCP server | 3 semanas | **Já construído** (Sprint 6): servidor MCP com 8 tools (`listar_faturas_cliente`, `abrir_chamado`, `consultar_status_chamado`, etc.), adapter OpenClaw, endpoints `/mcp/exec`, `/mcp/tools`, `/mcp/openclaw.yaml`, documentado em `docs/MCP-OPENCLAW-LLM.md` | **Já construído no nível de código.** O que resta é só: gerar API key do lado do OpenClaw/clawd.bot, configurar o `MCP_SERVICE_TOKEN`, e validar os casos de uso ponta a ponta. 3 semanas parece superdimensionado pra isso — questione o integrador |
| **3** — Backblaze B2 (storage) | 1-2 semanas | **Já construído**: `cora-api/routes/uploads.js` + `infra/s3.js` já implementam upload via presigned URL, com allowlist de tipo/prefixo, limite de tamanho, proteção path-traversal. B2 é S3-compatible — o backup do Postgres já está com env vars pra B2 no `docker-compose.yml` | **Já construído.** O trabalho real é configurar `S3_BUCKET`/`S3_ACCESS_KEY`/`S3_SECRET_KEY` apontando pro endpoint da B2 e migrar arquivos que hoje estão no volume local `app-uploads`. Não é "semanas de dev" |
| **4** — Maya CRM coexistir/consolidar | 2 semanas | **Nenhuma menção a "Maya" em código ou documentação** | **Preciso de contexto seu**: o que é o Maya CRM? Sistema paralelo que a equipe comercial usa hoje? Tem API? Quantos registros migrar? Sem isso não dá pra validar se 2 semanas é realista — decisão de consolidar/migrar uma base de CRM inteira não deveria ser prazo fixo sem descoberta prévia |
| **5** — Landing page + Stripe + LGPD | 2-3 semanas | LGPD **já implementado** no backend (DSAR, consentimento, retenção configurável, 25/25 testes). Landing page e Stripe: nada no código | Escopo real é landing page + Stripe (novo). ⚠️ **Atenção**: já existe integração bancária (Cora) pra cobrar os *clientes do seu cliente* (faturas/boletos). Stripe aqui é pra cobrar *o próprio SaaS* dos seus clientes (assinatura do ERP). São dois fluxos de pagamento diferentes na mesma base de código — deixe isso explícito pro integrador pra não misturar |
| **6** — Multi-tenant forte + SaaS | 4-5 semanas | **Substancialmente implementado** desde a Sprint 13: `tenant_id` em todas as tabelas, isolamento testado (`test-tenant-isolation` 10/10, `test-tenant-aware` 15/15), rotas de tenant (`routes/tenants.js`), flags `ENABLE_MULTI_TENANT`/`DEFAULT_TENANT_ID` | Peça pro integrador listar **exatamente** o que falta (self-signup, trial automático, limite de recursos por tenant, billing por tenant ligado ao Stripe da Fase 5) em vez de aceitar "multi-tenant" como caixa-preta de 4-5 semanas |
| **7** — Self-hosted/licença | 4-5 semanas | Nada no código (é decisão de modelo de negócio + engenharia de licenciamento) | Razoável como fase tardia; depende fortemente das decisões da Fase 6 |
| **8** — Escala (K8s) | Sob demanda | — | Bom senso já embutido no roadmap ("quando a tração justificar") — sem objeção |

---

## 🔐 O maior gap do roadmap: segurança de perímetro não aparece em lugar nenhum

O roadmap assume que da Fase 0 (VPS no ar) já se pode abrir WhatsApp (Fase 1.1),
N8N (Fase 1.2) e OpenClaw (Fase 2) — ou seja, expor a aplicação a canais
externos de verdade — **sem nenhuma menção a firewall, WAF ou detecção de
intrusão**. A aplicação em si está bem protegida (JWT, rate-limit, CSRF, 27/27
vulnerabilidades da auditoria de app corrigidas — ver `SECURITY.md` e as 3
sprints `SPRINT-SECURITY-*.md`), mas isso é orquestra sem baixo: infraestrutura
de perímetro (firewall de host, WAF na borda, EDR+SIEM) já está preparada no
repositório (`SPRINT-SECURITY-INFRA.md`, scripts prontos), só falta ser
aplicada na VPS real.

**Recomendação concreta**: insira isso como critério de saída da Fase 0 — a VPS
só é considerada "no ar" quando o firewall + WAF estiverem ativos, não só
quando o `docker compose up` funcionar. Antes de abrir WhatsApp/N8N pro público
(Fase 1), a superfície de ataque cresce bastante — é o pior momento pra não ter
perímetro.

---

## ⚠️ Um documento antigo pode confundir o integrador

`ANALISE-PROJETO.md` (na raiz) é uma auditoria que lista 9 vulnerabilidades
críticas — CORS aberto, autorização via headers manipuláveis pelo cliente,
"2FA" fake no `sessionStorage`, senhas em texto puro no `localStorage`, chave de
criptografia com default público no código. **Pelas datas e pelo conteúdo, isso
descreve uma versão anterior do sistema** (frontend estático com auth em
`js/auth.js`/`js/storage.js`), e a maioria desses pontos parece corrigida pelas
sprints de segurança posteriores (JWT com whitelist de algoritmo, CORS
restrito, etc.).

O documento não deixa isso claro. Se o integrador ler `ANALISE-PROJETO.md`
sozinho, sem cruzar com `SECURITY.md`/`SPRINT-SECURITY-*.md`, corre o risco de
(a) re-trabalhar algo já corrigido, ou (b) não perceber que parte do código
antigo (`js/auth.js`, `js/storage.js`) pode ainda estar presente como código
morto. Vale um dos dois: apagar/arquivar o arquivo, ou adicionar uma nota no
topo dizendo que foi superado pelas sprints seguintes.

---

## ❓ Perguntas que eu faria ao integrador antes de assinar o cronograma

1. **Maya CRM** — o que é, tem API, quantos registros, é uma migração de dados
   ou só uma integração de leitura?
2. **OpenClaw** — é o serviço hospedado (clawd.bot, citado no
   `docs/MCP-OPENCLAW-LLM.md`) ou algo pra ser hospedado por vocês? Isso muda
   drasticamente o esforço da Fase 2, que já tem quase tudo pronto do lado do
   Renostter.
3. **N8N vs. MCP/OpenClaw** — as duas camadas de automação vão coexistir com
   responsabilidades separadas, ou há sobreposição? Duas orquestrações fazendo
   automação parecida é custo de manutenção duplicado.
4. Pedir ao integrador, como primeira entrega (não paga, ou de poucas horas):
   ler os documentos `SPRINT-*.md`/`CHANGELOG.md` e rodar a suíte de testes
   existente (298/299 passando na última sprint de segurança) — confirmação de
   que ele entendeu o estado real antes de cronogramar em cima de um roadmap
   que parece ter sido escrito sem essa leitura.

---

## ✅ Resumo executivo

- **Faça `git init` + primeiro commit hoje**, antes do integrador começar —
  independe dele, é rápido, e destrava revisão por PR desde o dia 1.
- **Fases 0, 2 e 3 estão superdimensionadas** — boa parte já existe em código;
  renegocie prazo/custo ou realoque esse tempo pro que é genuinamente novo.
- **Fase 6 (multi-tenant) precisa de escopo explícito** — já não é do zero.
- **Falta uma fase/critério de segurança de perímetro** antes de abrir canais
  externos (WhatsApp/N8N/OpenClaw) — já preparado, só falta aplicar.
- **Fase 4 (Maya CRM) é a mais nebulosa** — não decida prazo sem descoberta.
- **Arquive ou anote `ANALISE-PROJETO.md`** para não confundir o time novo.
