const request = require('supertest')
const app = require('../app')
const { prisma, resetDb } = require('./db')
const { createUser } = require('./factories')
const clerkMock = require('./clerkMock')

jest.mock('../services/clerkAuth', () => require('./clerkMock').mock)

beforeEach(async () => {
  await resetDb()
  clerkMock.mock.verificarWebhook.mockReset()
})

const postWebhook = (evento) =>
  request(app)
    .post('/api/webhooks/clerk')
    .set('svix-id', 'msg_1')
    .set('svix-timestamp', '1')
    .set('svix-signature', 'v1,x')
    .send({ tipo: evento.tipo })

describe('POST /api/webhooks/clerk', () => {
  test('assinatura inválida -> 401', async () => {
    clerkMock.mock.verificarWebhook.mockRejectedValue(new Error('invalid signature'))
    const res = await postWebhook({ tipo: 'usuario.criado' })

    expect(res.statusCode).toBe(401)
    expect(res.body.error).toBe('Assinatura do webhook inválida')
  })

  test('evento desconhecido -> 200 ignorado', async () => {
    clerkMock.mock.verificarWebhook.mockResolvedValue({
      id: 'msg_ign', tipo: 'ignorado', clerkUserId: null, email: null, nome: null, foto: null,
    })
    const res = await postWebhook({ tipo: 'ignorado' })

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ processado: false, motivo: 'evento-ignorado' })
  })

  test('user.created de e-mail novo cria participante', async () => {
    clerkMock.mock.verificarWebhook.mockResolvedValue({
      id: 'msg_1', tipo: 'usuario.criado', clerkUserId: 'clerk_w1',
      email: 'maria@teste.com', nome: 'Maria Silva', foto: 'https://img.clerk.com/m.png',
    })
    const res = await postWebhook({ tipo: 'usuario.criado' })

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ processado: true })
    const row = await prisma.usuario.findUnique({ where: { email: 'maria@teste.com' } })
    expect(row).toMatchObject({
      tipoUsuario: 'participante', clerkUserId: 'clerk_w1', nome: 'Maria Silva', ativo: true,
    })
    expect(row.fotoPerfil).toBe('https://img.clerk.com/m.png')
  })

  test('user.updated liga conta existente pelo e-mail (mantém papel/ativo)', async () => {
    const user = await createUser({ tipoUsuario: 'organizador', clerkUserId: null })
    clerkMock.mock.verificarWebhook.mockResolvedValue({
      id: 'msg_2', tipo: 'usuario.atualizado', clerkUserId: 'clerk_w2',
      email: user.email, nome: 'Nome Do Clerk', foto: null,
    })
    const res = await postWebhook({ tipo: 'usuario.atualizado' })

    expect(res.body).toEqual({ processado: true })
    const row = await prisma.usuario.findUnique({ where: { id: user.id } })
    expect(row.clerkUserId).toBe('clerk_w2')
    expect(row.tipoUsuario).toBe('organizador')
    expect(row.nome).toBe(user.nome)
  })

  test('updated não sobrescreve nome/foto já preenchidos', async () => {
    const user = await createUser()
    clerkMock.mock.verificarWebhook.mockResolvedValue({
      id: 'msg_3', tipo: 'usuario.atualizado', clerkUserId: user.clerkUserId,
      email: user.email, nome: 'Nome Do Clerk', foto: 'https://img.clerk.com/x.png',
    })
    await postWebhook({ tipo: 'usuario.atualizado' })

    const row = await prisma.usuario.findUnique({ where: { id: user.id } })
    expect(row.nome).toBe(user.nome)
    expect(row.fotoPerfil).toBeNull()
  })

  test('e-mail já ligado a outro clerkUserId -> ignora sem criar', async () => {
    const user = await createUser()
    const total = await prisma.usuario.count()
    clerkMock.mock.verificarWebhook.mockResolvedValue({
      id: 'msg_4', tipo: 'usuario.criado', clerkUserId: 'clerk_w4',
      email: user.email, nome: 'Invasor', foto: null,
    })
    const res = await postWebhook({ tipo: 'usuario.criado' })

    expect(res.body).toEqual({ processado: false, motivo: 'sem-conta-correspondente' })
    expect(await prisma.usuario.count()).toBe(total)
    const row = await prisma.usuario.findUnique({ where: { id: user.id } })
    expect(row.clerkUserId).toBe(user.clerkUserId)
  })

  test('user.created sem e-mail -> evento inválido', async () => {
    clerkMock.mock.verificarWebhook.mockResolvedValue({
      id: 'msg_5', tipo: 'usuario.criado', clerkUserId: 'clerk_w5',
      email: null, nome: null, foto: null,
    })
    const res = await postWebhook({ tipo: 'usuario.criado' })

    expect(res.body).toEqual({ processado: false, motivo: 'evento-invalido' })
  })

  test('user.deleted desativa e solta o vínculo; repetido -> duplicado', async () => {
    const user = await createUser()
    clerkMock.mock.verificarWebhook.mockResolvedValue({
      id: 'msg_6', tipo: 'usuario.removido', clerkUserId: user.clerkUserId,
      email: null, nome: null, foto: null,
    })

    const primeira = await postWebhook({ tipo: 'usuario.removido' })
    expect(primeira.body).toEqual({ processado: true })
    const row = await prisma.usuario.findUnique({ where: { id: user.id } })
    expect(row.ativo).toBe(false)
    expect(row.clerkUserId).toBeNull()

    clerkMock.mock.verificarWebhook.mockResolvedValue({
      id: 'msg_6', tipo: 'usuario.removido', clerkUserId: user.clerkUserId,
      email: null, nome: null, foto: null,
    })
    const segunda = await postWebhook({ tipo: 'usuario.removido' })
    expect(segunda.body).toEqual({ processado: false, motivo: 'duplicado' })
  })

  test('reenvio do MESMO evento de criação não duplica conta', async () => {
    clerkMock.mock.verificarWebhook.mockResolvedValue({
      id: 'msg_7', tipo: 'usuario.criado', clerkUserId: 'clerk_w7',
      email: 'dupla@teste.com', nome: 'Dupla', foto: null,
    })
    await postWebhook({ tipo: 'usuario.criado' })

    clerkMock.mock.verificarWebhook.mockResolvedValue({
      id: 'msg_7', tipo: 'usuario.criado', clerkUserId: 'clerk_w7',
      email: 'dupla@teste.com', nome: 'Dupla', foto: null,
    })
    const segunda = await postWebhook({ tipo: 'usuario.criado' })

    expect(segunda.body).toEqual({ processado: false, motivo: 'duplicado' })
    expect(await prisma.usuario.count({ where: { email: 'dupla@teste.com' } })).toBe(1)
  })
})
