# 🛡️ Sprint Security Infra — Firewall, WAF e EDR+SIEM

**Período**: Setembro 2026
**Status**: ✅ Código/config pronto no repositório · ⏳ **Deploy em produção pendente**
**Sprint anterior**: Security Hardening 3 (V10–V27 — camada de aplicação, 27/27 vulnerabilidades)

---

## 🎯 Objetivo

As três sprints de segurança anteriores (Security Fixes, Hardening 2 e 3) fecharam a
**camada de aplicação**: JWT, validação de input, rate-limit local, brute-force,
backup cifrado, etc. Uma auditoria de infraestrutura identificou que faltavam os
três pilares clássicos de defesa de perímetro/host:

| Pilar | Situação antes | Situação depois |
|---|---|---|
| **Firewall** | Só rate-limit do nginx. VPS com portas expostas sem allowlist. | UFW com default-deny + allowlist de IP do Cloudflare + fail2ban |
| **WAF** | Nenhum. Cloudflare só fazia DNS. | Bot Fight Mode + managed ruleset + rate-limit de borda |
| **EDR + SIEM** | `SecurityLogger` (V21) gerava eventos, mas nada os correlacionava ou alertava. Nenhum agente de host. | Wazuh (open source) — FIM, rootcheck, correlação e dashboards, ingerindo os logs que a app já produz |

---

## 📦 O que foi implementado (no repositório)

### 1. Firewall de host — `scripts/setup-firewall.sh`
- UFW: `default deny incoming`, `default allow outgoing`
- SSH liberado com `ufw limit` (rate-limit nativo contra brute force)
- 80/443 liberados **somente** para as faixas de IP do Cloudflare (buscadas em
  tempo real de `cloudflare.com/ips-v4` e `/ips-v6`) — ou completamente fechados
  se a VPS usar Cloudflare Tunnel (`USE_CLOUDFLARE_TUNNEL=true`), que é o que o
  próprio `DEPLOY-DOCKER.md` já recomendava
- `fail2ban` configurado pro `sshd` (5 tentativas / 10min → ban de 1h)

### 2. WAF na borda (Cloudflare) — `scripts/cloudflare-waf-setup.sh` + `scripts/update-cloudflare-realip.sh`
- Bot Fight Mode + `security_level=medium` (challenge automático)
- Managed ruleset (Free Managed Ruleset no plano Free; documentado como trocar
  pelo OWASP Core Ruleset completo se migrar pro plano Pro)
- Regra de rate-limit de borda: 10 req/min por IP em `/api/auth/login` e
  `/api/portal/login` — 3ª camada de defesa (nginx e a própria API já fazem
  rate-limit local; isso bloqueia ANTES de chegar na VPS)
- Regra de challenge gerenciado em métodos de escrita (`POST/PUT/PATCH/DELETE`)
  vindos de bots conhecidos
- `update-cloudflare-realip.sh` gera `nginx/conf.d/00-cloudflare-realip.conf` com
  `set_real_ip_from` pras faixas do Cloudflare + `real_ip_header
  CF-Connecting-IP` — sem isso, o rate-limit do nginx e os logs enxergam sempre o
  IP de borda do Cloudflare, não o do visitante real

### 3. EDR + SIEM — Wazuh (open source, self-hosted)
Optei por Wazuh em vez de uma ferramenta comercial (CrowdStrike/SentinelOne)
porque unifica EDR e SIEM numa peça só, é gratuito, e já existe uma fonte de
dados pronta pra ele consumir — o `SecurityLogger` da Sprint Security Hardening 3.

- `scripts/setup-wazuh.sh` — clona e sobe o deployment **oficial** do Wazuh
  (manager + indexer + dashboard), não reescrevemos a geração de certificados na
  mão. Porta do dashboard remapeada pra 8443 (443 já é do nginx do app).
- `docker-compose.wazuh-agent.yml` + `wazuh-agent/ossec-localfiles.conf` — agente
  containerizado que lê (read-only) os volumes `renostter-logs` e
  `renostter-nginx-logs` que **já existem** no `docker-compose.yml` principal, e
  encaminha pro manager:
  - `security-*.jsonl` do `SecurityLogger` (login_failed, account_locked,
    token_revoked, path_traversal, mime_spoof, etc.)
  - access.log / error.log do nginx
- `scripts/install-wazuh-agent-host.sh` — agente **nativo** na VPS (fora de
  Docker, porque um container não enxerga o host por fora dele). Faz o que de
  fato é "EDR":
  - FIM (File Integrity Monitoring) em tempo real: `/etc/ufw`, `/etc/fail2ban`,
    `/etc/ssh`
  - FIM periódico: `/etc`, `/usr/bin`, `/usr/sbin`, `/bin`, `/sbin`
  - FIM no próprio projeto: `docker-compose.yml`, `nginx/`, `scripts/`, e nos
    `.env` (só o hash — o conteúdo/segredos nunca são lidos ou enviados)
  - Rootcheck (detecção de rootkit/anomalias) — vem habilitado por padrão no
    Wazuh agent

---

## 📂 Arquivos criados/modificados

### Criados
- `scripts/setup-firewall.sh`
- `scripts/cloudflare-waf-setup.sh`
- `scripts/update-cloudflare-realip.sh`
- `scripts/setup-wazuh.sh`
- `scripts/install-wazuh-agent-host.sh`
- `docker-compose.wazuh-agent.yml`
- `wazuh-agent/ossec-localfiles.conf`
- `SPRINT-SECURITY-INFRA.md` (este arquivo)

### Modificados
- `.env.example` — `CF_API_TOKEN`, `CF_ZONE_ID`, `WAZUH_MANAGER_HOST`,
  `WAZUH_MANAGER_IP`, `WAZUH_REGISTRATION_PASSWORD`
- `CHANGELOG.md` — entrada da sprint

---

## 🚀 Runbook de deploy (AÇÃO HUMANA NECESSÁRIA)

**Isto NÃO foi executado em produção.** Todo o trabalho acima foi feito no
repositório (`renostter-crm` na sua máquina) — ninguém aqui tem acesso SSH à VPS
de produção nem ao painel/API do Cloudflare. Alguém com esse acesso precisa
rodar, nesta ordem:

### Passo 1 — Firewall de host (na VPS, via SSH)
```bash
cd /opt/renostter-crm
git pull   # traz os scripts desta sprint
chmod +x scripts/setup-firewall.sh
sudo USE_CLOUDFLARE_TUNNEL=true ./scripts/setup-firewall.sh
# (troque pra USE_CLOUDFLARE_TUNNEL=false se NÃO usar Cloudflare Tunnel —
#  nesse caso ele libera 80/443 só pros IPs do Cloudflare)
```
⚠️ Teste o acesso (SSH + site) antes de fechar a sessão SSH. Se travar, use o
console da VPS (Hetzner/DO/Linode têm "console" fora do SSH) pra rodar `ufw disable`.

### Passo 2 — WAF Cloudflare (de qualquer máquina com internet)
```bash
export CF_API_TOKEN="<gere em dash.cloudflare.com → My Profile → API Tokens>"
export CF_ZONE_ID="<dashboard renostter.com → API, painel direito>"
chmod +x scripts/cloudflare-waf-setup.sh
./scripts/cloudflare-waf-setup.sh
```

### Passo 3 — Real IP no nginx (na VPS)
```bash
chmod +x scripts/update-cloudflare-realip.sh
./scripts/update-cloudflare-realip.sh
docker compose restart nginx
# agendar renovação mensal:
(crontab -l 2>/dev/null; echo "0 4 1 * * cd /opt/renostter-crm && ./scripts/update-cloudflare-realip.sh && docker compose restart nginx") | crontab -
```

### Passo 4 — Wazuh (na VPS — checar RAM disponível antes, indexer é pesado)
```bash
chmod +x scripts/setup-wazuh.sh
./scripts/setup-wazuh.sh
# troque as senhas padrão (instruções no output do script)
```

### Passo 5 — Agente de logs da aplicação (na VPS)
```bash
# gere e guarde uma senha forte, coloque em WAZUH_REGISTRATION_PASSWORD no .env
docker compose -f docker-compose.wazuh-agent.yml --env-file .env up -d
```

### Passo 6 — Agente nativo de host (na VPS)
```bash
chmod +x scripts/install-wazuh-agent-host.sh
sudo WAZUH_MANAGER_IP=127.0.0.1 \
     WAZUH_REGISTRATION_PASSWORD='<mesma senha do passo 5>' \
     RENOSTTER_PROJECT_DIR=/opt/renostter-crm \
     ./scripts/install-wazuh-agent-host.sh
```

### Passo 7 — Validar
- `https://<ip-da-vps>:8443` → dashboard do Wazuh, checar se os 2 agentes
  aparecem "Active" em **Agents management**
- Gerar um evento de teste: errar a senha de login 6 vezes seguidas → deve
  aparecer em `security-*.jsonl` (já existia) **e** no dashboard do Wazuh (novo)
- Testar o rate-limit de borda: repetir requests em `/api/auth/login` até
  levar 429/challenge do Cloudflare

---

## ⚠️ Riscos e observações

- **UFW mal configurado pode te trancar pra fora da VPS.** O script libera SSH
  antes de ativar o firewall, mas teste em uma janela de manutenção e com o
  console da VPS aberto como plano B.
- **O Wazuh indexer é pesado** (OpenSearch por baixo). Numa VPS de 4-8GB isso
  pode apertar junto com Postgres+Redis+app. Se a VPS for pequena, suba o Wazuh
  numa VPS separada e aponte `WAZUH_MANAGER_IP`/`WAZUH_MANAGER_HOST` pro IP dela.
- **Cloudflare Free vs Pro**: o managed ruleset completo (OWASP Core Ruleset)
  só existe no plano Pro (~US$20/mês). O Free já cobre DDoS L3/4 ilimitado e um
  ruleset básico — ativar via `cloudflare-waf-setup.sh` funciona nos dois, mas
  a cobertura é maior no Pro.
- **Senhas padrão do Wazuh** (`admin/admin`, `kibanaserver/kibanaserver`) —
  o script avisa, mas TROCAR é manual e obrigatório antes de expor a porta 8443
  pra internet.

---

**Sprint responsável**: preparado via Claude (sessão Cowork) — código e docs
prontos; deploy real depende de quem tem acesso à VPS/Cloudflare.
