const { prisma, resetDb } = require('./db')

describe('infra de teste', () => {
  test('env do .env.test carregado', () => {
    expect(process.env.NODE_ENV).toBe('test')
    expect(process.env.JWT_SECRET).toBe('test-secret')
    expect(process.env.CLERK_SECRET_KEY).toBe('sk_test_local')
    expect(process.env.CLERK_WEBHOOK_SIGNING_SECRET).toBe('whsec_test_local')
    expect(process.env.EMAIL_ENABLED).toBe('false')
  })

  test('resetDb deixa o banco vazio', async () => {
    await resetDb()
    const rows = await prisma.$queryRawUnsafe('SELECT COUNT(*)::int AS n FROM usuarios')
    expect(rows[0].n).toBe(0)
  })

  test('TRUNCATE reseta sequências (RESTART IDENTITY)', async () => {
    const a = await prisma.usuario.create({
      data: { nome: 'A', email: 'a@teste.com', senha: 'x', tipoUsuario: 'participante' },
    })
    await resetDb()
    const b = await prisma.usuario.create({
      data: { nome: 'B', email: 'b@teste.com', senha: 'x', tipoUsuario: 'participante' },
    })
    expect(b.id).toBe(a.id)
    expect(await prisma.usuario.count()).toBe(1)
  })
})
