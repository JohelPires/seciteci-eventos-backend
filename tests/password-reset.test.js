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
