# Recuperação de Senha Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir redefinição de senha por e-mail com código de 6 dígitos, invalidando JWTs antigos.

**Architecture:** Dois endpoints públicos (`/api/auth/esqueci-senha`, `/api/auth/redefinir-senha`) persistem hash bcrypt + expiração em colunas novas de `Usuario`. Um `tokenVersion` no usuário é incluído no JWT e conferido (async) pelo `authMiddleware`, permitindo invalidar todas as sessões ao trocar/redefinir a senha.

**Tech Stack:** Node.js + Express, Prisma/PostgreSQL, bcryptjs, jsonwebtoken, nodemailer (via `services/emailService`), Jest + Supertest.

## Global Constraints

- JavaScript CommonJS, sem TypeScript. Entrypoint `server.js`; rotas em `routes/index.js`.
- Campos Prisma usam camelCase com `@map` para snake_case; `Time`/`Timestamp` seguem o padrão do schema.
- Senhas SEMPRE com `bcrypt.hash(valor, 10)`; nunca persistir código/senha em claro.
- Código de reset: 6 dígitos (`crypto.randomInt(0, 1000000).toString().padStart(6, '0')`), validade **15 minutos**, máximo **5 tentativas**.
- `/api/auth/esqueci-senha` responde **sempre** `200 { message: "Se o e-mail existir, enviaremos um código" }`.
- Quando `EMAIL_ENABLED=false`, o código só aparece no console do servidor.
- Erros inesperados: `500 { error: "..." }` + `console.error`.
- Testes: `npm test` no host com `docker compose up -d db` rodando. `tests/globalSetup.js` roda `prisma migrate deploy` no banco de teste.

---

### Task 1: Schema, `tokenVersion` e invalidação no middleware

**Files:**
- Modify: `prisma/schema.prisma` (modelo `Usuario`, após `ativo`)
- Create: `prisma/migrations/<timestamp>_add_password_reset/migration.sql` (gerada)
- Modify: `controllers/authController.js` (função `login`, ~linha 81)
- Modify: `middleware/auth.js`
- Modify: `tests/factories.js:29-33`
- Test: `tests/permissoes.test.js`

**Interfaces:**
- Consumes: `config/prisma.js` (client já existente).
- Produces: `Usuario.tokenVersion` (Int, default 0); JWT payload `{ id, tipo, v }`; `tokenFor(user)` assina com `v`; `authMiddleware` (async) rejeita token cujo `v` difere de `tokenVersion`.

- [ ] **Step 1: Adicionar campos ao schema**

Em `prisma/schema.prisma`, no model `Usuario`, logo após `ativo Boolean @default(true)`:

```prisma
  resetCodigo     String?   @map("reset_codigo") @db.VarChar(255)
  resetExpira     DateTime? @map("reset_expira") @db.Timestamp(6)
  resetTentativas Int       @default(0) @map("reset_tentativas")
  tokenVersion    Int       @default(0) @map("token_version")
```

- [ ] **Step 2: Gerar a migration e o Prisma Client**

Run:
```bash
docker compose up -d db
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/sistema_eventos?schema=public" npx prisma migrate dev --name add-password-reset
```

Esperado: cria `prisma/migrations/<timestamp>_add_password_reset/migration.sql` equivalente a:
```sql
ALTER TABLE "usuarios"
  ADD COLUMN "reset_codigo" VARCHAR(255),
  ADD COLUMN "reset_expira" TIMESTAMP(6),
  ADD COLUMN "reset_tentativas" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 0;
```
e regenera o client.

- [ ] **Step 3: Escrever o teste que falha (invalidação no middleware)**

Em `tests/permissoes.test.js`, troque o import do topo:

```js
const { prisma, resetDb } = require('./db')
```

Dentro do `describe('middleware de autenticação', ...)`, adicione:

```js
  test('token com tokenVersion desatualizado -> 401', async () => {
    const user = await createUser()
    const token = tokenFor(user)

    await prisma.usuario.update({
      where: { id: user.id },
      data: { tokenVersion: user.tokenVersion + 1 },
    })

    const res = await request(app)
      .get('/api/minhas-inscricoes')
      .set('Authorization', `Bearer ${token}`)

    expect(res.statusCode).toBe(401)
    expect(res.body.error).toBe('Token inválido ou expirado')
  })
```

- [ ] **Step 4: Rodar e verificar que falha**

Run: `npx jest tests/permissoes.test.js -t "tokenVersion desatualizado" --runInBand`
Esperado: FALHA — o token continua aceito (403/200 em vez de 401), pois o middleware ainda não confere.

- [ ] **Step 5: Atualizar `login` para assinar `v`**

Em `controllers/authController.js`, no `jwt.sign` do `login`:

```js
    const token = jwt.sign(
      { id: user.id, tipo: user.tipoUsuario, v: user.tokenVersion },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );
```

- [ ] **Step 6: Reescrever `authMiddleware` (async + checagem)**

`middleware/auth.js` completo:

```js
const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");

const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Token não fornecido" });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return res.status(401).json({ error: "Token inválido ou expirado" });
  }

  try {
    const user = await prisma.usuario.findUnique({
      where: { id: decoded.id },
      select: { tokenVersion: true },
    });

    // Tokens antigos (pré-deploy) não têm `v`; tratamos como 0 para não
    // deslogar todo mundo de uma vez. Reset/troca incrementam tokenVersion.
    if (!user || (decoded.v ?? 0) !== user.tokenVersion) {
      return res.status(401).json({ error: "Token inválido ou expirado" });
    }

    req.userId = decoded.id;
    req.userType = decoded.tipo;
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

- [ ] **Step 7: Atualizar `tokenFor` nas factories**

Em `tests/factories.js`:

```js
function tokenFor(user) {
  return jwt.sign(
    { id: user.id, tipo: user.tipoUsuario, v: user.tokenVersion ?? 0 },
    process.env.JWT_SECRET,
    { expiresIn: '1d' }
  )
}
```

- [ ] **Step 8: Rodar os testes**

Run: `npm test`
Esperado: todos os suites existentes PASSAM e o novo teste de invalidação PASSA.

- [ ] **Step 9: Commit**

```bash
git add prisma/schema.prisma prisma/migrations middleware/auth.js controllers/authController.js tests/factories.js tests/permissoes.test.js
git commit -m "feat(auth): tokenVersion no JWT e invalidacao de tokens no middleware"
```

---

### Task 2: Endpoint `/api/auth/esqueci-senha` + template de e-mail

**Files:**
- Create: `services/emailTemplates/resetSenha.js`
- Modify: `middleware/validators.js`
- Modify: `controllers/authController.js`
- Modify: `routes/index.js`
- Test: `tests/password-reset.test.js`

**Interfaces:**
- Consumes: `sendMailSafe`, `isEmailEnabled` de `services/emailService`; `prisma.usuario` com os campos da Task 1.
- Produces: `resetSenhaTemplate({ usuario, codigo }) → { subject, html, text }`; `authController.esqueciSenha`; `esqueciSenhaValidator`; rota `POST /api/auth/esqueci-senha`.

- [ ] **Step 1: Escrever os testes que falham**

Crie `tests/password-reset.test.js`:

```js
jest.mock('../services/emailService', () => ({
  sendMailSafe: jest.fn(),
  isEmailEnabled: jest.fn(() => true),
  sendEmail: jest.fn(),
  sendTemplatedEmail: jest.fn(),
}))

const request = require('supertest')
const app = require('../app')
const { prisma, resetDb } = require('./db')
const { createUser } = require('./factories')
const { sendMailSafe } = require('../services/emailService')

beforeEach(async () => {
  await resetDb()
  sendMailSafe.mockClear()
})

const capturarCodigo = () => {
  const template = sendMailSafe.mock.calls[0][1]
  return template.text.match(/\b\d{6}\b/)[0]
}

describe('POST /api/auth/esqueci-senha', () => {
  test('email existente -> 200 generico, codigo hasheado e e-mail disparado', async () => {
    const user = await createUser({ email: 'reset@teste.com' })

    const res = await request(app)
      .post('/api/auth/esqueci-senha')
      .send({ email: user.email })

    expect(res.statusCode).toBe(200)
    expect(res.body.message).toBe('Se o e-mail existir, enviaremos um código')

    const atualizado = await prisma.usuario.findUnique({ where: { id: user.id } })
    expect(atualizado.resetCodigo).toBeTruthy()
    expect(atualizado.resetCodigo).not.toHaveLength(6)
    expect(atualizado.resetExpira.getTime()).toBeGreaterThan(Date.now())
    expect(sendMailSafe).toHaveBeenCalledTimes(1)
  })

  test('email inexistente -> 200 generico e nada e enviado', async () => {
    const res = await request(app)
      .post('/api/auth/esqueci-senha')
      .send({ email: 'naoexiste@teste.com' })

    expect(res.statusCode).toBe(200)
    expect(res.body.message).toBe('Se o e-mail existir, enviaremos um código')
    expect(sendMailSafe).not.toHaveBeenCalled()
  })

  test('email invalido -> 400 com errors', async () => {
    const res = await request(app)
      .post('/api/auth/esqueci-senha')
      .send({ email: 'sem-arroba' })

    expect(res.statusCode).toBe(400)
    expect(Array.isArray(res.body.errors)).toBe(true)
  })
})
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `npx jest tests/password-reset.test.js --runInBand`
Esperado: FALHA (rota `/api/auth/esqueci-senha` responde 404).

- [ ] **Step 3: Criar o template `services/emailTemplates/resetSenha.js`**

```js
const resetSenhaTemplate = ({ usuario, codigo }) => {
   const subject = 'Redefinição de senha - CONECTE-SE'

   const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
         <h2 style="color: #2c3e50;">Ola, ${usuario.nome}!</h2>
         <p>Recebemos uma solicitacao para redefinir a senha da sua conta na plataforma CONECTE-SE.</p>
         <p style="color: #7f8c8d;">Seu codigo de verificacao e:</p>
         <p style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #2c3e50;">${codigo}</p>
         <p>Este codigo expira em <strong>15 minutos</strong>.</p>
         <p style="color: #7f8c8d; font-size: 12px;">Se voce nao solicitou a redefinicao, ignore este e-mail. Esta e uma mensagem automatica, nao responda.</p>
      </div>
   `

   const text = [
      `Ola, ${usuario.nome}!`,
      '',
      'Recebemos uma solicitacao para redefinir a senha da sua conta na plataforma CONECTE-SE.',
      '',
      `Seu codigo de verificacao e: ${codigo}`,
      'Este codigo expira em 15 minutos.',
      '',
      'Se voce nao solicitou a redefinicao, ignore este e-mail.',
   ].join('\n')

   return { subject, html, text }
}

module.exports = { resetSenhaTemplate }
```

- [ ] **Step 4: Adicionar validators**

Em `middleware/validators.js`, após `alterarSenhaValidator`:

```js
const esqueciSenhaValidator = [
  body("email").isEmail().withMessage("Email inválido"),
  validate,
];

const redefinirSenhaValidator = [
  body("email").isEmail().withMessage("Email inválido"),
  body("codigo")
    .trim()
    .isLength({ min: 6, max: 6 })
    .withMessage("Código deve ter 6 dígitos")
    .isNumeric()
    .withMessage("Código inválido"),
  body("novaSenha")
    .isLength({ min: 6 })
    .withMessage("Nova senha deve ter no mínimo 6 caracteres"),
  validate,
];
```

Atualize o `module.exports`:

```js
module.exports = {
  registerValidator,
  loginValidator,
  eventoValidator,
  inscricaoValidator,
  alterarSenhaValidator,
  esqueciSenhaValidator,
  redefinirSenhaValidator,
};
```

- [ ] **Step 5: Implementar `esqueciSenha` no controller**

No topo de `controllers/authController.js`, após os requires atuais:

```js
const crypto = require("crypto");
const { sendMailSafe, isEmailEnabled } = require("../services/emailService");
const { resetSenhaTemplate } = require("../services/emailTemplates/resetSenha");

const CODIGO_TTL_MINUTOS = 15;
const MAX_TENTATIVAS_RESET = 5;
```

Adicione a função:

```js
const esqueciSenha = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await prisma.usuario.findUnique({
      where: { email, ativo: true },
    });

    if (user) {
      const codigo = crypto.randomInt(0, 1000000).toString().padStart(6, "0");
      const resetCodigo = await bcrypt.hash(codigo, 10);
      const resetExpira = new Date(Date.now() + CODIGO_TTL_MINUTOS * 60 * 1000);

      await prisma.usuario.update({
        where: { id: user.id },
        data: { resetCodigo, resetExpira, resetTentativas: 0 },
      });

      if (isEmailEnabled()) {
        sendMailSafe(user.email, resetSenhaTemplate({ usuario: user, codigo }));
      } else {
        console.log(`[reset-senha] Codigo para ${user.email}: ${codigo}`);
      }
    }

    res.json({ message: "Se o e-mail existir, enviaremos um código" });
  } catch (error) {
    console.error("Erro ao solicitar reset de senha:", error);
    res.status(500).json({ error: "Erro ao solicitar redefinição de senha" });
  }
};
```

Atualize o `module.exports` adicionando `esqueciSenha` (a `redefinirSenha` entra na Task 3):

```js
module.exports = { register, login, getProfile, alterarSenha, esqueciSenha };
```

- [ ] **Step 6: Registrar a rota**

Em `routes/index.js`, no destructuring dos validators:

```js
const { registerValidator, loginValidator, eventoValidator, inscricaoValidator, alterarSenhaValidator, esqueciSenhaValidator, redefinirSenhaValidator } = require('../middleware/validators')
```

Após `router.post('/auth/login', ...)`:

```js
router.post('/auth/esqueci-senha', esqueciSenhaValidator, authController.esqueciSenha)
```

- [ ] **Step 7: Rodar os testes**

Run: `npx jest tests/password-reset.test.js --runInBand`
Esperado: os 3 testes de `esqueci-senha` PASSAM.

- [ ] **Step 8: Commit**

```bash
git add services/emailTemplates/resetSenha.js middleware/validators.js controllers/authController.js routes/index.js tests/password-reset.test.js
git commit -m "feat(auth): endpoint esqueci-senha com codigo por e-mail"
```

---

### Task 3: Endpoint `/api/auth/redefinir-senha`

**Files:**
- Modify: `controllers/authController.js`
- Modify: `routes/index.js`
- Test: `tests/password-reset.test.js`

**Interfaces:**
- Consumes: `esqueciSenha`/template/rota da Task 2; constantes `MAX_TENTATIVAS_RESET`; campos `resetCodigo/resetExpira/resetTentativas/tokenVersion`.
- Produces: `authController.redefinirSenha`; rota `POST /api/auth/redefinir-senha`.

- [ ] **Step 1: Escrever os testes que falham**

Adicione ao final de `tests/password-reset.test.js`:

```js
describe('POST /api/auth/redefinir-senha', () => {
  const solicitar = async (user) => {
    await request(app).post('/api/auth/esqueci-senha').send({ email: user.email })
    return capturarCodigo()
  }

  const codigoErrado = (codigo) => (codigo === '000000' ? '000001' : '000000')

  test('fluxo feliz: codigo correto troca a senha e permite login', async () => {
    const user = await createUser({ email: 'feliz@teste.com' })
    const codigo = await solicitar(user)

    const res = await request(app)
      .post('/api/auth/redefinir-senha')
      .send({ email: user.email, codigo, novaSenha: 'novaSenha789' })

    expect(res.statusCode).toBe(200)
    expect(res.body.message).toBe('Senha redefinida com sucesso')

    const atualizado = await prisma.usuario.findUnique({ where: { id: user.id } })
    expect(atualizado.resetCodigo).toBeNull()
    expect(atualizado.resetExpira).toBeNull()
    expect(atualizado.resetTentativas).toBe(0)

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, senha: 'novaSenha789' })
    expect(login.statusCode).toBe(200)
  })

  test('reset invalida token emitido antes (tokenVersion)', async () => {
    const user = await createUser({ email: 'invalida@teste.com' })
    const loginAntes = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, senha: user.senhaPlano })
    const tokenAntigo = loginAntes.body.token

    const codigo = await solicitar(user)
    await request(app)
      .post('/api/auth/redefinir-senha')
      .send({ email: user.email, codigo, novaSenha: 'outraSenha789' })

    const res = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${tokenAntigo}`)

    expect(res.statusCode).toBe(401)
  })

  test('codigo errado -> 400 e incrementa resetTentativas', async () => {
    const user = await createUser({ email: 'errado@teste.com' })
    const codigo = await solicitar(user)

    const res = await request(app)
      .post('/api/auth/redefinir-senha')
      .send({ email: user.email, codigo: codigoErrado(codigo), novaSenha: 'novaSenha789' })

    expect(res.statusCode).toBe(400)
    expect(res.body.error).toBe('Código inválido ou expirado')

    const atualizado = await prisma.usuario.findUnique({ where: { id: user.id } })
    expect(atualizado.resetTentativas).toBe(1)
  })

  test('5 tentativas erradas invalidam o codigo', async () => {
    const user = await createUser({ email: 'limite@teste.com' })
    const codigo = await solicitar(user)
    const errado = codigoErrado(codigo)

    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/auth/redefinir-senha')
        .send({ email: user.email, codigo: errado, novaSenha: 'novaSenha789' })
    }

    const res = await request(app)
      .post('/api/auth/redefinir-senha')
      .send({ email: user.email, codigo, novaSenha: 'novaSenha789' })

    expect(res.statusCode).toBe(400)
    const atualizado = await prisma.usuario.findUnique({ where: { id: user.id } })
    expect(atualizado.resetCodigo).toBeNull()
  })

  test('codigo expirado -> 400', async () => {
    const user = await createUser({ email: 'expirado@teste.com' })
    const codigo = await solicitar(user)

    await prisma.usuario.update({
      where: { id: user.id },
      data: { resetExpira: new Date(Date.now() - 1000) },
    })

    const res = await request(app)
      .post('/api/auth/redefinir-senha')
      .send({ email: user.email, codigo, novaSenha: 'novaSenha789' })

    expect(res.statusCode).toBe(400)
    expect(res.body.error).toBe('Código inválido ou expirado')
  })

  test('nova senha curta -> 400 com errors', async () => {
    const user = await createUser({ email: 'curta@teste.com' })
    const codigo = await solicitar(user)

    const res = await request(app)
      .post('/api/auth/redefinir-senha')
      .send({ email: user.email, codigo, novaSenha: '123' })

    expect(res.statusCode).toBe(400)
    expect(Array.isArray(res.body.errors)).toBe(true)
  })
})
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `npx jest tests/password-reset.test.js -t "redefinir-senha" --runInBand`
Esperado: FALHA (rota ainda 404).

- [ ] **Step 3: Implementar `redefinirSenha`**

Em `controllers/authController.js`, logo após `esqueciSenha`:

```js
const redefinirSenha = async (req, res) => {
  try {
    const { email, codigo, novaSenha } = req.body;

    const invalido = () =>
      res.status(400).json({ error: "Código inválido ou expirado" });

    const user = await prisma.usuario.findUnique({ where: { email } });

    if (!user || !user.resetCodigo || !user.resetExpira) {
      return invalido();
    }

    if (
      user.resetExpira < new Date() ||
      user.resetTentativas >= MAX_TENTATIVAS_RESET
    ) {
      return invalido();
    }

    const codigoValido = await bcrypt.compare(codigo, user.resetCodigo);

    if (!codigoValido) {
      const tentativas = user.resetTentativas + 1;
      const data = { resetTentativas: tentativas };
      if (tentativas >= MAX_TENTATIVAS_RESET) {
        data.resetCodigo = null;
        data.resetExpira = null;
      }
      await prisma.usuario.update({ where: { id: user.id }, data });
      return invalido();
    }

    const senha = await bcrypt.hash(novaSenha, 10);

    await prisma.usuario.update({
      where: { id: user.id },
      data: {
        senha,
        resetCodigo: null,
        resetExpira: null,
        resetTentativas: 0,
        tokenVersion: { increment: 1 },
      },
    });

    res.json({ message: "Senha redefinida com sucesso" });
  } catch (error) {
    console.error("Erro ao redefinir senha:", error);
    res.status(500).json({ error: "Erro ao redefinir senha" });
  }
};
```

Atualize o `module.exports`:

```js
module.exports = { register, login, getProfile, alterarSenha, esqueciSenha, redefinirSenha };
```

- [ ] **Step 4: Registrar a rota**

Em `routes/index.js`, logo após a rota de `esqueci-senha`:

```js
router.post('/auth/redefinir-senha', redefinirSenhaValidator, authController.redefinirSenha)
```

- [ ] **Step 5: Rodar os testes**

Run: `npx jest tests/password-reset.test.js --runInBand`
Esperado: todos os testes do arquivo PASSAM.

- [ ] **Step 6: Rodar a suíte completa**

Run: `npm test`
Esperado: todos os suites PASSAM.

- [ ] **Step 7: Commit**

```bash
git add controllers/authController.js routes/index.js tests/password-reset.test.js
git commit -m "feat(auth): endpoint redefinir-senha validando codigo"
```

---

### Task 4: `PATCH /api/auth/senha` invalida sessões e devolve token novo

**Files:**
- Modify: `controllers/authController.js` (função `alterarSenha`)
- Test: `tests/auth.test.js`

**Interfaces:**
- Consumes: `tokenVersion` da Task 1; `jwt`.
- Produces: `alterarSenha` que incrementa `tokenVersion` e responde `{ message, token }`.

- [ ] **Step 1: Escrever os testes que falham**

No `describe('PATCH /api/auth/senha', ...)` de `tests/auth.test.js`, adicione:

```js
  test('retorna token novo que continua valido', async () => {
    const user = await createUser({ email: 'novotoken@teste.com' })

    const res = await request(app)
      .patch('/api/auth/senha')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ senhaAtual: user.senhaPlano, novaSenha: 'novaSenha456' })

    expect(res.statusCode).toBe(200)
    expect(typeof res.body.token).toBe('string')

    const perfil = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${res.body.token}`)
    expect(perfil.statusCode).toBe(200)
  })

  test('token antigo eh invalidado apos a troca', async () => {
    const user = await createUser({ email: 'antigoinvalido@teste.com' })
    const tokenAntigo = tokenFor(user)

    await request(app)
      .patch('/api/auth/senha')
      .set('Authorization', `Bearer ${tokenAntigo}`)
      .send({ senhaAtual: user.senhaPlano, novaSenha: 'novaSenha456' })

    const res = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${tokenAntigo}`)
    expect(res.statusCode).toBe(401)
  })
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `npx jest tests/auth.test.js -t "senha" --runInBand`
Esperado: FALHA — `res.body.token` é `undefined` e o token antigo ainda funciona (200).

- [ ] **Step 3: Atualizar `alterarSenha`**

Substitua, em `controllers/authController.js`, o trecho final de `alterarSenha`:

```js
    const hashedPassword = await bcrypt.hash(novaSenha, 10);

    const updated = await prisma.usuario.update({
      where: { id: user.id },
      data: { senha: hashedPassword, tokenVersion: { increment: 1 } },
    });

    const token = jwt.sign(
      { id: updated.id, tipo: updated.tipoUsuario, v: updated.tokenVersion },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ message: "Senha alterada com sucesso", token });
```

- [ ] **Step 4: Rodar os testes**

Run: `npx jest tests/auth.test.js --runInBand`
Esperado: PASSAM (incluindo os testes existentes de `alterarSenha`).

- [ ] **Step 5: Suíte completa**

Run: `npm test`
Esperado: todos os suites PASSAM.

- [ ] **Step 6: Commit**

```bash
git add controllers/authController.js tests/auth.test.js
git commit -m "feat(auth): troca de senha invalida sessoes e devolve novo token"
```

---

### Task 5: Documentação Swagger dos novos endpoints

**Files:**
- Modify: `docs/swagger.routes.js` (após o bloco `/api/auth/senha`, ~linha 170)

**Interfaces:**
- Consumes: rotas da Task 2 e Task 3.
- Produces: spec OpenAPI para `/api/auth/esqueci-senha` e `/api/auth/redefinir-senha`.

- [ ] **Step 1: Adicionar os blocos Swagger**

Em `docs/swagger.routes.js`, após o bloco `@swagger /api/auth/senha` (antes de `/api/usuarios`):

```js
/**
 * @swagger
 * /api/auth/esqueci-senha:
 *   post:
 *     tags:
 *       - Autenticação
 *     summary: Solicitar código de recuperação de senha
 *     description: >
 *       Envia um código numérico de 6 dígitos (válido por 15 minutos) caso o
 *       e-mail esteja cadastrado. A resposta é sempre genérica (HTTP 200) para
 *       não revelar quais e-mails existem.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: usuario@email.com
 *     responses:
 *       200:
 *         description: Solicitação recebida (resposta genérica)
 *       400:
 *         description: E-mail inválido
 */

/**
 * @swagger
 * /api/auth/redefinir-senha:
 *   post:
 *     tags:
 *       - Autenticação
 *     summary: Redefinir senha com código
 *     description: >
 *       Valida o código de 6 dígitos e define uma nova senha. Máximo de 5
 *       tentativas; ao exceder, o código é invalidado. A troca invalida os
 *       tokens JWT emitidos anteriormente.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - codigo
 *               - novaSenha
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: usuario@email.com
 *               codigo:
 *                 type: string
 *                 example: "123456"
 *               novaSenha:
 *                 type: string
 *                 format: password
 *                 minLength: 6
 *                 example: novaSenha456
 *     responses:
 *       200:
 *         description: Senha redefinida com sucesso
 *       400:
 *         description: Dados inválidos ou código inválido/expirado
 */
```

- [ ] **Step 2: Verificar sintaxe e build da spec**

Run: `node --check docs/swagger.routes.js && node -e "const s=require('./config/swagger'); console.log(Object.keys(s.paths).filter(p=>p.includes('senha')||p.includes('esqueci')||p.includes('redefinir')))"`
Esperado: imprime `['/api/auth/esqueci-senha', '/api/auth/redefinir-senha', '/api/auth/senha']` (sem erro).

- [ ] **Step 3: Commit**

```bash
git add docs/swagger.routes.js
git commit -m "docs(swagger): documenta esqueci-senha e redefinir-senha"
```

---

## Verificação final

- [ ] `npm test` — todos os suites PASSAM.
- [ ] `docker compose up --build` (rebuild necessário: Prisma Client regenerado e deps inalteradas).
- [ ] Manual: `EMAIL_ENABLED=false` → `POST /api/auth/esqueci-senha` deixa o código no log do container `app`; usar o código em `/api/auth/redefinir-senha` e logar com a nova senha.
- [ ] Manual: `EMAIL_ENABLED=true` com SMTP válido → e-mail com o código chega.
