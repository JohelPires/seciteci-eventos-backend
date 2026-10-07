const request = require('supertest')
const app = require('../app')
const { prisma, resetDb } = require('./db')
const { createUser, tokenFor, eventoPayload, createEvento } = require('./factories')

beforeEach(resetDb)

const emUmDia = 24 * 60 * 60 * 1000

describe('POST /api/eventos', () => {
  test('sem token -> 401 "Token não fornecido"', async () => {
    const res = await request(app).post('/api/eventos').send({})
    expect(res.statusCode).toBe(401)
    expect(res.body.error).toBe('Token não fornecido')
  })

  test('usuario qualquer cria sempre como rascunho', async () => {
    const user = await createUser()
    const res = await request(app)
      .post('/api/eventos')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send(eventoPayload({ status: 'publicado' }))

    expect(res.statusCode).toBe(201)
    expect(res.body.evento.status).toBe('rascunho')
    expect(res.body.evento.organizadorId).toBe(user.id)
  })

  test('admin cria como publicado', async () => {
    const admin = await createUser({ tipoUsuario: 'admin' })
    const res = await request(app)
      .post('/api/eventos')
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send(eventoPayload({ status: 'publicado' }))

    expect(res.statusCode).toBe(201)
    expect(res.body.evento.status).toBe('publicado')
  })

  test('vagas acompanham a capacidade informada', async () => {
    const user = await createUser()
    const res = await request(app)
      .post('/api/eventos')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send(eventoPayload({ capacidadeMaxima: 10 }))

    expect(res.body.evento.capacidadeMaxima).toBe(10)
    expect(res.body.evento.vagasDisponiveis).toBe(10)
  })

  test('payload invalido -> 400', async () => {
    const user = await createUser()
    const res = await request(app)
      .post('/api/eventos')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ titulo: 'X', tipoEvento: 'presencial' })

    expect(res.statusCode).toBe(400)
    expect(Array.isArray(res.body.errors)).toBe(true)
  })
})

describe('GET /api/eventos', () => {
  test('lista paginada (2 por página de 3)', async () => {
    const user = await createUser()
    for (let i = 0; i < 3; i++) {
      await createEvento(user.id, {
        titulo: `Listagem-${i}`,
        dataInicio: new Date(Date.now() + (i + 1) * emUmDia).toISOString(),
      })
    }

    const res = await request(app).get('/api/eventos?limit=2&page=1')

    expect(res.statusCode).toBe(200)
    expect(res.body.eventos).toHaveLength(2)
    expect(res.body.pagination.total).toBe(3)
    expect(res.body.pagination.totalPages).toBe(2)
  })

  test('filtro ?status=rascunho so mostra rascunho', async () => {
    const user = await createUser()
    await createEvento(user.id, { titulo: 'Meu-Rascunho', status: 'rascunho' })
    await createEvento(user.id, { titulo: 'Meu-Publicado' })

    const res = await request(app).get('/api/eventos?status=rascunho')

    expect(res.statusCode).toBe(200)
    expect(res.body.eventos).toHaveLength(1)
    expect(res.body.eventos[0].titulo).toBe('Meu-Rascunho')
  })

  test('busca por título (contains, sem acento na query)', async () => {
    const user = await createUser()
    await createEvento(user.id, { titulo: 'Semana de Inovacao Tech' })
    await createEvento(user.id, { titulo: 'Outro Titulo' })

    const res = await request(app).get('/api/eventos?busca=tech')

    expect(res.statusCode).toBe(200)
    expect(res.body.eventos.some((e) => e.titulo === 'Semana de Inovacao Tech')).toBe(true)
    expect(res.body.eventos.some((e) => e.titulo === 'Outro Titulo')).toBe(false)
  })
})

describe('GET /api/eventos/:id', () => {
  test('detalhe inclui organizador', async () => {
    const user = await createUser({ nome: 'Org Detalhe' })
    const evento = await createEvento(user.id)

    const res = await request(app).get(`/api/eventos/${evento.id}`)

    expect(res.statusCode).toBe(200)
    expect(res.body.evento.organizador.nome).toBe('Org Detalhe')
    expect(res.body.evento.id).toBe(evento.id)
  })

  test('id inexistente -> 404', async () => {
    const res = await request(app).get('/api/eventos/9999999')
    expect(res.statusCode).toBe(404)
    expect(res.body.error).toBe('Evento não encontrado')
  })
})

describe('PUT /api/eventos/:id', () => {
  test('nao-dono -> 403 "Sem permissão para editar este evento"', async () => {
    const owner = await createUser()
    const strang = await createUser()
    const evento = await createEvento(owner.id)

    const res = await request(app)
      .put(`/api/eventos/${evento.id}`)
      .set('Authorization', `Bearer ${tokenFor(strang)}`)
      .send({ titulo: 'Outra submissao' })

    expect(res.statusCode).toBe(403)
    expect(res.body.error).toBe('Sem permissão para editar este evento')
  })

  test('dono edita -> 200', async () => {
    const owner = await createUser()
    const evento = await createEvento(owner.id, { titulo: 'Antes' })

    const res = await request(app)
      .put(`/api/eventos/${evento.id}`)
      .set('Authorization', `Bearer ${tokenFor(owner)}`)
      .send({ titulo: 'Depois' })

    expect(res.statusCode).toBe(200)
    expect(res.body.evento.titulo).toBe('Depois')
  })

  test('admin edita evento alheio -> 200', async () => {
    const owner = await createUser()
    const admin = await createUser({ tipoUsuario: 'admin' })
    const evento = await createEvento(owner.id, { titulo: 'Original' })

    const res = await request(app)
      .put(`/api/eventos/${evento.id}`)
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ titulo: 'Editado pelo admin' })

    expect(res.statusCode).toBe(200)
    expect(res.body.evento.titulo).toBe('Editado pelo admin')
  })

  test('nao-admin nao publica -> 403', async () => {
    const owner = await createUser()
    const evento = await createEvento(owner.id, { status: 'rascunho' })

    const res = await request(app)
      .put(`/api/eventos/${evento.id}`)
      .set('Authorization', `Bearer ${tokenFor(owner)}`)
      .send({ status: 'publicado' })

    expect(res.statusCode).toBe(403)
    expect(res.body.error).toBe('Apenas administradores podem publicar eventos')
  })
})

describe('DELETE /api/eventos/:id', () => {
  test('nao-dono -> 403', async () => {
    const owner = await createUser()
    const other = await createUser()
    const evento = await createEvento(owner.id)

    const res = await request(app)
      .delete(`/api/eventos/${evento.id}`)
      .set('Authorization', `Bearer ${tokenFor(other)}`)

    expect(res.statusCode).toBe(403)
    expect(res.body.error).toBe('Sem permissão para deletar este evento')
  })

  test('dono sem inscricoes -> 200 e some da base', async () => {
    const owner = await createUser()
    const evento = await createEvento(owner.id)

    const res = await request(app)
      .delete(`/api/eventos/${evento.id}`)
      .set('Authorization', `Bearer ${tokenFor(owner)}`)

    expect(res.statusCode).toBe(200)
    expect(res.body.message).toBe('Evento deletado com sucesso')
    expect(await prisma.evento.findUnique({ where: { id: evento.id } })).toBeNull()
  })

  test('com inscricoes -> 400 e não deleta', async () => {
    const owner = await createUser()
    const user = await createUser()
    const evento = await createEvento(owner.id, { capacidadeMaxima: 5 })

    await request(app)
      .post('/api/inscricoes')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ eventoId: evento.id })

    const res = await request(app)
      .delete(`/api/eventos/${evento.id}`)
      .set('Authorization', `Bearer ${tokenFor(owner)}`)

    expect(res.statusCode).toBe(400)
    expect(res.body.error).toBe('Não é possível deletar evento com inscrições. Considere cancelá-lo.')
    expect(await prisma.evento.findUnique({ where: { id: evento.id } })).not.toBeNull()
  })
})
