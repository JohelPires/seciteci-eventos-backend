# Serviço de E-mail (confirmação de criação de evento) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar um serviço de e-mail reutilizável (Nodemailer + Gmail App Password) que envia um e-mail de confirmação ao organizador sempre que um evento é criado via `POST /api/eventos`, sem bloquear a resposta HTTP.

**Architecture:** Transporter único em `config/mailer.js` a partir de env vars; serviço genérico em `services/emailService.js` (`sendEmail`, `sendTemplatedEmail`, `sendMailSafe` fire-and-forget); template puro em `services/emailTemplates/eventoCriado.js`; hook não-bloqueante no fim de `createEvento`. Falhas apenas logadas. `EMAIL_ENABLED=false` desliga tudo.

**Tech Stack:** Node.js (CommonJS), Express, Nodemailer ^6.x, Gmail SMTP (`smtp.gmail.com:465`) com App Password.

**Spec:** `docs/superpowers/specs/2026-10-06-servico-email-design.md`

## Global Constraints

- Código CommonJS (`require`/`module.exports`), sem TypeScript, sem Babel.
- Nenhum teste automatizado existe no projeto (AGENTS.md): verificação é sintática (`node --check`), por smoke test com `node -e`, e manual ponta a ponta via Docker.
- NÃO usar emojis no código.
- Segredos (App Password) apenas em `.env` local (gitignored). `.env.example` contém somente placeholders.
- Envio de e-mail: assíncrono, não-bloqueante, apenas log em caso de falha. Sem retry, sem persistência.
- O comportamento da API (status codes, corpo das respostas) não muda; Swagger (`docs/swagger.routes.js`) não precisa de alteração.
- Docker: após mudar `package.json`, rebuild obrigatório (`docker compose up --build`) — `node_modules` é volume anônimo.

---

### Task 1: Dependência nodemailer + `config/mailer.js`

**Files:**
- Modify: `package.json` (via `npm install`)
- Create: `config/mailer.js`
- Modify: `.env` (local, NÃO comitar)

**Interfaces:**
- Consumes: nada (primeira task).
- Produces: `require('../config/mailer')` exporta `{ transporter, emailEnabled, verifyMailer }`:
  - `transporter`: instância Nodemailer ou `null` quando `EMAIL_ENABLED !== 'true'`.
  - `emailEnabled`: boolean, `process.env.EMAIL_ENABLED === 'true'`.
  - `verifyMailer()`: `async () => void`, nunca lança; usado no boot (Task 4).

- [ ] **Step 1: Instalar nodemailer**

```bash
npm install nodemailer
```

Expected: `package.json` ganha `"nodemailer": "^6.x.x"` em `dependencies`.

- [ ] **Step 2: Criar `config/mailer.js`**

```js
const nodemailer = require('nodemailer')

const emailEnabled = process.env.EMAIL_ENABLED === 'true'

const transporter = emailEnabled
   ? nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: Number(process.env.SMTP_PORT) || 465,
        secure: process.env.SMTP_SECURE !== 'false',
        auth: {
           user: process.env.SMTP_USER,
           pass: process.env.SMTP_PASS,
        },
     })
   : null

const verifyMailer = async () => {
   if (!emailEnabled) {
      console.log('Email desativado: defina EMAIL_ENABLED=true para enviar e-mails')
      return
   }

   if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.warn('AVISO: EMAIL_ENABLED=true, mas SMTP_USER/SMTP_PASS nao estao configurados')
      return
   }

   try {
      await transporter.verify()
      console.log(`Servico de e-mail pronto (${process.env.SMTP_USER})`)
   } catch (error) {
      console.error('Falha ao verificar SMTP:', error.message)
   }
}

module.exports = { transporter, emailEnabled, verifyMailer }
```

- [ ] **Step 3: Verificar sintaxe e smoke test**

```bash
node --check config/mailer.js
node -e "const m = require('./config/mailer'); console.log(typeof m.verifyMailer, m.emailEnabled, m.transporter)"
```

Expected: sem erro de sintaxe; imprime `function false null` (sem EMAIL_ENABLED no env do shell).

- [ ] **Step 4: Adicionar variáveis de e-mail ao `.env` local**

Anexar ao final de `.env` (o arquivo é gitignored — confirmar com `git status` que NÃO aparece; valores reais vêm depois, na Task 6):

```
# E-mail (Gmail App Password - ver docs/superpowers/specs/2026-10-06-servico-email-design.md)
EMAIL_ENABLED=false
EMAIL_FROM=Seciteci Eventos <seu@gmail.com>
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=seu@gmail.com
SMTP_PASS=senha-de-app-de-16-digitos
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json config/mailer.js
git commit -m "feat: adiciona transporter de e-mail (nodemailer) em config/mailer"
```

---

### Task 2: Serviço genérico `services/emailService.js`

**Files:**
- Create: `services/` (diretório novo) e `services/emailService.js`

**Interfaces:**
- Consumes: `{ transporter, emailEnabled }` de `config/mailer` (Task 1).
- Produces: `require('../services/emailService')` exporta:
  - `isEmailEnabled(): boolean`
  - `sendEmail({ to, subject, html, text }): Promise<string|null>` — resolve com `messageId`; resolve `null` se desativado; rejeita em falha SMTP ou campos ausentes.
  - `sendTemplatedEmail(to, template): Promise<string|null>` — `template` é `{ subject, html, text }`.
  - `sendMailSafe(to, template): void` — fire-and-forget, nunca rejeita; loga `[email] Falha ao enviar para <to> ("<subject>"): <erro>`.

- [ ] **Step 1: Criar `services/emailService.js`**

```js
const { transporter, emailEnabled } = require('../config/mailer')

const isEmailEnabled = () => emailEnabled && transporter !== null

const sendEmail = async ({ to, subject, html, text }) => {
   if (!isEmailEnabled()) {
      return null
   }

   if (!to || !subject) {
      throw new Error('sendEmail: campos obrigatorios ausentes (to, subject)')
   }

   const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.SMTP_USER,
      to,
      subject,
      html,
      text,
   })

   return info.messageId
}

const sendTemplatedEmail = async (to, template) => {
   return sendEmail({ to, ...template })
}

const sendMailSafe = (to, template) => {
   sendTemplatedEmail(to, template).catch((error) => {
      console.error(`[email] Falha ao enviar para ${to} ("${template.subject}"):`, error.message)
   })
}

module.exports = { isEmailEnabled, sendEmail, sendTemplatedEmail, sendMailSafe }
```

- [ ] **Step 2: Verificar sintaxe e smoke tests**

```bash
node --check services/emailService.js
EMAIL_ENABLED=false node -e "
   const svc = require('./services/emailService');
   console.log(svc.isEmailEnabled());
   svc.sendEmail({ to: 'x@y.z', subject: 't' }).then((r) => console.log(r));
"
```

Expected: imprime `false` e `null` (desativado retorna sem enviar, não lança).

- [ ] **Step 3: Commit**

```bash
git add services/emailService.js
git commit -m "feat: servico generico de e-mail com envio fire-and-forget"
```

---

### Task 3: Template puro `services/emailTemplates/eventoCriado.js`

**Files:**
- Create: `services/emailTemplates/` e `services/emailTemplates/eventoCriado.js`

**Interfaces:**
- Consumes: nada (função pura).
- Produces: `eventoCriadoTemplate({ usuario, evento })` → `{ subject, html, text }`, onde:
  - `usuario` = `{ nome, ... }` (vem do `include.organizador`, Task 4).
  - `evento` = linha do Prisma com `titulo`, `dataInicio`, `dataFim`, `tipoEvento`, `linkOnline`, `LocalNome`, `LocalCidade`, `LocalEstado`, `status`.

- [ ] **Step 1: Criar `services/emailTemplates/eventoCriado.js`**

```js
const formatarData = (data) =>
   data
      ? new Date(data).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
      : 'Nao informado'

const eventoCriadoTemplate = ({ usuario, evento }) => {
   const presencial = evento.tipoEvento === 'presencial'
   const local = presencial
      ? `${evento.LocalNome || 'A definir'}${
           evento.LocalCidade ? ` - ${evento.LocalCidade}/${evento.LocalEstado || ''}` : ''
        }`
      : evento.linkOnline || 'A definir'

   const ehRascunho = evento.status === 'rascunho'
   const subject = `Evento criado: ${evento.titulo}`

   const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
         <h2 style="color: #2c3e50;">Ola, ${usuario.nome}!</h2>
         <p>Seu evento foi criado com sucesso na plataforma Seciteci Eventos.</p>
         <h3 style="color: #2c3e50;">${evento.titulo}</h3>
         <ul>
            <li><strong>Início:</strong> ${formatarData(evento.dataInicio)}</li>
            <li><strong>Fim:</strong> ${formatarData(evento.dataFim)}</li>
            <li><strong>${presencial ? 'Local' : 'Link'}:</strong> ${local}</li>
            <li><strong>Status:</strong> ${evento.status}</li>
         </ul>
         ${
            ehRascunho
               ? '<p style="background-color: #fff3cd; padding: 12px; border-radius: 4px;">O evento esta em <strong>rascunho</strong> e ainda nao esta visivel ao publico.</p>'
               : ''
         }
         <p style="color: #7f8c8d; font-size: 12px;">Esta e uma mensagem automatica. Nao responda este e-mail.</p>
      </div>
   `

   const text = [
      `Ola, ${usuario.nome}!`,
      '',
      'Seu evento foi criado com sucesso na plataforma Seciteci Eventos.',
      '',
      `Evento: ${evento.titulo}`,
      `Inicio: ${formatarData(evento.dataInicio)}`,
      `Fim: ${formatarData(evento.dataFim)}`,
      `${presencial ? 'Local' : 'Link'}: ${local}`,
      `Status: ${evento.status}`,
      ehRascunho ? 'O evento esta em rascunho e ainda nao esta visivel ao publico.' : '',
   ]
      .filter(Boolean)
      .join('\n')

   return { subject, html, text }
}

module.exports = { eventoCriadoTemplate }
```

- [ ] **Step 2: Verificar sintaxe e smoke test**

```bash
node --check services/emailTemplates/eventoCriado.js
node -e "
   const { eventoCriadoTemplate } = require('./services/emailTemplates/eventoCriado');
   const t = eventoCriadoTemplate({
      usuario: { nome: 'Maria' },
      evento: { titulo: 'Semana de TI', dataInicio: '2026-10-10T12:00:00Z', dataFim: '2026-10-12T22:00:00Z', tipoEvento: 'presencial', LocalNome: 'Centro de Convencoes', LocalCidade: 'Cuiaba', LocalEstado: 'MT', status: 'rascunho' },
   });
   console.log(t.subject);
   console.log(t.text);
"
```

Expected: `Evento criado: Semana de TI` e o texto puro com os dados; sem erro.

- [ ] **Step 3: Commit**

```bash
git add services/emailTemplates/eventoCriado.js
git commit -m "feat: template de e-mail de evento criado"
```

---

### Task 4: Hook em `createEvento` + `verifyMailer()` no boot

**Files:**
- Modify: `controllers/eventosController.js:1-4` (imports) e `:242` (após `cache.flushAll()` dentro de `createEvento`)
- Modify: `server.js` (require + chamada no callback do `app.listen`)

**Interfaces:**
- Consumes: `sendMailSafe` de `services/emailService` (Task 2); `eventoCriadoTemplate` de `services/emailTemplates/eventoCriado` (Task 3); `verifyMailer` de `config/mailer` (Task 1).
- Produces: nenhum novo export; efeito colateral observável é o envio do e-mail em background após `POST /api/eventos`.

- [ ] **Step 1: Adicionar imports no topo de `controllers/eventosController.js`**

Após `const prisma = require('../config/prisma')` (linha 4), adicionar:

```js
const { sendMailSafe } = require('../services/emailService')
const { eventoCriadoTemplate } = require('../services/emailTemplates/eventoCriado')
```

- [ ] **Step 2: Chamar o envio dentro de `createEvento`**

Localizar em `createEvento` o trecho:

```js
      cache.flushAll() // remove todo cache

      res.status(201).json({
         message: 'Evento criado com sucesso',
         evento,
      })
```

Substituir por:

```js
      cache.flushAll() // remove todo cache

      sendMailSafe(evento.organizador.email, eventoCriadoTemplate({ usuario: evento.organizador, evento }))

      res.status(201).json({
         message: 'Evento criado com sucesso',
         evento,
      })
```

Importante: SEM `await` — a resposta 201 não pode esperar o SMTP. `evento.organizador.email` já vem do `include` do `prisma.evento.create`.

- [ ] **Step 3: Chamar `verifyMailer()` no boot de `server.js`**

Após `const prisma = require('./config/prisma')`, adicionar:

```js
const { verifyMailer } = require('./config/mailer')
```

No callback de `app.listen(PORT, '0.0.0.0', async () => {`, logo na primeira linha do callback, adicionar:

```js
   verifyMailer()
```

(Non-fatal: `verifyMailer` nunca lança.)

- [ ] **Step 4: Verificar sintaxe e smoke test de integração**

```bash
node --check controllers/eventosController.js
node --check server.js
EMAIL_ENABLED=false node -e "
   const svc = require('./services/emailService');
   const { eventoCriadoTemplate } = require('./services/emailTemplates/eventoCriado');
   svc.sendMailSafe('org@test.com', eventoCriadoTemplate({ usuario: { nome: 'Ana' }, evento: { titulo: 'X', dataInicio: new Date(), dataFim: new Date(), tipoEvento: 'online', status: 'publicado' } }));
   setTimeout(() => console.log('ok: sem crash no fire-and-forget'), 300);
"
```

Expected: `ok: sem crash no fire-and-forget` (com EMAIL_ENABLED=false nada é enviado, mas o caminho inteiro roda).

- [ ] **Step 5: Commit**

```bash
git add controllers/eventosController.js server.js
git commit -m "feat: envia e-mail de confirmacao ao criar evento"
```

---

### Task 5: Config de deploy (compose, `.env.example`) + script `email:test`

**Files:**
- Modify: `docker-compose.yml` (bloco `environment` do serviço `app`)
- Modify: `package.json` (novo script)
- Create: `.env.example`
- Create: `scripts/sendTestEmail.js`

**Interfaces:**
- Consumes: `sendEmail` de `services/emailService` (Task 2); variáveis `EMAIL_*`/`SMTP_*` (Task 1).
- Produces: comando `npm run email:test -- <destinatario>` para validação manual; `.env.example` como documentação de configuração.

- [ ] **Step 1: Repassar variáveis de e-mail no `docker-compose.yml`**

No serviço `app`, após `JWT_SECRET: "dev-secret-local"`, adicionar:

```yaml
      EMAIL_ENABLED: "${EMAIL_ENABLED:-false}"
      EMAIL_FROM: "${EMAIL_FROM:-Seciteci Eventos <nao-responder@seciteci.local>}"
      SMTP_HOST: "${SMTP_HOST:-smtp.gmail.com}"
      SMTP_PORT: "${SMTP_PORT:-465}"
      SMTP_SECURE: "${SMTP_SECURE:-true}"
      SMTP_USER: "${SMTP_USER:-}"
      SMTP_PASS: "${SMTP_PASS:-}"
```

O Compose lê o `.env` do diretório para a substituição `${VAR}`. Default `false` evita envios acidentais em ambiente sem `.env`.

- [ ] **Step 2: Validar compose**

```bash
docker compose config --quiet
```

Expected: sem saída/erro (arquivo válido).

- [ ] **Step 3: Criar `.env.example`**

```bash
# Aplicacao
PORT=3030
NODE_ENV=development
JWT_SECRET=troque-por-um-segredo-forte

# Banco (usado quando rodando sem Docker; no Docker o compose define)
# DATABASE_URL=postgresql://usuario:senha@host:5432/sistema_eventos

# E-mail (Gmail pessoal - exige verificacao em 2 etapas + App Password de 16 digitos)
EMAIL_ENABLED=false
EMAIL_FROM=Seciteci Eventos <seu@gmail.com>
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=seu@gmail.com
SMTP_PASS=senha-de-app-de-16-digitos
```

- [ ] **Step 4: Criar `scripts/sendTestEmail.js`**

```js
require('dotenv').config()
const { sendEmail } = require('../services/emailService')

const destinatario = process.argv[2]

const main = async () => {
   if (!destinatario) {
      console.error('Uso: npm run email:test -- destinatario@email.com')
      process.exit(1)
   }

   console.log(`Enviando e-mail de teste para ${destinatario}...`)

   const messageId = await sendEmail({
      to: destinatario,
      subject: 'Teste do servico de e-mail - Seciteci Eventos',
      html: '<p>Se voce recebeu este e-mail, o servico de envio esta funcionando.</p>',
      text: 'Se voce recebeu este e-mail, o servico de envio esta funcionando.',
   })

   if (!messageId) {
      console.error('Envio desativado: defina EMAIL_ENABLED=true e preencha SMTP_USER/SMTP_PASS no .env')
      process.exit(1)
   }

   console.log(`E-mail enviado (messageId: ${messageId})`)
   process.exit(0)
}

main().catch((error) => {
   console.error('Falha no envio:', error.message)
   process.exit(1)
})
```

- [ ] **Step 5: Registrar script npm**

Em `package.json`, dentro de `"scripts"`, adicionar:

```json
"email:test": "node scripts/sendTestEmail.js"
```

- [ ] **Step 6: Verificar sintaxe e validação**

```bash
node --check scripts/sendTestEmail.js
npm run email:test
```

Expected: `npm run email:test` sem argumento imprime o uso e sai com código 1.

- [ ] **Step 7: Commit**

```bash
git add docker-compose.yml package.json .env.example scripts/sendTestEmail.js
git commit -m "feat: configuracao de e-mail no compose, .env.example e script email:test"
```

---

### Task 6: Verificação ponta a ponta (manual, requer interação do usuário)

**Files:**
- Modify: `.env` (preencher credenciais reais — NÃO comitar)

**Interfaces:**
- Consumes: tudo das Tasks 1–5.
- Produces: evidência de que o fluxo completo funciona (conta Google → envio → inbox).

- [ ] **Step 1: Usuário gera a App Password do Gmail**

O usuário precisa (não automatizável):
1. Ativar verificação em 2 etapas em https://myaccount.google.com/security
2. Gerar App Password em https://myaccount.google.com/apppasswords (16 dígitos)

- [ ] **Step 2: Preencher `.env` local**

Substituir no `.env` os placeholders:
- `EMAIL_ENABLED=true`
- `EMAIL_FROM=Seciteci Eventos <SEU_EMAIL@gmail.com>`
- `SMTP_USER=SEU_EMAIL@gmail.com`
- `SMTP_PASS=<senha-de-app-de-16-digitos>`

- [ ] **Step 3: Rebuild e subir o stack**

```bash
docker compose up --build -d
```

Expected: no log do app (`docker compose logs app --tail 30`), a linha `Servico de e-mail pronto (SEU_EMAIL@gmail.com)`.

- [ ] **Step 4: Testar envio direto pelo script**

```bash
docker compose exec app npm run email:test -- SEU_EMAIL@gmail.com
```

Expected: `E-mail enviado (messageId: ...)` e e-mail na caixa de entrada (verificar spam).

- [ ] **Step 5: Testar fluxo real de criação de evento**

1. Login via `POST /api/auth/login` (Swagger `/api-docs`) para obter token.
2. `POST /api/eventos` com `Authorization: Bearer <token>` e um payload mínimo válido.
3. Conferir resposta 201 e chegada do e-mail `Evento criado: <titulo>` no e-mail do organizador.
4. Confirmar que, com credenciais SMTP inválidas, a resposta continua 201 (apenas log `[email] Falha ao enviar...` aparece nos logs).

- [ ] **Step 6: Commit final (se houver ajustes)**

Nenhum arquivo de código esperado. Se algo foi ajustado durante a validação, commitar:

```bash
git add -A && git commit -m "fix: ajustes da validacao ponta a ponta do servico de e-mail"
```
