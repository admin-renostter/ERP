# Preenchimento automático por CPF / CNPJ / CEP

No formulário **Clientes → Novo Cliente**, o campo **CNPJ / CPF** consulta bases externas e preenche o cadastro:

| Documento | Fonte | Chave | O que preenche |
|---|---|---|---|
| CNPJ (14 dígitos) | BrasilAPI (Receita Federal) | não precisa | Razão social, fantasia, e-mail, telefone, situação cadastral, endereço completo |
| CPF (11 dígitos) | CPFHub.io | `CPFHUB_API_KEY` | Nome, data de nascimento, gênero (só com a autorização do titular marcada) |
| CEP (8 dígitos) | BrasilAPI, com ViaCEP de reserva | não precisa | Logradouro, bairro, cidade, UF |

## Como funciona

```
Navegador (admin/clients.html)                Servidor (cora-api)                 APIs externas
  campo CNPJ/CPF  ── máscara, validação ──►  GET /api/consulta/cpf/:cpf  ──x-api-key──►  api.cpfhub.io
  (debounce 600 ms ou ao sair do campo)      GET /api/consulta/cnpj/:cnpj ─────────────►  brasilapi.com.br
                                             GET /api/consulta/cep/:cep  ─────────────►  brasilapi / viacep
                                             cache + limite + auditoria
```

A chamada **sempre passa pelo servidor**, por dois motivos:
- **A chave do CPFHub não sai do servidor.** Ela fica só no `.env` do servidor, nunca vai para o navegador nem para o Git.
- **A CSP do site bloqueia o navegador.** A regra `connect-src 'self'` não deixa o navegador chamar APIs externas; por isso a consulta de CNPJ antiga, feita direto do navegador, não funcionava em produção.

## Arquivos

```
cora-api/
  services/consultaDocumentos.js   validação de CPF/CNPJ, chamadas externas, mapeamento, cache, fila do CPFHub
  routes/consulta.js               rotas /api/consulta/*, permissões, consentimento, limite por usuário, auditoria
  server.js                        monta a rota (app.use('/api/consulta', ...))
  .env.example                     variáveis CPFHUB_* e CONSULTA_TIMEOUT_MS
js/api.js                          api.consultar(), getCNPJ/getCEP (formato antigo), máscara e validação no navegador
js/pages/admin__clients.js         consultarDocumento(): debounce, blur, consentimento, preenchimento, mensagens
admin/clients.html                 status da consulta, caixa de autorização LGPD, campos de nascimento e gênero (só CPF)
```

## Variáveis de ambiente (`.env` do servidor)

```
CPFHUB_API_KEY=                        # chave do painel do CPFHub — NUNCA commitar
CPFHUB_API_URL=https://api.cpfhub.io
CPFHUB_MIN_INTERVAL_MS=2000            # plano gratuito: 1 consulta a cada 2 s (Pro: 1000)
CONSULTA_TIMEOUT_MS=8000               # tempo máximo por consulta externa
```

Sem `CPFHUB_API_KEY`, a consulta de CPF avisa que ainda não está configurada, e o cadastro manual continua funcionando. CNPJ e CEP funcionam sem chave.

## Respostas

Resposta de sucesso da consulta de CPF: `GET /api/consulta/cpf/52998224725?consentimento=1`

```json
{ "success": true, "cache": false,
  "data": { "cpf": "52998224725", "nome": "Maria da Silva", "nascimento": "1990-06-15", "genero": "F" } }
```

Resposta original do CPFHub, conforme a documentação dele, e como cada campo vira campo do formulário:

```json
{ "success": true,
  "data": { "cpf": "52998224725", "name": "Maria da Silva", "nameUpper": "MARIA DA SILVA",
            "gender": "F", "birthDate": "15/06/1990", "day": 15, "month": 6, "year": 1990 } }
```

| CPFHub | Nosso campo | Campo do formulário |
|---|---|---|
| `name` (ou `nameUpper`) | `nome` | Razão Social / Nome e Contato Principal (se vazio) |
| `birthDate` / `day`,`month`,`year` | `nascimento` (AAAA-MM-DD) | Data de nascimento |
| `gender` (`M`/`F`) | `genero` | Gênero |

O mapeamento (`mapearCpfHub`) também aceita nomes alternativos (`nome`, `dataNascimento`, `sexo`). Se a resposta real vier diferente, ajuste só essa função.

Os erros seguem sempre o formato `{ success:false, code, error }`:

| HTTP | code | Quando |
|---|---|---|
| 400 | `DOC_INVALIDO` | dígito verificador errado ou tamanho errado |
| 400 | `SEM_CONSENTIMENTO` | consulta de CPF sem `consentimento=1` |
| 401 / 403 | — | sem login, ou usuário sem permissão (CPF: só admin e superadmin) |
| 404 | `NAO_ENCONTRADO` | documento não existe na base |
| 429 | `LIMITE` | limite do CPFHub ou do usuário (CPF 10/min, CNPJ 30/min, CEP 60/min) |
| 502 | `CHAVE_INVALIDA` | CPFHub recusou a chave (401/403 do CPFHub) |
| 502 | `SERVICO_INDISPONIVEL` / `FALHA_REDE` | erro 5xx ou falha de rede da API externa |
| 503 | `NAO_CONFIGURADO` | falta `CPFHUB_API_KEY` |
| 504 | `TEMPO_ESGOTADO` | a API externa não respondeu no tempo |

## LGPD e segurança

- **Autorização obrigatória:** para CPF, a tela só consulta com a caixa "O titular autorizou…" marcada, e o servidor recusa sem `consentimento=1`.
- **Quem pode:** só admin e superadmin consultam CPF. CNPJ e CEP são dados públicos e ficam liberados à equipe.
- **Auditoria:** cada consulta de CPF vai para `logs_auditoria`, com usuário, CPF mascarado (`***.982.247-**`) e resultado.
- **Logs:** não gravam a chave nem o documento completo.
- **Cache:** o cache fica em memória no servidor (CPF 12 h, CNPJ 24 h, CEP 7 dias, "não encontrado" 30 min) e é indexado por hash do documento. O navegador **não** guarda dados de CPF; CNPJ e CEP ficam em cache local por 24 h.
- **Pedidos repetidos:** consultas iguais ao mesmo tempo viram uma só chamada externa.
- **Campos pessoais:** nascimento e gênero só aparecem para CPF. Se não forem necessários ao negócio, remova-os (princípio da minimização).

## Como testar

Com o sistema no ar, pegue um token de admin fazendo login pela tela. Depois:

```bash
TOKEN=...   # accessToken da sessão (sessionStorage rcrm_session)
curl -s "https://erp.renostter.com/api/consulta/cnpj/15522727000106" -H "Authorization: Bearer $TOKEN"
curl -s "https://erp.renostter.com/api/consulta/cep/01001000"        -H "Authorization: Bearer $TOKEN"
curl -s "https://erp.renostter.com/api/consulta/cpf/SEU_CPF?consentimento=1" -H "Authorization: Bearer $TOKEN"
```

Para testar direto no CPFHub (fora do sistema), a chave vai numa variável e não no comando:

```bash
curl -s "https://api.cpfhub.io/cpf/SEU_CPF" -H "x-api-key: $CPFHUB_API_KEY"
```

Para rodar localmente, sem gastar consultas, aponte `CPFHUB_API_URL`, `BRASILAPI_URL` e `VIACEP_URL` para um servidor simulado. O teste usado no desenvolvimento cobre sucesso, cache, CPF inválido, 404, 429, 500, tempo esgotado, chave errada, chave ausente, falta de permissão, fallback do CEP para o ViaCEP e a tela com a CSP de produção.

## Limites e sugestões

- **Plano gratuito do CPFHub:** 50 consultas por mês e 1 a cada 2 s. CPF não encontrado não gasta crédito. O cache e a fila do servidor ajudam a economizar. No plano Pro (R$ 149/mês, 1.000 consultas, 1 por segundo), ajuste `CPFHUB_MIN_INTERVAL_MS=1000`.
- **O CPFHub não traz endereço.** Para pessoa física, o endereço vem pelo CEP (aba Endereço).
- **Várias instâncias do servidor:** se o sistema rodar em mais de uma instância, troque o cache em memória pelo Redis (`infra/redis.js`).
- **Segurança da chave:** se a chave completa aparecer em algum lugar público (chat, repositório, print), gere outra no painel do CPFHub.
