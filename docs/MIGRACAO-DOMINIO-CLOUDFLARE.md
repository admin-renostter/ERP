# Migração renostter.com: GoDaddy → Cloudflare

**Data início:** 2026-07-17
**Domínio:** `renostter.com`
**Email:** M365 via GoDaddy (mantém — só muda DNS)
**Objetivo:** Domínio at-cost no Cloudflare, M365 funcionando, R$ risco eliminado

---

## Por que estamos fazendo isso

- **Billing do GoDaddy falhou** → risco de suspender M365 + perder domínio em 30-60 dias
- **Custo:** $21.99/ano (GoDaddy) → **$10.44/ano** (Cloudflare at-cost) = **-$11.55/ano**
- **Acumulado 5 anos:** ~$66 de economia
- **Bônus:** DNS mais rápido, DNSSEC grátis, DDoS protection, sem renovação surpresa

---

## Ordem dos passos (CRÍTICA — não pular!)

### ✅ ETAPA 0 — PRÉ-REQUISITO (fazer AGORA, 5 min)
- [ ] **Atualizar billing do GoDaddy** (`Validar dados de cobrança` na home)
  - Atualizar cartão de crédito
  - Confirmar endereço de cobrança
  - Salvar
- [ ] **Pagar fatura do M365** se tiver alguma pendente
  - Vai em `Email e Office` → `Manage` → ver fatura
- [ ] **Verificar se o M365 não foi suspenso**
  - Tenta logar em https://outlook.office.com com `seu@renostter.com`

### ✅ ETAPA 1 — Liberar o domínio no GoDaddy (5 min)
- [ ] My Products → `renostter.com` → Manage
- [ ] Desligar **Domain Lock** (Additional Settings → Edit)
- [ ] Desabilitar **auto-renew** do domínio
- [ ] **Transfer to Another Registrar** → Continue → copiar **EPP code**
- [ ] Guardar o EPP code em local seguro (1Password / Bitwarden / arquivo criptografado)

### ✅ ETAPA 2 — Criar conta no Cloudflare (3 min)
- [ ] Acessar https://dash.cloudflare.com/sign-up
- [ ] Criar conta com email (preferencialmente o mesmo do M365)
- [ ] Confirmar email
- [ ] Adicionar site `renostter.com` (plano Free)
- [ ] Pular setup de DNS (vai pular pro passo 3)

### ✅ ETAPA 3 — Iniciar transferência no Cloudflare (5 min)
- [ ] Cloudflare → **Domain Registration** → **Transfer Domains**
- [ ] Digitar `renostter.com` → Add
- [ ] Colar o **EPP code** do GoDaddy
- [ ] Confirmar contact info (usar o mesmo email do M365)
- [ ] Pagar **$10.44** (cartão internacional)
- [ ] Anotar o **Transfer ID** que aparece

### ✅ ETAPA 4 — Aprovar email da GoDaddy (dentro de 5 dias!)
- [ ] Checar o **email do WHOIS** (não o email de login do GoDaddy)
- [ ] Procurar assunto: *"Transfer of renostter.com to Cloudflare"*
- [ ] Clicar em **"APPROVE"** ou **"Accept"**
- [ ] **Se não aparecer:** checar spam/promoções
- [ ] **Se não vier em 24h:** ligar pro suporte GoDaddy (480-463-8719)

### ⏳ ETAPA 5 — Esperar (5-7 dias automáticos)
- [ ] Status em: Cloudflare → Domain Registration → Transfer Domains
- [ ] Não fazer NADA durante esse período
- [ ] Email continua funcionando (DNS não muda até a conclusão)

### ✅ ETAPA 6 — Após transferência completar (15 min)
- [ ] Cloudflare → DNS → Records (apagar registros antigos, se houver)
- [ ] Adicionar registros do M365 (ver tabela abaixo)
- [ ] Validar email: enviar email teste de Gmail pra `seu@renostter.com`
- [ ] Validar envio: enviar email de `seu@renostter.com` pra Gmail
- [ ] Aguardar propagação DNS (até 24h, mas normalmente <1h)

### ✅ ETAPA 7 — Limpeza final (10 min)
- [ ] No GoDaddy: cancelar **WordPress trial** (se não quiser)
- [ ] No GoDaddy: confirmar que M365 continua ativo e renovando
- [ ] Salvar nota: domínio agora é gerenciado em dash.cloudflare.com

---

## Registros DNS do M365 (pra ETAPA 6)

| Tipo | Nome | Valor | Proxy |
|---|---|---|---|
| MX | `@` | `renostter-com.mail.protection.outlook.com` (prio 0) | DNS only |
| TXT | `@` | `v=spf1 include:spf.protection.outlook.com -all` | — |
| CNAME | `autodiscover` | `autodiscover.outlook.com` | DNS only |
| CNAME | `sip` | `sipdir.online.lync.com` | DNS only |
| CNAME | `lyncdiscover` | `webdir.online.lync.com` | DNS only |
| TXT | `_dmarc` | `v=DMARC1; p=reject; rua=mailto:dmarc@renostter.com` | — |

**DKIM** (2 CNAMEs adicionais): o admin M365 gera em https://security.microsoft.com → DKIM

---

## Contatos de emergência

| Problema | Contato |
|---|---|
| Transferência travada | Cloudflare support: https://dash.cloudflare.com → Help |
| Email parou de funcionar | Microsoft 365 admin: https://admin.microsoft.com |
| Dúvidas sobre billing M365 | GoDaddy: 0800-892-2460 (BR) ou chat |
| Domínio foi suspenso | GoDaddy: 480-463-8719 (US) |

---

## Custos

| Item | Valor |
|---|---|
| **Hoje (GoDaddy, quebrado)** | $21.99/ano (domínio) + M365 |
| **Depois (Cloudflare + M365)** | $10.44/ano (domínio) + M365 |
| **Economia direta** | $11.55/ano (domínio) |
| **Economia 5 anos** | ~$66 |

---

## Changelog

- **2026-07-17** — Iniciado. Billing GoDaddy falhou, M365 em risco. Decisão: transferir domínio pro Cloudflare mantendo M365 via GoDaddy.
