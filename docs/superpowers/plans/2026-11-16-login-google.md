# Login via Google (ID token do frontend) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Autenticação via Google no backend: `POST /api/auth/google` recebe um ID token do frontend, valida com `google-auth-library`, cria/vincula o usuário e devolve o JWT próprio da API.

**Architecture:** Novo `services/googleAuth.js` encapsula a verificação do ID token (audience `GOOGLE_CLIENT_ID`, lista separada por vírgula). `Usuario` ganha `googleId` único e `senha` nullable. O controller segue o padrão dos demais handlers (try/catch, resposta idêntica ao `login`).

**Tech Stack:** Node/Express, Prisma/Postgres, `google-auth-library`, Jest + Supertest.

**Spec:** `docs/superpowers/specs/2026-11-16-login-google-design.md`

## Global Constraints

- Mensagens de erro exatas da spec: `Token do Google inválido`, `Credenciais inválidas`, `Conta já vinculada a outro usuário Google`, `Conta sem senha definida. Use a redefinição de senha ou o login Google.`, `Erro ao fazer login com Google`.
- Erros de validação do `express-validator` retornam `400 { errors: [...] }` (convenção do repo — middleware `validate`).
- JWT idêntico ao login local: `{ id, tipo, v }`, expiresIn `7d`. Resposta `200 { token, user: { id, nome, email, tipoUsuario } }`.
- Contas Google: `senha: null`, `tipoUsuario: "participante"`, `googleId = payload.sub`.
- `fotoPerfil` (VarChar(255)): grava `picture` só se `picture.length <= 255`; senão `null`/mantém.
- Vínculo automático só com `email_verified === true`.
- Testes NUNCA chamam o Google real: `jest.mock('../services/googleAuth')`.
- Testes rodam no host (`npx jest --runInBand`) com `docker compose -f docker-compose.yml up -d db` ativo; sempre `-f docker-compose.yml`.
- Sem comentários no código (regra do AGENTS.md).

---

### Task 1: Dependência, schema e migração

**Files:**
- Modify: `package.json` (via npm install)
- Modify: `prisma/schema.prisma:10-34` (model Usuario)

**Interfaces:**
- Produces: `Usuario.googleId (String?, unique)` e `Usuario.senha (String?)` disponíveis no Prisma Client; migration aplicada no banco dev.

- [ ] **Step 1: Subir o banco dev e instalar a dependência**

```bash
docker compose -f docker-compose.yml up -d db
npm install google-auth-library
```

Expected: `google-auth-library` aparece em `dependencies` no `package.json`.

- [ ] **Step 2: Editar `prisma/schema.prisma` (model Usuario)**

Trocar as duas linhas:

```prisma
  senha           String    @db.VarChar(255)
```

por:

```prisma
  senha           String?   @db.VarChar(255)
  googleId        String?   @unique @map("google_id") @db.VarChar(255)
```

(deixar `googleId` junto dos demais campos escalares, após `senha`)

- [ ] **Step 3: Criar e aplicar a migração**

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/sistema_eventos?schema=public" npx prisma migrate dev --name login_google
```

Expected: pasta `prisma/migrations/<timestamp>_login_google/migration.sql` criada com `ALTER TABLE "usuarios" ALTER COLUMN "senha" DROP NOT NULL;` e a criação de `google_id` + índice único. Se o SQL gerado divergir disso, editar o arquivo da migração manualmente.

- [ ] **Step 4: Verificar o estado**

```bash
docker compose -f docker-compose.yml exec db psql -U postgres -d sistema_eventos -c "\d usuarios" | grep -E "senha|google_id"
```

Expected: `senha character varying(255)` (sem "not null") e `google_id character varying(255)`.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json prisma/schema.prisma prisma/migrations/*_login_google
git commit -m "auth: schema para login Google (googleId, senha nullable)"
```

---

### Task 2: Serviço de verificação do ID token

**Files:**
- Create: `services/googleAuth.js`

**Interfaces:**
- Produces: `verifyGoogleIdToken(idToken) -> Promise<payload>` onde payload contém `sub, email, email_verified, name, picture`. Lança `Error` em token inválido ou `GOOGLE_CLIENT_ID` ausente. (Task 3 consome; testes fazem `jest.mock` deste módulo.)

- [ ] **Step 1: Criar `services/googleAuth.js`**

```js
const { OAuth2Client } = require("google-auth-library");

const client = new OAuth2Client();

const audientes = () =>
  (process.env.GOOGLE_CLIENT_ID || "")
    .split(",")
    .map((valor) => valor.trim())
    .filter(Boolean);

const verifyGoogleIdToken = async (idToken) => {
  const audience = audientes();
  if (audience.length === 0) {
    throw new Error("GOOGLE_CLIENT_ID não configurado");
  }

  const ticket = await client.verifyIdToken({ idToken, audience });
  return ticket.getPayload();
};

module.exports = { verifyGoogleIdToken };
```

- [ ] **Step 2: Smoke check do require**

```bash
node -e "require('./services/googleAuth'); console.log('ok')"
```

Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add services/googleAuth.js
git commit -m "auth: servico de verificacao do ID token do Google"
```

---

### Task 3: Endpoint POST /api/auth/google (TDD)

**Files:**
- Modify: `middleware/validators.js` (novo `googleLoginValidator`)
- Modify: `tests/factories.js:7-27` (criar usuário sem senha / com `googleId`)
- Create: `tests/google-auth.test.js`
- Modify: `controllers/authController.js` (novo `googleLogin`)
- Modify: `routes/index.js:17-23` (rota pública + import do validator)

**Interfaces:**
- Consumes: `verifyGoogleIdToken` (Task 2), `Usuario.googleId` (Task 1).
- Produces: `POST /api/auth/google` → `200 { token, user }`; erros conforme spec. `googleLoginValidator` exportado de `middleware/validators.js`. `createUser({ googleId, senha: null })` suportado nos factories.

- [ ] **Step 1: Ajustar `tests/factories.js` (usuário sem senha e com googleId)**

Substituir o corpo de `createUser` por:

```js
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

  const data = { nome, email, telefone, cpf, dataNascimento, tipoUsuario, ativo, googleId }
  data.senha = senha === null ? null : await bcrypt.hash(senha, 10)

  const user = await prisma.usuario.create({ data })

  return { ...user, senhaPlano: senha }
}
```

- [ ] **Step 2: Adicionar `googleLoginValidator` em `middleware/validators.js`**

Logo após `loginValidator`:

```js
const googleLoginValidator = [
  body("idToken")
    .isString()
    .bail()
    .trim()
    .notEmpty()
    .withMessage("idToken é obrigatório"),
  validate,
];
```

E adicionar `googleLoginValidator` ao `module.exports` (lista final do arquivo).

- [ ] **Step 3: Escrever os testes falhando — `tests/google-auth.test.js`**

```js
const request = require('supertest')
const jwt = require('jsonwebtoken')
const app = require('../app')
const { prisma, resetDb } = require('./db')
const { createUser, tokenFor } = require('./factories')

jest.mock('../services/googleAuth')

const { verifyGoogleIdToken } = require('../services/googleAuth')

const payloadGoogle = (overrides = {}) => ({
  sub: 'google-sub-123',
  email: 'google@teste.com',
  email_verified: true,
  name: 'Usuário Google',
  picture: 'https://lh3.googleusercontent.com/a/abc123',
  ...overrides,
})

const mockOk = (payload = payloadGoogle()) =>
  verifyGoogleIdToken.mockResolvedValue(payload)
const mockErro = () =>
  verifyGoogleIdToken.mockRejectedValue(new Error('Token inválido'))

beforeEach(() => {
  jest.clearAllMocks()
  return resetDb()
})

describe('POST /api/auth/google', () => {
  test('400 sem idToken', async () => {
    const res = await request(app).post('/api/auth/google').send({})

    expect(res.statusCode).toBe(400)
    expect(res.body.errors[0].msg).toBe('idToken é obrigatório')
    expect(verifyGoogleIdToken).not.toHaveBeenCalled()
  })

  test('401 quando o token do Google é invalido', async () => {
    mockErro()
    const res = await request(app)
      .post('/api/auth/google')
      .send({ idToken: 'token-lixo' })

    expect(res.statusCode).toBe(401)
    expect(res.body.error).toBe('Token do Google inválido')
  })

  test('401 quando o e-mail do Google nao esta verificado', async () => {
    mockOk(payloadGoogle({ email_verified: false }))
    const res = await request(app)
      .post('/api/auth/google')
      .send({ idToken: 'token-lixo' })

    expect(res.statusCode).toBe(401)
    expect(res.body.error).toBe('Token do Google inválido')
  })

  test('cria usuario novo participante com senha nula', async () => {
    mockOk()
    const res = await request(app)
      .post('/api/auth/google')
      .send({ idToken: 'token-lixo' })

    expect(res.statusCode).toBe(200)
    expect(res.body.user).toMatchObject({
      nome: 'Usuário Google',
      email: 'google@teste.com',
      tipoUsuario: 'participante',
    })
    expect(res.body.user.senha).toBeUndefined()
    expect(res.body.token).toBeTruthy()

    const user = await prisma.usuario.findUnique({ where: { email: 'google@teste.com' } })
    expect(user.senha).toBeNull()
    expect(user.googleId).toBe('google-sub-123')
    expect(user.fotoPerfil).toBe('https://lh3.googleusercontent.com/a/abc123')
    expect(user.ultimoAcesso).toBeTruthy()

    const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET)
    expect(decoded.id).toBe(user.id)
    expect(decoded.tipo).toBe('participante')
    expect(decoded.v).toBe(user.tokenVersion)
  })

  test('vincula conta local existente pelo e-mail', async () => {
    const local = await createUser({
      email: 'google@teste.com',
      nome: 'Conta Local',
      senha: 'senha123',
    })

    mockOk()
    const res = await request(app)
      .post('/api/auth/google')
      .send({ idToken: 'token-lixo' })

    expect(res.statusCode).toBe(200)
    expect(res.body.user.id).toBe(local.id)

    const user = await prisma.usuario.findUnique({ where: { id: local.id } })
    expect(user.googleId).toBe('google-sub-123')
    expect(user.senha).not.toBeNull()
  })

  test('segundo login pelo mesmo Google nao duplica usuario', async () => {
    mockOk()
    await request(app).post('/api/auth/google').send({ idToken: 'a' })
    const res = await request(app).post('/api/auth/google').send({ idToken: 'a' })

    expect(res.statusCode).toBe(200)
    const total = await prisma.usuario.count({ where: { email: 'google@teste.com' } })
    expect(total).toBe(1)
  })

  test('401 para conta desativada', async () => {
    await createUser({
      email: 'google@teste.com',
      googleId: 'google-sub-123',
      ativo: false,
    })

    mockOk()
    const res = await request(app)
      .post('/api/auth/google')
      .send({ idToken: 'token-lixo' })

    expect(res.statusCode).toBe(401)
    expect(res.body.error).toBe('Credenciais inválidas')
  })

  test('409 quando o e-mail ja esta vinculado a outro googleId', async () => {
    await createUser({
      email: 'google@teste.com',
      googleId: 'outro-sub-456',
    })

    mockOk()
    const res = await request(app)
      .post('/api/auth/google')
      .send({ idToken: 'token-lixo' })

    expect(res.statusCode).toBe(409)
    expect(res.body.error).toBe('Conta já vinculada a outro usuário Google')
  })

  test('login por senha em conta Google retorna 401', async () => {
    await createUser({
      email: 'google@teste.com',
      googleId: 'google-sub-123',
      senha: null,
    })

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'google@teste.com', senha: 'qualquer' })

    expect(res.statusCode).toBe(401)
    expect(res.body.error).toBe('Credenciais inválidas')
  })
})
```

- [ ] **Step 4: Rodar os testes e confirmar a falha**

```bash
docker compose -f docker-compose.yml up -d db && npx jest tests/google-auth.test.js --runInBand
```

Expected: FAIL — rota `/api/auth/google` não existe (404) nos casos de endpoint; `googleId`/`senha: null` nos factories falham no Prisma (campo desconhecido), etc.

- [ ] **Step 5: Implementar `googleLogin` em `controllers/authController.js`**

Adicionar o import no topo:

```js
const { verifyGoogleIdToken } = require("../services/googleAuth");
```

Adicionar a função (antes do `module.exports`):

```js
const googleLogin = async (req, res) => {
  try {
    const { idToken } = req.body;

    let payload;
    try {
      payload = await verifyGoogleIdToken(idToken);
    } catch (error) {
      console.error("Token do Google inválido:", error.message);
      return res.status(401).json({ error: "Token do Google inválido" });
    }

    const {
      sub,
      email,
      email_verified: emailVerified,
      name,
      picture,
    } = payload;

    if (!sub || !email || emailVerified !== true) {
      return res.status(401).json({ error: "Token do Google inválido" });
    }

    const fotoGoogle = picture && picture.length <= 255 ? picture : null;

    let user = await prisma.usuario.findUnique({ where: { googleId: sub } });

    if (user) {
      if (!user.ativo) {
        return res.status(401).json({ error: "Credenciais inválidas" });
      }
      user = await prisma.usuario.update({
        where: { id: user.id },
        data: { ultimoAcesso: new Date() },
      });
    } else {
      const porEmail = await prisma.usuario.findUnique({ where: { email } });

      if (porEmail && porEmail.googleId && porEmail.googleId !== sub) {
        return res
          .status(409)
          .json({ error: "Conta já vinculada a outro usuário Google" });
      }

      if (porEmail) {
        if (!porEmail.ativo) {
          return res.status(401).json({ error: "Credenciais inválidas" });
        }
        user = await prisma.usuario.update({
          where: { id: porEmail.id },
          data: {
            googleId: sub,
            ultimoAcesso: new Date(),
            ...(porEmail.fotoPerfil ? {} : { fotoPerfil: fotoGoogle }),
          },
        });
      } else {
        user = await prisma.usuario.create({
          data: {
            nome: (name && name.trim()) || email.split("@")[0],
            email,
            senha: null,
            googleId: sub,
            fotoPerfil: fotoGoogle,
            tipoUsuario: "participante",
            ultimoAcesso: new Date(),
          },
        });
      }
    }

    const token = jwt.sign(
      { id: user.id, tipo: user.tipoUsuario, v: user.tokenVersion },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: {
        id: user.id,
        nome: user.nome,
        email: user.email,
        tipoUsuario: user.tipoUsuario,
      },
    });
  } catch (error) {
    console.error("Erro no login com Google:", error);
    res.status(500).json({ error: "Erro ao fazer login com Google" });
  }
};
```

Adicionar `googleLogin` ao `module.exports` final.

- [ ] **Step 6: Registrar a rota em `routes/index.js`**

No import de validators (linha 4), adicionar `googleLoginValidator`:

```js
const { registerValidator, loginValidator, googleLoginValidator, eventoValidator, ... } = require('../middleware/validators')
```

No bloco de rotas públicas, logo após `router.post('/auth/login', ...)` (linha 19):

```js
router.post('/auth/google', googleLoginValidator, authController.googleLogin)
```

- [ ] **Step 7: Rodar os testes e confirmar o passe**

```bash
npx jest tests/google-auth.test.js --runInBand
```

Expected: 9 testes PASS.

- [ ] **Step 8: Commit**

```bash
git add middleware/validators.js tests/factories.js tests/google-auth.test.js controllers/authController.js routes/index.js
git commit -m "auth: login via Google (ID token do frontend)"
```

---

### Task 4: Guardas de senha nula em login e alterarSenha (TDD)

**Files:**
- Modify: `controllers/authController.js:64-106` (login) e `:137-173` (alterarSenha)
- Test: `tests/google-auth.test.js`

**Interfaces:**
- Consumes: `createUser({ senha: null })` (Task 3).
- Produces: `POST /api/auth/login` com conta sem senha → `401 { error: 'Credenciais inválidas' }`; `PATCH /api/auth/senha` com conta sem senha → `400 { error: 'Conta sem senha definida. Use a redefinição de senha ou o login Google.' }`.

- [ ] **Step 1: Escrever os testes falhando (apêndice em `tests/google-auth.test.js`)**

```js
describe('conta Google nos fluxos de senha', () => {
  test('PATCH /api/auth/senha em conta sem senha -> 400', async () => {
    const user = await createUser({
      email: 'google@teste.com',
      googleId: 'google-sub-123',
      senha: null,
    })

    const res = await request(app)
      .patch('/api/auth/senha')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ senhaAtual: 'x', novaSenha: 'nova123' })

    expect(res.statusCode).toBe(400)
    expect(res.body.error).toBe(
      'Conta sem senha definida. Use a redefinição de senha ou o login Google.'
    )
  })
})
```

- [ ] **Step 2: Rodar e confirmar a falha**

```bash
npx jest tests/google-auth.test.js --runInBand
```

Expected: FAIL — `alterarSenha` não trata `senha` nula (`bcrypt.compare` com null → 401 "Senha atual incorreta" ou 500).

- [ ] **Step 3: Implementar as guardas em `controllers/authController.js`**

No `login`, logo após o `if (!user)` (linha ~72-74):

```js
    if (!user.senha) {
      return res.status(401).json({ error: "Credenciais inválidas" });
    }
```

No `alterarSenha`, logo após o `if (!user)` (linha ~145-147):

```js
    if (!user.senha) {
      return res
        .status(400)
        .json({
          error:
            "Conta sem senha definida. Use a redefinição de senha ou o login Google.",
        });
    }
```

- [ ] **Step 4: Rodar os testes e confirmar o passe**

```bash
npx jest tests/google-auth.test.js --runInBand
```

Expected: 10 testes PASS.

- [ ] **Step 5: Commit**

```bash
git add controllers/authController.js tests/google-auth.test.js
git commit -m "auth: guardas para contas Google sem senha (login e alterarSenha)"
```

---

### Task 5: Config e documentação

**Files:**
- Modify: `.env.example` (bloco Aplicacao)
- Modify: `docker-compose.yml:42-59` (environment do app)
- Modify: `docs/swagger.routes.js` (após o bloco de `/api/auth/login`)

**Interfaces:**
- Consumes: nada novo. Produces: `GOOGLE_CLIENT_ID` documentado localmente e no Swagger.

- [ ] **Step 1: `.env.example`**

No bloco Aplicacao, após `JWT_SECRET=troque-por-um-segredo-forte`:

```
# Login Google: ID(s) de cliente OAuth aceitos como audience do ID token
# (varios clientes: separar por virgula)
GOOGLE_CLIENT_ID=
```

- [ ] **Step 2: `docker-compose.yml`**

No `environment` do serviço `app`, após a linha `JWT_SECRET:`:

```yaml
      GOOGLE_CLIENT_ID: "${GOOGLE_CLIENT_ID:-}"
```

- [ ] **Step 3: Swagger em `docs/swagger.routes.js`**

Localizar o comentário `@swagger` de `/api/auth/login` (linhas 83-107) e inserir logo após o bloco de respostas dele:

```js
/**
 * @swagger
 * /api/auth/google:
 *   post:
 *     tags:
 *       - Autenticação
 *     summary: Fazer login com Google
 *     description: |
 *       Recebe o ID token do Google (Google Sign-In/One Tap), valida contra
 *       GOOGLE_CLIENT_ID e retorna o JWT da API (7 dias). Contas locais com
 *       o mesmo e-mail verificado são vinculadas automaticamente.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - idToken
 *             properties:
 *               idToken:
 *                 type: string
 *                 example: eyJhbGciOiJSUzI1NiIsImtpZCI6...
 *     responses:
 *       200:
 *         description: Login efetuado; retorna token e user
 *       400:
 *         description: idToken ausente
 *       401:
 *         description: Token do Google inválido ou conta desativada
 *       409:
 *         description: Conta já vinculada a outro usuário Google
 */
```

- [ ] **Step 4: Commit**

```bash
git add .env.example docker-compose.yml docs/swagger.routes.js
git commit -m "docs/config: GOOGLE_CLIENT_ID e documentacao de POST /api/auth/google"
```

---

### Task 6: Verificação final

- [ ] **Step 1: Suite completa**

```bash
npx jest --runInBand
```

Expected: todas as suites PASS (incluindo `deploy.test.js`, que valida o grafo runtime vs `.dockerignore` — a nova dependência `google-auth-library` está no `package.json`, então passa).

- [ ] **Step 2: Smoke do boot completo (opcional, requer refresh do volume)**

A dependência nova exige refresh do volume `node_modules` (regra do AGENTS.md):

```bash
docker compose -f docker-compose.yml down && docker volume rm seciteci-eventos-backend_node_modules && docker compose -f docker-compose.yml up --build -d
curl -s -X POST http://localhost:3030/api/auth/google -H 'Content-Type: application/json' -d '{}'
```

Expected: migração `login_google` aplicada no boot; curl → `400 { errors: [...] }` (rota montada e validador ativo). Com `GOOGLE_CLIENT_ID` vazio e idToken qualquer → `401 { error: 'Token do Google inválido' }`.

- [ ] **Step 3: Deploy (fora deste plano)**

- Adicionar `GOOGLE_CLIENT_ID` ao `APP_ENV` (File) dos escopos RISC e `conectese-api-prod` no GitLab — antes do primeiro push que contém este recurso.
