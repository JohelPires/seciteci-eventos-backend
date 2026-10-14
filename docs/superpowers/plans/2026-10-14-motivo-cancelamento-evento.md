# Motivo do Cancelamento de Evento Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir registrar um motivo (opcional, público, editável) ao cancelar um evento via `PUT /api/eventos/:id`, limpando-o ao reativar, e incluí-lo no e-mail de alteração de status.

**Architecture:** Adiciona-se uma coluna nullable `motivo_cancelamento` em `eventos` (Prisma). O `updateEvento` normaliza/valida o campo, limpa-o quando o status resultante não é `cancelado`, e passa o valor persistido ao template de e-mail existente. Sem endpoint dedicado, sem tabela de histórico, sem cascade para inscrições.

**Tech Stack:** Node.js + Express + Prisma + PostgreSQL (CommonJS), Jest + Supertest, node-cache.

## Global Constraints

- Rodar testes: `npx jest --runInBand` (equivalente a `npm test`), com o DB de teste de pé (`docker compose -f docker-compose.yml up -d db`). Somente no host, nunca contra o DB de dev.
- Sempre usar `-f docker-compose.yml` em comandos Docker locais (existe `compose.yml` de produção que o Compose descobriria primeiro).
- Testes usam `.env.test` (DB `sistema_eventos_test`); `NODE_ENV=test` desliga rate limit, cache e e-mail (`EMAIL_ENABLED=false`).
- Migrações são aplicadas automaticamente: no boot do container e no `globalSetup` do Jest (`npx prisma migrate deploy`). O arquivo `migration.sql` deve ser commitado.
- Mensagens de erro da API em português, seguindo o padrão existente (`{ error: '...' }`).
- Não adicionar dependências novas.
- `PUT /api/eventos/:id` não passa por `eventoValidator`; a validação do motivo é feita no controller.
- Não alterar o cascade/comportamento de inscrições nem notificar participantes (fora de escopo).
- Não rodar lint/typecheck (não existem no projeto).

---

### Task 1: Coluna `motivo_cancelamento` + API (`updateEvento`) + Swagger

**Files:**
- Modify: `prisma/schema.prisma:102` (model `Evento`, logo após `status`)
- Create: `prisma/migrations/20261014120000_adicionar_motivo_cancelamento_evento/migration.sql`
- Modify: `controllers/eventosController.js:289-368` (`updateEvento`)
- Modify: `docs/swagger.routes.js:534-539` (requestBody do `PUT /api/eventos/{id}`) e `:514` (description)
- Test: `tests/eventos.test.js` (novo bloco no `describe('PUT /api/eventos/:id')`, termina em `:179`)

**Interfaces:**
- Consumes: `prisma.evento.findUnique`/`update` (client existente), `updateEvento` existente, `cache.flushAll()`, `sendMailSafe`, `eventoStatusAlteradoTemplate({ usuario, evento, statusAnterior, statusNovo, motivoCancelamento })` (assinatura ampliada na Task 2).
- Produces: `req.body.motivoCancelamento` (string opcional, ≤ 1000 chars) persistido em `Evento.motivoCancelamento`; erros `400 { error: 'Motivo de cancelamento inválido' }` e `400 { error: 'Motivo de cancelamento deve ter no máximo 1000 caracteres' }`.

- [ ] **Step 1: Escrever os testes que falham**

Acrescentar dentro do `describe('PUT /api/eventos/:id', ...)` em `tests/eventos.test.js` (antes do `})` final que fecha o describe na linha 179):

```js
   test('cancelar com motivo persiste o motivo', async () => {
      const owner = await createUser()
      const evento = await createEvento(owner.id, { status: 'publicado' })

      const res = await request(app)
         .put(`/api/eventos/${evento.id}`)
         .set('Authorization', `Bearer ${tokenFor(owner)}`)
         .send({ status: 'cancelado', motivoCancelamento: 'Chuva forte' })

      expect(res.statusCode).toBe(200)
      expect(res.body.evento.status).toBe('cancelado')
      expect(res.body.evento.motivoCancelamento).toBe('Chuva forte')
      const noBanco = await prisma.evento.findUnique({ where: { id: evento.id } })
      expect(noBanco.motivoCancelamento).toBe('Chuva forte')

      const detalhe = await request(app).get(`/api/eventos/${evento.id}`)
      expect(detalhe.body.evento.motivoCancelamento).toBe('Chuva forte')
   })

   test('cancelar sem motivo mantem null', async () => {
      const owner = await createUser()
      const evento = await createEvento(owner.id, { status: 'publicado' })

      const res = await request(app)
         .put(`/api/eventos/${evento.id}`)
         .set('Authorization', `Bearer ${tokenFor(owner)}`)
         .send({ status: 'cancelado' })

      expect(res.statusCode).toBe(200)
      expect(res.body.evento.motivoCancelamento).toBeNull()
   })

   test('motivo vazio normaliza para null', async () => {
      const owner = await createUser()
      const evento = await createEvento(owner.id, { status: 'publicado' })

      const res = await request(app)
         .put(`/api/eventos/${evento.id}`)
         .set('Authorization', `Bearer ${tokenFor(owner)}`)
         .send({ status: 'cancelado', motivoCancelamento: '   ' })

      expect(res.statusCode).toBe(200)
      expect(res.body.evento.motivoCancelamento).toBeNull()
   })

   test('reativar evento limpa o motivo', async () => {
      const owner = await createUser()
      const evento = await createEvento(owner.id)
      await prisma.evento.update({
         where: { id: evento.id },
         data: { status: 'cancelado', motivoCancelamento: 'Motivo antigo' },
      })

      const res = await request(app)
         .put(`/api/eventos/${evento.id}`)
         .set('Authorization', `Bearer ${tokenFor(owner)}`)
         .send({ status: 'rascunho' })

      expect(res.statusCode).toBe(200)
      expect(res.body.evento.status).toBe('rascunho')
      expect(res.body.evento.motivoCancelamento).toBeNull()
   })

   test('motivo com mais de 1000 caracteres -> 400', async () => {
      const owner = await createUser()
      const evento = await createEvento(owner.id, { status: 'publicado' })

      const res = await request(app)
         .put(`/api/eventos/${evento.id}`)
         .set('Authorization', `Bearer ${tokenFor(owner)}`)
         .send({ status: 'cancelado', motivoCancelamento: 'a'.repeat(1001) })

      expect(res.statusCode).toBe(400)
      expect(res.body.error).toBe('Motivo de cancelamento deve ter no máximo 1000 caracteres')
   })

   test('editar motivo de evento cancelado -> 200', async () => {
      const owner = await createUser()
      const evento = await createEvento(owner.id)
      await prisma.evento.update({
         where: { id: evento.id },
         data: { status: 'cancelado', motivoCancelamento: 'Motivo antigo' },
      })

      const res = await request(app)
         .put(`/api/eventos/${evento.id}`)
         .set('Authorization', `Bearer ${tokenFor(owner)}`)
         .send({ motivoCancelamento: 'Motivo novo' })

      expect(res.statusCode).toBe(200)
      expect(res.body.evento.motivoCancelamento).toBe('Motivo novo')
   })
```

- [ ] **Step 2: Garantir o DB de teste de pé**

Run: `docker compose -f docker-compose.yml up -d db`
Expected: container `db` (postgres) rodando na porta 5433.

- [ ] **Step 3: Rodar os testes para ver falhar**

Run: `npx jest tests/eventos.test.js --runInBand`
Expected: FAIL — `motivoCancelamento` vem `undefined` (coluna inexistente / campo não persistido), e o teste de 1000 chars não retorna 400. Pode haver erro do Prisma por coluna desconhecida até a Task 1 Steps 4-6. Se `prisma migrate deploy` no globalSetup falhar por causa da coluna ainda não existente, ignore — resolvido nos próximos passos.

- [ ] **Step 4: Adicionar o campo no schema**

Em `prisma/schema.prisma`, no model `Evento`, logo após a linha de `status` (linha 102):

```prisma
  motivoCancelamento   String?   @map("motivo_cancelamento") @db.Text
```

- [ ] **Step 5: Criar a migração**

Criar o arquivo `prisma/migrations/20261014120000_adicionar_motivo_cancelamento_evento/migration.sql` com:

```sql
-- AlterTable
ALTER TABLE "eventos" ADD COLUMN "motivo_cancelamento" TEXT;
```

- [ ] **Step 6: Gerar o Prisma Client**

Os testes rodam no host (`npx jest`), usando o Prisma Client gerado no host, então regenerar aqui:

Run: `npx prisma generate`
Expected: "Generated Prisma Client".

(Se quiser testar via API no container Docker, rode `docker compose -f docker-compose.yml up --build -d` — o client é gerado na imagem.)

- [ ] **Step 7: Implementar no controller**

Em `controllers/eventosController.js`, dentro de `updateEvento`, logo após o bloco que remove campos protegidos (`delete dadosAtualizacao.dataCriacao`, linha 294), inserir a normalização/validação do motivo:

```js
      // Normalizar e validar o motivo de cancelamento
      if (
         dadosAtualizacao.motivoCancelamento !== undefined &&
         dadosAtualizacao.motivoCancelamento !== null
      ) {
         if (typeof dadosAtualizacao.motivoCancelamento !== 'string') {
            return res.status(400).json({ error: 'Motivo de cancelamento inválido' })
         }
         dadosAtualizacao.motivoCancelamento = dadosAtualizacao.motivoCancelamento.trim()
         if (dadosAtualizacao.motivoCancelamento.length > 1000) {
            return res
               .status(400)
               .json({ error: 'Motivo de cancelamento deve ter no máximo 1000 caracteres' })
         }
         if (dadosAtualizacao.motivoCancelamento === '') {
            dadosAtualizacao.motivoCancelamento = null
         }
      }

      // Limpar o motivo sempre que o status resultante não for "cancelado"
      const statusEfetivo =
         dadosAtualizacao.status !== undefined ? dadosAtualizacao.status : evento.status
      if (statusEfetivo !== 'cancelado') {
         dadosAtualizacao.motivoCancelamento = null
      }
```

E no envio de e-mail existente (linhas 358-368), acrescentar o motivo persistido:

```js
      if (dadosAtualizacao.status && dadosAtualizacao.status !== evento.status) {
         sendMailSafe(
            eventoAtualizado.organizador.email,
            eventoStatusAlteradoTemplate({
               usuario: eventoAtualizado.organizador,
               evento: eventoAtualizado,
               statusAnterior: evento.status,
               statusNovo: dadosAtualizacao.status,
               motivoCancelamento: eventoAtualizado.motivoCancelamento,
            })
         )
      }
```

- [ ] **Step 8: Rodar os testes para ver passar**

Run: `npx jest tests/eventos.test.js --runInBand`
Expected: PASS (todos os testes de eventos, incluindo os 6 novos).

- [ ] **Step 9: Atualizar o Swagger**

Em `docs/swagger.routes.js`, no requestBody do `PUT /api/eventos/{id}` (após a propriedade `status`, linhas 534-536), adicionar:

```js
 *               motivoCancelamento:
 *                 type: string
 *                 maxLength: 1000
 *                 description: Motivo do cancelamento. Opcional; exibido quando o status do evento é "cancelado" e limpo automaticamente ao reativar.
```

E atualizar a `description` do endpoint (linha 514) para mencionar o campo:

```js
 *     description: Atualiza informações de um evento (dono do evento ou admin). Apenas administradores podem mudar o status para publicado; os demais ficam restritos a rascunho/cancelado/encerrado. Aceita "motivoCancelamento" (opcional, máx. 1000 caracteres), limpo automaticamente quando o evento deixa de estar cancelado.
```

- [ ] **Step 10: Verificar sintaxe e commit**

Run: `node --check controllers/eventosController.js && node --check docs/swagger.routes.js`
Expected: sem saída (sucesso).

```bash
git add prisma/schema.prisma prisma/migrations controllers/eventosController.js docs/swagger.routes.js tests/eventos.test.js
git commit -m "feat(eventos): motivo do cancelamento no update de evento"
```

---

### Task 2: Motivo no e-mail de alteração de status

**Files:**
- Modify: `services/emailTemplates/eventoStatusAlterado.js:3-42`
- Test: `tests/emailTemplates.test.js` (criar)

**Interfaces:**
- Consumes: `helpers.js` (`formatarData`, `rotuloStatus`) já importados.
- Produces: `eventoStatusAlteradoTemplate({ usuario, evento, statusAnterior, statusNovo, motivoCancelamento })` → `{ subject, html, text }`; inclui o motivo apenas quando `statusNovo === 'cancelado'` e `motivoCancelamento` não vazio. Retrocompatível: chamada sem `motivoCancelamento` mantém a saída atual.

- [ ] **Step 1: Escrever o teste que falha**

Criar `tests/emailTemplates.test.js`:

```js
const { eventoStatusAlteradoTemplate } = require('../services/emailTemplates/eventoStatusAlterado')

const base = {
   usuario: { nome: 'Ana' },
   evento: {
      titulo: 'Evento X',
      dataInicio: new Date('2026-01-01T10:00:00Z'),
      dataFim: new Date('2026-01-01T12:00:00Z'),
      tipoEvento: 'online',
      linkOnline: 'https://exemplo.test',
      status: 'cancelado',
   },
   statusAnterior: 'publicado',
   statusNovo: 'cancelado',
}

describe('eventoStatusAlteradoTemplate', () => {
   test('inclui o motivo quando o novo status e cancelado', () => {
      const t = eventoStatusAlteradoTemplate({ ...base, motivoCancelamento: 'Chuva forte' })
      expect(t.html).toContain('Motivo do cancelamento')
      expect(t.html).toContain('Chuva forte')
      expect(t.text).toContain('Motivo do cancelamento: Chuva forte')
   })

   test('nao inclui o motivo quando o novo status nao e cancelado', () => {
      const t = eventoStatusAlteradoTemplate({
         ...base,
         statusNovo: 'publicado',
         motivoCancelamento: 'Chuva forte',
      })
      expect(t.html).not.toContain('Motivo do cancelamento')
      expect(t.text).not.toContain('Motivo do cancelamento')
   })

   test('nao inclui o bloco quando nao ha motivo', () => {
      const t = eventoStatusAlteradoTemplate({ ...base })
      expect(t.html).not.toContain('Motivo do cancelamento')
      expect(t.text).not.toContain('Motivo do cancelamento')
   })
})
```

- [ ] **Step 2: Rodar o teste para ver falhar**

Run: `npx jest tests/emailTemplates.test.js --runInBand`
Expected: FAIL no primeiro teste (`html`/`text` não contêm "Motivo do cancelamento").

- [ ] **Step 3: Implementar no template**

Em `services/emailTemplates/eventoStatusAlterado.js`, ampliar a assinatura e adicionar o bloco condicional. Substituir a linha 3 por:

```js
const eventoStatusAlteradoTemplate = ({
   usuario,
   evento,
   statusAnterior,
   statusNovo,
   motivoCancelamento,
}) => {
```

Logo após `const rotuloNovo = rotuloStatus(statusNovo)` (linha 13), adicionar:

```js
   const motivo =
      statusNovo === 'cancelado' && motivoCancelamento && motivoCancelamento.trim()
         ? motivoCancelamento.trim()
         : null
```

No `html`, logo após a linha `<li><strong>Status atual:</strong> ${rotuloNovo}</li>` (linha 23), adicionar:

```js
            ${motivo ? `<li><strong>Motivo do cancelamento:</strong> ${motivo}</li>` : ''}
```

No `text`, substituir o array final para incluir o motivo condicionalmente. Trocar as linhas 29-39 por:

```js
   const linhas = [
      `Ola, ${usuario.nome}!`,
      '',
      `O status do evento "${evento.titulo}" foi alterado de ${rotuloAnterior} para ${rotuloNovo}.`,
      '',
      `Evento: ${evento.titulo}`,
      `Inicio: ${formatarData(evento.dataInicio)}`,
      `Fim: ${formatarData(evento.dataFim)}`,
      `${presencial ? 'Local' : 'Link'}: ${local}`,
      `Status atual: ${rotuloNovo}`,
   ]
   if (motivo) {
      linhas.push(`Motivo do cancelamento: ${motivo}`)
   }
   const text = linhas.join('\n')
```

- [ ] **Step 4: Rodar o teste para ver passar**

Run: `npx jest tests/emailTemplates.test.js --runInBand`
Expected: PASS (3 testes).

- [ ] **Step 5: Rodar a suíte completa**

Run: `npx jest --runInBand`
Expected: PASS em todas as suítes (as existentes + os novos casos).

- [ ] **Step 6: Verificar sintaxe e commit**

Run: `node --check services/emailTemplates/eventoStatusAlterado.js`
Expected: sem saída (sucesso).

```bash
git add services/emailTemplates/eventoStatusAlterado.js tests/emailTemplates.test.js
git commit -m "feat(email): inclui motivo do cancelamento no e-mail de status"
```
