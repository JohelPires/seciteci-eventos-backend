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
