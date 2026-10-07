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
