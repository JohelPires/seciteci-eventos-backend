const request = require('supertest')
const app = require('../app')
const { prisma, resetDb } = require('./db')
const { createUser, tokenFor, createEvento } = require('./factories')

beforeEach(resetDb)

const emUmDia = 24 * 60 * 60 * 1000

const inscrever = async (user, eventoId) =>
  request(app)
    .post('/api/inscricoes')
    .set('Authorization', `Bearer ${tokenFor(user)}`)
    .send({ eventoId })

describe('POST /api/inscricoes', () => {
  test('201 confirmada, decrementa vagas e cria notificação', async () => {
    const org = await createUser()
    const user = await createUser()
    const evento = await createEvento(org.id, { capacidadeMaxima: 2 })

    const res = await inscrever(user, evento.id)

    expect(res.statusCode).toBe(201)
    expect(res.body.inscricao.statusInscricao).toBe('confirmada')

    const eventoDb = await prisma.evento.findUnique({ where: { id: evento.id } })
    expect(eventoDb.vagasDisponiveis).toBe(1)

    const notifs = await prisma.notificacao.findMany({ where: { usuarioId: user.id } })
    expect(notifs).toHaveLength(1)
    expect(notifs[0].tipo).toBe('confirmacao')
    expect(notifs[0].mensagem).toContain(evento.titulo)
  })

  test('evento gratuito -> statusPagamento "isento"; pago -> "pendente"', async () => {
    const org = await createUser()
    const user = await createUser()
    const gratuito = await createEvento(org.id, { valorInscricao: 0 })
    const pago = await createEvento(org.id, { valorInscricao: 50 })

    const resGratuito = await inscrever(user, gratuito.id)
    expect(resGratuito.body.inscricao.statusPagamento).toBe('isento')

    const user2 = await createUser()
    const resPago = await inscrever(user2, pago.id)
    expect(resPago.body.inscricao.statusPagamento).toBe('pendente')
  })

  test('duplicada -> 400 "Você já está inscrito neste evento"', async () => {
    const org = await createUser()
    const user = await createUser()
    const evento = await createEvento(org.id)

    await inscrever(user, evento.id)
    const res = await inscrever(user, evento.id)

    expect(res.statusCode).toBe(400)
    expect(res.body.error).toBe('Você já está inscrito neste evento')
  })

  test('evento rascunho -> 404 indisponível', async () => {
    const org = await createUser()
    const user = await createUser()
    const evento = await createEvento(org.id, { status: 'rascunho' })

    const res = await inscrever(user, evento.id)

    expect(res.statusCode).toBe(404)
    expect(res.body.error).toBe('Evento não encontrado ou não disponível para inscrição')
  })

  test('evento inexistente -> 404', async () => {
    const user = await createUser()
    const res = await inscrever(user, 9999999)

    expect(res.statusCode).toBe(404)
  })

  test('evento já iniciado -> 400 "eventos já iniciados"', async () => {
    const org = await createUser()
    const user = await createUser()
    const evento = await createEvento(org.id, {
      dataInicio: new Date(Date.now() - 2 * emUmDia).toISOString(),
      dataFim: new Date(Date.now() - emUmDia).toISOString(),
    })

    const res = await inscrever(user, evento.id)

    expect(res.statusCode).toBe(400)
    expect(res.body.error).toBe('Não é possível se inscrever em eventos já iniciados')
  })

  test('sem vagas -> 400 "Evento sem vagas disponíveis"', async () => {
    const org = await createUser()
    const user = await createUser()
    const evento = await createEvento(org.id, { capacidadeMaxima: 0 })

    const res = await inscrever(user, evento.id)

    expect(res.statusCode).toBe(400)
    expect(res.body.error).toBe('Evento sem vagas disponíveis')
  })
})

describe('GET /api/minhas-inscricoes', () => {
  test('retorna só inscrições do usuário autenticado', async () => {
    const org = await createUser()
    const userA = await createUser()
    const userB = await createUser()
    const evento = await createEvento(org.id)

    await inscrever(userA, evento.id)
    await inscrever(userB, evento.id)

    const res = await request(app)
      .get('/api/minhas-inscricoes')
      .set('Authorization', `Bearer ${tokenFor(userA)}`)

    expect(res.statusCode).toBe(200)
    expect(res.body.inscricoes).toHaveLength(1)
    expect(res.body.inscricoes[0].usuarioId).toBe(userA.id)
    expect(res.body.inscricoes[0].evento.titulo).toBe(evento.titulo)
  })
})

describe('DELETE /api/inscricoes/:id', () => {
  test('cancelamento devolve vaga, marca cancelada e notifica', async () => {
    const org = await createUser()
    const user = await createUser()
    const evento = await createEvento(org.id, { capacidadeMaxima: 2 })
    const inscricaoRes = await inscrever(user, evento.id)

    const res = await request(app)
      .delete(`/api/inscricoes/${inscricaoRes.body.inscricao.id}`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    expect(res.statusCode).toBe(200)
    expect(res.body.message).toBe('Inscrição cancelada com sucesso')

    const eventoDb = await prisma.evento.findUnique({ where: { id: evento.id } })
    expect(eventoDb.vagasDisponiveis).toBe(2)

    const inscricaoDb = await prisma.inscricao.findUnique({
      where: { id: inscricaoRes.body.inscricao.id },
    })
    expect(inscricaoDb.statusInscricao).toBe('cancelada')

    const notifs = await prisma.notificacao.findMany({
      where: { usuarioId: user.id, tipo: 'cancelamento' },
    })
    expect(notifs).toHaveLength(1)
  })

  test('inscrição de outro usuário -> 404', async () => {
    const org = await createUser()
    const userA = await createUser()
    const userB = await createUser()
    const evento = await createEvento(org.id)
    const inscricaoRes = await inscrever(userA, evento.id)

    const res = await request(app)
      .delete(`/api/inscricoes/${inscricaoRes.body.inscricao.id}`)
      .set('Authorization', `Bearer ${tokenFor(userB)}`)

    expect(res.statusCode).toBe(404)
    expect(res.body.error).toBe('Inscrição não encontrada')
  })

  test('já cancelada -> 400 "Inscrição já cancelada"', async () => {
    const org = await createUser()
    const user = await createUser()
    const evento = await createEvento(org.id)
    const inscricaoRes = await inscrever(user, evento.id)

    await request(app)
      .delete(`/api/inscricoes/${inscricaoRes.body.inscricao.id}`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    const res = await request(app)
      .delete(`/api/inscricoes/${inscricaoRes.body.inscricao.id}`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)

    expect(res.statusCode).toBe(400)
    expect(res.body.error).toBe('Inscrição já cancelada')
  })
})

describe('PATCH /api/inscricoes/:id/presenca', () => {
  test('organizador confirma -> 200 presente true', async () => {
    const org = await createUser()
    const user = await createUser()
    const evento = await createEvento(org.id)
    const inscricaoRes = await inscrever(user, evento.id)

    const res = await request(app)
      .patch(`/api/inscricoes/${inscricaoRes.body.inscricao.id}/presenca`)
      .set('Authorization', `Bearer ${tokenFor(org)}`)

    expect(res.statusCode).toBe(200)
    expect(res.body.inscricao.presente).toBe(true)
    expect(res.body.message).toBe('Presença confirmada com sucesso')
  })

  test('participante estranho -> 403 "Sem permissão para confirmar presença"', async () => {
    const org = await createUser()
    const user = await createUser()
    const stranger = await createUser()
    const evento = await createEvento(org.id)
    const inscricaoRes = await inscrever(user, evento.id)

    const res = await request(app)
      .patch(`/api/inscricoes/${inscricaoRes.body.inscricao.id}/presenca`)
      .set('Authorization', `Bearer ${tokenFor(stranger)}`)

    expect(res.statusCode).toBe(403)
    expect(res.body.error).toBe('Sem permissão para confirmar presença')
  })
})
