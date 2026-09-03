Assunto: Solicitação de ativação do módulo Banking / Extrato Bancário — API Cora

Prezados,

Somos a Renostter (ANTGRAVITY), cliente Cora com integração já em operação
para emissão de boletos via API. Estamos ampliando a integração e precisamos
do endpoint de extrato bancário.

---

**O QUE JÁ FUNCIONA (integração ativa):**
- Emissão de invoices/boletos via POST /v2/invoices/
- Autenticação mTLS com certificados PEM
- Consulta de invoices via GET /v2/invoices/:id
- Notificações de pagamento via webhook

**O QUE ESTÁ FALTANDO:**
- GET /v2/banking/statement → retorna HTTP 404 Not Found
- Endpoint necessário para exibir saldo e histórico de transações
  no painel do nosso CRM de cobrança

---

**DETALHE TÉCNICO:**

Ao chamar GET https://matls-clients.api.cora.com.br/v2/banking/statement
obtemos:

  Status: 404
  Response: {"timestamp":..., "status": 404, "error": "Not Found",
              "message": "",
              "path": "/external/transfers/initiate/v2/banking/statement"}

A autenticação e os demais endpoints da API Cora (token, invoices) estão
funcionando corretamente, então trata-se de um módulo específico não
habilitado na nossa conta.

---

**SOLICITAÇÃO:**

Solicitamos a ativação do módulo de Banking / Extrato Bancário na nossa
conta, para que possamos consumir o endpoint GET /v2/banking/statement.

Se houver algum custo adicional ou processo de aprovação, por favor nos
informem os próximos passos.

---

**DADOS DA CONTA:**
- Client ID: int-3cR3yfHHjtuXNW5bmX6mhN
- Ambiente: Produção
- Uso atual: Emissão de boletos via API REST

Estamos à disposição para qualquer verificação adicional.

Atenciosamente,

João Paulo
ANTGRAVITY — Renostter CRM
