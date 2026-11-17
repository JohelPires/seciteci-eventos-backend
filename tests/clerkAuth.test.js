jest.mock('@clerk/backend')
jest.mock('@clerk/backend/webhooks')

let { verifyToken, createClerkClient } = require('@clerk/backend')
let { verifyWebhook } = require('@clerk/backend/webhooks')
let adapter

describe('services/clerkAuth', () => {
  beforeEach(() => {
    // O adapter cacheia o cliente Clerk com preguica; resetar o registry
    // garante um cache limpo em cada teste (createClerkClient e remockado).
    jest.resetModules()
    ;({ verifyToken, createClerkClient } = require('@clerk/backend'))
    ;({ verifyWebhook } = require('@clerk/backend/webhooks'))
    adapter = require('../services/clerkAuth')

    process.env.CLERK_SECRET_KEY = 'sk_test_local'
    process.env.CLERK_WEBHOOK_SIGNING_SECRET = 'whsec_test_local'
    delete process.env.CLERK_JWT_KEY
    process.env.CLERK_AUTHORIZED_PARTIES = 'https://painel.teste'
    verifyToken.mockReset()
    verifyWebhook.mockReset()
    createClerkClient.mockReset()
  })

  test('token válido devolve { userId }', async () => {
    verifyToken.mockResolvedValue({ sub: 'user_1' })
    await expect(adapter.verificarSessionToken('tok')).resolves.toEqual({
      userId: 'user_1',
      email: undefined,
    })
    expect(verifyToken).toHaveBeenCalledWith(
      'tok',
      expect.objectContaining({ secretKey: 'sk_test_local', authorizedParties: ['https://painel.teste'] })
    )
  })

  test('usa CLERK_JWT_KEY quando presente', async () => {
    process.env.CLERK_JWT_KEY = '-----BEGIN PUBLIC KEY-----'
    verifyToken.mockResolvedValue({ sub: 'user_1' })
    await adapter.verificarSessionToken('tok')
    expect(verifyToken).toHaveBeenCalledWith(
      'tok',
      expect.objectContaining({ jwtKey: '-----BEGIN PUBLIC KEY-----' })
    )
    expect(verifyToken.mock.calls[0][1].secretKey).toBeUndefined()
  })

  test('claim email vai minusculo', async () => {
    verifyToken.mockResolvedValue({ sub: 'user_1', email: 'Fulano@Teste.COM' })
    await expect(adapter.verificarSessionToken('tok')).resolves.toEqual({
      userId: 'user_1',
      email: 'fulano@teste.com',
    })
  })

  test('verifyToken lancando -> null', async () => {
    verifyToken.mockRejectedValue(new Error('expirado'))
    await expect(adapter.verificarSessionToken('tok')).resolves.toBeNull()
  })

  test('payload sem sub -> null', async () => {
    verifyToken.mockResolvedValue(undefined)
    await expect(adapter.verificarSessionToken('tok')).resolves.toBeNull()
  })

  test('getUsuario devolve email/nome/foto do recurso', async () => {
    const getUser = jest.fn().mockResolvedValue({
      firstName: 'Fulano',
      lastName: 'da Silva',
      imageUrl: 'https://img.clerk.com/foto.png',
      primaryEmailAddressId: 'idn_2',
      emailAddresses: [
        { id: 'idn_1', emailAddress: 'Outro@Teste.com' },
        { id: 'idn_2', emailAddress: 'Fulano@Teste.com' },
      ],
    })
    createClerkClient.mockReturnValue({ users: { getUser } })

    await expect(adapter.getUsuario('user_1')).resolves.toEqual({
      email: 'fulano@teste.com',
      nome: 'Fulano da Silva',
      foto: 'https://img.clerk.com/foto.png',
    })
  })

  test('getUsuario com falha -> null (nunca lanca)', async () => {
    createClerkClient.mockReturnValue({ users: { getUser: jest.fn().mockRejectedValue(new Error('404')) } })
    await expect(adapter.getUsuario('user_x')).resolves.toBeNull()
  })

  test('getUsuario sem e-mail -> null', async () => {
    createClerkClient.mockReturnValue({
      users: { getUser: jest.fn().mockResolvedValue({ firstName: null, lastName: null, imageUrl: '', primaryEmailAddressId: null, emailAddresses: [] }) },
    })
    await expect(adapter.getUsuario('user_1')).resolves.toBeNull()
  })

  test('getUsuario trunca nome em 100 e foto maior que 255 vira null', async () => {
    createClerkClient.mockReturnValue({
      users: {
        getUser: jest.fn().mockResolvedValue({
          firstName: 'N'.repeat(120),
          lastName: null,
          imageUrl: 'https://x/' + 'a'.repeat(260),
          primaryEmailAddressId: 'idn_1',
          emailAddresses: [{ id: 'idn_1', emailAddress: 'a@b.com' }],
        }),
      },
    })
    const r = await adapter.getUsuario('user_1')
    expect(r.nome.length).toBe(100)
    expect(r.foto).toBeNull()
  })

  test('webhook user.created normaliza payload (email principal, nome, foto)', async () => {
    verifyWebhook.mockResolvedValue({
      type: 'user.created',
      data: {
        id: 'user_9',
        first_name: 'Maria',
        last_name: 'Silva',
        image_url: 'https://img.clerk.com/m.png',
        primary_email_address_id: 'idn_1',
        email_addresses: [{ id: 'idn_1', email_address: 'MARIA@Teste.com' }],
      },
    })

    const req = { headers: { 'svix-id': 'msg_1' }, rawBody: Buffer.from('{}') }
    await expect(adapter.verificarWebhook(req)).resolves.toEqual({
      id: 'user_9',
      tipo: 'usuario.criado',
      clerkUserId: 'user_9',
      email: 'maria@teste.com',
      nome: 'Maria Silva',
      foto: 'https://img.clerk.com/m.png',
    })
  })

  test('webhook user.updated mapeia tipo', async () => {
    verifyWebhook.mockResolvedValue({
      type: 'user.updated',
      data: { id: 'user_9', first_name: null, last_name: null, image_url: '', primary_email_address_id: 'idn_1', email_addresses: [{ id: 'idn_1', email_address: 'm@teste.com' }] },
    })
    const r = await adapter.verificarWebhook({ headers: {}, rawBody: Buffer.alloc(0) })
    expect(r.tipo).toBe('usuario.atualizado')
    expect(r.nome).toBeNull()
    expect(r.foto).toBeNull()
  })

  test('webhook user.deleted devolve só o id', async () => {
    verifyWebhook.mockResolvedValue({ type: 'user.deleted', data: { id: 'user_9', deleted: true } })
    const r = await adapter.verificarWebhook({ headers: {}, rawBody: Buffer.alloc(0) })
    expect(r).toEqual({ id: 'user_9', tipo: 'usuario.removido', clerkUserId: 'user_9', email: null, nome: null, foto: null })
  })

  test('webhook de outro evento -> tipo ignorado', async () => {
    verifyWebhook.mockResolvedValue({ type: 'session.created', data: { id: 'sess_1' } })
    const r = await adapter.verificarWebhook({ headers: {}, rawBody: Buffer.alloc(0) })
    expect(r.tipo).toBe('ignorado')
  })

  test('webhook com assinatura invalida LANCA', async () => {
    verifyWebhook.mockRejectedValue(new Error('invalid signature'))
    await expect(adapter.verificarWebhook({ headers: {}, rawBody: Buffer.alloc(0) })).rejects.toThrow()
  })
})
