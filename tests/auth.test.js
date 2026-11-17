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
