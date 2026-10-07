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
