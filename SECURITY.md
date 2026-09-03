# 🔐 Renostter CRM — Política de Segurança

**Sprint 0 — Correções Críticas de Segurança**

Este documento define o que consideramos credencial sensível, como rotacionar
e o que fazer se algo vazar. Toda a equipe DEVE ler antes de contribuir.

---

## 1. Arquivos que NUNCA devem ser commitados

| Categoria | Extensões / Padrões | Risco se vazar |
|---|---|---|
| Certificados mTLS | `*.pem`, `*.key`, `*.crt`, `*.p12`, `*.pfx`, `*.cer` | **Equivale a senha bancária.** Atacante pode emitir cobranças na nossa conta Cora. |
| Variáveis de ambiente | `.env`, `.env.*` (exceto `.env.example`) | Expõe `DB_ENCRYPTION_KEY`, `JWT_SECRET`, chaves de SMTP, NFe, etc. |
| Bancos de dados locais | `*.sqlite*`, `*.db` | Contém dados de clientes (LGPD). |
| Logs de produção | `*.log` (em prod) | Podem conter tokens em URL, payloads, IP de admin. |
| Cobertura de teste | `coverage/`, `playwright-report/` | Podem conter snapshots de telas com dados reais. |

> O `.gitignore` da raiz + `cora-api/.gitignore` já protegem todos esses
> padrões. Se você criar um novo padrão sensível, **edite os dois**.

---

## 2. Procedimento de rotação de credenciais

Se uma credencial foi commitada por acidente, **trate como comprometida**
e rotacione IMEDIATAMENTE. Sequência:

### 2.1 Chave privada mTLS da Cora (`private-key.key`)

```bash
# 1. Gere um novo par de chaves + certificado na plataforma Cora
#    (https://app.cora.com.br → Configurações → API → Certificados)
# 2. Baixe os novos arquivos para um caminho FORA do repositório:
#    ~/.secrets/renostter/cora/private-key.key
#    ~/.secrets/renostter/cora/certificate.pem
# 3. Apague o .key e o .pem do projeto:
rm -f cora-api/private-key.key cora-api/certificate.pem cora-api/certs/*
# 4. Configure as variáveis de ambiente:
export CORA_KEY_PATH="/home/deploy/.secrets/renostter/cora/private-key.key"
export CORA_CERT_PATH="/home/deploy/.secrets/renostter/cora/certificate.pem"
# 5. Limpe o histórico do Git (BFG Repo-Cleaner ou git filter-repo)
bfg --delete-files private-key.key
git reflog expire --expire=now --all
git gc --prune=now --aggressive
# 6. Force-push e avise a equipe
git push --force
```

### 2.2 `DB_ENCRYPTION_KEY` (criptografia AES-256)

```bash
# Gerar nova chave forte (32 bytes hex = 64 chars):
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Re-criptografar dados existentes:
node cora-api/scripts/rotate-secrets.js --rotate db-encryption
# (script provided — re-encrypts client_secret_encrypted in bancos_cadastrados)
```

### 2.3 `JWT_SECRET`

```bash
# Gerar nova chave:
node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"

# ⚠️ ATENÇÃO: rotacionar JWT_SECRET invalida todos os tokens ativos.
# Usuários precisarão logar novamente. Faça em horário de baixo movimento.
export JWT_SECRET="$(node -e "console.log(require('crypto').randomBytes(64).toString('base64'))")"
# Reinicie a API. Todos os clientes devem re-autenticar.
```

### 2.4 `WEBHOOK_WEBHOOK_SECRET` (assinatura HMAC dos webhooks)

```bash
# Gerar nova chave (compartilhada com a Cora):
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Configure a mesma chave no painel da Cora (webhook signing secret)
# e no env da nossa API.
export WEBHOOK_WEBHOOK_SECRET="<nova_chave>"
# Reinicie a API.
```

### 2.5 `RESEND_API_KEY` (Sprint 8 — Email transacional)

```bash
# 1. Acesse https://resend.com/api-keys
# 2. Clique em "Create API Key"
# 3. Defina permissões: "Sending access" (mínimo)
# 4. Copie a chave (só aparece UMA vez)
# 5. Adicione ao .env:
export RESEND_API_KEY="re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
# 6. Reinicie a API
#
# ⚠️ Se a chave vazou, delete-a no painel do Resend IMEDIATAMENTE
# e crie uma nova.
```

### 2.6 `AUTENTIQUE_TOKEN` (Sprint 8 — Assinatura digital)

```bash
# 1. Acesse https://painel.autentique.com.br/perfil/api
# 2. Clique em "Revogar" no token atual
# 3. Gere um novo token
# 4. Adicione ao .env:
export AUTENTIQUE_TOKEN="<token_hex_64_chars>"
# 5. Reinicie a API
#
# ⚠️ Se o token vazou, revogue IMEDIATAMENTE no painel Autentique.
```

---

## 3. Checklist pré-commit

Antes de qualquer `git commit`, rode:

```bash
# Lista arquivos que vão ser commitados:
git status

# Procure por padrões sensíveis:
git diff --cached | grep -E '\.env|private-key|\.pem|\.key|password|secret|token' -i
# Se aparecer algo: NÃO COMMITE. Verifique o .gitignore.

# (Opcional) Use um pre-commit hook:
# cat .git/hooks/pre-commit
# #!/bin/sh
# git diff --cached --name-only | grep -E '\.(env|key|pem|crt|p12)$' && \
#   echo "❌ Arquivo sensível detectado. Commit bloqueado." && exit 1
```

---

## 4. Reportando uma vulnerabilidade

> **⚠️ NUNCA compartilhe credenciais em texto puro em chat, e-mail, planilha ou prints.**
>
> As credenciais SEMPRE devem ser:
> - Geradas pelo `npm run rotate:*`
> - Coladas no `.env` (que está no `.gitignore`)
> - Ou armazenadas em cofre (1Password, Bitwarden, AWS Secrets Manager, Doppler)
> - Nunca digitadas em URLs, prints de tela, screenshots, Issues do GitHub, etc.

Exemplos do que **NÃO fazer**:
- ❌ Mandar chave de API no chat (mesmo chat privado)
- ❌ Colar token em issue do GitHub
- ❌ Print do painel mostrando a chave
- ❌ Salvar em planilha compartilhada
- ❌ Commitar `.env` "só pra testar"

Se uma credencial vazar:
1. **Rotacione IMEDIATAMENTE** (mesmo procedimento da seção 2)
2. Verifique logs da plataforma (Resend, Autentique) para uso indevido
3. Documente o incidente (sem expor a chave comprometida)

Achou um bug de segurança? **Não abra issue pública.** Mande e-mail para:

📧 **security@renostter.com** (privado, só os mantenedores veem)

Inclua:
- Descrição do problema
- Passos para reproduzir
- Impacto potencial
- Sugestão de correção (se tiver)

Resposta em até 48h úteis.

---

## 5. Referências

- OWASP Top 10 — https://owasp.org/Top10/
- RFC 6238 (TOTP) — para implementação de 2FA na Sprint 1
- RFC 7519 (JWT) — para JWT na Sprint 0
- LGPD — Lei Geral de Proteção de Dados (Brasil)

---

**Última atualização:** Sprint 0 — Correções críticas de segurança
**Owner:** Time Renostter
