# Quick Start - Deployment Webhook (5 minutos)

## ⚡ Resumo da Solução

Criamos um sistema alternativo de deployment que não usa SSH (que estava com timeout).

**Como funciona:**
1. Você faz `git push` para o main
2. GitHub Actions faz um `POST /webhook/deploy` para seu VPS
3. Seu VPS puxa o código e reinicia os containers
4. Deploy concluído! 🎉

## 🚀 Setup Rápido (no seu VPS)

```bash
# SSH no VPS
ssh root@184.167.156.130

# Criar token
WEBHOOK_TOKEN=$(openssl rand -hex 32)
echo $WEBHOOK_TOKEN  # Salve este valor!

# Criar diretório
mkdir -p /opt/webhook-deploy
cd /opt/webhook-deploy

# Clonar e copiar arquivos
git clone https://github.com/admin-renostter/ERP.git temp
cp temp/scripts/webhook-deploy.py .
cp temp/docker-compose.webhook.yml .
cp temp/Dockerfile.webhook .
rm -rf temp

# Salvar token
echo "WEBHOOK_TOKEN=$WEBHOOK_TOKEN" > .env

# Buildar e rodar
docker-compose -f docker-compose.webhook.yml build
docker-compose -f docker-compose.webhook.yml up -d

# Verificar
docker-compose -f docker-compose.webhook.yml logs -f webhook-deploy
```

## 🔐 Configurar GitHub

1. Settings → Secrets and variables → Actions
2. New secret: `WEBHOOK_TOKEN` = (token que você anotou)
3. Salvar

## ✅ Testar

```bash
curl -k https://erp.renostter.com/health
curl -X POST -H "Authorization: Bearer $WEBHOOK_TOKEN" -H "Content-Type: application/json" -d '{"action":"deploy"}' -k https://erp.renostter.com/webhook/deploy
```

## 🔧 Configurar NGINX

Editar `/opt/renostter-erp/nginx/conf.d/default.conf`:

```nginx
location /webhook/ {
    proxy_pass http://webhook-deploy:5000/webhook/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_connect_timeout 10s;
    proxy_send_timeout 30s;
    proxy_read_timeout 60s;
}

location /health {
    proxy_pass http://webhook-deploy:5000/health;
}
```

Depois: `docker-compose restart nginx`

## ✨ Pronto!

Agora quando você fizer `git push main`, o deployment acontece automaticamente! 🚀
