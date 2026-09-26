# Setup do Sistema de Webhook Deploy

## Problema Resolvido
- SSH estava com timeout (porta 22 bloqueada)
- Usar HTTP POST webhook (mais confiável)

## Arquivos Criados
1. `.github/workflows/deploy-webhook.yml`
2. `scripts/webhook-deploy.py`
3. `docker-compose.webhook.yml`
4. `Dockerfile.webhook`

## Passo 1: Configurar o VPS

### Instalar dependências
```bash
ssh root@184.167.156.130

apt-get update
apt-get install -y python3 python3-pip
pip install flask gunicorn
```

### Criar diretório
```bash
mkdir -p /opt/webhook-deploy
cd /opt/webhook-deploy
```

### Copiar arquivos
```bash
git clone https://github.com/admin-renostter/ERP.git temp
cp temp/scripts/webhook-deploy.py .
cp temp/docker-compose.webhook.yml .
cp temp/Dockerfile.webhook .
rm -rf temp
```

### Definir token
```bash
WEBHOOK_TOKEN=$(openssl rand -hex 32)
echo "WEBHOOK_TOKEN=$WEBHOOK_TOKEN" > .env
```

### Rodar container
```bash
docker-compose -f docker-compose.webhook.yml build
docker-compose -f docker-compose.webhook.yml up -d
docker-compose -f docker-compose.webhook.yml logs -f webhook-deploy
```

## Passo 2: GitHub Secrets

1. Settings → Secrets and variables → Actions
2. New secret: `WEBHOOK_TOKEN`
3. Colar o token do VPS
4. Save

## Passo 3: NGINX

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

## Passo 4: Testar

```bash
# Health check
curl -k https://erp.renostter.com/health

# Deploy manual
curl -X POST \
  -H "Authorization: Bearer $WEBHOOK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action":"deploy","repository":"ERP","branch":"main"}' \
  -k https://erp.renostter.com/webhook/deploy

# Verificar logs
tail -f /var/log/webhook-deploy.log
```

## Troubleshooting

### 403 Forbidden
- Verificar se NGINX está bloqueando `/webhook/`
- Adicionar a rota acima no `default.conf`

### Webhook não chamado
- Verificar se `WEBHOOK_TOKEN` no GitHub está correto
- Comparar com token no VPS

### Deploy não completa
- Verificar logs: `tail -f /var/log/webhook-deploy.log`

### NGINX recusa
- Verificar se container está rodando: `docker-compose ps`
- Testar: `curl http://webhook-deploy:5000/health`
