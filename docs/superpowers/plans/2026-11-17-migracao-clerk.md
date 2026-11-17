# Migracao da autenticacao para o Clerk — Plano de Implementacao

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar a autenticacao propria (senha/Google/JWT) pelo Clerk: a API verifica o session token do Clerk, autoriza por `usuarios.clerk_user_id` + `tipoUsuario`/`ativo`, e recebe webhook do Clerk para ligar/criar/desativar contas.

**Architecture:** Adapter unico `services/clerkAuth.js` sobre `@clerk/backend` (verifyToken local com PEM, verifyWebhook/svix, users.getUser para o fallback). `authMiddleware` busca a conta por `clerk_user_id` e, no fallback, liga por e-mail ou cria `participante`. Webhook `POST /api/webhooks/clerk` idempotente via tabela `webhook_eventos`. Papel vem sempre do banco a cada request.

**Tech Stack:** Node 20 (CommonJS), Express 4, Prisma 5, `@clerk/backend@3.30.0`, Jest + supertest.

Spec: `docs/superpowers/specs/2026-11-17-migracao-clerk-design.md`

## Global Constraints

- Commits em portugues, estilo do repo (`auth:`, `webhook:`, `docs:`, `seed:`, `config:`). NUNCA dar push (`dev` protegida publica no RISC).
- Comentarios em portugues, no estilo dos arquivos existentes.
- Novas deps exigem refresh do volume `node_modules` (fim do plano: avisar o usuario; o comando esta no AGENTS.md).
- SDK v3 (confirmado em `npm view`): `verifyToken(token, { jwtKey?, secretKey?, authorizedParties? })` -> `Promise<JwtPayload|undefined>` (payload direto, sem wrapper `{data}`); `verifyWebhook(request: Request, { signingSecret? })` -> `WebhookEvent` (`evt.type`, `evt.data`, lancando em assinatura invalida); `createClerkClient({ secretKey }).users.getUser(id)` -> resource camelCase (`firstName`, `lastName`, `emailAddresses[].emailAddress/id`, `primaryEmailAddressId`, `imageUrl`).
- Webhook payload do Clerk (snake_case): `data.id`, `data.email_addresses[].{id,email_address}`, `data.primary_email_address_id`, `data.first_name`, `data.last_name`, `data.image_url`.
- `usuarios.senha/googleId/reset_*/token_version` ficam inertes nesta release (sem escrita); remocao definitiva e follow-up.
- Testes rodam no host com `docker compose -f docker-compose.yml up -d db` ativo; `npx jest --runInBand` (o `npm test` ja usa).
- Migracao no host precisa de `DATABASE_URL` inline (o `.env` local nao tem): `postgresql://postgres:postgres@localhost:5433/sistema_eventos?schema=public`.
- Nao usar bcrypt/jsonwebtoken/google-auth-library em codigo novo; remocao das deps so na Task 7 (seeds ainda usam bcrypt ate la).

---

### Task 1: Migração Prisma (`clerk_user_id` + `webhook_eventos`)

**Files:**
- Modify: `prisma/schema.prisma` (model Usuario + novo model WebhookEvento)
- Create: `prisma/migrations/<timestamp>_clerk_identidade/migration.sql` (gerado pelo Prisma)

**Interfaces:**
- Produces: `prisma.usuario` com campo `clerkUserId` (String?, unico) e `prisma.webhookEvento` com `id` (String, PK), `tipo`, `recebidoEm`. Tasks 3–6 usam exatamente esses nomes.

- [ ] **Step 1: Subir o banco de dev**

```bash
docker compose -f docker-compose.yml up -d db
```

- [ ] **Step 2: Editar `prisma/schema.prisma`**

No model `Usuario`, apos `tokenVersion`:

```prisma
  clerkUserId     String?   @unique @map("clerk_user_id") @db.VarChar(255)
```

Novo model no fim do arquivo:

```prisma
model WebhookEvento {
  id         String   @id @db.VarChar(255)
  tipo       String   @db.VarChar(100)
  recebidoEm DateTime @default(now()) @map("recebido_em") @db.Timestamp(6)

  @@map("webhook_eventos")
}
```

- [ ] **Step 3: Rodar a migração no host**

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/sistema_eventos?schema=public" npx prisma migrate dev --name clerk_identidade
```

Expected: migration criada, `prisma generate` executado. `npx prisma migrate status` limpo.

- [ ] **Step 4: Sanity**

```bash
npx jest tests/sanity.test.js
```

Expected: PASS (suite antiga intocada; schema aditivo).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "auth: migration clerk_user_id e webhook_eventos"
```

---

### Task 2: Adapter `services/clerkAuth.js` (+ `@clerk/backend`)

**Files:**
- Create: `services/clerkAuth.js`
- Create: `tests/clerkAuth.test.js`
- Modify: `package.json`/`package-lock.json` (instala `@clerk/backend`)

**Interfaces:**
- Produces (consumido pela Task 4 e Task 6):
  - `verificarSessionToken(token) -> Promise<{ userId: string, email?: string } | null>` (nunca lança; claim `email` minusculo quando presente).
  - `getUsuario(clerkUserId) -> Promise<{ email: string, nome: string|null, foto: string|null } | null>` (nunca lança).
  - `verificarWebhook(req) -> Promise<Evento>` onde `Evento = { id: string|null, tipo: 'usuario.criado'|'usuario.atualizado'|'usuario.removido'|'ignorado', clerkUserId: string|null, email: string|null, nome: string|null, foto: string|null }`; LANÇA em assinatura inválida. Lê `req.rawBody` (Buffer, montado na Task 6) e `req.headers`.
- Cliente Clerk criado com preguica (lazy): modulo importa sem exigir env no load (testes mockam o modulo inteiro).

- [ ] **Step 1: Instalar a dependência**

```bash
npm install @clerk/backend@3.30.0
```

- [ ] **Step 2: Smoke check dos exports CJS**

```bash
node -e "const m=require('@clerk/backend'); const w=require('@clerk/backend/webhooks'); console.log(!!m.createClerkClient, !!m.verifyToken, typeof w.verifyWebhook)"
```

Expected: `true true function`.

- [ ] **Step 3: Escrever o teste do adapter (falha primeiro)**

`tests/clerkAuth.test.js`:

```js
jest.mock('@clerk/backend')
jest.mock('@clerk/backend/webhooks')

const { verifyToken, createClerkClient } = require('@clerk/backend')
const { verifyWebhook } = require('@clerk/backend/webhooks')
const adapter = require('../services/clerkAuth')

describe('services/clerkAuth', () => {
  beforeEach(() => {
    process.env.CLERK_SECRET_KEY = 'sk_test_local'
    process.env.CLERK_WEBHOOK_SIGNING_SECRET = 'whsec_test_local'
    delete process.env.CLERK_JWT_KEY
    process.env.CLERK_AUTHORIZED_PARTIES = 'https://painel.teste'
    verifyToken.mockReset()
    verifyWebhook.mockReset()
    createClerkClient.mockReset()
  })

  test('token válido devolve { userId }', async () => {
    verifyToken.mockResolvedValue({ sub: 'user_1' })
    await expect(adapter.verificarSessionToken('tok')).resolves.toEqual({
      userId: 'user_1',
      email: undefined,
    })
    expect(verifyToken).toHaveBeenCalledWith(
      'tok',
      expect.objectContaining({ secretKey: 'sk_test_local', authorizedParties: ['https://painel.teste'] })
    )
  })

  test('usa CLERK_JWT_KEY quando presente', async () => {
    process.env.CLERK_JWT_KEY = '-----BEGIN PUBLIC KEY-----'
    verifyToken.mockResolvedValue({ sub: 'user_1' })
    await adapter.verificarSessionToken('tok')
    expect(verifyToken).toHaveBeenCalledWith(
      'tok',
      expect.objectContaining({ jwtKey: '-----BEGIN PUBLIC KEY-----' })
    )
    expect(verifyToken.mock.calls[0][1].secretKey).toBeUndefined()
  })

  test('claim email vai minusculo', async () => {
    verifyToken.mockResolvedValue({ sub: 'user_1', email: 'Fulano@Teste.COM' })
    await expect(adapter.verificarSessionToken('tok')).resolves.toEqual({
      userId: 'user_1',
      email: 'fulano@teste.com',
    })
  })

  test('verifyToken lancando -> null', async () => {
    verifyToken.mockRejectedValue(new Error('expirado'))
    await expect(adapter.verificarSessionToken('tok')).resolves.toBeNull()
  })

  test('payload sem sub -> null', async () => {
    verifyToken.mockResolvedValue(undefined)
    await expect(adapter.verificarSessionToken('tok')).resolves.toBeNull()
  })

  test('getUsuario devolve email/nome/foto do recurso', async () => {
    const getUser = jest.fn().mockResolvedValue({
      firstName: 'Fulano',
      lastName: 'da Silva',
      imageUrl: 'https://img.clerk.com/foto.png',
      primaryEmailAddressId: 'idn_2',
      emailAddresses: [
        { id: 'idn_1', emailAddress: 'Outro@Teste.com' },
        { id: 'idn_2', emailAddress: 'Fulano@Teste.com' },
      ],
    })
    createClerkClient.mockReturnValue({ users: { getUser } })

    await expect(adapter.getUsuario('user_1')).resolves.toEqual({
      email: 'fulano@teste.com',
      nome: 'Fulano da Silva',
      foto: 'https://img.clerk.com/foto.png',
    })
  })

  test('getUsuario com falha -> null (nunca lanca)', async () => {
    createClerkClient.mockReturnValue({ users: { getUser: jest.fn().mockRejectedValue(new Error('404')) } })
    await expect(adapter.getUsuario('user_x')).resolves.toBeNull()
  })

  test('getUsuario sem e-mail -> null', async () => {
    createClerkClient.mockReturnValue({
      users: { getUser: jest.fn().mockResolvedValue({ firstName: null, lastName: null, imageUrl: '', primaryEmailAddressId: null, emailAddresses: [] }) },
    })
    await expect(adapter.getUsuario('user_1')).resolves.toBeNull()
  })

  test('getUsuario trunca nome em 100 e foto maior que 255 vira null', async () => {
    createClerkClient.mockReturnValue({
      users: {
        getUser: jest.fn().mockResolvedValue({
          firstName: 'N'.repeat(120),
          lastName: null,
          imageUrl: 'https://x/' + 'a'.repeat(260),
          primaryEmailAddressId: 'idn_1',
          emailAddresses: [{ id: 'idn_1', emailAddress: 'a@b.com' }],
        }),
      },
    })
    const r = await adapter.getUsuario('user_1')
    expect(r.nome.length).toBe(100)
    expect(r.foto).toBeNull()
  })

  test('webhook user.created normaliza payload (email principal, nome, foto)', async () => {
    verifyWebhook.mockResolvedValue({
      type: 'user.created',
      data: {
        id: 'user_9',
        first_name: 'Maria',
        last_name: 'Silva',
        image_url: 'https://img.clerk.com/m.png',
        primary_email_address_id: 'idn_1',
        email_addresses: [{ id: 'idn_1', email_address: 'MARIA@Teste.com' }],
      },
    })

    const req = { headers: { 'svix-id': 'msg_1' }, rawBody: Buffer.from('{}') }
    await expect(adapter.verificarWebhook(req)).resolves.toEqual({
      id: 'user_9',
      tipo: 'usuario.criado',
      clerkUserId: 'user_9',
      email: 'maria@teste.com',
      nome: 'Maria Silva',
      foto: 'https://img.clerk.com/m.png',
    })
  })

  test('webhook user.updated mapeia tipo', async () => {
    verifyWebhook.mockResolvedValue({
      type: 'user.updated',
      data: { id: 'user_9', first_name: null, last_name: null, image_url: '', primary_email_address_id: 'idn_1', email_addresses: [{ id: 'idn_1', email_address: 'm@teste.com' }] },
    })
    const r = await adapter.verificarWebhook({ headers: {}, rawBody: Buffer.alloc(0) })
    expect(r.tipo).toBe('usuario.atualizado')
    expect(r.nome).toBeNull()
    expect(r.foto).toBeNull()
  })

  test('webhook user.deleted devolve só o id', async () => {
    verifyWebhook.mockResolvedValue({ type: 'user.deleted', data: { id: 'user_9', deleted: true } })
    const r = await adapter.verificarWebhook({ headers: {}, rawBody: Buffer.alloc(0) })
    expect(r).toEqual({ id: 'user_9', tipo: 'usuario.removido', clerkUserId: 'user_9', email: null, nome: null, foto: null })
  })

  test('webhook de outro evento -> tipo ignorado', async () => {
    verifyWebhook.mockResolvedValue({ type: 'session.created', data: { id: 'sess_1' } })
    const r = await adapter.verificarWebhook({ headers: {}, rawBody: Buffer.alloc(0) })
    expect(r.tipo).toBe('ignorado')
  })

  test('webhook com assinatura invalida LANCA', async () => {
    verifyWebhook.mockRejectedValue(new Error('invalid signature'))
    await expect(adapter.verificarWebhook({ headers: {}, rawBody: Buffer.alloc(0) })).rejects.toThrow()
  })
})
```

- [ ] **Step 4: Rodar e ver FALHAR**

```bash
npx jest tests/clerkAuth.test.js
```

Expected: FAIL (`adapter.verificarSessionToken is not a function` — arquivo nao existe).

- [ ] **Step 5: Implementar `services/clerkAuth.js`**

```js
const { createClerkClient, verifyToken } = require("@clerk/backend");
const { verifyWebhook } = require("@clerk/backend/webhooks");

const FOTO_MAX = 255;
const NOME_MAX = 100;

// Cliente criado com preguica: o modulo nao exige env no load (os testes
// mockam o modulo inteiro; em dev, faltar CLERK_SECRET_KEY so falha no uso).
let cliente = null;
const clienteClerk = () => {
  if (!cliente) {
    cliente = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  }
  return cliente;
};

const origensAutorizadas = () =>
  (process.env.CLERK_AUTHORIZED_PARTIES || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

const verificarSessionToken = async (token) => {
  const jwtKey = process.env.CLERK_JWT_KEY;

  let payload;
  try {
    payload = await verifyToken(token, {
      // Com a chave PEM a verificacao e local; sem ela, o SDK busca o JWKS
      // pela rede usando a CLERK_SECRET_KEY.
      ...(jwtKey ? { jwtKey } : { secretKey: process.env.CLERK_SECRET_KEY }),
      authorizedParties: origensAutorizadas(),
    });
  } catch (error) {
    return null;
  }

  if (!payload || typeof payload.sub !== "string" || !payload.sub) {
    return null;
  }
  const email =
    typeof payload.email === "string" ? payload.email.toLowerCase() : undefined;
  return { userId: payload.sub, email };
};

const getUsuario = async (clerkUserId) => {
  try {
    const u = await clienteClerk().users.getUser(clerkUserId);
    const primario =
      u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId) ||
      u.emailAddresses[0];
    if (!primario || !primario.emailAddress) return null;
    return {
      email: primario.emailAddress.toLowerCase(),
      nome: `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim().slice(0, NOME_MAX) || null,
      foto: u.imageUrl && u.imageUrl.length <= FOTO_MAX ? u.imageUrl : null,
    };
  } catch (error) {
    return null;
  }
};

const verificarWebhook = async (req) => {
  const cabecalhos = Object.entries(req.headers).flatMap(([k, v]) =>
    typeof v === "string" ? [[k, v]] : []
  );
  const request = new Request("http://localhost/api/webhooks/clerk", {
    method: "POST",
    headers: cabecalhos,
    body: req.rawBody ?? Buffer.alloc(0),
  });

  const evt = await verifyWebhook(request, {
    signingSecret: process.env.CLERK_WEBHOOK_SIGNING_SECRET,
  });

  if (evt.type === "user.created" || evt.type === "user.updated") {
    const primario =
      evt.data.email_addresses.find(
        (e) => e.id === evt.data.primary_email_address_id
      ) || evt.data.email_addresses[0];
    const nome =
      `${evt.data.first_name ?? ""} ${evt.data.last_name ?? ""}`
        .trim()
        .slice(0, NOME_MAX) || null;
    return {
      id: evt.data.id,
      tipo: evt.type === "user.created" ? "usuario.criado" : "usuario.atualizado",
      clerkUserId: evt.data.id,
      email: primario ? primario.email_address.toLowerCase() : null,
      nome,
      foto:
        evt.data.image_url && evt.data.image_url.length <= FOTO_MAX
          ? evt.data.image_url
          : null,
    };
  }

  if (evt.type === "user.deleted") {
    return {
      id: evt.data.id ?? null,
      tipo: "usuario.removido",
      clerkUserId: evt.data.id ?? null,
      email: null,
      nome: null,
      foto: null,
    };
  }

  return {
    id: evt.data.id ?? null,
    tipo: "ignorado",
    clerkUserId: null,
    email: null,
    nome: null,
    foto: null,
  };
};

module.exports = { verificarSessionToken, getUsuario, verificarWebhook };
```

- [ ] **Step 6: Rodar e ver PASSAR**

```bash
npx jest tests/clerkAuth.test.js
```

Expected: PASS (13 tests).

- [ ] **Step 7: Suite inteira continua verde**

```bash
npx jest --runInBand
```

Expected: PASS (suites antigas nao tocam no adapter).

- [ ] **Step 8: Commit**

```bash
git add services/clerkAuth.js tests/clerkAuth.test.js package.json package-lock.json
git commit -m "auth: adapter do Clerk (verifyToken, getUser e webhook)"
```

---

### Task 3: Validação de env no boot + `.env.test`

**Files:**
- Create: `config/env.js`
- Modify: `server.js:1-4` (após `dotenv`)
- Modify: `.env.test`, `.env.test.example` (acrescentar variáveis Clerk)
- Modify: `tests/sanity.test.js:5-9` (expectativa de env)

**Interfaces:**
- Produces: `require('./config/env').validarEnv()` — lança `Error("Variáveis de ambiente inválidas — …")` se faltar `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET` ou `CLERK_AUTHORIZED_PARTIES`, ou se produção usar `sk_test_`/origem não-https. `CLERK_JWT_KEY` é opcional. Chamada apenas em `server.js` (testes importam `app.js` direto, com fakes no `.env.test`).

- [ ] **Step 1: Escrever `config/env.js`**

```js
// Validação das variáveis de ambiente no boot: falhar no arranque é melhor
// que falhar na primeira request de produção (padrão fic_dev/padroes-servicos).
const OBRIGATORIAS = [
  "CLERK_SECRET_KEY",
  "CLERK_WEBHOOK_SIGNING_SECRET",
  "CLERK_AUTHORIZED_PARTIES",
];

const origens = () =>
  (process.env.CLERK_AUTHORIZED_PARTIES || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

const validarEnv = () => {
  const erros = [];

  for (const nome of OBRIGATORIAS) {
    if (!process.env[nome]) erros.push(`${nome}: obrigatória`);
  }

  if (process.env.NODE_ENV === "production") {
    if (process.env.CLERK_SECRET_KEY && !process.env.CLERK_SECRET_KEY.startsWith("sk_live_")) {
      erros.push(
        "CLERK_SECRET_KEY: em produção, use a chave da instância de PRODUÇÃO (sk_live_…)"
      );
    }
    if (origens().length === 0) {
      erros.push("CLERK_AUTHORIZED_PARTIES: obrigatória em produção (claim azp do token)");
    }
    for (const origem of origens()) {
      if (!origem.startsWith("https://")) {
        erros.push(`CLERK_AUTHORIZED_PARTIES: origem inválida "${origem}" (só https://)`);
      }
    }
  }

  if (erros.length > 0) {
    throw new Error(`Variáveis de ambiente inválidas — ${erros.join("; ")}`);
  }
};

module.exports = { validarEnv };
```

- [ ] **Step 2: Chamar no `server.js`**

Logo após `require('dotenv').config()`:

```js
const { validarEnv } = require('./config/env')
validarEnv()
```

- [ ] **Step 3: Acrescentar no `.env.test` e `.env.test.example`**

```
CLERK_SECRET_KEY=sk_test_local
CLERK_JWT_KEY=
CLERK_AUTHORIZED_PARTIES=https://painel.teste
CLERK_WEBHOOK_SIGNING_SECRET=whsec_test_local
```

(`.env.test.example` com os mesmos valores e comentário de uma linha.)

- [ ] **Step 4: Atualizar `tests/sanity.test.js`**

Substituir o primeiro test por:

```js
  test('env do .env.test carregado', () => {
    expect(process.env.NODE_ENV).toBe('test')
    expect(process.env.JWT_SECRET).toBe('test-secret')
    expect(process.env.CLERK_SECRET_KEY).toBe('sk_test_local')
    expect(process.env.CLERK_WEBHOOK_SIGNING_SECRET).toBe('whsec_test_local')
    expect(process.env.EMAIL_ENABLED).toBe('false')
  })
```

- [ ] **Step 5: Rodar sanity**

```bash
npx jest tests/sanity.test.js tests/app.test.js
```

Expected: PASS (o `app.js` NÃO valida env; validação só no `server.js`).

- [ ] **Step 6: Commit**

```bash
git add config/env.js server.js .env.test .env.test.example tests/sanity.test.js
git commit -m "config: validacao de env do Clerk no boot"
```

---

### Task 4: `authMiddleware` no Clerk + mock de teste + factories

**Files:**
- Modify: `middleware/auth.js` (reescrita)
- Create: `tests/clerkMock.js`
- Modify: `tests/factories.js` (clerkUserId, tokenFor opaco, registro no mock)
- Modify: `tests/permissoes.test.js` (describe "middleware de autenticação" + test de token após desativação)
- Modify: `tests/eventos.test.js:1`, `tests/inscricoes.test.js:1` (uma linha de `jest.mock` cada)

**Interfaces:**
- Consumes: `verificarSessionToken`/`getUsuario` de `services/clerkAuth` (Task 2).
- Produces (contrato usado por TODAS as tasks seguintes):
  - `authMiddleware` seta `req.userId` (Int) e `req.userType` (`'participante'|'organizador'|'admin'`) a partir da CONTA no banco; 401 sem Bearer/token inválido; 403 `"Esta conta não tem acesso"` para `ativo=false`, e-mail ligado a outro clerkUserId, ou falha do fallback; fallback liga conta por e-mail ou cria `participante`.
  - `tokenFor(user)` (tests/factories.js) devolve `clerk-test:<clerkUserId>` — token opaco reconhecido pelo mock.
  - `tests/clerkMock.js` exporta `{ mock }` com `__registry: Map<clerkUserId, { email, nome, foto }>`, `verificarSessionToken` (regex `^clerk-test:(.+)$`), `getUsuario` (consulta o registry), `verificarWebhook` (jest.fn, configurável pela Task 6).

- [ ] **Step 1: Criar `tests/clerkMock.js`**

```js
// Mock do adapter de Clerk para as suites HTTP: tokens "clerk-test:<id>" sao
// reconhecidos pelo verificarSessionToken e getUsuario responde pelo registry
// alimentado por tests/factories.js (nunca chamando o Clerk real).
const registry = new Map()

const mock = {
  __registry: registry,
  verificarSessionToken: jest.fn((token) => {
    const m = /^clerk-test:(.+)$/.exec(token || '')
    return m ? { userId: m[1] } : null
  }),
  getUsuario: jest.fn(async (id) => registry.get(id) ?? null),
  verificarWebhook: jest.fn(),
}

module.exports = { mock }
```

- [ ] **Step 2: Atualizar `tests/factories.js`**

Substituir imports e as funções `createUser`/`tokenFor` (manter `eventoPayload`/`createEvento` como estão; bcrypt fica até a Task 7 porque `senhaPlano` ainda é usada):

```js
const bcrypt = require('bcryptjs')
const { prisma } = require('./db')
const clerkMock = require('./clerkMock')

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
    googleId = null,
  } = overrides

  const clerkUserId =
    'clerkUserId' in overrides ? overrides.clerkUserId : `clerk_u_${counter}`

  const data = { nome, email, telefone, cpf, dataNascimento, tipoUsuario, ativo, googleId, clerkUserId }
  data.senha = senha === null ? null : await bcrypt.hash(senha, 10)

  const user = await prisma.usuario.create({ data })

  if (clerkUserId) {
    clerkMock.mock.__registry.set(clerkUserId, { email, nome, foto: null })
  }

  return { ...user, senhaPlano: senha }
}

function tokenFor(user) {
  return `clerk-test:${user.clerkUserId}`
}
```

- [ ] **Step 3: Reescrever `middleware/auth.js`**

```js
const prisma = require("../config/prisma");
const { verificarSessionToken, getUsuario } = require("../services/clerkAuth");

// O Clerk diz quem a pessoa e; o banco diz o que ela pode (clerk.md). O papel
// vem da conta A CADA request: promover/desativar tem efeito imediato.
const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Token não fornecido" });
  }

  const identidade = await verificarSessionToken(token);
  if (!identidade) {
    return res.status(401).json({ error: "Token inválido ou expirado" });
  }

  try {
    let usuario = await prisma.usuario.findUnique({
      where: { clerkUserId: identidade.userId },
    });

    // Fallback: token válido sem conta ligada (webhook atrasado/falho ou
    // conta anterior ao Clerk). O e-mail do claim evita ir à rede; sem ele,
    // busca o usuário no Clerk para achar o e-mail.
    if (!usuario) {
      const info = identidade.email
        ? { email: identidade.email, nome: null, foto: null }
        : await getUsuario(identidade.userId);

      if (!info) {
        return res.status(401).json({ error: "Token inválido ou expirado" });
      }

      const porEmail = await prisma.usuario.findUnique({
        where: { email: info.email },
      });

      if (porEmail && porEmail.clerkUserId && porEmail.clerkUserId !== identidade.userId) {
        return res.status(403).json({ error: "Esta conta não tem acesso" });
      }

      if (porEmail) {
        usuario = await prisma.usuario.update({
          where: { id: porEmail.id },
          data: {
            clerkUserId: identidade.userId,
            ...(porEmail.nome || !info.nome ? {} : { nome: info.nome }),
            ...(porEmail.fotoPerfil || !info.foto ? {} : { fotoPerfil: info.foto }),
            ultimoAcesso: new Date(),
          },
        });
      } else {
        usuario = await prisma.usuario.create({
          data: {
            nome: (info.nome || info.email.split("@")[0]).slice(0, 100),
            email: info.email,
            clerkUserId: identidade.userId,
            fotoPerfil: info.foto,
            tipoUsuario: "participante",
            ultimoAcesso: new Date(),
          },
        });
      }
    }

    if (!usuario.ativo) {
      return res.status(403).json({ error: "Esta conta não tem acesso" });
    }

    req.userId = usuario.id;
    req.userType = usuario.tipoUsuario;
    next();
  } catch (error) {
    next(error);
  }
};

const isOrganizador = (req, res, next) => {
  if (req.userType !== "organizador" && req.userType !== "admin") {
    return res
      .status(403)
      .json({
        error: "Acesso negado. Apenas organizadores e administradores.",
      });
  }
  next();
};

const isAdmin = (req, res, next) => {
  if (req.userType !== "admin") {
    return res
      .status(403)
      .json({ error: "Acesso negado. Apenas administradores." });
  }
  next();
};

module.exports = { authMiddleware, isOrganizador, isAdmin };
```

- [ ] **Step 4: Atualizar `tests/permissoes.test.js`**

Header do arquivo (remover `jwt`):

```js
const request = require('supertest')
const app = require('../app')
const { prisma, resetDb } = require('./db')
const { createUser, tokenFor } = require('./factories')
const clerkMock = require('./clerkMock')

jest.mock('../services/clerkAuth', () => require('./clerkMock').mock)

beforeEach(resetDb)
```

Substituir o describe `middleware de autenticação` inteiro por:

```js
describe('middleware de autenticação', () => {
  test('sem token -> 401 "Token não fornecido"', async () => {
    const res = await request(app).get('/api/minhas-inscricoes')

    expect(res.statusCode).toBe(401)
    expect(res.body.error).toBe('Token não fornecido')
  })

  test('token não reconhecido pelo adapter -> 401 "Token inválido ou expirado"', async () => {
    const res = await request(app)
      .get('/api/minhas-inscricoes')
      .set('Authorization', 'Bearer lixo-qualquer')

    expect(res.statusCode).toBe(401)
    expect(res.body.error).toBe('Token inválido ou expirado')
  })

  test('token válido autentica pelo clerk_user_id', async () => {
    const user = await createUser()
    const res = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    expect(res.statusCode).toBe(200)
    expect(res.body.user.email).toBe(user.email)
  })

  test('token válido sem conta ligada: fallback liga por e-mail', async () => {
    const user = await createUser({ clerkUserId: null })
    clerkMock.mock.__registry.set('clerk_fallback_1', {
      email: user.email,
      nome: user.nome,
      foto: null,
    })

    const res = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', 'Bearer clerk-test:clerk_fallback_1')

    expect(res.statusCode).toBe(200)
    const row = await prisma.usuario.findUnique({ where: { id: user.id } })
    expect(row.clerkUserId).toBe('clerk_fallback_1')
  })

  test('token válido sem conta: fallback cria participante', async () => {
    clerkMock.mock.__registry.set('clerk_novo_1', {
      email: 'novo@teste.com',
      nome: 'Nova Pessoa',
      foto: 'https://img.clerk.com/n.png',
    })

    const res = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', 'Bearer clerk-test:clerk_novo_1')

    expect(res.statusCode).toBe(200)
    const row = await prisma.usuario.findUnique({ where: { email: 'novo@teste.com' } })
    expect(row).toMatchObject({
      tipoUsuario: 'participante',
      clerkUserId: 'clerk_novo_1',
      nome: 'Nova Pessoa',
      fotoPerfil: 'https://img.clerk.com/n.png',
    })
  })

  test('e-mail já ligado a outro clerkUserId -> 403 "Esta conta não tem acesso"', async () => {
    const user = await createUser()
    await prisma.usuario.update({
      where: { id: user.id },
      data: { clerkUserId: 'clerk_outro' },
    })
    // tokenFor continua com o clerkUserId da criação; a conta agora aponta para outro.
    const res = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    expect(res.statusCode).toBe(403)
    expect(res.body.error).toBe('Esta conta não tem acesso')
  })

  test('getUsuario sem e-mail (usuário sumiu do Clerk) -> 401', async () => {
    const user = await createUser({ clerkUserId: null })
    clerkMock.mock.__registry.set('clerk_sumiu_1', null)

    const res = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', 'Bearer clerk-test:clerk_sumiu_1')

    expect(res.statusCode).toBe(401)
    expect(res.body.error).toBe('Token inválido ou expirado')
  })

  test('conta desativada (ativo=false) -> 403 "Esta conta não tem acesso"', async () => {
    const user = await createUser({ ativo: false })
    const res = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    expect(res.statusCode).toBe(403)
    expect(res.body.error).toBe('Esta conta não tem acesso')
  })
})
```

No describe `DELETE /api/usuarios/:id`, trocar o test `token já emitido fica inválido após desativação -> 401` por:

```js
  test('token válido de conta desativada -> 403 "Esta conta não tem acesso"', async () => {
    const admin = await createUser({ tipoUsuario: 'admin' })
    const alvo = await createUser()
    const tokenAlvo = tokenFor(alvo)

    await request(app)
      .delete(`/api/usuarios/${alvo.id}`)
      .set('Authorization', `Bearer ${tokenFor(admin)}`)

    const res = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${tokenAlvo}`)

    expect(res.statusCode).toBe(403)
    expect(res.body.error).toBe('Esta conta não tem acesso')
  })
```

(NÃO mexer ainda nos testes que esperam `tokenVersion` incrementada — o controller muda na Task 5.)

- [ ] **Step 5: Linha de mock nas demais suites HTTP**

Primeira linha de `tests/eventos.test.js` e de `tests/inscricoes.test.js`:

```js
jest.mock('../services/clerkAuth', () => require('./clerkMock').mock)
```

(`tests/app.test.js` não tem rota protegida: sem mock; o adapter real carrega inerte.)

- [ ] **Step 6: Suite inteira**

```bash
npx jest --runInBand
```

Expected: PASS. (`auth.test.js` de register/login continua passando: endpoints antigos ainda existem e `senhaPlano` continua hashada.)

- [ ] **Step 7: Commit**

```bash
git add middleware/auth.js tests/clerkMock.js tests/factories.js tests/permissoes.test.js tests/eventos.test.js tests/inscricoes.test.js
git commit -m "auth: middleware valida token do Clerk e autoriza pelo banco"
```

---

### Task 5: Endpoints de perfil (remove login/register/reset), controllers e Swagger

**Files:**
- Modify: `routes/index.js` (remove 5 rotas públicas de auth + `PATCH /auth/senha`; adiciona `PATCH /auth/profile`)
- Modify: `controllers/authController.js` (reescrito: `getProfile` + `atualizarProfile`)
- Modify: `controllers/usuariosController.js:172` (sem incremento de `tokenVersion`)
- Modify: `middleware/validators.js` (remove 5 validators + `registerValidator`; cria `atualizarProfileValidator`)
- Modify: `docs/swagger.routes.js` (remove blocos de auth mortos; documenta `PATCH /api/auth/profile`)
- Modify: `config/swagger.js` (descrição do bearerAuth)
- Modify: `tests/auth.test.js` (reescrito: perfil)
- Delete: `tests/google-auth.test.js`, `tests/password-reset.test.js`

**Interfaces:**
- Consumes: `authMiddleware` da Task 4 (`req.userId`).
- Produces:
  - `GET /api/auth/profile` -> `{ user: { id, nome, email, telefone, cpf, dataNascimento, fotoPerfil, tipoUsuario, dataCadastro, ultimoAcesso } }` (404 se conta sumiu; atualiza `ultimoAcesso`).
  - `PATCH /api/auth/profile` -> campos opcionais `nome` (≤100), `telefone` (≤20), `cpf` (≤14), `dataNascimento` (ISO8601), `fotoPerfil` (≤255); `email`/`tipoUsuario`/`ativo` fora do schema -> `400 { errors: [...] }`; CPF duplicado -> `400 { error: 'CPF já cadastrado' }`; 200 `{ message: 'Perfil atualizado com sucesso', user }`.
  - Erros de validator mantêm a convenção: `400 { errors: [...] }` (`express-validator`).

- [ ] **Step 1: Reescrever `controllers/authController.js`**

Arquivo inteiro:

```js
const prisma = require("../config/prisma");

const getProfile = async (req, res) => {
  try {
    const user = await prisma.usuario.update({
      where: { id: req.userId },
      data: { ultimoAcesso: new Date() },
      select: {
        id: true,
        nome: true,
        email: true,
        telefone: true,
        cpf: true,
        dataNascimento: true,
        fotoPerfil: true,
        tipoUsuario: true,
        dataCadastro: true,
        ultimoAcesso: true,
      },
    });

    res.json({ user });
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }
    console.error("Erro ao buscar perfil:", error);
    res.status(500).json({ error: "Erro ao buscar perfil" });
  }
};

const atualizarProfile = async (req, res) => {
  try {
    const dados = {};
    if (req.body.nome !== undefined) dados.nome = req.body.nome;
    if (req.body.telefone !== undefined) dados.telefone = req.body.telefone;
    if (req.body.cpf !== undefined) dados.cpf = req.body.cpf;
    if (req.body.dataNascimento !== undefined) {
      dados.dataNascimento = req.body.dataNascimento
        ? new Date(req.body.dataNascimento)
        : null;
    }
    if (req.body.fotoPerfil !== undefined) dados.fotoPerfil = req.body.fotoPerfil;

    const user = await prisma.usuario.update({
      where: { id: req.userId },
      data: dados,
      select: {
        id: true,
        nome: true,
        email: true,
        telefone: true,
        cpf: true,
        dataNascimento: true,
        fotoPerfil: true,
        tipoUsuario: true,
      },
    });

    res.json({ message: "Perfil atualizado com sucesso", user });
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(400).json({ error: "CPF já cadastrado" });
    }
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }
    console.error("Erro ao atualizar perfil:", error);
    res.status(500).json({ error: "Erro ao atualizar perfil" });
  }
};

module.exports = { getProfile, atualizarProfile };
```

- [ ] **Step 2: `middleware/validators.js`**

Remover `registerValidator`, `loginValidator`, `googleLoginValidator`, `alterarSenhaValidator`, `esqueciSenhaValidator`, `redefinirSenhaValidator` e acrescentar:

```js
const atualizarProfileValidator = [
  body("nome")
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("Nome deve ter até 100 caracteres"),
  body("telefone")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 20 })
    .withMessage("Telefone deve ter até 20 caracteres"),
  body("cpf")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 14 })
    .withMessage("CPF deve ter até 14 caracteres"),
  body("dataNascimento")
    .optional({ nullable: true })
    .isISO8601()
    .withMessage("Data de nascimento inválida"),
  body("fotoPerfil")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 255 })
    .withMessage("Foto deve ter até 255 caracteres"),
  validate,
];
```

Exports: `{ financiadoresValidator, eventoValidator, eventoUpdateValidator, inscricaoValidator, atualizarProfileValidator }` (o arquivo continua exportando o que as rotas restantes usam).

- [ ] **Step 3: `routes/index.js`**

Import de validators vira:

```js
const { financiadoresValidator, eventoValidator, eventoUpdateValidator, inscricaoValidator, atualizarProfileValidator } = require('../middleware/validators')
```

Remover do bloco público:

```js
router.post('/auth/register', ...)
router.post('/auth/login', ...)
router.post('/auth/google', ...)
router.post('/auth/esqueci-senha', ...)
router.post('/auth/redefinir-senha', ...)
```

Remover do bloco protegido `router.patch('/auth/senha', ...)` e adicionar:

```js
router.patch('/auth/profile', authMiddleware, atualizarProfileValidator, authController.atualizarProfile)
```

(`router.get('/auth/profile', authMiddleware, authController.getProfile)` permanece.)

- [ ] **Step 4: `controllers/usuariosController.js`**

Na linha do `update` de `desativarUsuario`:

```js
      await prisma.usuario.update({
         where: { id },
         data: { ativo: false },
      })
```

(`tokenVersion` deixa de ser incrementada; `ativo=false` já barra no middleware.)

- [ ] **Step 5: Reescrever `tests/auth.test.js`**

```js
const request = require('supertest')
const app = require('../app')
const { prisma, resetDb } = require('./db')
const { createUser } = require('./factories')

jest.mock('../services/clerkAuth', () => require('./clerkMock').mock)

beforeEach(resetDb)

describe('GET /api/auth/profile', () => {
  test('devolve o perfil da conta ligada', async () => {
    const user = await createUser({ telefone: '(65) 99999-1111' })
    const res = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer clerk-test:${user.clerkUserId}`)

    expect(res.statusCode).toBe(200)
    expect(res.body.user).toMatchObject({
      id: user.id,
      nome: user.nome,
      email: user.email,
      tipoUsuario: 'participante',
    })
    expect(res.body.user).not.toHaveProperty('senha')
    expect(res.body.user).not.toHaveProperty('clerkUserId')
  })

  test('atualiza ultimoAcesso', async () => {
    const user = await createUser()
    const res = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer clerk-test:${user.clerkUserId}`)

    expect(res.statusCode).toBe(200)
    const row = await prisma.usuario.findUnique({ where: { id: user.id } })
    expect(row.ultimoAcesso).not.toBeNull()
  })
})

describe('PATCH /api/auth/profile', () => {
  test('atualiza campos de perfil', async () => {
    const user = await createUser()
    const res = await request(app)
      .patch('/api/auth/profile')
      .set('Authorization', `Bearer clerk-test:${user.clerkUserId}`)
      .send({ nome: 'Novo Nome', telefone: '(65) 98888-2222', dataNascimento: '1990-05-10' })

    expect(res.statusCode).toBe(200)
    expect(res.body.user).toMatchObject({ nome: 'Novo Nome', telefone: '(65) 98888-2222' })
    const row = await prisma.usuario.findUnique({ where: { id: user.id } })
    expect(new Date(row.dataNascimento).toISOString().slice(0, 10)).toBe('1990-05-10')
  })

  test('cpf duplicado -> 400 "CPF já cadastrado"', async () => {
    await createUser({ cpf: '12345678900' })
    const user = await createUser()
    const res = await request(app)
      .patch('/api/auth/profile')
      .set('Authorization', `Bearer clerk-test:${user.clerkUserId}`)
      .send({ cpf: '12345678900' })

    expect(res.statusCode).toBe(400)
    expect(res.body.error).toBe('CPF já cadastrado')
  })

  test('payload invalido -> 400 com errors', async () => {
    const user = await createUser()
    const res = await request(app)
      .patch('/api/auth/profile')
      .set('Authorization', `Bearer clerk-test:${user.clerkUserId}`)
      .send({ nome: 'x'.repeat(101), dataNascimento: 'nao-e-data' })

    expect(res.statusCode).toBe(400)
    expect(Array.isArray(res.body.errors)).toBe(true)
  })

  test('nao altera email/tipoUsuario', async () => {
    const user = await createUser()
    const res = await request(app)
      .patch('/api/auth/profile')
      .set('Authorization', `Bearer clerk-test:${user.clerkUserId}`)
      .send({ email: 'injetado@teste.com', tipoUsuario: 'admin' })

    expect(res.statusCode).toBe(400)
    const row = await prisma.usuario.findUnique({ where: { id: user.id } })
    expect(row.email).toBe(user.email)
    expect(row.tipoUsuario).toBe('participante')
  })
})
```

(Nenhuma correção pendente: os dois tests de GET usam o token `clerk-test:` reconhecido pelo mock.)

- [ ] **Step 6: Remover suites mortas e ajustar `permissoes.test.js`**

```bash
git rm tests/google-auth.test.js tests/password-reset.test.js
```

Em `tests/permissoes.test.js`:

- No test "admin desativa participante", remover a expectativa de `tokenVersion` (manter só `ativo=false`).
- No test "segunda chamada é idempotente", trocar a verificação de `tokenVersion` por: a segunda chamada responde 200 "Usuário já está desativado" e `ativo` segue false.
- Trocar o test "admin promove participante e login emite novo token admin" por:

```js
  test('promoção tem efeito imediato (papel vem do banco, sem re-login)', async () => {
    const admin = await createUser({ tipoUsuario: 'admin' })
    const user = await createUser()

    const res = await request(app)
      .patch(`/api/usuarios/${user.id}/promover`)
      .set('Authorization', `Bearer ${tokenFor(admin)}`)

    expect(res.statusCode).toBe(200)
    expect(res.body.user.tipoUsuario).toBe('admin')

    const depois = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    expect(depois.statusCode).toBe(200)
    expect(depois.body.user.tipoUsuario).toBe('admin')
  })
```

- [ ] **Step 7: Swagger**

Em `docs/swagger.routes.js`:

- Remover os blocos `* /api/auth/register:`, `* /api/auth/login:`, `* /api/auth/google:`, `* /api/auth/senha:`, `* /api/auth/esqueci-senha:`, `* /api/auth/redefinir-senha:` (com seus responses).
- No bloco `* /api/auth/profile:` existente (GET), acrescentar o `patch` com os campos opcionais, respostas 200/400/404/401/403 e nota: "Clerk é a identidade; este endpoint só completa/edita o perfil (`nome`, `telefone`, `cpf`, `dataNascimento`, `fotoPerfil`). E-mail vem do Clerk."

Em `config/swagger.js`, descrição do `bearerAuth`:

```js
              description: 'Token de sessão do Clerk (Bearer). O frontend obtém via getToken() do Clerk e a API autoriza pela conta ligada ao clerk_user_id',
```

- [ ] **Step 8: Suite inteira**

```bash
npx jest --runInBand
```

Expected: PASS (inclui `tests/swagger.test.js` e `tests/deploy.test.js`; 26 paths no swagger, >20).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "auth: removidos login/senha proprios; perfil via PATCH /auth/profile"
```

---

### Task 6: Webhook `POST /api/webhooks/clerk`

**Files:**
- Create: `controllers/clerkWebhookController.js`
- Modify: `routes/index.js` (rota pública do webhook)
- Modify: `app.js` (`express.json({ verify })` para `req.rawBody`; `skip` do rate limit)
- Create: `tests/clerk-webhook.test.js`

**Interfaces:**
- Consumes: `verificarWebhook(req)` da Task 2 (lança em assinatura inválida), `prisma.webhookEvento` (Task 1).
- Produces: `POST /api/webhooks/clerk` (pública, fora do rate limit) -> 200 `{ processado: true }` | `{ processado: false, motivo: 'duplicado'|'sem-conta-correspondente'|'evento-ignorado'|'evento-invalido' }`; 401 `{ error: 'Assinatura do webhook inválida' }`; 500 `{ error: 'Erro ao processar webhook' }`.

- [ ] **Step 1: Escrever o teste (falha primeiro)**

`tests/clerk-webhook.test.js`:

```js
const request = require('supertest')
const app = require('../app')
const { prisma, resetDb } = require('./db')
const { createUser } = require('./factories')
const clerkMock = require('./clerkMock')

jest.mock('../services/clerkAuth', () => require('./clerkMock').mock)

beforeEach(async () => {
  await resetDb()
  clerkMock.mock.verificarWebhook.mockReset()
})

const postWebhook = (evento) =>
  request(app)
    .post('/api/webhooks/clerk')
    .set('svix-id', 'msg_1')
    .set('svix-timestamp', '1')
    .set('svix-signature', 'v1,x')
    .send({ tipo: evento.tipo })

describe('POST /api/webhooks/clerk', () => {
  test('assinatura inválida -> 401', async () => {
    clerkMock.mock.verificarWebhook.mockRejectedValue(new Error('invalid signature'))
    const res = await postWebhook({ tipo: 'usuario.criado' })

    expect(res.statusCode).toBe(401)
    expect(res.body.error).toBe('Assinatura do webhook inválida')
  })

  test('evento desconhecido -> 200 ignorado', async () => {
    clerkMock.mock.verificarWebhook.mockResolvedValue({
      id: 'msg_ign', tipo: 'ignorado', clerkUserId: null, email: null, nome: null, foto: null,
    })
    const res = await postWebhook({ tipo: 'ignorado' })

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ processado: false, motivo: 'evento-ignorado' })
  })

  test('user.created de e-mail novo cria participante', async () => {
    clerkMock.mock.verificarWebhook.mockResolvedValue({
      id: 'msg_1', tipo: 'usuario.criado', clerkUserId: 'clerk_w1',
      email: 'maria@teste.com', nome: 'Maria Silva', foto: 'https://img.clerk.com/m.png',
    })
    const res = await postWebhook({ tipo: 'usuario.criado' })

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ processado: true })
    const row = await prisma.usuario.findUnique({ where: { email: 'maria@teste.com' } })
    expect(row).toMatchObject({
      tipoUsuario: 'participante', clerkUserId: 'clerk_w1', nome: 'Maria Silva', ativo: true,
    })
    expect(row.fotoPerfil).toBe('https://img.clerk.com/m.png')
  })

  test('user.updated liga conta existente pelo e-mail (mantém papel/ativo)', async () => {
    const user = await createUser({ tipoUsuario: 'organizador', clerkUserId: null })
    clerkMock.mock.verificarWebhook.mockResolvedValue({
      id: 'msg_2', tipo: 'usuario.atualizado', clerkUserId: 'clerk_w2',
      email: user.email, nome: 'Nome Do Clerk', foto: null,
    })
    const res = await postWebhook({ tipo: 'usuario.atualizado' })

    expect(res.body).toEqual({ processado: true })
    const row = await prisma.usuario.findUnique({ where: { id: user.id } })
    expect(row.clerkUserId).toBe('clerk_w2')
    expect(row.tipoUsuario).toBe('organizador')
    expect(row.nome).toBe(user.nome)
  })

  test('updated não sobrescreve nome/foto já preenchidos', async () => {
    const user = await createUser()
    clerkMock.mock.verificarWebhook.mockResolvedValue({
      id: 'msg_3', tipo: 'usuario.atualizado', clerkUserId: user.clerkUserId,
      email: user.email, nome: 'Nome Do Clerk', foto: 'https://img.clerk.com/x.png',
    })
    await postWebhook({ tipo: 'usuario.atualizado' })

    const row = await prisma.usuario.findUnique({ where: { id: user.id } })
    expect(row.nome).toBe(user.nome)
    expect(row.fotoPerfil).toBeNull()
  })

  test('e-mail já ligado a outro clerkUserId -> ignora sem criar', async () => {
    const user = await createUser()
    const total = await prisma.usuario.count()
    clerkMock.mock.verificarWebhook.mockResolvedValue({
      id: 'msg_4', tipo: 'usuario.criado', clerkUserId: 'clerk_w4',
      email: user.email, nome: 'Invasor', foto: null,
    })
    const res = await postWebhook({ tipo: 'usuario.criado' })

    expect(res.body).toEqual({ processado: false, motivo: 'sem-conta-correspondente' })
    expect(await prisma.usuario.count()).toBe(total)
    const row = await prisma.usuario.findUnique({ where: { id: user.id } })
    expect(row.clerkUserId).toBe(user.clerkUserId)
  })

  test('user.created sem e-mail -> evento inválido', async () => {
    clerkMock.mock.verificarWebhook.mockResolvedValue({
      id: 'msg_5', tipo: 'usuario.criado', clerkUserId: 'clerk_w5',
      email: null, nome: null, foto: null,
    })
    const res = await postWebhook({ tipo: 'usuario.criado' })

    expect(res.body).toEqual({ processado: false, motivo: 'evento-invalido' })
  })

  test('user.deleted desativa e solta o vínculo; repetido -> duplicado', async () => {
    const user = await createUser()
    clerkMock.mock.verificarWebhook.mockResolvedValue({
      id: 'msg_6', tipo: 'usuario.removido', clerkUserId: user.clerkUserId,
      email: null, nome: null, foto: null,
    })

    const primeira = await postWebhook({ tipo: 'usuario.removido' })
    expect(primeira.body).toEqual({ processado: true })
    const row = await prisma.usuario.findUnique({ where: { id: user.id } })
    expect(row.ativo).toBe(false)
    expect(row.clerkUserId).toBeNull()

    clerkMock.mock.verificarWebhook.mockResolvedValue({
      id: 'msg_6', tipo: 'usuario.removido', clerkUserId: user.clerkUserId,
      email: null, nome: null, foto: null,
    })
    const segunda = await postWebhook({ tipo: 'usuario.removido' })
    expect(segunda.body).toEqual({ processado: false, motivo: 'duplicado' })
  })

  test('reenvio do MESMO evento de criação não duplica conta', async () => {
    clerkMock.mock.verificarWebhook.mockResolvedValue({
      id: 'msg_7', tipo: 'usuario.criado', clerkUserId: 'clerk_w7',
      email: 'dupla@teste.com', nome: 'Dupla', foto: null,
    })
    await postWebhook({ tipo: 'usuario.criado' })

    clerkMock.mock.verificarWebhook.mockResolvedValue({
      id: 'msg_7', tipo: 'usuario.criado', clerkUserId: 'clerk_w7',
      email: 'dupla@teste.com', nome: 'Dupla', foto: null,
    })
    const segunda = await postWebhook({ tipo: 'usuario.criado' })

    expect(segunda.body).toEqual({ processado: false, motivo: 'duplicado' })
    expect(await prisma.usuario.count({ where: { email: 'dupla@teste.com' } })).toBe(1)
  })
})
```

- [ ] **Step 2: Rodar e ver FALHAR**

```bash
npx jest tests/clerk-webhook.test.js
```

Expected: FAIL (404 — rota não existe).

- [ ] **Step 3: Implementar `controllers/clerkWebhookController.js`**

```js
const prisma = require("../config/prisma");
const { verificarWebhook } = require("../services/clerkAuth");

// O webhook é idempotente: o Clerk pode reenviar o mesmo evento e fora de
// ordem. Cada id é processado uma vez só (webhook_eventos) e cada efeito é
// seguro de repetir.
const aplicarEvento = async (evento) => {
  if (evento.tipo === "usuario.criado" || evento.tipo === "usuario.atualizado") {
    if (!evento.clerkUserId || !evento.email) {
      return { processado: false, motivo: "evento-invalido" };
    }

    const peloId = await prisma.usuario.findUnique({
      where: { clerkUserId: evento.clerkUserId },
    });
    if (peloId) return { processado: true };

    const porEmail = await prisma.usuario.findUnique({
      where: { email: evento.email },
    });

    if (porEmail && porEmail.clerkUserId && porEmail.clerkUserId !== evento.clerkUserId) {
      return { processado: false, motivo: "sem-conta-correspondente" };
    }

    if (porEmail) {
      await prisma.usuario.update({
        where: { id: porEmail.id },
        data: {
          clerkUserId: evento.clerkUserId,
          ...(porEmail.nome || !evento.nome ? {} : { nome: evento.nome }),
          ...(porEmail.fotoPerfil || !evento.foto ? {} : { fotoPerfil: evento.foto }),
        },
      });
      return { processado: true };
    }

    await prisma.usuario.create({
      data: {
        nome: (evento.nome || evento.email.split("@")[0]).slice(0, 100),
        email: evento.email,
        clerkUserId: evento.clerkUserId,
        fotoPerfil: evento.foto,
        tipoUsuario: "participante",
      },
    });
    return { processado: true };
  }

  if (evento.tipo === "usuario.removido") {
    if (!evento.clerkUserId) {
      return { processado: false, motivo: "evento-invalido" };
    }
    await prisma.usuario.updateMany({
      where: { clerkUserId: evento.clerkUserId },
      data: { ativo: false, clerkUserId: null },
    });
    return { processado: true };
  }

  return { processado: false, motivo: "evento-ignorado" };
};

const receber = async (req, res) => {
  let evento;
  try {
    evento = await verificarWebhook(req);
  } catch (error) {
    return res.status(401).json({ error: "Assinatura do webhook inválida" });
  }

  try {
    if (evento.id) {
      const visto = await prisma.webhookEvento.findUnique({
        where: { id: evento.id },
      });
      if (visto) {
        return res.json({ processado: false, motivo: "duplicado" });
      }
    }

    const resultado = await aplicarEvento(evento);

    // Marca como visto só DEPOIS de aplicar: se falhar, o reenvio do Clerk
    // processa de novo (efeitos idempotentes).
    if (evento.id) {
      await prisma.webhookEvento
        .create({ data: { id: evento.id, tipo: evento.tipo } })
        .catch(() => {});
    }

    return res.json(resultado);
  } catch (error) {
    console.error("Erro ao processar webhook do Clerk:", error);
    return res.status(500).json({ error: "Erro ao processar webhook" });
  }
};

module.exports = { receber };
```

- [ ] **Step 4: Rota e app.js**

Em `routes/index.js` (bloco público, antes das rotas de eventos):

```js
const clerkWebhookController = require('../controllers/clerkWebhookController')
...
router.post('/webhooks/clerk', clerkWebhookController.receber)
```

Em `app.js`, o `express.json()` vira:

```js
// rawBody para o webhook do Clerk (a verificação de assinatura usa o corpo cru).
app.use(express.json({
   verify: (req, res, buf) => {
      if (req.originalUrl.split('?')[0] === '/api/webhooks/clerk') {
         req.rawBody = buf
      }
   },
}))
```

E o limiter ganha `skip`:

```js
const limiter = rateLimit({
   windowMs: 3 * 60 * 1000,
   max: 100,
   // Callbacks do Clerk não podem ser estrangulados pelo limite por IP.
   skip: (req) => req.path === '/webhooks/clerk',
   message: 'Muitas requisições deste IP, tente novamente mais tarde.',
})
```

- [ ] **Step 5: Rodar e ver PASSAR**

```bash
npx jest tests/clerk-webhook.test.js
```

Expected: PASS (9 tests).

- [ ] **Step 6: Suite inteira**

```bash
npx jest --runInBand
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add controllers/clerkWebhookController.js routes/index.js app.js tests/clerk-webhook.test.js
git commit -m "webhook: sincronizacao de contas com o Clerk (created/updated/deleted)"
```

---

### Task 7: Seed sem senha, dependências, envs, docs

**Files:**
- Modify: `prisma/seeds/prod.js`, `prisma/seeds/dev.js` (sem bcrypt/senha; só `ADMIN_EMAIL`)
- Modify: `tests/factories.js` (sem bcrypt; sem `senhaPlano`)
- Modify: `.env.example`, `.env.test`, `.env.test.example`, `docker-compose.yml`
- Modify: `docs/swagger.routes.js` (nota sobre o webhook) — opcional
- Modify: `README.md`, `AGENTS.md`
- Modify: `tests/sanity.test.js` (remover expectativa de `JWT_SECRET`)
- Modify: `package.json`/`package-lock.json` (uninstall)

**Interfaces:**
- Produces: seed idempotente por e-mail que cria contas SEM senha (`tipoUsuario` correto); `.env` de dev/teste com `CLERK_*`; docs coerentes com o novo fluxo.

- [ ] **Step 1: Seed de produção**

`prisma/seeds/prod.js` inteiro:

```js
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
   console.log('🌱 Iniciando seed de produção...')

   const adminEmail = process.env.ADMIN_EMAIL
   if (!adminEmail) {
      throw new Error('ADMIN_EMAIL é obrigatório no seed de produção')
   }

   const categorias = [
      { nome: 'Ciência', cor: 'bg-green-600' },
      { nome: 'Tecnologia', cor: 'bg-blue-600' },
      { nome: 'Inovação', cor: 'bg-slate-700' },
   ]

   await prisma.categoria.createMany({
      data: categorias,
      skipDuplicates: true,
   })

   console.log('✅ Categorias criadas')

   // Conta do admin SEM senha: o Clerk é a identidade. Para entrar, o admin
   // cria/aceita conta no Clerk com o MESMO e-mail e o webhook (ou o
   // fallback) liga ao registro.
   await prisma.usuario.upsert({
      where: { email: adminEmail },
      create: {
         nome: 'Administrador',
         email: adminEmail,
         tipoUsuario: 'admin',
      },
      update: {},
   })

   console.log('✅ Conta do admin criada (ligue-a via Clerk, com o mesmo e-mail)')

   console.log('🎉 Seed de produção concluído com sucesso!')
}

main()
   .catch((e) => {
      console.error('❌ Erro no seed:', e)
      process.exit(1)
   })
   .finally(async () => {
      await prisma.$disconnect()
   })
```

- [ ] **Step 2: Seed de dev**

Em `prisma/seeds/dev.js`: remover o `require('bcryptjs')`, remover as exigências/uso de `ADMIN_PASSWORD` (validar só `ADMIN_EMAIL`) e, em CADA `prisma.usuario.create`, remover o campo `senha: ...`. O resto (eventos, inscrições, etc.) fica como está.

- [ ] **Step 3: `tests/factories.js` sem bcrypt**

Remover `require('bcryptjs')` e os campos `senha`/`senhaPlano` (nenhum test usa `senhaPlano` depois da Task 5):

```js
const { prisma } = require('./db')
const clerkMock = require('./clerkMock')

let counter = 0

async function createUser(overrides = {}) {
  counter += 1
  const {
    nome = `Usuario ${counter}`,
    email = `usuario${counter}@teste.com`,
    telefone = null,
    cpf = null,
    dataNascimento = null,
    tipoUsuario = 'participante',
    ativo = true,
    googleId = null,
  } = overrides

  const clerkUserId =
    'clerkUserId' in overrides ? overrides.clerkUserId : `clerk_u_${counter}`

  const data = { nome, email, telefone, cpf, dataNascimento, tipoUsuario, ativo, googleId, clerkUserId }

  const user = await prisma.usuario.create({ data })

  if (clerkUserId) {
    clerkMock.mock.__registry.set(clerkUserId, { email, nome, foto: null })
  }

  return user
}
```

(`tokenFor` e o resto como na Task 4.)

- [ ] **Step 4: Uninstall das deps mortas**

```bash
npm uninstall bcryptjs jsonwebtoken google-auth-library
npx jest --runInBand
```

Expected: PASS (nenhum require sobrou; confirmar com `grep -rn "bcryptjs\|jsonwebtoken\|google-auth" --exclude-dir=node_modules .`).

- [ ] **Step 5: Arquivos de env**

`.env.example` — remover `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `ADMIN_PASSWORD`; trocar o bloco por:

```
# Clerk (login): padrao fic_dev/padroes-servicos/clerk.md
CLERK_SECRET_KEY=sk_test_...
# PEM da JWT public key (API keys -> JWT public key); vazia = busca via rede
CLERK_JWT_KEY=
# Origem(ns) do painel, separada(s) por virgula (claim azp do token)
CLERK_AUTHORIZED_PARTIES=https://host-do-painel
CLERK_WEBHOOK_SIGNING_SECRET=whsec_...
```

`ADMIN_EMAIL` permanece (seed). `docker-compose.yml`: remover as linhas `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `ADMIN_PASSWORD` e acrescentar:

```yaml
      CLERK_SECRET_KEY: "${CLERK_SECRET_KEY:-}"
      CLERK_JWT_KEY: "${CLERK_JWT_KEY:-}"
      CLERK_AUTHORIZED_PARTIES: "${CLERK_AUTHORIZED_PARTIES:-http://localhost:3000}"
      CLERK_WEBHOOK_SIGNING_SECRET: "${CLERK_WEBHOOK_SIGNING_SECRET:-}"
```

`.env.test`/`.env.test.example`: remover `JWT_SECRET` (os fakes do Clerk já entraram na Task 3). Ajustar o comentário do `.env.test.example` se citar JWT.

- [ ] **Step 6: `tests/sanity.test.js`**

No primeiro test, remover a linha `expect(process.env.JWT_SECRET).toBe('test-secret')`.

```bash
npx jest tests/sanity.test.js
```

Expected: PASS.

- [ ] **Step 7: README.md**

- Seção "Backend / API"/config: trocar `JWT_SECRET`/`GOOGLE_CLIENT_ID`/`ADMIN_PASSWORD` por `CLERK_*` (mesmos nomes do `.env.example`); seed menciona só `ADMIN_EMAIL`.
- Auth: "Login pelo Clerk (padrão `fic_dev/padroes-servicos/clerk.md`): a API valida o session token (Bearer) e autoriza pela conta ligada por `clerk_user_id`; papel (`participante|organizador|admin`) e `ativo` são SEMPRE do banco. Participante entra por sign-up público; admin/organizador provisionados por e-mail (seed/convite no dashboard do Clerk)."
- Webhook: "Configurar no dashboard do Clerk: `POST https://<api>/api/webhooks/clerk`, eventos `user.created`, `user.updated`, `user.deleted`."

- [ ] **Step 8: AGENTS.md**

Atualizar as linhas que descrevem o sistema atual (a numeração real pode ter mudado):

- "Roles: `participante`, `organizador`, `admin`; register accepts client-supplied `tipoUsuario`." -> "Identidade = Clerk; autorização = `usuarios.tipoUsuario`/`ativo` lidos do banco a cada request; sign-up público cria `participante` (nunca papel elevado)."
- "`middleware/auth.js` — `authMiddleware` verifies JWT …" -> "`middleware/auth.js` — `authMiddleware` verifica o session token do Clerk (`services/clerkAuth.js`), busca a conta por `clerk_user_id` (fallback: liga por e-mail via `getUser` ou cria `participante`); `isOrganizador`, `isAdmin`."
- Segredos do Conecte-se: `DATABASE_URL/JWT_SECRET/POSTGRES_* + EMAIL_*` -> `DATABASE_URL/POSTGRES_* + CLERK_* + EMAIL_*`.
- Suites/testes: atualizar contagem com a saída real de `npx jest --runInBand` (depois do Step 9).
- Seed de produção no deploy: "cria o admin (e-mail/senha de ADMIN_EMAIL/ADMIN_PASSWORD…)" -> "cria a conta do admin por ADMIN_EMAIL; ligar via Clerk com o mesmo e-mail".

- [ ] **Step 9: Suite completa final**

```bash
npx jest --runInBand
```

Expected: PASS. Anotar o número de suites/tests para o AGENTS.md (Step 8).

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "auth: seed/env/docs no padrao Clerk; removidas deps de login proprio"
```

- [ ] **Step 11: Avisar o usuário sobre o volume `node_modules`**

Dependência nova (`@clerk/backend`) só é visível dentro do container após o refresh documentado no AGENTS.md:

```bash
docker compose -f docker-compose.yml down && docker volume rm seciteci-eventos-backend_node_modules && docker compose -f docker-compose.yml up --build
```

---

## Verificação guiada (pós-execução)

1. `npx jest --runInBand` — todas as suites verdes.
2. `docker compose -f docker-compose.yml up --build` (após refresh do volume) — API sobe com envs Clerk de dev; `/health` OK.
3. Com uma instância Development do Clerk (quando existir): sign-up de participante -> `GET /api/auth/profile` 200 (conta criada pelo fallback/webhook); admin promovido no banco -> efeito imediato; conta desativada -> 403 "Esta conta não tem acesso".
4. Webhook: no dashboard do Clerk, endpoint `https://<api>/api/webhooks/clerk` com os 3 eventos; teste "Signing secret" inválido -> 401.

## Riscos

- Migration é aditiva: rollback de imagem continua funcionando; reverter dados = `UPDATE usuarios SET clerk_user_id = NULL`.
- Sem instância Clerk configurada, a validação de ponta a ponta fica para o deploy/homologação (testes cobrem com mock).
