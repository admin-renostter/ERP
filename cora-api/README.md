# Renostter CRM - Cora API Middleware

Este é o Microserviço em Node.js criado pelo Antigravity para suportar a integração com a **Cora**.
A função deste middleware é realizar as requisições autenticadas usando mTLS (Certificados), para não expor as chaves privadas no código-fonte do Front-End (CRM).

## Pré-Requisitos

- Node.js versão v18+
- SQLite3 (Instalado via NPM automaticamente)
- Certificados da Cora Pro (`certificate.pem` e `private-key.key`) baixados da plataforma Cora Web.

## Configuração

1. Instale as dependências:
   ```bash
   npm install
   ```

2. Crie ou renomeie o `.env.example` para `.env`:
   ```env
   PORT=3000
   CORA_CLIENT_ID=seu_client_id_aqui
   CORA_CERT_PATH=./certs/certificate.pem
   CORA_KEY_PATH=./certs/private-key.key
   ```

3. Coloque seus certificados na pasta `certs/`. (Atenção: A pasta `certs/` não deve ser versionada no git!).

## Executando o Middleware

Para rodar em ambiente de desenvolvimento interativo:
```bash
npm start
# (Ou simplesmente: `node server.js`)
```

Isso criará automaticamente o banco de dados `cora.sqlite` e subirá os endpoints na porta 3000.

## Comunicação com o Frontend CRM

O arquivo `cora_integration.js` presente em `js/` do seu Frontend enviará requisições para `http://localhost:3000/api/cora/...`.
Assegure-se de que o NPM esteja rodando quando for testar o painel!

### Endpoints
- `POST /api/cora/boleto`: Emite a fatura e retorna o PDF/Código de Barras.
- `GET /api/cora/extrato`: Exibe saldo.
- `GET /api/cora/sync`: Baixa os status atualizados para o LocalStorage do Frontend.
- `POST /api/cora/webhook/receber`: Escuta atualizações da Cora em tempo real. (Nota: Para Webhooks funcionarem no ambiente restrito do localhost, exponha a porta 3000 usando Ngrok e atualize o Webhook na Cora Web).
