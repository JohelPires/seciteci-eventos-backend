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
