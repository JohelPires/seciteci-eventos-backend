# E-mail de mudança de status do evento — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enviar e-mail ao organizador dono do evento sempre que o status de um evento mudar via `PUT /api/eventos/:id` (ex.: rascunho → publicado/cancelado), reaproveitando o serviço de e-mail existente.

**Architecture:** Mesmo padrão do e-mail de criação: hook fire-and-forget no controller (`updateEvento`) + template puro novo; `formatarData`/`TIMEZONE`/rótulos de status extraídos para `services/emailTemplates/helpers.js` e reusados pelos dois templates.

**Tech Stack:** Node.js (CommonJS), Nodemailer existente (`^10.0.15`), sem novas dependências.

**Spec:** `docs/superpowers/specs/2026-10-06-email-status-evento-design.md`

## Global Constraints

- Código CommonJS (`require`/`module.exports`), sem TypeScript, sem emojis em código.
- Nenhum teste automatizado no projeto: verificação = `node --check` + smoke `node -e` + E2E manual.
- Envio assíncrono, NÃO-bloqueante (SEM `await`), apenas log em falha; `EMAIL_ENABLED=false` = nada enviado.
- API não muda: mesmos status codes e corpo de resposta do `PUT /api/eventos/:id`; Swagger sem alteração.
- Nenhuma variável de ambiente, dependência ou mudança no compose.
- Destinatário: organizador do evento (`evento.organizador.email` disponível no `include` do `prisma.evento.update`).
- Disparo somente quando o corpo do `PUT` traz `status` E ele difere do anterior armazenado.

---

### Task 1: Helpers compartilhados + refactor do template de criação

**Files:**
- Create: `services/emailTemplates/helpers.js`
- Modify: `services/emailTemplates/eventoCriado.js`

**Interfaces:**
- Consumes: nada.
- Produces: `require('./helpers')` exporta:
  - `TIMEZONE`: string (`'America/Cuiaba'`)
  - `formatarData(data): string` — data → `pt-BR short/short` no TIMEZONE; falsy → `'Nao informado'`
  - `rotuloStatus(status): string` — `rascunho→Rascunho`, `publicado→Publicado`, `cancelado→Cancelado`, `encerrado→Encerrado`; desconhecido → valor cru.
- Comportamento observável de `eventoCriadoTemplate` permanece identico (regressão: smoke test do template atual).

- [ ] **Step 1: Criar `services/emailTemplates/helpers.js`**

```js
const TIMEZONE = 'America/Cuiaba'

const formatarData = (data) =>
   data
      ? new Date(data).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: TIMEZONE })
      : 'Nao informado'

const ROTULOS_STATUS = {
   rascunho: 'Rascunho',
   publicado: 'Publicado',
   cancelado: 'Cancelado',
   encerrado: 'Encerrado',
}

const rotuloStatus = (status) => ROTULOS_STATUS[status] || status

module.exports = { TIMEZONE, formatarData, rotuloStatus }
```

- [ ] **Step 2: Refatorar `services/emailTemplates/eventoCriado.js`**

Substituir as linhas 1-6 (constantes locais) por uma import do helper — o resto do arquivo fica intacto:

```js
const { formatarData } = require('./helpers')
```

(Esta é a ÚNICA alteração: remover `TIMEZONE` e `formatarData` locais, importar do helper. `module.exports` e o corpo da função não mudam.)

- [ ] **Step 3: Verificar sintaxe e smoke de regressão**

```bash
node --check services/emailTemplates/helpers.js
node --check services/emailTemplates/eventoCriado.js
node -e "
   const h = require('./services/emailTemplates/helpers');
   console.log(h.rotuloStatus('publicado'), h.rotuloStatus('cancelado'), h.rotuloStatus('estranho'), h.formatarData(null));
   const { eventoCriadoTemplate } = require('./services/emailTemplates/eventoCriado');
   const t = eventoCriadoTemplate({ usuario: { nome: 'Maria' }, evento: { titulo: 'Semana de TI', dataInicio: '2026-10-10T12:00:00Z', dataFim: '2026-10-12T22:00:00Z', tipoEvento: 'presencial', LocalNome: 'Centro', LocalCidade: 'Cuiaba', LocalEstado: 'MT', status: 'rascunho' } });
   console.log(t.subject);
   console.log(t.text);
"
```

Expected: `Publicado Cancelado estranho Nao informado`; subject e text idênticos ao comportamento anterior (datas renderizadas em America/Cuiaba, como hoje).

- [ ] **Step 4: Commit**

```bash
git add services/emailTemplates/helpers.js services/emailTemplates/eventoCriado.js
git commit -m "refactor: extrai helpers de data/status para email templates"
```

---

### Task 2: Template `services/emailTemplates/eventoStatusAlterado.js`

**Files:**
- Create: `services/emailTemplates/eventoStatusAlterado.js`

**Interfaces:**
- Consumes: `formatarData` e `rotuloStatus` de `./helpers` (Task 1).
- Produces: `eventoStatusAlteradoTemplate({ usuario, evento, statusAnterior, statusNovo })` → `{ subject, html, text }`, onde `usuario` = `{ nome, ... }` e `evento` = linha do Prisma (`titulo`, `dataInicio`, `dataFim`, `tipoEvento`, `linkOnline`, `LocalNome`, `LocalCidade`, `LocalEstado`, `status`).

- [ ] **Step 1: Criar o template**

```js
const { formatarData, rotuloStatus } = require('./helpers')

const eventoStatusAlteradoTemplate = ({ usuario, evento, statusAnterior, statusNovo }) => {
   const presencial = evento.tipoEvento === 'presencial'
   const local = presencial
      ? `${evento.LocalNome || 'A definir'}${
           evento.LocalCidade ? ` - ${evento.LocalCidade}/${evento.LocalEstado || ''}` : ''
        }`
      : evento.linkOnline || 'A definir'

   const subject = `Status do evento atualizado: ${evento.titulo}`
   const rotuloAnterior = rotuloStatus(statusAnterior)
   const rotuloNovo = rotuloStatus(statusNovo)

   const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
         <h2 style="color: #2c3e50;">Ola, ${usuario.nome}!</h2>
         <p>O status do evento <strong>${evento.titulo}</strong> foi alterado de <strong>${rotuloAnterior}</strong> para <strong>${rotuloNovo}</strong>.</p>
         <ul>
            <li><strong>Início:</strong> ${formatarData(evento.dataInicio)}</li>
            <li><strong>Fim:</strong> ${formatarData(evento.dataFim)}</li>
            <li><strong>${presencial ? 'Local' : 'Link'}:</strong> ${local}</li>
            <li><strong>Status atual:</strong> ${rotuloNovo}</li>
         </ul>
         <p style="color: #7f8c8d; font-size: 12px;">Esta e uma mensagem automatica. Nao responda este e-mail.</p>
      </div>
   `

   const text = [
      `Ola, ${usuario.nome}!`,
      '',
      `O status do evento "${evento.titulo}" foi alterado de ${rotuloAnterior} para ${rotuloNovo}.`,
      '',
      `Evento: ${evento.titulo}`,
      `Inicio: ${formatarData(evento.dataInicio)}`,
      `Fim: ${formatarData(evento.dataFim)}`,
      `${presencial ? 'Local' : 'Link'}: ${local}`,
      `Status atual: ${rotuloNovo}`,
   ].join('\n')

   return { subject, html, text }
}

module.exports = { eventoStatusAlteradoTemplate }
```

- [ ] **Step 2: Verificar sintaxe e smoke test**

```bash
node --check services/emailTemplates/eventoStatusAlterado.js
node -e "
   const { eventoStatusAlteradoTemplate } = require('./services/emailTemplates/eventoStatusAlterado');
   const t = eventoStatusAlteradoTemplate({
      usuario: { nome: 'Maria' },
      evento: { titulo: 'Semana de TI', dataInicio: '2026-10-10T12:00:00Z', dataFim: '2026-10-12T22:00:00Z', tipoEvento: 'presencial', LocalNome: 'Centro', LocalCidade: 'Cuiaba', LocalEstado: 'MT', status: 'publicado' },
      statusAnterior: 'rascunho',
      statusNovo: 'publicado',
   });
   console.log(t.subject);
   console.log(t.text);
"
```

Expected: `Status do evento atualizado: Semana de TI`; no text, `...alterado de Rascunho para Publicado.` e datas em America/Cuiaba.

- [ ] **Step 3: Commit**

```bash
git add services/emailTemplates/eventoStatusAlterado.js
git commit -m "feat: template de e-mail de mudanca de status do evento"
```

---

### Task 3: Hook no `updateEvento`

**Files:**
- Modify: `controllers/eventosController.js` — imports no topo e hook dentro de `updateEvento` (após `cache.flushAll()` daquele bloco, antes do `res.json` do update)

**Interfaces:**
- Consumes: `sendMailSafe` de `../services/emailService` (JÁ importado na Task 4 do plano anterior); `eventoStatusAlteradoTemplate` de `../services/emailTemplates/eventoStatusAlterado` (Task 2 deste plano).
- Produces: nenhum novo export; efeito colateral = e-mail de mudança de status em background após `PUT /api/eventos/:id` quando o status muda de fato.

- [ ] **Step 1: Adicionar import**

No topo de `controllers/eventosController.js`, junto aos imports existentes de e-mail (após a linha do `eventoCriadoTemplate`):

```js
const { eventoStatusAlteradoTemplate } = require('../services/emailTemplates/eventoStatusAlterado')
```

- [ ] **Step 2: Disparar o envio em `updateEvento`**

Localizar no fim do `updateEvento` (o segundo `cache.flushAll()` do arquivo, ~linha 327, dentro do try do update):

```js
      cache.flushAll() // remove todo cache

      res.json({
         message: 'Evento atualizado com sucesso',
         evento: eventoAtualizado,
      })
```

Substituir por:

```js
      cache.flushAll() // remove todo cache

      if (dadosAtualizacao.status && dadosAtualizacao.status !== evento.status) {
         sendMailSafe(
            eventoAtualizado.organizador.email,
            eventoStatusAlteradoTemplate({
               usuario: eventoAtualizado.organizador,
               evento: eventoAtualizado,
               statusAnterior: evento.status,
               statusNovo: dadosAtualizacao.status,
            })
         )
      }

      res.json({
         message: 'Evento atualizado com sucesso',
         evento: eventoAtualizado,
      })
```

Regras críticas:
- SEM `await` (fire-and-forget; a resposta nunca espera o SMTP).
- `evento.status` é o valor ANTERIOR (evento buscado no início de `updateEvento`); `eventoAtualizado` vem do `prisma.evento.update`, cujo `include` já traz `organizador { id, nome, email }` — não adicionar query.
- O PRIMEIRO `cache.flushAll()` (do `createEvento`) NÃO é tocado.

- [ ] **Step 3: Verificar sintaxe e smoke de integração**

```bash
node --check controllers/eventosController.js
EMAIL_ENABLED=false node -e "
   require('./controllers/eventosController');
   const svc = require('./services/emailService');
   const { eventoStatusAlteradoTemplate } = require('./services/emailTemplates/eventoStatusAlterado');
   svc.sendMailSafe('org@test.com', eventoStatusAlteradoTemplate({ usuario: { nome: 'Ana' }, evento: { titulo: 'X', dataInicio: new Date(), dataFim: new Date(), tipoEvento: 'online', status: 'cancelado' }, statusAnterior: 'publicado', statusNovo: 'cancelado' }));
   setTimeout(() => console.log('ok: sem crash'), 300);
"
```

Expected: carregamento do controller sem erro e `ok: sem crash`.

- [ ] **Step 4: Commit**

```bash
git add controllers/eventosController.js
git commit -m "feat: envia e-mail ao organizador quando status do evento muda"
```

---

### Task 4: Verificação ponta a ponta (manual, com usuário)

**Files:**
- Nenhum (apenas validação).

**Interfaces:**
- Consumes: Tasks 1-3; serviço de e-mail ativo (`EMAIL_ENABLED=true` com credenciais reais) do deploy anterior.

- [ ] **Step 1: Confirmar serviço ativo**

```bash
docker compose logs app --tail 50 2>&1 | grep "Servico de e-mail"
```

Expected: `Servico de e-mail pronto (johelpires@gmail.com)` (sem mudança de env, o container nem precisa recriar — nodemon recarrega o código; se o container estiver parado, `docker compose up -d`).

- [ ] **Step 2: E2E real (Swagger ou curl)**

1. `POST /api/auth/login` para obter token.
2. `PUT /api/eventos/<id>` com `Authorization: Bearer <token>` e body contendo `status` diferente do atual (ex.: `publicado`) → resposta 200 igual a antes; e-mail `Status do evento atualizado: <titulo>` chega na caixa do organizador.
3. Repetir o mesmo `PUT` com o MESMO status → NENHUM e-mail novo.
4. `PUT` sem `status` no body (ex.: só `titulo`) → NENHUM e-mail.

- [ ] **Step 3: Registro do resultado**

Anotar no relatório da task (`.superpowers/sdd/2026-10-06-email-status-evento/task-*-report.md`) o resultado dos quatro cenários acima.
