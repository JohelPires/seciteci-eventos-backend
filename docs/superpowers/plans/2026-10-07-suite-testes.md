# Plano de Implementação: Suíte de Testes Automatizados (Integração HTTP)

> **Para agentes:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar task por task. Steps usam checkboxes (`- [ ]`).

**Goal:** Suíte de testes de integração HTTP (Jest + Supertest) cobrindo caminhos críticos (auth, eventos, inscrições, permissões) contra o banco de teste `sistema_eventos_test`.

**Spec:** `docs/superpowers/specs/2026-10-07-suite-testes-design.md`

**Arquitetura:** Importa o app Express (`app.js`, extraído de `server.js`) com supertest, contra Postgres do compose (`localhost:5433`) num database dedicado `sistema_eventos_test`, migrado via `prisma migrate deploy` no `globalSetup` e truncado no `beforeEach`. Execução serial (`--runInBand`). Sem mocks de banco; e-mail desligado por `EMAIL_ENABLED=false`; rate limit e cache ignorados sob `NODE_ENV=test`.

**Tech stack:** Node (CJS puro), Jest, Supertest, Prisma (`@prisma/client`/CLI já presentes).

## Global Constraints

- CJS puro, sem ESM, sem TS.
- Nunca tocar o banco de dev/prod `sistema_eventos` — todos os testes usam `sistema_eventos_test`.
- `NODE_ENV=test` deve desativar rate limit e cache; produção inalterada.
- Sem comentários em código novo.
- Estilo da repo: statements sem ponto-e-vírgula no server/routes (`server.js`), com ponto-e-vírgula em controllers/middleware — manter o estilo do arquivo tocado.
- Node local v22; Docker node:20-alpine.

---

### Task 1: Infraestrutura Jest + banco de teste

**Files:**
- Create: `.env.test.example`, `db/init-test-db.sql`, `jest.config.js`, `tests/setupEnv.js`, `tests/globalSetup.js`, `tests/db.js`, `tests/sanity.test.js`
- Modify: `package.json` (scripts + devDeps), `docker-compose.yml` (mount init SQL), `.gitignore`

**Interfaces:**
- Produces: `tests/db.js` exporta `{ prisma, resetDb }` — usado por todas as tasks seguintes (`resetDb(): Promise<void>` trunca todas as tabelas públicas).
- Produces: `jest.config.js` com `setupFiles: ./tests/setupEnv.js` e `globalSetup: ./tests/globalSetup.js`.

- [ ] **Step 1: Instalar devDependencies**

```bash
npm install -D jest supertest
```

- [ ] **Step 2: Criar `.env.test.example`** (versionado; todos testes partem desse conteúdo)

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/sistema_eventos_test?schema=public
NODE_ENV=test
JWT_SECRET=test-secret
EMAIL_ENABLED=false
```

- [ ] **Step 3: Criar `.env.test` (cópia do exemplo, não versionado)**

```bash
cp .env.test.example .env.test
```

- [ ] **Step 4: Adicionar `.env.test` ao `.gitignore`** (o .gitignore tem `.env` exato, não cobre `.env.test`)

No bloco "dotenv environment variable files", adicionar linha:

```
.env.test
```

- [ ] **Step 5: Criar `db/init-test-db.sql`** (só roda em volume `pgdata` novo)

```sql
CREATE DATABASE sistema_eventos_test;
```

- [ ] **Step 6: Montar o init script no serviço `db` do `docker-compose.yml`**

```yaml
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./db/init-test-db.sql:/docker-entrypoint-initdb.d/init-test-db.sql:ro
```

- [ ] **Step 7: Scripts no `package.json`**

```json
"test": "jest --runInBand",
"test:watch": "jest --watch"
```

- [ ] **Step 8: Criar `jest.config.js`**

```js
module.exports = {
  testEnvironment: 'node',
  setupFiles: ['./tests/setupEnv.js'],
  globalSetup: './tests/globalSetup.js',
  testTimeout: 30000,
}
```

- [ ] **Step 9: Criar `tests/setupEnv.js`** (roda antes de cada arquivo de teste, antes dos imports de teste carregarem `config/prisma`)

```js
const path = require('path')
const dotenv = require('dotenv')

process.env.NODE_ENV = 'test'
dotenv.config({ path: path.resolve(__dirname, '..', '.env.test') })
```

- [ ] **Step 10: Criar `tests/globalSetup.js`** (roda uma vez, em processo separado, antes de tudo; aplica migrações no banco de teste)

```js
const path = require('path')
const { execSync } = require('child_process')

module.exports = async () => {
  process.env.NODE_ENV = 'test'
  require('dotenv').config({ path: path.resolve(__dirname, '..', '.env.test') })

  const url = process.env.DATABASE_URL
  if (!url || !url.includes('sistema_eventos_test')) {
    throw new Error(
      'DATABASE_URL deve apontar para o banco de teste sistema_eventos_test. Crie .env.test a partir de .env.test.example.'
    )
  }

  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url },
  })
}
```

Nota: `migrate deploy` nunca cria database. Se não existir, o erro do passo seguinte é explícito (provisão manual no Step 12).

- [ ] **Step 11: Criar `tests/db.js`**

```js
const prisma = require('../config/prisma')

async function resetDb() {
  const tables = await prisma.$queryRawUnsafe(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != '_prisma_migrations'"
  )
  if (tables.length === 0) return
  const list = tables.map((t) => `"${t.tablename}"`).join(', ')
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`)
}

module.exports = { prisma, resetDb }
```

O `config/prisma.js` cria o client a partir de `process.env.DATABASE_URL`, que em testes vem de `.env.test` via `setupEnv.js`. Client é o mesmo usado pela API nos testes (uma só conexão).

- [ ] **Step 12: Provisão do banco de teste** (`pgdata` atual já existe; init script não reroda)

```bash
docker compose up -d db
docker compose exec db createdb -U postgres sistema_eventos_test
```

(se já existir, o `createdb` falha com erro claro — ignorar)

- [ ] **Step 13: Criar `tests/sanity.test.js`**

```js
const { prisma, resetDb } = require('./db')

describe('infra de teste', () => {
  test('env do .env.test carregado', () => {
    expect(process.env.NODE_ENV).toBe('test')
    expect(process.env.JWT_SECRET).toBe('test-secret')
    expect(process.env.EMAIL_ENABLED).toBe('false')
  })

  test('resetDb deixa o banco vazio', async () => {
    await resetDb()
    const rows = await prisma.$queryRawUnsafe('SELECT COUNT(*)::int AS n FROM usuarios')
    expect(rows[0].n).toBe(0)
  })

  test('TRUNCATE reseta sequências (RESTART IDENTITY)', async () => {
    await prisma.usuario.create({
      data: { nome: 'A', email: 'a@teste.com', senha: 'x', tipoUsuario: 'participante' },
    })
    await resetDb()
    await prisma.usuario.create({
      data: { nome: 'B', email: 'b@teste.com', senha: 'x', tipoUsuario: 'participante' },
    })
    expect(await prisma.usuario.count()).toBe(1)
  })
})
```

- [ ] **Step 14: Rodar e verificar**

```bash
npm test -- tests/sanity.test.js
```

Expected: PASS (3 testes). Erros comuns: `createdb` faltou (ponto 12), porta errada no `.env.test` (deve ser 5433).

- [ ] **Step 15: Commit**

```bash
git add package.json package-lock.json .gitignore .env.test.example db/init-test-db.sql docker-compose.yml jest.config.js tests/
git commit -m "test: infraestrutura de jest+supertest com banco de teste dedicado"
```

---

### Task 2: Extrair `app.js` de `server.js` (+ bypass de rate limit/cache em test)

**Files:**
- Create: `app.js`, `tests/app.test.js`
- Modify: `server.js` (reescrito), `controllers/eventosController.js`

**Interfaces:**
- Produces: `module.exports = app` em `app.js` — app Express montado (middlewares, swagger, rotas, 404, error handler), sem listener.
- Produces: bypasses sob `NODE_ENV=test` (rate limit e cache) usados implicitamente pelas suítes seguintes.

- [ ] **Step 1: Escrever teste que falha (roda contra o app futuro)**

`tests/app.test.js`:

```js
const request = require('supertest')
const app = require('../app')

describe('app exportável', () => {
  test('rota pública /api/categorias responde 200 com array', async () => {
    const res = await request(app).get('/api/categorias')
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(res.body.categorias)).toBe(true)
  })

  test('rota inexistente responde 404', async () => {
    const res = await request(app).get('/api/rota-inexistente')
    expect(res.statusCode).toBe(404)
    expect(res.body.error).toBe('Rota não encontrada')
  })
})
```

- [ ] **Step 2: Rodar e verificar falha**

```bash
npm test -- tests/app.test.js
```

Expected: FAIL (`Cannot find module '../app'`)

- [ ] **Step 3: Criar `app.js`** (toda montagem vem de `server.js` original)

```js
const express = require('express')
const cors = require('cors')
const rateLimit = require('express-rate-limit')
const swaggerUi = require('swagger-ui-express')
const swaggerSpec = require('./config/swagger')
require('dotenv').config()
const routes = require('./routes')

const app = express()
const PORT = process.env.PORT || 3000
const URL =
   process.env.NODE_ENV === 'development'
      ? `http://localhost:${PORT}`
      : 'https://seciteci-seciteci-eventos.qmono1.easypanel.host'

app.set('trust proxy', 1)

const limiter = rateLimit({
   windowMs: 3 * 60 * 1000,
   max: 100,
   message: 'Muitas requisições deste IP, tente novamente mais tarde.',
})

app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use(
   '/api-docs',
   swaggerUi.serve,
   swaggerUi.setup(swaggerSpec, {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'API Eventos - Documentação',
   })
)

app.get('/api-docs.json', (req, res) => {
   res.setHeader('Content-Type', 'application/json')
   res.send(swaggerSpec)
})

if (process.env.NODE_ENV !== 'test') {
   app.use('/api/', limiter)
}

app.use('/api', routes)

app.get('/health', async (req, res) => {
   const prisma = require('./config/prisma')
   try {
      await prisma.$queryRaw`SELECT 1`
      res.json({
         status: 'OK',
         message: 'API funcionando perfeitamente',
         database: 'Conectado',
         timestamp: new Date().toISOString(),
      })
   } catch (error) {
      res.status(500).json({
         status: 'ERROR',
         message: 'Erro na conexão com o banco',
         error: error.message,
      })
   }
})

app.get('/', (req, res) => {
   res.json({
      message: 'API Sistema de Eventos',
      version: '1.0.0',
      swagger: `${URL}/api-docs`,
      endpoints: {
         auth: `${URL}/api/auth/register, ${URL}/api/auth/login`,
         eventos: `${URL}/api/eventos`,
         inscricoes: `${URL}/api/inscricoes`,
         categorias: `${URL}/api/categorias`,
         locais: `${URL}/api/locais`,
         avaliacoes: `${URL}/api/avaliacoes`,
         notificacoes: `${URL}/api/notificacoes`,
      },
      docs: 'Para documentação completa, consulte o README',
   })
})

app.use((req, res) => {
   res.status(404).json({ error: 'Rota não encontrada' })
})

app.use((err, req, res, next) => {
   console.error('Erro não tratado:', err)
   res.status(500).json({
      error: 'Erro interno do servidor',
      message: process.env.NODE_ENV === 'development' ? err.message : undefined,
   })
})

module.exports = app
```

- [ ] **Step 4: Reescrever `server.js`** (restam: dotenv, requires, listen, banner, shutdown. Rodapé `SIGTERM` comentado no original é descartado; resta no git history)

```js
require('dotenv').config()
const app = require('./app')
const prisma = require('./config/prisma')
const { verifyMailer } = require('./config/mailer')

const PORT = process.env.PORT || 3000
const URL =
   process.env.NODE_ENV === 'development'
      ? `http://localhost:${PORT}`
      : 'https://seciteci-seciteci-eventos.qmono1.easypanel.host'

process.on('SIGINT', async () => {
   console.log('\n🔴 Encerrando servidor...')
   await prisma.$disconnect()
   console.log('✅ Conexão com banco encerrada')
   process.exit(0)
})

app.listen(PORT, '0.0.0.0', async () => {
   verifyMailer()

   let conectado = false
   try {
      await prisma.$connect()
      conectado = true
   } catch (error) {
      console.error('❌ Erro ao conectar no banco:', error.message)
      console.error('💡 Verifique a DATABASE_URL no .env')
   }
   console.log('\n====================================')
   console.log(' API Sistema de Eventos - Seciteci')
   console.log('====================================')
   console.log(`URL:      ${URL}`)
   console.log(`Swagger:  ${URL}/api-docs`)
   console.log(`Database: ${conectado ? '✅ Conectado' : '❌ Desconectado'}`)
   console.log(`Ambiente: ${process.env.NODE_ENV || 'development'}`)
   console.log('====================================\n')
})

module.exports = app
```

- [ ] **Step 5: Cache off em NODE_ENV=test em `controllers/eventosController.js`**

Adicionar junto à definição de `cache` (linha ~2):

```js
const cacheEnabled = () => process.env.NODE_ENV !== 'test'
```

Depois, substituir os 4 sites (em `getEventos` e `getEventoById`):

```js
// antes (2x):
const cachedData = cache.get(cacheKey)
// depois (2x):
const cachedData = cacheEnabled() ? cache.get(cacheKey) : null

// antes (2x, no fim de cada handler):
cache.set(cacheKey, responseData)
// depois (2x):
if (cacheEnabled()) {
   cache.set(cacheKey, responseData)
}
```

(`cache.flushAll()` continua chamado nos writes — no-op sem cache populado.)

- [ ] **Step 6: Rodar e verificar**

```bash
node --check server.js && node --check app.js && npm test -- tests/app.test.js
```

Expected: checks ok + PASS (2 testes).

- [ ] **Step 7: Smoke dev parity (opcional)** — `docker compose up` e abrir `http://localhost:3030/`, `/health` e `/api-docs` (depende do volume `node_modules` estar atualizado).

- [ ] **Step 8: Commit**

```bash
git add app.js server.js controllers/eventosController.js tests/app.test.js
git commit -m "refactor: separa app express do server.js e desliga rate-limit/cache em NODE_ENV=test"
```

---

### Task 3: Factories + suíte de auth

**Files:**
- Create: `tests/factories.js`, `tests/auth.test.js`

**Interfaces:**
- Produces: `createUser(overrides) → (Usuario & { senhaPlano })` — cria direto no prisma com bcrypt, qualquer `tipoUsuario`.
- Produces: `tokenFor(user) → string` — JWT `{ id, tipo }` assinado com `process.env.JWT_SECRET` (mesmo contrato de `middleware/auth.js`).

- [ ] **Step 1: Criar `tests/factories.js`**

```js
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { prisma } = require('./db')

let counter = 0

async function createUser(overrides = {}) {
   counter += 1
   const {
      nome = `Usuario ${counter}`,
      email = `usuario${counter}@teste.com`,
      senha = 'senha123',
      telefone = null,
      cpf = null,
      dataNascimento = null,
      tipoUsuario = 'participante',
      ativo = true,
   } = overrides

   const senhaHash = await bcrypt.hash(senha, 10)

   const user = await prisma.usuario.create({
      data: { nome, email, senha: senhaHash, telefone, cpf, dataNascimento, tipoUsuario, ativo },
   })

   return { ...user, senhaPlano: senha }
}

function tokenFor(user) {
   return jwt.sign({ id: user.id, tipo: user.tipoUsuario }, process.env.JWT_SECRET, {
      expiresIn: '1d',
   })
}

module.exports = { createUser, tokenFor }
```

- [ ] **Step 2: Criar `tests/auth.test.js`**

```js
const request = require('supertest')
const app = require('../app')
const { prisma, resetDb } = require('./db')
const { createUser, tokenFor } = require('./factories')

beforeEach(resetDb)

describe('POST /api/auth/register', () => {
   const payload = {
      nome: 'Fulano da Silva',
      email: 'fulano@teste.com',
      senha: 'senha123',
   }

   test('cria usuario participante (201)', async () => {
      const res = await request(app).post('/api/auth/register').send(payload)

      expect(res.statusCode).toBe(201)
      expect(res.body.user).toMatchObject({
         nome: payload.nome,
         email: payload.email,
         tipoUsuario: 'participante',
      })
      expect(res.body.user.senha).toBeUndefined()
   })

   test('senha no banco vem hasheada', async () => {
      await request(app).post('/api/auth/register').send(payload)
      const user = await prisma.usuario.findUnique({ where: { email: payload.email } })
      expect(user.senha).not.toBe(payload.senha)
      expect(user.senha.length).toBeGreaterThan(20)
   })

   test('email duplicado -> 400', async () => {
      await request(app).post('/api/auth/register').send(payload)
      const res = await request(app).post('/api/auth/register').send(payload)

      expect(res.statusCode).toBe(400)
      expect(res.body.error).toBe('Email já cadastrado')
   })

   test('cpf duplicado -> 400', async () => {
      await request(app).post('/api/auth/register').send({ ...payload, cpf: '12345678900' })
      const res = await request(app)
         .post('/api/auth/register')
         .send({ ...payload, email: 'outro@teste.com', cpf: '12345678900' })

      expect(res.statusCode).toBe(400)
      expect(res.body.error).toBe('CPF já cadastrado')
   })

   test('payload invalido -> 400 com errors', async () => {
      const res = await request(app)
         .post('/api/auth/register')
         .send({ email: 'nao-e-email', senha: '123' })

      expect(res.statusCode).toBe(400)
      expect(Array.isArray(res.body.errors)).toBe(true)
      expect(res.body.errors.length).toBeGreaterThan(0)
   })

   test('tipoUsuario != participante é barrado pelo validator', async () => {
      const res = await request(app)
         .post('/api/auth/register')
         .send({ ...payload, email: 'org@teste.com', tipoUsuario: 'organizador' })

      expect(res.statusCode).toBe(400)
      expect(Array.isArray(res.body.errors)).toBe(true)
   })
})

describe('POST /api/auth/login', () => {
   test('credenciais corretas -> 200 com token', async () => {
      const user = await createUser({ email: 'login@teste.com' })

      const res = await request(app)
         .post('/api/auth/login')
         .send({ email: user.email, senha: user.senhaPlano })

      expect(res.statusCode).toBe(200)
      expect(typeof res.body.token).toBe('string')
      expect(res.body.token.split('.')).toHaveLength(3)
      expect(res.body.user).toMatchObject({ id: user.id, email: user.email })
   })

   test('senha errada -> 401 "Credenciais inválidas"', async () => {
      const user = await createUser({ email: 'errada@teste.com' })
      const res = await request(app)
         .post('/api/auth/login')
         .send({ email: user.email, senha: 'SenhaErrada!' })

      expect(res.statusCode).toBe(401)
      expect(res.body.error).toBe('Credenciais inválidas')
   })

   test('email inexistente -> 401', async () => {
      const res = await request(app)
         .post('/api/auth/login')
         .send({ email: 'nada@teste.com', senha: 'qualquer' })

      expect(res.statusCode).toBe(401)
      expect(res.body.error).toBe('Credenciais inválidas')
   })

   test('payload invalido -> 400', async () => {
      const res = await request(app)
         .post('/api/auth/login')
         .send({ email: 'sem-arroba', senha: '' })

      expect(res.statusCode).toBe(400)
      expect(Array.isArray(res.body.errors)).toBe(true)
   })
})

describe('GET /api/auth/profile', () => {
   test('token valido -> 200 com user', async () => {
      const user = await createUser({ email: 'perfil@teste.com' })

      const res = await request(app)
         .get('/api/auth/profile')
         .set('Authorization', `Bearer ${tokenFor(user)}`)

      expect(res.statusCode).toBe(200)
      expect(res.body.user).toMatchObject({ id: user.id, email: user.email })
   })

   test('sem token -> 401 "Token não fornecido"', async () => {
      const res = await request(app).get('/api/auth/profile')

      expect(res.statusCode).toBe(401)
      expect(res.body.error).toBe('Token não fornecido')
   })
})
```

- [ ] **Step 3: Rodar e verificar**

```bash
npm test -- tests/auth.test.js
```

Expected: PASS. Se algo falhar, tratar como possível bug real do código testado: investigar a fundo o comportamento antes de ajustar o teste (não amaciar o assert).

- [ ] **Step 4: Commit**

```bash
git add tests/factories.js tests/auth.test.js
git commit -m "test: suíte de auth com factories de usuário e tokens"
```

---

### Task 4: Factory de evento + suíte de eventos

**Files:**
- Modify: `tests/factories.js` (adicionar `eventoPayload`/`createEvento`)
- Create: `tests/eventos.test.js`

**Interfaces:**
- Consumes: `createUser`, `tokenFor` (Task 3).
- Produces: `eventoPayload(overrides) → body de criação com defaults` e `createEvento(organizadorId, overrides) → Evento` (default `status: 'publicado'`, datas futuras, `vagasDisponiveis` = capacidadeMaxima) — consumidos por Task 5 (e úteis para os testes de inscrição).

- [ ] **Step 1: Adicionar a `tests/factories.js`** (antes do `module.exports`):

```js
const emUmDia = 24 * 60 * 60 * 1000

function eventoPayload(overrides = {}) {
   return {
      titulo: 'Evento de Teste',
      descricao: 'Descrição do evento de teste',
      dataInicio: new Date(Date.now() + 7 * emUmDia).toISOString(),
      dataFim: new Date(Date.now() + 8 * emUmDia).toISOString(),
      tipoEvento: 'presencial',
      LocalNome: 'Estádio de Teste',
      LocalEndereco: 'Av. Teste, 123',
      LocalCidade: 'Cuiabá',
      LocalEstado: 'MT',
      ...overrides,
   }
}

async function createEvento(organizadorId, overrides = {}) {
   const d = eventoPayload(overrides)
   const status = overrides.status ?? 'publicado'
   const capacidadeMaxima = overrides.capacidadeMaxima ?? null
   const vagasDisponiveis = overrides.vagasDisponiveis ?? capacidadeMaxima

   return prisma.evento.create({
      data: {
         titulo: d.titulo,
         descricao: d.descricao,
         dataInicio: new Date(d.dataInicio),
         dataFim: new Date(d.dataFim),
         tipoEvento: d.tipoEvento,
         status,
         capacidadeMaxima,
         vagasDisponiveis,
         valorInscricao: overrides.valorInscricao ?? 0,
         LocalNome: d.LocalNome,
         LocalEndereco: d.LocalEndereco,
         LocalCidade: d.LocalCidade,
         LocalEstado: d.LocalEstado,
         organizadorId,
      },
   })
}
```

e exportar: `module.exports = { createUser, tokenFor, eventoPayload, createEvento }`

- [ ] **Step 2: Criar `tests/eventos.test.js`**

```js
const request = require('supertest')
const app = require('../app')
const { prisma, resetDb } = require('./db')
const { createUser, tokenFor, eventoPayload, createEvento } = require('./factories')

beforeEach(resetDb)

const emUmDia = 24 * 60 * 60 * 1000

describe('POST /api/eventos', () => {
   test('sem token -> 401 "Token não fornecido"', async () => {
      const res = await request(app).post('/api/eventos').send({})
      expect(res.statusCode).toBe(401)
      expect(res.body.error).toBe('Token não fornecido')
   })

   test('usuario qualquer cria sempre como rascunho', async () => {
      const user = await createUser()
      const res = await request(app)
         .post('/api/eventos')
         .set('Authorization', `Bearer ${tokenFor(user)}`)
         .send(eventoPayload({ status: 'publicado' }))

      expect(res.statusCode).toBe(201)
      expect(res.body.evento.status).toBe('rascunho')
      expect(res.body.evento.organizadorId).toBe(user.id)
   })

   test('admin cria como publicado', async () => {
      const admin = await createUser({ tipoUsuario: 'admin' })
      const res = await request(app)
         .post('/api/eventos')
         .set('Authorization', `Bearer ${tokenFor(admin)}`)
         .send(eventoPayload({ status: 'publicado' }))

      expect(res.statusCode).toBe(201)
      expect(res.body.evento.status).toBe('publicado')
   })

   test('vagas acompanham a capacidade informada', async () => {
      const user = await createUser()
      const res = await request(app)
         .post('/api/eventos')
         .set('Authorization', `Bearer ${tokenFor(user)}`)
         .send(eventoPayload({ capacidadeMaxima: 10 }))

      expect(res.body.evento.capacidadeMaxima).toBe(10)
      expect(res.body.evento.vagasDisponiveis).toBe(10)
   })

   test('payload invalido -> 400', async () => {
      const user = await createUser()
      const res = await request(app)
         .post('/api/eventos')
         .set('Authorization', `Bearer ${tokenFor(user)}`)
         .send({ titulo: 'X', tipoEvento: 'presencial' })

      expect(res.statusCode).toBe(400)
      expect(Array.isArray(res.body.errors)).toBe(true)
   })
})

describe('GET /api/eventos', () => {
   test('lista paginada (2 por página de 3)', async () => {
      const user = await createUser()
      for (let i = 0; i < 3; i++) {
         await createEvento(user.id, {
            titulo: `Listagem-${i}`,
            dataInicio: new Date(Date.now() + (i + 1) * emUmDia).toISOString(),
         })
      }

      const res = await request(app).get('/api/eventos?limit=2&page=1')

      expect(res.statusCode).toBe(200)
      expect(res.body.eventos).toHaveLength(2)
      expect(res.body.pagination.total).toBe(3)
      expect(res.body.pagination.totalPages).toBe(2)
   })

   test('filtro ?status=rascunho so mostra rascunho', async () => {
      const user = await createUser()
      await createEvento(user.id, { titulo: 'Meu-Rascunho', status: 'rascunho' })
      await createEvento(user.id, { titulo: 'Meu-Publicado' })

      const res = await request(app).get('/api/eventos?status=rascunho')

      expect(res.statusCode).toBe(200)
      expect(res.body.eventos).toHaveLength(1)
      expect(res.body.eventos[0].titulo).toBe('Meu-Rascunho')
   })

   test('busca por título (contains, sem acento na query)', async () => {
      const user = await createUser()
      await createEvento(user.id, { titulo: 'Semana de Inovacao Tech' })
      await createEvento(user.id, { titulo: 'Outro Titulo' })

      const res = await request(app).get('/api/eventos?busca=tech')

      expect(res.statusCode).toBe(200)
      expect(res.body.eventos.some((e) => e.titulo === 'Semana de Inovacao Tech')).toBe(true)
      expect(res.body.eventos.some((e) => e.titulo === 'Outro Titulo')).toBe(false)
   })
})

describe('GET /api/eventos/:id', () => {
   test('detalhe inclui organizador', async () => {
      const user = await createUser({ nome: 'Org Detalhe' })
      const evento = await createEvento(user.id)

      const res = await request(app).get(`/api/eventos/${evento.id}`)

      expect(res.statusCode).toBe(200)
      expect(res.body.evento.organizador.nome).toBe('Org Detalhe')
      expect(res.body.evento.id).toBe(evento.id)
   })

   test('id inexistente -> 404', async () => {
      const res = await request(app).get('/api/eventos/9999999')
      expect(res.statusCode).toBe(404)
      expect(res.body.error).toBe('Evento não encontrado')
   })
})

describe('PUT /api/eventos/:id', () => {
   test('nao-dono -> 403 "Sem permissão para editar este evento"', async () => {
      const owner = await createUser()
      const strang = await createUser()
      const evento = await createEvento(owner.id)

      const res = await request(app)
         .put(`/api/eventos/${evento.id}`)
         .set('Authorization', `Bearer ${tokenFor(strang)}`)
         .send({ titulo: 'Outra submissao' })

      expect(res.statusCode).toBe(403)
      expect(res.body.error).toBe('Sem permissão para editar este evento')
   })

   test('dono edita -> 200', async () => {
      const owner = await createUser()
      const evento = await createEvento(owner.id, { titulo: 'Antes' })

      const res = await request(app)
         .put(`/api/eventos/${evento.id}`)
         .set('Authorization', `Bearer ${tokenFor(owner)}`)
         .send({ titulo: 'Depois' })

      expect(res.statusCode).toBe(200)
      expect(res.body.evento.titulo).toBe('Depois')
   })

   test('admin edita evento alheio -> 200', async () => {
      const owner = await createUser()
      const admin = await createUser({ tipoUsuario: 'admin' })
      const evento = await createEvento(owner.id, { titulo: 'Original' })

      const res = await request(app)
         .put(`/api/eventos/${evento.id}`)
         .set('Authorization', `Bearer ${tokenFor(admin)}`)
         .send({ titulo: 'Editado pelo admin' })

      expect(res.statusCode).toBe(200)
      expect(res.body.evento.titulo).toBe('Editado pelo admin')
   })

   test('nao-admin nao publica -> 403', async () => {
      const owner = await createUser()
      const evento = await createEvento(owner.id, { status: 'rascunho' })

      const res = await request(app)
         .put(`/api/eventos/${evento.id}`)
         .set('Authorization', `Bearer ${tokenFor(owner)}`)
         .send({ status: 'publicado' })

      expect(res.statusCode).toBe(403)
      expect(res.body.error).toBe('Apenas administradores podem publicar eventos')
   })
})

describe('DELETE /api/eventos/:id', () => {
   test('nao-dono -> 403', async () => {
      const owner = await createUser()
      const other = await createUser()
      const evento = await createEvento(owner.id)

      const res = await request(app)
         .delete(`/api/eventos/${evento.id}`)
         .set('Authorization', `Bearer ${tokenFor(other)}`)

      expect(res.statusCode).toBe(403)
      expect(res.body.error).toBe('Sem permissão para deletar este evento')
   })

   test('dono sem inscricoes -> 200 e some da base', async () => {
      const owner = await createUser()
      const evento = await createEvento(owner.id)

      const res = await request(app)
         .delete(`/api/eventos/${evento.id}`)
         .set('Authorization', `Bearer ${tokenFor(owner)}`)

      expect(res.statusCode).toBe(200)
      expect(res.body.message).toBe('Evento deletado com sucesso')
      expect(await prisma.evento.findUnique({ where: { id: evento.id } })).toBeNull()
   })

   test('com inscricoes -> 400 e não deleta', async () => {
      const owner = await createUser()
      const user = await createUser()
      const evento = await createEvento(owner.id, { capacidadeMaxima: 5 })

      await request(app)
         .post('/api/inscricoes')
         .set('Authorization', `Bearer ${tokenFor(user)}`)
         .send({ eventoId: evento.id })

      const res = await request(app)
         .delete(`/api/eventos/${evento.id}`)
         .set('Authorization', `Bearer ${tokenFor(owner)}`)

      expect(res.statusCode).toBe(400)
      expect(res.body.error).toBe('Não é possível deletar evento com inscrições. Considere cancelá-lo.')
      expect(await prisma.evento.findUnique({ where: { id: evento.id } })).not.toBeNull()
   })
})
```

- [ ] **Step 3: Rodar e verificar**

```bash
npm test -- tests/eventos.test.js
```

Expected: PASS. Falhas = sinais de bug real ou incompatibilidade de rota: investigar antes de ajustar teste.

- [ ] **Step 4: Commit**

```bash
git add tests/factories.js tests/eventos.test.js
git commit -m "test: suíte de eventos (create/list/detail/update/delete + papéis)"
```

---

### Task 5: Suíte de inscrições

**Files:**
- Create: `tests/inscricoes.test.js`

**Interfaces:**
- Consumes: tudo de Task 3/4 (`createUser`, `tokenFor`, `createEvento`, `prisma`, `resetDb`, supertest).

- [ ] **Step 1: Criar `tests/inscricoes.test.js`**

```js
const request = require('supertest')
const app = require('../app')
const { prisma, resetDb } = require('./db')
const { createUser, tokenFor, createEvento } = require('./factories')

beforeEach(resetDb)

const emUmDia = 24 * 60 * 60 * 1000

const inscrever = async (user, eventoId) =>
   request(app)
      .post('/api/inscricoes')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ eventoId })

describe('POST /api/inscricoes', () => {
   test('201 confirmada, decrementa vagas e cria notificação', async () => {
      const org = await createUser()
      const user = await createUser()
      const evento = await createEvento(org.id, { capacidadeMaxima: 2 })

      const res = await inscrever(user, evento.id)

      expect(res.statusCode).toBe(201)
      expect(res.body.inscricao.statusInscricao).toBe('confirmada')

      const eventoDb = await prisma.evento.findUnique({ where: { id: evento.id } })
      expect(eventoDb.vagasDisponiveis).toBe(1)

      const notifs = await prisma.notificacao.findMany({ where: { usuarioId: user.id } })
      expect(notifs).toHaveLength(1)
      expect(notifs[0].tipo).toBe('confirmacao')
      expect(notifs[0].mensagem).toContain(evento.titulo)
   })

   test('evento gratuito -> statusPagamento "isento"; pago -> "pendente"', async () => {
      const org = await createUser()
      const user = await createUser()
      const gratuito = await createEvento(org.id, { valorInscricao: 0 })
      const pago = await createEvento(org.id, { valorInscricao: 50 })

      const resGratuito = await inscrever(user, gratuito.id)
      expect(resGratuito.body.inscricao.statusPagamento).toBe('isento')

      const user2 = await createUser()
      const resPago = await inscrever(user2, pago.id)
      expect(resPago.body.inscricao.statusPagamento).toBe('pendente')
   })

   test('duplicada -> 400 "Você já está inscrito neste evento"', async () => {
      const org = await createUser()
      const user = await createUser()
      const evento = await createEvento(org.id)

      await inscrever(user, evento.id)
      const res = await inscrever(user, evento.id)

      expect(res.statusCode).toBe(400)
      expect(res.body.error).toBe('Você já está inscrito neste evento')
   })

   test('evento rascunho -> 404 indisponível', async () => {
      const org = await createUser()
      const user = await createUser()
      const evento = await createEvento(org.id, { status: 'rascunho' })

      const res = await inscrever(user, evento.id)

      expect(res.statusCode).toBe(404)
      expect(res.body.error).toBe('Evento não encontrado ou não disponível para inscrição')
   })

   test('evento inexistente -> 404', async () => {
      const user = await createUser()
      const res = await inscrever(user, 9999999)

      expect(res.statusCode).toBe(404)
   })

   test('evento já iniciado -> 400 "eventos já iniciados"', async () => {
      const org = await createUser()
      const user = await createUser()
      const evento = await createEvento(org.id, {
         dataInicio: new Date(Date.now() - 2 * emUmDia).toISOString(),
         dataFim: new Date(Date.now() - emUmDia).toISOString(),
      })

      const res = await inscrever(user, evento.id)

      expect(res.statusCode).toBe(400)
      expect(res.body.error).toBe('Não é possível se inscrever em eventos já iniciados')
   })

   test('sem vagas -> 400 "Evento sem vagas disponíveis"', async () => {
      const org = await createUser()
      const user = await createUser()
      const evento = await createEvento(org.id, { capacidadeMaxima: 0 })

      const res = await inscrever(user, evento.id)

      expect(res.statusCode).toBe(400)
      expect(res.body.error).toBe('Evento sem vagas disponíveis')
   })
})

describe('GET /api/minhas-inscricoes', () => {
   test('retorna só inscrições do usuário autenticado', async () => {
      const org = await createUser()
      const userA = await createUser()
      const userB = await createUser()
      const evento = await createEvento(org.id)

      await inscrever(userA, evento.id)
      await inscrever(userB, evento.id)

      const res = await request(app)
         .get('/api/minhas-inscricoes')
         .set('Authorization', `Bearer ${tokenFor(userA)}`)

      expect(res.statusCode).toBe(200)
      expect(res.body.inscricoes).toHaveLength(1)
      expect(res.body.inscricoes[0].usuarioId).toBe(userA.id)
      expect(res.body.inscricoes[0].evento.titulo).toBe(evento.titulo)
   })
})

describe('DELETE /api/inscricoes/:id', () => {
   test('cancelamento devolve vaga, marca cancelada e notifica', async () => {
      const org = await createUser()
      const user = await createUser()
      const evento = await createEvento(org.id, { capacidadeMaxima: 2 })
      const inscricaoRes = await inscrever(user, evento.id)

      const res = await request(app)
         .delete(`/api/inscricoes/${inscricaoRes.body.inscricao.id}`)
         .set('Authorization', `Bearer ${tokenFor(user)}`)

      expect(res.statusCode).toBe(200)
      expect(res.body.message).toBe('Inscrição cancelada com sucesso')

      const eventoDb = await prisma.evento.findUnique({ where: { id: evento.id } })
      expect(eventoDb.vagasDisponiveis).toBe(2)

      const inscricaoDb = await prisma.inscricao.findUnique({
         where: { id: inscricaoRes.body.inscricao.id },
      })
      expect(inscricaoDb.statusInscricao).toBe('cancelada')

      const notifs = await prisma.notificacao.findMany({
         where: { usuarioId: user.id, tipo: 'cancelamento' },
      })
      expect(notifs).toHaveLength(1)
   })

   test('inscrição de outro usuário -> 404', async () => {
      const org = await createUser()
      const userA = await createUser()
      const userB = await createUser()
      const evento = await createEvento(org.id)
      const inscricaoRes = await inscrever(userA, evento.id)

      const res = await request(app)
         .delete(`/api/inscricoes/${inscricaoRes.body.inscricao.id}`)
         .set('Authorization', `Bearer ${tokenFor(userB)}`)

      expect(res.statusCode).toBe(404)
      expect(res.body.error).toBe('Inscrição não encontrada')
   })

   test('já cancelada -> 400 "Inscrição já cancelada"', async () => {
      const org = await createUser()
      const user = await createUser()
      const evento = await createEvento(org.id)
      const inscricaoRes = await inscrever(user, evento.id)

      await request(app)
         .delete(`/api/inscricoes/${inscricaoRes.body.inscricao.id}`)
         .set('Authorization', `Bearer ${tokenFor(user)}`)

      const res = await request(app)
         .delete(`/api/inscricoes/${inscricaoRes.body.inscricao.id}`)
         .set('Authorization', `Bearer ${tokenFor(user)}`)

      expect(res.statusCode).toBe(400)
      expect(res.body.error).toBe('Inscrição já cancelada')
   })
})

describe('PATCH /api/inscricoes/:id/presenca', () => {
   test('organizador confirma -> 200 presente true', async () => {
      const org = await createUser()
      const user = await createUser()
      const evento = await createEvento(org.id)
      const inscricaoRes = await inscrever(user, evento.id)

      const res = await request(app)
         .patch(`/api/inscricoes/${inscricaoRes.body.inscricao.id}/presenca`)
         .set('Authorization', `Bearer ${tokenFor(org)}`)

      expect(res.statusCode).toBe(200)
      expect(res.body.inscricao.presente).toBe(true)
      expect(res.body.message).toBe('Presença confirmada com sucesso')
   })

   test('participante estranho -> 403 "Sem permissão para confirmar presença"', async () => {
      const org = await createUser()
      const user = await createUser()
      const stranger = await createUser()
      const evento = await createEvento(org.id)
      const inscricaoRes = await inscrever(user, evento.id)

      const res = await request(app)
         .patch(`/api/inscricoes/${inscricaoRes.body.inscricao.id}/presenca`)
         .set('Authorization', `Bearer ${tokenFor(stranger)}`)

      expect(res.statusCode).toBe(403)
      expect(res.body.error).toBe('Sem permissão para confirmar presença')
   })
})
```

- [ ] **Step 2: Rodar e verificar**

```bash
npm test -- tests/inscricoes.test.js
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/inscricoes.test.js
git commit -m "test: suíte de inscrições (criar/listar/cancelar/presença)"
```

---

### Task 6: Suíte de permissões e middleware

**Files:**
- Create: `tests/permissoes.test.js`

**Interfaces:**
- Consumes: bindings como Tasks 3-5 + `jwt` direto para casos de token adulterado.

- [ ] **Step 1: Criar `tests/permissoes.test.js`**

```js
const request = require('supertest')
const jwt = require('jsonwebtoken')
const app = require('../app')
const { resetDb } = require('./db')
const { createUser, tokenFor } = require('./factories')

beforeEach(resetDb)

describe('middleware de autenticação', () => {
   test('sem token -> 401 "Token não fornecido"', async () => {
      const res = await request(app).get('/api/minhas-inscricoes')

      expect(res.statusCode).toBe(401)
      expect(res.body.error).toBe('Token não fornecido')
   })

   test('token malformado -> 401 "Token inválido ou expirado"', async () => {
      const res = await request(app)
         .get('/api/minhas-inscricoes')
         .set('Authorization', 'Bearer nao.e.jwt')

      expect(res.statusCode).toBe(401)
      expect(res.body.error).toBe('Token inválido ou expirado')
   })

   test('token assinado com segredo errado -> 401 (mesmo payload válido)', async () => {
      const user = await createUser()
      const fake = jwt.sign({ id: user.id, tipo: user.tipoUsuario }, 'secret-errado')

      const res = await request(app)
         .get('/api/minhas-inscricoes')
         .set('Authorization', `Bearer ${fake}`)

      expect(res.statusCode).toBe(401)
   })
})

describe('rotas de admin', () => {
   test('POST /api/categorias com participante -> 403 "Apenas administradores."', async () => {
      const user = await createUser()
      const res = await request(app)
         .post('/api/categorias')
         .set('Authorization', `Bearer ${tokenFor(user)}`)
         .send({ nome: 'Workshop' })

      expect(res.statusCode).toBe(403)
      expect(res.body.error).toBe('Acesso negado. Apenas administradores.')
   })

   test('POST /api/categorias com admin -> 201', async () => {
      const admin = await createUser({ tipoUsuario: 'admin' })
      const res = await request(app)
         .post('/api/categorias')
         .set('Authorization', `Bearer ${tokenFor(admin)}`)
         .send({ nome: 'Workshop' })

      expect(res.statusCode).toBe(201)
      expect(res.body.categoria.nome).toBe('Workshop')
   })

   test('GET /api/usuarios com participante -> 403', async () => {
      const user = await createUser()
      const res = await request(app)
         .get('/api/usuarios')
         .set('Authorization', `Bearer ${tokenFor(user)}`)

      expect(res.statusCode).toBe(403)
      expect(res.body.error).toBe('Acesso negado. Apenas administradores.')
   })

   test('GET /api/usuarios com admin -> 200 com lista', async () => {
      await createUser({ email: 'qualquer1@teste.com' })
      const admin = await createUser({ email: 'qualquer2@teste.com', tipoUsuario: 'admin' })
      const res = await request(app)
         .get('/api/usuarios')
         .set('Authorization', `Bearer ${tokenFor(admin)}`)

      expect(res.statusCode).toBe(200)
      expect(res.body.usuarios.length).toBeGreaterThanOrEqual(2)
      expect(res.body.pagination.total).toBeGreaterThanOrEqual(2)
   })

   test('admin promove participante e login emite novo token admin', async () => {
      const admin = await createUser({ tipoUsuario: 'admin' })
      const user = await createUser({ email: 'promover@teste.com' })

      const res = await request(app)
         .patch(`/api/usuarios/${user.id}/promover`)
         .set('Authorization', `Bearer ${tokenFor(admin)}`)

      expect(res.statusCode).toBe(200)
      expect(res.body.message).toBe('Usuário promovido a administrador')
      expect(res.body.user.tipoUsuario).toBe('admin')

      const login = await request(app)
         .post('/api/auth/login')
         .send({ email: 'promover@teste.com', senha: user.senhaPlano })

      expect(login.statusCode).toBe(200)
      const decoded = jwt.verify(login.body.token, process.env.JWT_SECRET)
      expect(decoded.tipo).toBe('admin')
   })
})
```

- [ ] **Step 2: Rodar e verificar**

```bash
npm test -- tests/permissoes.test.js
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/permissoes.test.js
git commit -m "test: suíte de permissões (auth middleware e rotas admin)"
```

---

### Task 7: Documentação (AGENTS.md) + suite completa

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Rodar suite completa**

```bash
npm test
```

Expected: ALL PASS (sanity + auth + eventos + inscricoes + permissoes). Nenhum skip esperado.

- [ ] **Step 2: Atualizar AGENTS.md**

Na seção "## Dev commands", adicionar:

```
- Tests: `npm test` (or `npm run test:watch`) on the host, with `docker compose up -d db` running. One-time: `docker compose exec db createdb -U postgres sistema_eventos_test` only needed when pgdata existed before (fresh volumes get it via `db/init-test-db.sql`). Tests use `.env.test` (DB `sistema_eventos_test`) and NEVER touch the dev DB. `NODE_ENV=test` disables rate limit and cache. Suites import `app.js` (supertest), not `server.js`.
```

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "docs: registra comandos de teste no AGENTS.md"
```

## Self-review (feito no writing-plans)

- Spec coverage: auth/eventos/inscricoes/permissoes cobertos; bypass de rate-limit/cache na Task 2; infra de banco dedicado na Task 1; docs na Task 7 (com painel de cobertura do spec em `specs/2026-10-07-suite-testes-design.md`).
- Nenhum step placeholder (TBD / "handle edge cases").
- Nomes consistentes entre tasks: `resetDb`, `prisma`, `createUser`, `tokenFor`, `eventoPayload`, `createEvento`, `inscrever`.
