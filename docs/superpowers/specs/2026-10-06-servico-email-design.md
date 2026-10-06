# Design: Serviço de E-mail (confirmação de criação de evento)

Data: 2026-10-06
Status: Aprovado pelo usuário (design em conversa)

## Objetivo

Criar um serviço de e-mail reutilizável para a API de eventos, capaz de disparar
e-mails sempre que necessário. No escopo atual: enviar um e-mail de confirmação
ao usuário (organizador) que solicitou a criação de um novo evento via
`POST /api/eventos`.

Fora de escopo: autenticação OAuth2, notificações in-app, retry/persistência de
e-mails falhos, outros gatilhos de e-mail (inscrição, cancelamento etc.) — a
interface do serviço já os comporta, mas nada além da criação de evento é
disparado agora.

## Decisões aprovadas

| Tópico           | Decisão                                                |
| ---------------- | ------------------------------------------------------ |
| Provedor         | Gmail pessoal do usuário                               |
| Autenticação     | App Password via SMTP + Nodemailer                     |
| Falha no envio   | Assíncrono / não-bloqueante; apenas log                |
| Resiliência      | Somente log do erro (sem retry, sem persistência)      |
| Conteúdo         | HTML com resumo do evento + fallback texto puro        |
| Abordagem        | Serviço genérico + templates puros, chamada no controller |

## Arquitetura

Fluxo: `POST /api/eventos` (JWT em `req.userId`) → `createEvento` persiste o
evento (o `include.organizador` já seleciona `id, nome, email`) → responde 201
imediatamente → em background, o serviço de e-mail monta o template para
`{usuario, evento}` e envia via transporter Nodemailer para o Gmail SMTP.

O envio nunca bloqueia nem altera a resposta HTTP; falhas são apenas logadas.

## Componentes

### Dependência

- `nodemailer` (^6.x) em `package.json`. Como `node_modules` é volume anônimo,
  requer `docker compose up --build` para entrar na imagem.

### `config/mailer.js`

- Exporta um único transporter criado a partir do ambiente:
  - `host`: `SMTP_HOST` (default `smtp.gmail.com`)
  - `port`: `Number(process.env.SMTP_PORT)` (default `465`)
  - `secure`: `SMTP_SECURE === 'true'` (default `true`)
  - `auth`: `{ user: SMTP_USER, pass: SMTP_PASS }`
- Se `EMAIL_ENABLED !== 'true'`, exporta transporter `null` (dev sem
  credenciais não quebra, nada é enviado).
- Exporta `verifyMailer()` que chama `transporter.verify()` e apenas loga
  resultado (usado no boot de `server.js`, não-fatal).

### `services/emailService.js`

Exportações:

- `isEmailEnabled()` → boolean (`EMAIL_ENABLED === 'true'` e transporter existe).
- `async sendEmail({ to, subject, html, text })` → valida campos obrigatórios,
  envia via transporter, retorna `messageId`; lança erro em falha (caller
  decide o que fazer).
- `async sendTemplatedEmail(to, template)` → conveniência que recebe o objeto
  `{ subject, html, text }` produzido por um template.
- `sendMailSafe(to, template)` → wrapper fire-and-forget usado pelo controller:
  não retorna promise rejeitada, faz `.catch` que loga `[email] <to> <subject>`:
  `<mensagem de erro>`.
- Remetente (`from`) = `EMAIL_FROM`; se indefinido, o Nodemailer usa
  `SMTP_USER` como endereço do remetente.

### `services/emailTemplates/eventoCriado.js`

Função pura `eventoCriadoTemplate({ usuario, evento })` → `{ subject, html, text }`.

- `subject`: `Evento criado: <titulo>`
- `html`: saudação pelo `usuario.nome`; título; datas formatadas em pt-BR
  (início/fim via `toLocaleString('pt-BR')`); local (`LocalNome` + cidade/UF)
  ou `linkOnline` quando `tipoEvento !== 'presencial'`; status atual; nota
  destacada quando `status === 'rascunho'`.
- `text`: versão texto puro com as mesmas informações.
- Sem dependências externas — template literals.

### Hook no controller (`controllers/eventosController.js`)

Ao final de `createEvento`, após `cache.flushAll()` e antes da resposta:

```js
sendMailSafe(evento.organizador.email, eventoCriadoTemplate({
   usuario: evento.organizador,
   evento,
}))
```

Não há query extra (email já vem do `include`). A resposta 201 ocorre antes do
envio terminar; o envio roda em background.

### Variáveis de ambiente

Adicionar ao `.env` e criar `./.env.example` documentando:

```
EMAIL_ENABLED=true
EMAIL_FROM=Seciteci Eventos <seu@gmail.com>
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=seu@gmail.com
SMTP_PASS=senha-de-app-de-16-digitos
```

- Credenciais reais ficam apenas no `.env` local (não comitado; `.env` já está
  no `.gitignore` — verificado no repositório).
- `docker-compose.yml` repassa as variáveis via substituição `${VAR}` — o
  Compose carrega o `.env` do diretório automaticamente para esse fim.
- Se obviamente ausentes com `EMAIL_ENABLED=true`, `verifyMailer()` loga aviso
  no boot, mas o servidor sobe normalmente.

### Verificação

Sem suíte de testes no projeto. Verificações:

1. Novo script `scripts/sendTestEmail.js` + npm script `email:test`, que envia
   um e-mail de teste para o destinatário informado:
   `docker compose exec app npm run email:test -- destinatario@gmail.com`.
2. Teste ponta a ponta: com `EMAIL_ENABLED=true`, `POST /api/eventos` com token
   válido → conferir chegada do e-mail na caixa do organizador.
3. Rebuild obrigatório: `docker compose up --build` (nodemailer novo).

## Tratamento de erros

- Envio assíncrono: erros não afetam a resposta HTTP nem o estado do banco
  (evento já persistido).
- Falhas são logadas com destinatário e assunto; sem retry, sem persistência
  (decisão de escopo do staging).
- `EMAIL_ENABLED=false` retorna sem tentar conectar/enviar.

## Segurança

- `SMTP_PASS` (App Password de 16 dígitos) só via variável de ambiente.
- Nada de segredos no código, no compose ou nos exemplos.
- App Password exige verificação em 2 etapas ativa na conta Google.
