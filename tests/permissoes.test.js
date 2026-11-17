const request = require('supertest')
const app = require('../app')
const { prisma, resetDb } = require('./db')
const { createUser, tokenFor } = require('./factories')
const clerkMock = require('./clerkMock')

jest.mock('../services/clerkAuth', () => require('./clerkMock').mock)

beforeEach(resetDb)

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

  test('GET /api/usuarios sanitiza page/limit (clamp 1..100, NaN -> default)', async () => {
    const admin = await createUser({ tipoUsuario: 'admin' })

    const clamado = await request(app)
      .get('/api/usuarios?page=0&limit=500')
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
    expect(clamado.statusCode).toBe(200)
    expect(clamado.body.pagination.page).toBe(1)
    expect(clamado.body.pagination.limit).toBe(100)

    const invalido = await request(app)
      .get('/api/usuarios?page=abc&limit=xyz')
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
    expect(invalido.statusCode).toBe(200)
    expect(invalido.body.pagination.page).toBe(1)
    expect(invalido.body.pagination.limit).toBe(10)
  })

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
})

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

  test('admin desativa participante -> 200, ativo=false', async () => {
    const admin = await createUser({ tipoUsuario: 'admin' })
    const alvo = await createUser()

    const res = await request(app)
      .delete(`/api/usuarios/${alvo.id}`)
      .set('Authorization', `Bearer ${tokenFor(admin)}`)

    expect(res.statusCode).toBe(200)
    expect(res.body.message).toBe('Usuário desativado com sucesso')

    const atualizado = await prisma.usuario.findUnique({ where: { id: alvo.id } })
    expect(atualizado.ativo).toBe(false)
  })

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

  test('segunda chamada é idempotente -> 200 e ativo segue false', async () => {
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
    expect(final.ativo).toBe(false)
  })
})
