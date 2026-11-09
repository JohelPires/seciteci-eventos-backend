# Excluir usuário (soft delete administrativo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin desativa qualquer usuário não-admin via `DELETE /api/usuarios/:id` (`ativo=false` + invalidação de sessão imediata), com Swagger e testes atualizados.

**Architecture:** Soft delete puramente logico usando colunas existentes (`ativo`, `tokenVersion`) — sem migration. O endpoint destrava sessões ativas em dois pontos: o delete incrementa `tokenVersion` (invalida JWTs emitidos) e o `authMiddleware` passa a rejeitar `ativo=false`. Spec: `docs/superpowers/specs/2026-11-09-excluir-usuario-design.md`.

**Tech Stack:** Node.js + Express (CommonJS), Prisma Client, Jest + Supertest (HTTP suites importam `app.js`).

## Global Constraints

- Testes rodam no host com o banco de teste de pé: `docker compose -f docker-compose.yml up -d db` (sempre `-f docker-compose.yml`; `compose.yml` é de produção). One-time, se o volume pgdata já existia: `docker compose -f docker-compose.yml exec db createdb -U postgres sistema_eventos_test`. Suíte completa: `npx jest --runInBand`.
- **Sem migration, sem mudança de schema**: `ativo` e `tokenVersion` já existem em `prisma/schema.prisma`.
- Não há lint/typecheck no repo. Verificação = suite Jest completa no fim de cada task.
- Código em CommonJS (`require`/`module.exports`), indentação idêntica ao arquivo alvo (2 espaços em `usuariosController.js`/`routes/index.js`, às vezes com espaçamento de 3 — copiar do contexto vizinho).
- Mensagens de resposta copiadas verbatim de `Global Constraints`/tasks abaixo: `'ID de usuário inválido'`, `'Usuário não encontrado'`, `'Acesso negado. Administradores não podem ser excluídos.'`, `'Usuário já está desativado'`, `'Usuário desativado com sucesso'`, `'Token inválido ou expirado'` (401 do authMiddleware, também usado para usuário inativo).
- Sem retorno de dados pessoais do alvo nas respostas do delete.
- Swagger é manual (`docs/swagger.routes.js`) — obrigatório atualizar a cada endpoint.
- Commit só quando o usuário pedir; se estiver executando com commits autorizados, usar estilo do repo (`auth:`, `usuarios:`).

---

### Task 1: authMiddleware rejeita usuário desativado

**Files:**
- Modify: `middleware/auth.js` (bloco `findUnique`/`if` do `authMiddleware`, ~linhas 21-32)
- Test: `tests/permissoes.test.js` (dentro de `describe('middleware de autenticação')`)

**Interfaces:**
- Consumes: nada de novas APIs.
- Produces: comportamento do `authMiddleware` — qualquer requisição autenticada em que `prisma.usuario` retorne `ativo=false` recebe `401 "Token inválido ou expirado"` (mesma resposta de token inválido). As Tasks 2 depende deste comportamento para o caso "token antigo após desativação".

- [ ] **Step 1: Write the failing test**

Em `tests/permissoes.test.js`, dentro de `describe('middleware de autenticação')` (após o teste `'token com tokenVersion desatualizado -> 401'`, linha ~74), adicionar:

```js
  test('token de usuário desativado (ativo=false) -> 401', async () => {
    const user = await createUser({ ativo: false })
    const res = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    expect(res.statusCode).toBe(401)
    expect(res.body.error).toBe('Token inválido ou expirado')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Pré-requisito: `docker compose -f docker-compose.yml up -d db`.

Run: `npx jest tests/permissoes.test.js -t "ativo=false"`
Expected: FAIL — `expect(res.statusCode).toBe(401)` recebe `200` (o middleware só checa `tokenVersion` hoje).

- [ ] **Step 3: Write minimal implementation**

Em `middleware/auth.js`, trocar:

```js
    const user = await prisma.usuario.findUnique({
      where: { id: decoded.id },
      select: { tokenVersion: true },
    });

    // Tokens antigos (pre-deploy) nao tem `v`; tratamos como 0 para nao
    // deslogar todo mundo de uma vez. Reset/troca incrementam tokenVersion.
    if (!user || (decoded.v ?? 0) !== user.tokenVersion) {
      return res.status(401).json({ error: "Token inválido ou expirado" });
    }
```

por:

```js
    const user = await prisma.usuario.findUnique({
      where: { id: decoded.id },
      select: { tokenVersion: true, ativo: true },
    });

    // Tokens antigos (pre-deploy) nao tem `v`; tratamos como 0 para nao
    // deslogar todo mundo de uma vez. Reset/troca incrementam tokenVersion.
    // Usuario desativado (ativo=false) nao autentica, mesmo com token fresco.
    if (!user || !user.ativo || (decoded.v ?? 0) !== user.tokenVersion) {
      return res.status(401).json({ error: "Token inválido ou expirado" });
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/permissoes.test.js -t "ativo=false"`
Expected: PASS

Run (regressão da suite http de permissões): `npx jest tests/permissoes.test.js`
Expected: PASS (nenhum teste existencial usa usuário inativo com token válido)

- [ ] **Step 5: Commit (se autorizado)**

```bash
git add middleware/auth.js tests/permissoes.test.js
git commit -m "auth: bloquear autenticação de usuário desativado (ativo=false)"
```

---

### Task 2: Endpoint DELETE /api/usuarios/:id + Swagger

**Files:**
- Modify: `controllers/usuariosController.js` (nova `desativarUsuario` + export)
- Modify: `routes/index.js:46` (nova rota logo após a linha 45 de `GET /usuarios`)
- Modify: `docs/swagger.routes.js` (novo bloco JSDoc entre o fim do bloco `/api/usuarios/{id}/promover`, linha 363, e o separador `// ============================================\n// EVENTOS` em ~365)
- Test: `tests/permissoes.test.js` (novo `describe` após `describe('rotas de admin')`)

**Interfaces:**
- Consumes: `authMiddleware` (Task 1), helpers `createUser`, `tokenFor` de `tests/factories.js`, `prisma` de `tests/db.js`.
- Produces: `usuariosController.desativarUsuario` — resposta final: `{ message }` com 200 (nunca dados pessoais). Erros: `400 { error: 'ID de usuário inválido' }`, `404 { error: 'Usuário não encontrado' }`, `403 { error: 'Acesso negado. Administradores não podem ser excluídos.' }`, idempotente no segundo DELETE.

- [ ] **Step 1: Write the failing tests**

Em `tests/permissoes.test.js`, após o fechamento de `describe('rotas de admin')`:

```js
describe('DELETE /api/usuarios/:id (soft delete)', () => {
  test('participante -> 403', async () => {
    const user = await createUser()
    const alvo = await createUser()
    const res = await request(app)
      .delete(`/api/usuarios/${alvo.id}`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    expect(res.statusCode).toBe(403)
    expect(res.body.error).toBe('Acesso negado. Apenas administradores.')
  })

  test('admin desativa participante -> 200, ativo=false e tokenVersion incrementada', async () => {
    const admin = await createUser({ tipoUsuario: 'admin' })
    const alvo = await createUser()

    const res = await request(app)
      .delete(`/api/usuarios/${alvo.id}`)
      .set('Authorization', `Bearer ${tokenFor(admin)}`)

    expect(res.statusCode).toBe(200)
    expect(res.body.message).toBe('Usuário desativado com sucesso')

    const atualizado = await prisma.usuario.findUnique({ where: { id: alvo.id } })
    expect(atualizado.ativo).toBe(false)
    expect(atualizado.tokenVersion).toBe(alvo.tokenVersion + 1)
  })

  test('token já emitido fica inválido após desativação -> 401', async () => {
    const admin = await createUser({ tipoUsuario: 'admin' })
    const alvo = await createUser()
    const tokenAlvo = tokenFor(alvo)

    await request(app)
      .delete(`/api/usuarios/${alvo.id}`)
      .set('Authorization', `Bearer ${tokenFor(admin)}`)

    const res = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${tokenAlvo}`)

    expect(res.statusCode).toBe(401)
    expect(res.body.error).toBe('Token inválido ou expirado')
  })

  test('login de usuário desativado -> 401', async () => {
    const admin = await createUser({ tipoUsuario: 'admin' })
    const alvo = await createUser()

    const deleted = await request(app)
      .delete(`/api/usuarios/${alvo.id}`)
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
    expect(deleted.statusCode).toBe(200)

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: alvo.email, senha: alvo.senhaPlano })

    expect(res.statusCode).toBe(401)
    expect(res.body.error).toBe('Credenciais inválidas')
  })

  test('admin não desativa outro admin -> 403', async () => {
    const admin = await createUser({ tipoUsuario: 'admin' })
    const outroAdmin = await createUser({ tipoUsuario: 'admin' })

    const res = await request(app)
      .delete(`/api/usuarios/${outroAdmin.id}`)
      .set('Authorization', `Bearer ${tokenFor(admin)}`)

    expect(res.statusCode).toBe(403)
    expect(res.body.error).toBe('Acesso negado. Administradores não podem ser excluídos.')

    const intacto = await prisma.usuario.findUnique({ where: { id: outroAdmin.id } })
    expect(intacto.ativo).toBe(true)
  })

  test('admin não desativa a si mesmo -> 403', async () => {
    const admin = await createUser({ tipoUsuario: 'admin' })

    const res = await request(app)
      .delete(`/api/usuarios/${admin.id}`)
      .set('Authorization', `Bearer ${tokenFor(admin)}`)

    expect(res.statusCode).toBe(403)
  })

  test('inexistente -> 404', async () => {
    const admin = await createUser({ tipoUsuario: 'admin' })

    const res = await request(app)
      .delete('/api/usuarios/999999')
      .set('Authorization', `Bearer ${tokenFor(admin)}`)

    expect(res.statusCode).toBe(404)
    expect(res.body.error).toBe('Usuário não encontrado')
  })

  test('id inválido -> 400', async () => {
    const admin = await createUser({ tipoUsuario: 'admin' })

    const res = await request(app)
      .delete('/api/usuarios/abc')
      .set('Authorization', `Bearer ${tokenFor(admin)}`)

    expect(res.statusCode).toBe(400)
    expect(res.body.error).toBe('ID de usuário inválido')
  })

  test('segunda chamada é idempotente -> 200 e não reincrementa tokenVersion', async () => {
    const admin = await createUser({ tipoUsuario: 'admin' })
    const alvo = await createUser()

    await request(app)
      .delete(`/api/usuarios/${alvo.id}`)
      .set('Authorization', `Bearer ${tokenFor(admin)}`)

    const segunda = await request(app)
      .delete(`/api/usuarios/${alvo.id}`)
      .set('Authorization', `Bearer ${tokenFor(admin)}`)

    expect(segunda.statusCode).toBe(200)
    expect(segunda.body.message).toBe('Usuário já está desativado')

    const final = await prisma.usuario.findUnique({ where: { id: alvo.id } })
    expect(final.tokenVersion).toBe(alvo.tokenVersion + 1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/permissoes.test.js -t "soft delete"`
Expected: FAIL — a rota não existe; `app.use((req,res) => ...)` responde `404 { error: 'Rota não encontrada' }`, quebrando todos os asserts.

- [ ] **Step 3: Write minimal implementation (controller)**

Em `controllers/usuariosController.js`, adicionar antes de `module.exports`:

```js
const desativarUsuario = async (req, res) => {
   try {
      const id = parseInt(req.params.id, 10)

      if (!Number.isInteger(id) || id < 1) {
         return res.status(400).json({ error: 'ID de usuário inválido' })
      }

      const usuario = await prisma.usuario.findUnique({
         where: { id },
         select: { id: true, tipoUsuario: true, ativo: true },
      })

      if (!usuario) {
         return res.status(404).json({ error: 'Usuário não encontrado' })
      }

      if (usuario.tipoUsuario === 'admin') {
         return res.status(403).json({
            error: 'Acesso negado. Administradores não podem ser excluídos.',
         })
      }

      if (!usuario.ativo) {
         return res.status(200).json({ message: 'Usuário já está desativado' })
      }

      await prisma.usuario.update({
         where: { id },
         data: { ativo: false, tokenVersion: { increment: 1 } },
      })

      res.status(200).json({ message: 'Usuário desativado com sucesso' })
   } catch (error) {
      console.error('Erro ao desativar usuário:', error)
      res.status(500).json({ error: 'Erro ao desativar usuário' })
   }
}
```

E atualizar o export final:

```js
module.exports = {
   getUsuarios,
   promoverUsuarioAdmin,
   desativarUsuario,
}
```

- [ ] **Step 4: Register the route**

Em `routes/index.js`, adicionar entre as linhas 45 e 47 do bloco "ROTAS PROTEGIDAS - USUÁRIOS":

```js
router.delete('/usuarios/:id', authMiddleware, isAdmin, usuariosController.desativarUsuario)
```

Ficando o bloco como:

```js
router.get('/usuarios', authMiddleware, isAdmin, usuariosController.getUsuarios)

router.delete('/usuarios/:id', authMiddleware, isAdmin, usuariosController.desativarUsuario)

router.patch('/usuarios/:id/promover', authMiddleware, isAdmin, usuariosController.promoverUsuarioAdmin)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest tests/permissoes.test.js -t "soft delete"`
Expected: PASS (9 testes)

Run (suíte completa): `npx jest --runInBand`
Expected: PASS — todas as 6 suites (nenhuma dependia de rota/behavior alterado).

- [ ] **Step 6: Add Swagger docs**

Em `docs/swagger.routes.js`, inserir o bloco abaixo imediatamente após o fechamento do bloco `/api/usuarios/{id}/promover` (após a linha 363 `*         description: Usuário não encontrado` + `*/`) e antes do separador `// ============================================\n// EVENTOS`:

```js
/**
 * @swagger
 * /api/usuarios/{id}:
 *   delete:
 *     tags:
 *       - Autenticação
 *     summary: Desativar usuário (soft delete)
 *     description: Define ativo=false e incrementa tokenVersion, invalidando os tokens JWT já emitidos do usuário. Administradores não podem ser desativados (inclui o próprio admin, pois ele também é admin). Chamada idempotente. Os dados pessoais e o histórico (inscrições, avaliações, eventos) permanecem no banco.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do usuário a ser desativado
 *     responses:
 *       200:
 *         description: Usuário desativado com sucesso, ou já estava desativado
 *       400:
 *         description: ID de usuário inválido
 *       401:
 *         description: Token não fornecido ou inválido
 *       403:
 *         description: Apenas administradores executam a rota; administradores não podem ser desativados
 *       404:
 *         description: Usuário não encontrado
 *       500:
 *         description: Erro interno
 */
```

- [ ] **Step 7: Verify Swagger spec still loads**

Run: `node -e "require('./config/swagger'); console.log('swagger ok')"`
Expected: `swagger ok` (sem exceção de parse).

- [ ] **Step 8: Commit (se autorizado)**

```bash
git add controllers/usuariosController.js routes/index.js docs/swagger.routes.js tests/permissoes.test.js
git commit -m "usuarios: soft delete administrativo via DELETE /usuarios/:id"
```

---

## Resumo de verificação final

- [ ] `docker compose -f docker-compose.yml up -d db`
- [ ] `npx jest --runInBand` → 0 falhas (55 + 10 testes novos ≈ 65)
- [ ] `node -e "require('./config/swagger'); console.log('swagger ok')"`
- [ ] Sem migration criada (`git status` não mostra `prisma/migrations/`)
