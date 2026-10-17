# Financiador como tabela (1:N) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mover o financiador de evento de duas colunas planas (`financiador_tipo`/`financiador_nome` em `eventos`) para a tabela `financiadores` (1 evento → N financiadores), com array embutido `financiadores: [{ nome, tipo? }]` no POST/PUT e em todas as leituras.

**Architecture:** Nova tabela `financiadores` com FK `evento_id` (`ON DELETE CASCADE`). O POST cria os financiadores junto do evento (nested create atômico) e o PUT faz **substituição total** (nested `deleteMany: {}` + `create`) quando a chave vier no body; ausente/falsy mantém o estado. Validação por express-validator no POST e no PUT, sanitização em `services/eventoPayload.js`. E-mails passam a listar **apenas os nomes** dos financiadores.

**Tech Stack:** Node.js/Express (CommonJS), Prisma 5.7 + PostgreSQL 16, express-validator 7, Jest + supertest.

**Spec:** `docs/superpowers/specs/2026-10-16-financiador-tabela-design.md`

## Global Constraints

- Comandos docker SEMPRE com `-f docker-compose.yml` (o repo tem `compose.yml` de produção; sem `-f` o Compose mira produção e falha com `${IMAGEM}`/`${APP_HOST}` faltando).
- Dev DB (host): `postgresql://postgres:postgres@localhost:5433/sistema_eventos?schema=public` (Postgres na porta 5433; db/user/pass `sistema_eventos`/`postgres`/`postgres`). O `.env` do repo NÃO tem `DATABASE_URL` — passe inline nos comandos `prisma` rodados do host.
- Testes: `npx jest --runInBand` com `docker compose -f docker-compose.yml up -d db` ativo. `.env.test` aponta para o DB `sistema_eventos_test` (nunca o dev). `tests/globalSetup.js` roda `prisma migrate deploy` no DB de teste antes das suítes. `NODE_ENV=test` desativa rate limit e cache — nunca depender de cache nos testes.
- Sem novas dependências npm → o volume `node_modules` do Docker NÃO precisa ser recriado.
- Regras do financiador: `nome` obrigatório (string, trim, não vazio, ≤150); `tipo` opcional, quando enviado não-vazio precisa estar em `publico|privado|hibrido`; máximo de 20 itens por evento.
- PUT: `financiadores` presente (array) → substituição total; ausente/falsy → mantém; `[]` → limpa todos.
- E-mails: só os NOMES (ignora `tipo`), separador `", "`, rótulo `Financiador` (1) / `Financiadores` (vários).
- Swagger é hand-written em `docs/swagger.routes.js` — atualizar manualmente quando endpoints mudam.
- Sem lint/typecheck no repo: verificar sintaxe de todo arquivo tocado com `node --check <arquivo>`.
- TDD: escrever o teste, ver falhar, implementar o mínimo, ver passar, commitar.
- Commits no estilo do repo: prefixo `feat:`/`docs:`/`fix:`, primeira linha minúscula.
- Indentação: 2 espaços em `middleware/validators.js` e `tests/*`; 3 espaços em `services/eventoPayload.js`, `services/emailTemplates/*`, `controllers/eventosController.js` e `prisma/seed.js` (seguir o arquivo, não inventar).

---

### Task 1: Schema Prisma + migração com backfill

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_financiador_como_tabela/migration.sql`

**Interfaces:**
- Consumes: nada (primeira tarefa).
- Produces: model `Financiador` acessível como `prisma.financiador` (`id`, `eventoId`, `tipo: string|null`, `nome: string`); relação `Evento.financiadores` (FK cascade). Todas as tarefas seguintes dependem do client regenerado desta tarefa.

- [ ] **Step 1: Subir o banco de dev (se não estiver rodando)**

```bash
docker compose -f docker-compose.yml up -d db
```

- [ ] **Step 2: Editar `prisma/schema.prisma`**

No model `Evento`, remover as duas linhas (bloco atual, linhas ~106-107):

```prisma
   financiadorTipo      String?   @map("financiador_tipo") @db.VarChar(20)
   financiadorNome      String?   @map("financiador_nome") @db.VarChar(150)
```

No bloco de relações do `Evento` (após `notificacoes Notificacao[]`), adicionar:

```prisma
   financiadores Financiador[]
```

No fim do arquivo, adicionar o novo model:

```prisma
model Financiador {
   id       Int     @id @default(autoincrement())
   eventoId Int     @map("evento_id")
   tipo     String? @db.VarChar(20)
   nome     String  @db.VarChar(150)

   evento Evento @relation(fields: [eventoId], references: [id], onDelete: Cascade)

   @@map("financiadores")
}
```

- [ ] **Step 3: Criar a migração sem aplicar**

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/sistema_eventos?schema=public" npx prisma migrate dev --create-only --name financiador_como_tabela
```

Esperado: cria `prisma/migrations/<timestamp>_financiador_como_tabela/migration.sql` e regenera o client (ainda não aplica a migração).

- [ ] **Step 4: Inserir o backfill no `migration.sql` gerado**

Substituir TODO o conteúdo do arquivo gerado por (o INSERT precisa ficar ENTRE a criação da FK e o DROP das colunas):

```sql
-- CreateTable
CREATE TABLE "financiadores" (
    "id" SERIAL NOT NULL,
    "evento_id" INTEGER NOT NULL,
    "tipo" VARCHAR(20),
    "nome" VARCHAR(150) NOT NULL,

    CONSTRAINT "financiadores_pkey" PRIMARY KEY ("id")
);

-- CreateForeignKey
ALTER TABLE "financiadores" ADD CONSTRAINT "financiadores_evento_id_fkey" FOREIGN KEY ("evento_id") REFERENCES "eventos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: uma linha em "financiadores" para cada evento que tinha os campos
-- planos. "nome" é NOT NULL: fallback para o tipo e, por fim, 'Nao informado'.
INSERT INTO "financiadores" ("evento_id", "tipo", "nome")
SELECT
   id,
   financiador_tipo,
   COALESCE(
      NULLIF(BTRIM(financiador_nome), ''),
      NULLIF(BTRIM(financiador_tipo), ''),
      'Nao informado'
   )
FROM "eventos"
WHERE financiador_nome IS NOT NULL OR financiador_tipo IS NOT NULL;

-- DropColumns
ALTER TABLE "eventos" DROP COLUMN "financiador_tipo",
DROP COLUMN "financiador_nome";
```

- [ ] **Step 5: Capturar a contagem esperada do backfill (antes de aplicar)**

```bash
docker compose -f docker-compose.yml exec db psql -U postgres -d sistema_eventos -tAc "SELECT count(*) FROM eventos WHERE financiador_nome IS NOT NULL OR financiador_tipo IS NOT NULL;"
```

Guardar o número impresso (DB vazio/seeder não rodado → `0`; o par passa a ser 0 = 0, o que também é válido).

- [ ] **Step 6: Aplicar a migração e regenerar o client**

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/sistema_eventos?schema=public" npx prisma migrate dev
```

Esperado: `1 migration found/following` aplicada + `Generated Prisma Client`. Se houver erro de drift, conferir se o Step 4 substituiu o arquivo inteiro (o SQL final precisa casar exatamente com o schema).

- [ ] **Step 7: Verificar o backfill e o drop das colunas**

```bash
docker compose -f docker-compose.yml exec db psql -U postgres -d sistema_eventos -tAc "SELECT count(*) FROM financiadores;"
docker compose -f docker-compose.yml exec db psql -U postgres -d sistema_eventos -tAc "SELECT column_name FROM information_schema.columns WHERE table_name='eventos' AND column_name LIKE 'financiador%';"
```

Esperado: primeiro comando imprime o MESMO número capturado no Step 5; segundo imprime zero linhas.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(schema): financiador como tabela 1:N (migracao com backfill)"
```

---

### Task 2: POST /api/eventos aceita `financiadores` (validação + criação)

**Files:**
- Test: `tests/eventos.test.js`
- Modify: `middleware/validators.js`
- Modify: `services/eventoPayload.js`
- Modify: `controllers/eventosController.js`

**Interfaces:**
- Consumes: `prisma.financiador` e relação `Evento.financiadores` (Task 1).
- Produces:
  - `sanitizeFinanciadores(body)` em `services/eventoPayload.js` → `undefined` (chave ausente/falsy) **ou** `Array<{ tipo: string|null, nome: string }>` já trimado. Usada pelo POST (Task 2, `?? []`) e pelo PUT (Task 3, `!== undefined`).
  - `financiadoresValidator` (constante interna de `middleware/validators.js`), espalhada (`...financiadoresValidator`) em `eventoValidator` e `eventoUpdateValidator`.
  - POST cria com `financiadores: { create: [...] }` e devolve o array ordenado por `id` (este formato de include é reutilizado nas Tasks 3 e 4).

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao FIM de `tests/eventos.test.js` (indentação 2 espaços, imports `request`, `app`, `prisma`, `createUser`, `tokenFor`, `eventoPayload` já existem no topo do arquivo):

```js
describe('financiadores', () => {
  test('POST cria evento com financiadores e devolve o array', async () => {
    const user = await createUser()
    const res = await request(app)
      .post('/api/eventos')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send(
        eventoPayload({
          financiadores: [
            { tipo: 'publico', nome: 'MEC' },
            { nome: 'FIEMT' },
          ],
        })
      )

    expect(res.statusCode).toBe(201)
    expect(res.body.evento.financiadores).toHaveLength(2)
    expect(res.body.evento.financiadores[0]).toMatchObject({ tipo: 'publico', nome: 'MEC' })
    expect(res.body.evento.financiadores[1].tipo).toBeNull()
    expect(await prisma.financiador.count({ where: { eventoId: res.body.evento.id } })).toBe(2)
  })

  test('POST sem financiadores cria evento com lista vazia', async () => {
    const user = await createUser()
    const res = await request(app)
      .post('/api/eventos')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send(eventoPayload())

    expect(res.statusCode).toBe(201)
    expect(res.body.evento.financiadores).toEqual([])
  })

  test('POST com financiador sem nome -> 400', async () => {
    const user = await createUser()
    const res = await request(app)
      .post('/api/eventos')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send(eventoPayload({ financiadores: [{ tipo: 'publico' }] }))

    expect(res.statusCode).toBe(400)
    expect(Array.isArray(res.body.errors)).toBe(true)
  })

  test('POST com tipo de financiador invalido -> 400', async () => {
    const user = await createUser()
    const res = await request(app)
      .post('/api/eventos')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send(eventoPayload({ financiadores: [{ nome: 'MEC', tipo: 'estatal' }] }))

    expect(res.statusCode).toBe(400)
    expect(Array.isArray(res.body.errors)).toBe(true)
  })

  test('POST com financiadores que nao e array -> 400', async () => {
    const user = await createUser()
    const res = await request(app)
      .post('/api/eventos')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send(eventoPayload({ financiadores: 'MEC' }))

    expect(res.statusCode).toBe(400)
    expect(Array.isArray(res.body.errors)).toBe(true)
  })

  test('POST com mais de 20 financiadores -> 400', async () => {
    const user = await createUser()
    const muitos = Array.from({ length: 21 }, (_, i) => ({ nome: `Financiador ${i}` }))
    const res = await request(app)
      .post('/api/eventos')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send(eventoPayload({ financiadores: muitos }))

    expect(res.statusCode).toBe(400)
    expect(Array.isArray(res.body.errors)).toBe(true)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
docker compose -f docker-compose.yml up -d db
npx jest tests/eventos.test.js --runInBand
```

Esperado: FAIL — os 6 testes novos falham (hoje `financiadores` é descartado pelo whitelist e não há validação). Os testes existentes continuam passando.

- [ ] **Step 3: Implementar a validação (`middleware/validators.js`)**

Adicionar entre `loginValidator` e `eventoValidator` (indentação 2 espaços):

```js
const financiadoresValidator = [
  body("financiadores")
    .optional({ values: "falsy" })
    .custom((valor) => Array.isArray(valor))
    .withMessage("Financiadores deve ser um array")
    .custom((valor) => valor.length <= 20)
    .withMessage("Máximo de 20 financiadores por evento"),
  body("financiadores.*.nome")
    .isString()
    .withMessage("Nome do financiador inválido")
    .trim()
    .notEmpty()
    .withMessage("Nome do financiador é obrigatório")
    .isLength({ max: 150 })
    .withMessage("Nome do financiador deve ter no máximo 150 caracteres"),
  body("financiadores.*.tipo")
    .optional({ values: "falsy" })
    .isIn(["publico", "privado", "hibrido"])
    .withMessage("Tipo de financiador inválido"),
];
```

Em `eventoValidator`, substituir o bloco atual de `financiadorTipo`/`financiadorNome` (regras entre `tipoEvento` e `status`):

```js
  body("financiadorTipo")
    .optional({ values: "falsy" })
    .isIn(["publico", "privado", "hibrido"])
    .withMessage("Tipo de financiador inválido"),
  body("financiadorNome")
    .optional({ values: "falsy" })
    .isString()
    .withMessage("Nome do financiador inválido")
    .trim()
    .isLength({ max: 150 })
    .withMessage("Nome do financiador deve ter no máximo 150 caracteres"),
```

por:

```js
  ...financiadoresValidator,
```

Em `eventoUpdateValidator`, substituir o bloco equivalente (mesmas regras `financiadorTipo`/`financiadorNome`, entre `tipoEvento` e `status`) pelo mesmo `...financiadoresValidator,`.

- [ ] **Step 4: Implementar o sanitizer (`services/eventoPayload.js`, indentação 3 espaços)**

Remover de `WRITABLE_FIELDS` as duas linhas:

```js
   'financiadorTipo',
   'financiadorNome',
```

Adicionar a função (antes de `sanitizeEventoInput`) e o export:

```js
// Normaliza o array `financiadores` do body (já validado pelo middleware).
// - chave ausente/falsy => undefined (PUT mantém o estado atual; POST cria vazio)
// - array => [{ tipo, nome }] já trimado, pronto para o create aninhado
function sanitizeFinanciadores(body) {
   if (!Array.isArray(body.financiadores)) return undefined
   return body.financiadores.map((item) => ({
      tipo: item?.tipo ? String(item.tipo).trim() || null : null,
      nome: String(item?.nome ?? '').trim(),
   }))
}
```

Em `module.exports`, incluir `sanitizeFinanciadores` ao lado de `sanitizeEventoInput`.

- [ ] **Step 5: Implementar a criação aninhada (`controllers/eventosController.js`, indentação 3 espaços)**

Linha do import de `eventoPayload` passa a ser:

```js
const { sanitizeEventoInput, sanitizeFinanciadores, respondPrismaError } = require('../services/eventoPayload')
```

Em `createEvento`, após `const dados = sanitizeEventoInput(req.body)`:

```js
   const financiadores = sanitizeFinanciadores(req.body) ?? []
```

No `data:` do `prisma.evento.create`, após `status: statusFinal,`:

```js
         financiadores: { create: financiadores },
```

No `include:` do mesmo `create`, após `categoria: true,`:

```js
            financiadores: { orderBy: { id: 'asc' } },
```

- [ ] **Step 6: Rodar e ver passar**

```bash
npx jest tests/eventos.test.js --runInBand
```

Esperado: todos os testes da suíte PASS (novos e existentes).

- [ ] **Step 7: Verificação de sintaxe e commit**

```bash
node --check middleware/validators.js && node --check services/eventoPayload.js && node --check controllers/eventosController.js
git add tests/eventos.test.js middleware/validators.js services/eventoPayload.js controllers/eventosController.js
git commit -m "feat(eventos): POST aceita lista de financiadores"
```

---

### Task 3: PUT /api/eventos/:id substitui/mantém/limpa financiadores

**Files:**
- Test: `tests/eventos.test.js`
- Modify: `controllers/eventosController.js`

**Interfaces:**
- Consumes: `sanitizeFinanciadores` (Task 2); `financiadoresValidator` já espalhado no `eventoUpdateValidator` (Task 2).
- Produces: semântica do PUT — array presente → `{ deleteMany: {}, create: [...] }` dentro do mesmo update atômico; ausente/falsy → financiadores intactos; resposta do PUT inclui `financiadores` ordenado por `id` (mesmo formato do POST).

- [ ] **Step 1: Escrever os testes que falham**

Dentro do `describe('financiadores')` criado na Task 2 (ainda no fim de `tests/eventos.test.js`), adicionar:

```js
  test('PUT com novo array substitui os financiadores', async () => {
    const owner = await createUser()
    const criado = await request(app)
      .post('/api/eventos')
      .set('Authorization', `Bearer ${tokenFor(owner)}`)
      .send(eventoPayload({ financiadores: [{ nome: 'Antigo' }] }))
    const evento = criado.body.evento

    const res = await request(app)
      .put(`/api/eventos/${evento.id}`)
      .set('Authorization', `Bearer ${tokenFor(owner)}`)
      .send({
        financiadores: [
          { tipo: 'privado', nome: 'Novo A' },
          { nome: 'Novo B' },
        ],
      })

    expect(res.statusCode).toBe(200)
    expect(res.body.evento.financiadores.map((f) => f.nome)).toEqual(['Novo A', 'Novo B'])
    expect(await prisma.financiador.count({ where: { eventoId: evento.id } })).toBe(2)
  })

  test('PUT sem a chave financiadores mantém os existentes', async () => {
    const owner = await createUser()
    const criado = await request(app)
      .post('/api/eventos')
      .set('Authorization', `Bearer ${tokenFor(owner)}`)
      .send(eventoPayload({ financiadores: [{ nome: 'Permanente' }] }))
    const evento = criado.body.evento

    const res = await request(app)
      .put(`/api/eventos/${evento.id}`)
      .set('Authorization', `Bearer ${tokenFor(owner)}`)
      .send({ titulo: 'Só muda o título' })

    expect(res.statusCode).toBe(200)
    expect(res.body.evento.financiadores.map((f) => f.nome)).toEqual(['Permanente'])
  })

  test('PUT com [] limpa todos os financiadores', async () => {
    const owner = await createUser()
    const criado = await request(app)
      .post('/api/eventos')
      .set('Authorization', `Bearer ${tokenFor(owner)}`)
      .send(eventoPayload({ financiadores: [{ nome: 'Vai sumir' }] }))
    const evento = criado.body.evento

    const res = await request(app)
      .put(`/api/eventos/${evento.id}`)
      .set('Authorization', `Bearer ${tokenFor(owner)}`)
      .send({ financiadores: [] })

    expect(res.statusCode).toBe(200)
    expect(res.body.evento.financiadores).toEqual([])
    expect(await prisma.financiador.count({ where: { eventoId: evento.id } })).toBe(0)
  })

  test('PUT com financiadores nao-array -> 400', async () => {
    const owner = await createUser()
    const criado = await request(app)
      .post('/api/eventos')
      .set('Authorization', `Bearer ${tokenFor(owner)}`)
      .send(eventoPayload())
    const evento = criado.body.evento

    const res = await request(app)
      .put(`/api/eventos/${evento.id}`)
      .set('Authorization', `Bearer ${tokenFor(owner)}`)
      .send({ financiadores: 'MEC' })

    expect(res.statusCode).toBe(400)
    expect(Array.isArray(res.body.errors)).toBe(true)
  })
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx jest tests/eventos.test.js --runInBand
```

Esperado: FAIL nos 3 primeiros testes novos (substitui/mantém/limpa — o PUT hoje descarta `financiadores` e não devolve a lista). O teste "PUT com financiadores nao-array -> 400" JÁ PASSA (o `financiadoresValidator` da Task 2 está espalhado também no `eventoUpdateValidator`) — é guarda de regressão.

- [ ] **Step 3: Implementar (`controllers/eventosController.js`, `updateEvento`, indentação 3 espaços)**

Após `const dadosAtualizacao = sanitizeEventoInput(req.body)` (antes do bloco do `motivoCancelamento`):

```js
   // financiadores: array presente substitui todos (deleteMany + create no
   // mesmo update atômico); ausente/falsy => sanitizeFinanciadores devolve
   // undefined e nada muda.
   const financiadores = sanitizeFinanciadores(req.body)
   if (financiadores !== undefined) {
      dadosAtualizacao.financiadores = { deleteMany: {}, create: financiadores }
   }
```

No `include:` do `prisma.evento.update`, após `categoria: true,`:

```js
            financiadores: { orderBy: { id: 'asc' } },
```

- [ ] **Step 4: Rodar e ver passar**

```bash
npx jest tests/eventos.test.js --runInBand
```

Esperado: suíte inteira PASS.

- [ ] **Step 5: Verificação de sintaxe e commit**

```bash
node --check controllers/eventosController.js
git add tests/eventos.test.js controllers/eventosController.js
git commit -m "feat(eventos): PUT substitui financiadores do evento"
```

---

### Task 4: Leituras incluem `financiadores` + cascade no delete

**Files:**
- Test: `tests/eventos.test.js`
- Modify: `controllers/eventosController.js`

**Interfaces:**
- Consumes: relação `Evento.financiadores` (Task 1).
- Produces: `financiadores: { orderBy: { id: 'asc' } }` presente em `getEventos`, `getEventoById`, `getMeusEventos` e `getEventosDestaque`. O cascade no delete NÃO precisa de código (FK criada na Task 1) — o teste é guarda de regressão.

- [ ] **Step 1: Escrever os testes que falham**

Dentro do `describe('financiadores')`, adicionar:

```js
  test('GET /api/eventos (lista) inclui financiadores', async () => {
    const user = await createUser()
    const evento = await createEvento(user.id)
    await prisma.financiador.create({
      data: { eventoId: evento.id, tipo: 'publico', nome: 'MEC' },
    })

    const res = await request(app).get('/api/eventos')

    expect(res.statusCode).toBe(200)
    const encontrado = res.body.eventos.find((e) => e.id === evento.id)
    expect(encontrado.financiadores.map((f) => f.nome)).toEqual(['MEC'])
  })

  test('GET /api/eventos/:id inclui financiadores', async () => {
    const user = await createUser()
    const evento = await createEvento(user.id)
    await prisma.financiador.create({ data: { eventoId: evento.id, nome: 'UFMT' } })

    const res = await request(app).get(`/api/eventos/${evento.id}`)

    expect(res.statusCode).toBe(200)
    expect(res.body.evento.financiadores.map((f) => f.nome)).toEqual(['UFMT'])
  })

  test('GET /api/meus-eventos inclui financiadores', async () => {
    const user = await createUser()
    const evento = await createEvento(user.id)
    await prisma.financiador.create({ data: { eventoId: evento.id, nome: 'Sebrae' } })

    const res = await request(app)
      .get('/api/meus-eventos')
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    expect(res.statusCode).toBe(200)
    expect(res.body.eventos[0].financiadores.map((f) => f.nome)).toEqual(['Sebrae'])
  })

  test('DELETE do evento remove os financiadores (cascade)', async () => {
    const owner = await createUser()
    const evento = await createEvento(owner.id)
    await prisma.financiador.create({ data: { eventoId: evento.id, nome: 'MEC' } })

    const res = await request(app)
      .delete(`/api/eventos/${evento.id}`)
      .set('Authorization', `Bearer ${tokenFor(owner)}`)

    expect(res.statusCode).toBe(200)
    expect(await prisma.financiador.count({ where: { eventoId: evento.id } })).toBe(0)
  })
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx jest tests/eventos.test.js --runInBand
```

Esperado: FAIL nos 3 testes de leitura (`financiadores` não vem no payload); o teste de cascade PASSA já (FK cascade da Task 1) — é guarda de regressão.

- [ ] **Step 3: Implementar os includes (`controllers/eventosController.js`, indentação 3 espaços)**

Adicionar `financiadores: { orderBy: { id: 'asc' } },` ao `include:` das quatro queries:

1. `getEventos` — no `include` do `prisma.evento.findMany` (junto de `categoria: true,`).
2. `getEventoById` — no `include` do `findUnique` (junto de `categoria: true,`).
3. `getMeusEventos` — no `include` do `findMany` (junto de `categoria: true,`).
4. `getEventosDestaque` — no `include` do `findMany` (rota não exposta em `routes/index.js`, mas mantida consistente).

- [ ] **Step 4: Rodar e ver passar**

```bash
npx jest tests/eventos.test.js --runInBand
```

Esperado: suíte inteira PASS.

- [ ] **Step 5: Verificação de sintaxe e commit**

```bash
node --check controllers/eventosController.js
git add tests/eventos.test.js controllers/eventosController.js
git commit -m "feat(eventos): leituras de evento incluem financiadores"
```

---

### Task 5: E-mails listam os financiadores pelos nomes

**Files:**
- Test: `tests/emailTemplates.test.js`
- Modify: `services/emailTemplates/helpers.js`
- Modify: `services/emailTemplates/eventoCriado.js`
- Modify: `services/emailTemplates/eventoStatusAlterado.js`

**Interfaces:**
- Consumes: shape `evento.financiadores = [{ id, eventoId, tipo, nome }]` (Tasks 1-4).
- Produces: `formatarFinanciadores(evento)` em `helpers.js` → `null` (sem financiadores) **ou** `{ rotulo: 'Financiador'|'Financiadores', nomes: string }`. Templates passam a receber eventos com `financiadores` em vez de `financiadorTipo`/`financiadorNome`.

- [ ] **Step 1: Escrever os testes que falham**

Em `tests/emailTemplates.test.js`, no `describe('eventoStatusAlteradoTemplate')`, substituir os dois testes de financiador (`inclui o financiador quando informado` e `nao inclui financiador quando ausente`) por:

```js
  test('lista varios financiadores apenas pelo nome', () => {
    const t = eventoStatusAlteradoTemplate({
      ...base,
      evento: {
        ...base.evento,
        financiadores: [
          { tipo: 'publico', nome: 'MEC' },
          { tipo: 'privado', nome: 'FIEMT' },
        ],
      },
    })
    expect(t.html).toContain('Financiadores:')
    expect(t.html).toContain('MEC, FIEMT')
    expect(t.text).toContain('Financiadores: MEC, FIEMT')
  })

  test('um financiador usa o rotulo no singular e ignora o tipo', () => {
    const t = eventoStatusAlteradoTemplate({
      ...base,
      evento: { ...base.evento, financiadores: [{ tipo: 'publico', nome: 'MEC' }] },
    })
    expect(t.html).toContain('Financiador:')
    expect(t.html).not.toContain('Publico')
    expect(t.text).toContain('Financiador: MEC')
  })

  test('nao inclui financiador quando ausente', () => {
    const t = eventoStatusAlteradoTemplate({ ...base })
    expect(t.html).not.toContain('Financiador')
    expect(t.text).not.toContain('Financiador')
  })
```

No `describe('eventoCriadoTemplate')`, substituir os dois testes de financiador por:

```js
  test('lista varios financiadores apenas pelo nome', () => {
    const t = eventoCriadoTemplate({
      ...base,
      evento: {
        ...base.evento,
        financiadores: [
          { tipo: 'hibrido', nome: 'Fulano de Tal' },
          { nome: 'Beltrano' },
        ],
      },
    })
    expect(t.html).toContain('Financiadores:')
    expect(t.html).toContain('Fulano de Tal, Beltrano')
    expect(t.text).toContain('Financiadores: Fulano de Tal, Beltrano')
  })

  test('nao inclui financiador quando ausente', () => {
    const t = eventoCriadoTemplate({ ...base })
    expect(t.html).not.toContain('Financiador')
    expect(t.text).not.toContain('Financiador')
  })
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npx jest tests/emailTemplates.test.js --runInBand
```

Esperado: FAIL nos testes que esperam nomes (`MEC, FIEMT`, `Financiador: MEC` etc.); os de ausência continuam passando.

- [ ] **Step 3: Implementar o helper (`services/emailTemplates/helpers.js`, indentação 3 espaços)**

Substituir TODO o conteúdo do arquivo por:

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

const formatarFinanciadores = (evento) => {
   const lista = Array.isArray(evento?.financiadores) ? evento.financiadores : []
   const nomes = lista
      .map((f) => (f?.nome || '').trim())
      .filter(Boolean)
   if (!nomes.length) return null
   return {
      rotulo: nomes.length > 1 ? 'Financiadores' : 'Financiador',
      nomes: nomes.join(', '),
   }
}

module.exports = { TIMEZONE, formatarData, rotuloStatus, formatarFinanciadores }
```

(Remove `ROTULOS_FINANCIADOR`, `rotuloFinanciadorTipo` e `formatarFinanciador`.)

- [ ] **Step 4: Atualizar os templates (indentação 3 espaços)**

`services/emailTemplates/eventoCriado.js`:

- Import (linha 1): `const { formatarData, rotuloStatus, formatarFinanciadores } = require('./helpers')`
- Substituir `const financiador = formatarFinanciador(evento)` por `const financiadores = formatarFinanciadores(evento)`
- No HTML, substituir a linha do `<li>` do financiador por:

```js
            ${financiadores ? `<li><strong>${financiadores.rotulo}:</strong> ${financiadores.nomes}</li>` : ''}
```

- No `text`, substituir a linha `financiador ? \`Financiador: ${financiador}\` : '',` por:

```js
      financiadores ? `${financiadores.rotulo}: ${financiadores.nomes}` : '',
```

`services/emailTemplates/eventoStatusAlterado.js`:

- Import (linha 1): `const { formatarData, rotuloStatus, formatarFinanciadores } = require('./helpers')`
- Substituir `const financiador = formatarFinanciador(evento)` por `const financiadores = formatarFinanciadores(evento)`
- No HTML, substituir o `<li>` do financiador por:

```js
            ${financiadores ? `<li><strong>${financiadores.rotulo}:</strong> ${financiadores.nomes}</li>` : ''}
```

- No bloco de texto, substituir:

```js
   if (financiador) {
      linhas.push(`Financiador: ${financiador}`)
   }
```

por:

```js
   if (financiadores) {
      linhas.push(`${financiadores.rotulo}: ${financiadores.nomes}`)
   }
```

- [ ] **Step 5: Rodar e ver passar**

```bash
npx jest tests/emailTemplates.test.js --runInBand
```

Esperado: suíte inteira PASS.

- [ ] **Step 6: Verificação de sintaxe e commit**

```bash
node --check services/emailTemplates/helpers.js && node --check services/emailTemplates/eventoCriado.js && node --check services/emailTemplates/eventoStatusAlterado.js
git add tests/emailTemplates.test.js services/emailTemplates/
git commit -m "feat(email): lista os financiadores pelo nome"
```

---

### Task 6: Seed cria financiadores na tabela nova

**Files:**
- Modify: `prisma/seed.js`

**Interfaces:**
- Consumes: model `Financiador` (Task 1).
- Produces: seed com um financiador por evento (mesmos pares tipo/nome atuais), criado via relação aninhada.

- [ ] **Step 1: Trocar a escrita no loop final (`prisma/seed.js`, indentação 3 espaços)**

Substituir o loop (fim do arquivo, `for (const evento of eventos) { ... }`):

```js
   for (const { financiadorTipo, financiadorNome, ...evento } of eventos) {
      await prisma.evento.create({
         data: {
            ...evento,
            financiadores: {
               create:
                  financiadorNome || financiadorTipo
                     ? [{ tipo: financiadorTipo ?? null, nome: financiadorNome ?? 'Nao informado' }]
                     : [],
            },
         },
      })
   }
```

(A destructuring remove `financiadorTipo`/`financiadorNome` do objeto antes do spread — sem editar os 17 eventos um a um.)

- [ ] **Step 2: Verificação de sintaxe**

```bash
node --check prisma/seed.js
```

- [ ] **Step 3: Smoke opcional (só em banco recém-criado — o seed duplica eventos em DB povoado)**

```bash
docker compose -f docker-compose.yml exec app npm run prisma:seed
```

Esperado (se executado): `✅ Eventos criados` sem erro de `financiadorTipo` (o client antigo dentro do container só será regenerado no próximo boot do compose — se der `Unknown argument`, reinicie o app: `docker compose -f docker-compose.yml up -d app --force-recreate`).

- [ ] **Step 4: Commit**

```bash
git add prisma/seed.js
git commit -m "feat(seed): financiadores como tabela"
```

---

### Task 7: Swagger + suíte completa verde

**Files:**
- Modify: `docs/swagger.routes.js`

**Interfaces:**
- Consumes: API final das Tasks 2-5.
- Produces: documentação dos schemas `financiadores` no POST e no PUT.

- [ ] **Step 1: Trocar o bloco do `requestBody` do POST (bloco atual entre `requisitos` e o fim das `properties`)**

Remover:

```yaml
 *               financiadorTipo:
 *                 type: string
 *                 enum: [publico, privado, hibrido]
 *                 description: Natureza do financiador do evento
 *               financiadorNome:
 *                 type: string
 *                 example: Governo do Estado de Mato Grosso
 *                 description: Nome do financiador do evento
```

Inserir no lugar:

```yaml
 *               financiadores:
 *                 type: array
 *                 maxItems: 20
 *                 description: Lista de financiadores do evento. Cada item exige "nome"; "tipo" é opcional (publico, privado ou hibrido). A resposta devolve o evento com "financiadores".
 *                 items:
 *                   type: object
 *                   required:
 *                     - nome
 *                   properties:
 *                     nome:
 *                       type: string
 *                       maxLength: 150
 *                       example: Governo do Estado de Mato Grosso
 *                     tipo:
 *                       type: string
 *                       enum: [publico, privado, hibrido]
```

- [ ] **Step 2: Trocar o bloco equivalente no `requestBody` do PUT**

Remover:

```yaml
 *               financiadorTipo:
 *                 type: string
 *                 enum: [publico, privado, hibrido]
 *                 description: Natureza do financiador do evento
 *               financiadorNome:
 *                 type: string
 *                 description: Nome do financiador do evento
```

Inserir no lugar o MESMO bloco `financiadores` do Step 1, com a description ajustada:

```yaml
 *               financiadores:
 *                 type: array
 *                 maxItems: 20
 *                 description: Lista de financiadores do evento. Enviar o array substitui todos os financiadores existentes; omitir a chave mantém os atuais. Cada item exige "nome"; "tipo" é opcional (publico, privado ou hibrido).
 *                 items:
 *                   type: object
 *                   required:
 *                     - nome
 *                   properties:
 *                     nome:
 *                       type: string
 *                       maxLength: 150
 *                       example: Governo do Estado de Mato Grosso
 *                     tipo:
 *                       type: string
 *                       enum: [publico, privado, hibrido]
```

- [ ] **Step 3: Ajustar as descriptions**

POST `/api/eventos` (summary "Criar evento") — description passa a ser:

```yaml
 *     description: Cria um novo evento. Qualquer usuário autenticado pode criar, mas o evento nasce sempre como rascunho; apenas administradores podem criá-lo já como publicado. Aceita "financiadores" (lista de {nome, tipo}); a resposta devolve o evento com "financiadores".
```

GET `/api/eventos/{id}` (summary "Detalhes do evento") — description passa a ser:

```yaml
 *     description: Retorna informações completas incluindo programação, avaliações e financiadores
```

PUT `/api/eventos/{id}` (summary "Atualizar evento") — inserir a frase sobre financiadores entre a frase do `motivoCancelamento` e a de "Campos que não são colunas":

```yaml
 *     description: Atualiza informações de um evento (dono do evento ou admin). Apenas administradores podem mudar o status para publicado; os demais ficam restritos a rascunho/cancelado/encerrado. Aceita "motivoCancelamento" (opcional, máx. 1000 caracteres), limpo automaticamente quando o evento deixa de estar cancelado. Aceita "financiadores" (lista de {nome, tipo}); enviar o array substitui todos os financiadores do evento, omitir a chave mantém os atuais. Campos que não são colunas do evento (ex.: objeto completo do GET com categoria/organizador/_count) são ignorados; categoriaId, datas, horários e números podem vir como string e são convertidos. Campos não reconhecidos retornam 400; em NODE_ENV=development a resposta de erro traz o campo detalhe com a mensagem crua.
```

- [ ] **Step 4: Suíte completa**

```bash
node --check docs/swagger.routes.js
npx jest --runInBand
```

Esperado: todas as suítes PASS (sanity, app, auth, eventos, inscricoes, permissoes, emailTemplates, deploy). O `globalSetup` aplica a migração da Task 1 no DB de teste automaticamente.

- [ ] **Step 5: Smoke manual opcional do Swagger**

Subir a stack (`docker compose -f docker-compose.yml up --build`) e conferir `/api-docs`: POST e PUT de eventos mostram `financiadores` como array de objetos.

- [ ] **Step 6: Commit**

```bash
git add docs/swagger.routes.js
git commit -m "docs(swagger): documenta financiadores como lista"
```

---

## Notas finais

- O e-mail continua fire-and-forget (`sendMailSafe`) e o `cache.flushAll()` permanece em todos os writes — nenhuma mudança além das listadas.
- `tests/deploy.test.js` valida o grafo de `require` de runtime contra o `.dockerignore`: nenhuma tarefa cria arquivo novo de runtime, então não há impacto.
- Rollback do deploy: re-run da pipeline de um commit anterior (convenção do repo); a migração inverte a estrutura do banco, não os dados (backfill é one-way).
