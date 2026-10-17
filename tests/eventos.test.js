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

  test('admin publica enviando o objeto completo do GET (campos nao-editaveis sao ignorados)', async () => {
    const owner = await createUser()
    const admin = await createUser({ tipoUsuario: 'admin' })
    const evento = await createEvento(owner.id, { status: 'rascunho' })

    const detalhe = await request(app).get(`/api/eventos/${evento.id}`)

    const res = await request(app)
      .put(`/api/eventos/${evento.id}`)
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({
        ...detalhe.body.evento,
        status: 'publicado',
        cache: true,
        mediaAvaliacoes: '4.5',
        programacao: [],
        avaliacoes: [],
        _count: { inscricoes: 0, avaliacoes: 0 },
      })

    expect(res.statusCode).toBe(200)
    expect(res.body.evento.status).toBe('publicado')
  })

  test('categoriaId como string persiste como Int', async () => {
    const owner = await createUser()
    const evento = await createEvento(owner.id)
    const cat = await prisma.categoria.create({ data: { nome: 'Cat Update' } })

    const res = await request(app)
      .put(`/api/eventos/${evento.id}`)
      .set('Authorization', `Bearer ${tokenFor(owner)}`)
      .send({ categoriaId: String(cat.id) })

    expect(res.statusCode).toBe(200)
    expect(res.body.evento.categoriaId).toBe(cat.id)
  })

  test('categoriaId inexistente -> 400', async () => {
    const owner = await createUser()
    const evento = await createEvento(owner.id)

    const res = await request(app)
      .put(`/api/eventos/${evento.id}`)
      .set('Authorization', `Bearer ${tokenFor(owner)}`)
      .send({ categoriaId: 999999 })

    expect(res.statusCode).toBe(400)
    expect(res.body.error).toBe('Referência inválida (categoria ou local inexistente)')
  })

  test('status invalido no PUT -> 400 (validador)', async () => {
    const owner = await createUser()
    const evento = await createEvento(owner.id)

    const res = await request(app)
      .put(`/api/eventos/${evento.id}`)
      .set('Authorization', `Bearer ${tokenFor(owner)}`)
      .send({ status: 'qualquer' })

    expect(res.statusCode).toBe(400)
    expect(Array.isArray(res.body.errors)).toBe(true)
  })

  test('cancelar com motivo persiste o motivo', async () => {
    const owner = await createUser()
    const evento = await createEvento(owner.id, { status: 'publicado' })

    const res = await request(app)
      .put(`/api/eventos/${evento.id}`)
      .set('Authorization', `Bearer ${tokenFor(owner)}`)
      .send({ status: 'cancelado', motivoCancelamento: 'Chuva forte' })

    expect(res.statusCode).toBe(200)
    expect(res.body.evento.status).toBe('cancelado')
    expect(res.body.evento.motivoCancelamento).toBe('Chuva forte')
    const noBanco = await prisma.evento.findUnique({ where: { id: evento.id } })
    expect(noBanco.motivoCancelamento).toBe('Chuva forte')

    const detalhe = await request(app).get(`/api/eventos/${evento.id}`)
    expect(detalhe.body.evento.motivoCancelamento).toBe('Chuva forte')
  })

  test('cancelar sem motivo mantem null', async () => {
    const owner = await createUser()
    const evento = await createEvento(owner.id, { status: 'publicado' })

    const res = await request(app)
      .put(`/api/eventos/${evento.id}`)
      .set('Authorization', `Bearer ${tokenFor(owner)}`)
      .send({ status: 'cancelado' })

    expect(res.statusCode).toBe(200)
    expect(res.body.evento.motivoCancelamento).toBeNull()
  })

  test('motivo vazio normaliza para null', async () => {
    const owner = await createUser()
    const evento = await createEvento(owner.id, { status: 'publicado' })

    const res = await request(app)
      .put(`/api/eventos/${evento.id}`)
      .set('Authorization', `Bearer ${tokenFor(owner)}`)
      .send({ status: 'cancelado', motivoCancelamento: '   ' })

    expect(res.statusCode).toBe(200)
    expect(res.body.evento.motivoCancelamento).toBeNull()
  })

  test('reativar evento limpa o motivo', async () => {
    const owner = await createUser()
    const evento = await createEvento(owner.id)
    await prisma.evento.update({
      where: { id: evento.id },
      data: { status: 'cancelado', motivoCancelamento: 'Motivo antigo' },
    })

    const res = await request(app)
      .put(`/api/eventos/${evento.id}`)
      .set('Authorization', `Bearer ${tokenFor(owner)}`)
      .send({ status: 'rascunho' })

    expect(res.statusCode).toBe(200)
    expect(res.body.evento.status).toBe('rascunho')
    expect(res.body.evento.motivoCancelamento).toBeNull()
  })

  test('motivo com mais de 1000 caracteres -> 400', async () => {
    const owner = await createUser()
    const evento = await createEvento(owner.id, { status: 'publicado' })

    const res = await request(app)
      .put(`/api/eventos/${evento.id}`)
      .set('Authorization', `Bearer ${tokenFor(owner)}`)
      .send({ status: 'cancelado', motivoCancelamento: 'a'.repeat(1001) })

    expect(res.statusCode).toBe(400)
    expect(res.body.error).toBe('Motivo de cancelamento deve ter no máximo 1000 caracteres')
  })

  test('editar motivo de evento cancelado -> 200', async () => {
    const owner = await createUser()
    const evento = await createEvento(owner.id)
    await prisma.evento.update({
      where: { id: evento.id },
      data: { status: 'cancelado', motivoCancelamento: 'Motivo antigo' },
    })

    const res = await request(app)
      .put(`/api/eventos/${evento.id}`)
      .set('Authorization', `Bearer ${tokenFor(owner)}`)
      .send({ motivoCancelamento: 'Motivo novo' })

    expect(res.statusCode).toBe(200)
    expect(res.body.evento.motivoCancelamento).toBe('Motivo novo')
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

describe('financiadores', () => {
  test('POST cria evento com financiadores e devolve o array', async () => {
    const user = await createUser()
    const res = await request(app)
      .post('/api/eventos')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send(
        eventoPayload({
          financiadores: [
            { tipo: 'publico', nome: 'MEC' },
            { nome: 'FIEMT' },
          ],
        })
      )

    expect(res.statusCode).toBe(201)
    expect(res.body.evento.financiadores).toHaveLength(2)
    expect(res.body.evento.financiadores[0]).toMatchObject({ tipo: 'publico', nome: 'MEC' })
    expect(res.body.evento.financiadores[1].tipo).toBeNull()
    expect(await prisma.financiador.count({ where: { eventoId: res.body.evento.id } })).toBe(2)
  })

  test('POST sem financiadores cria evento com lista vazia', async () => {
    const user = await createUser()
    const res = await request(app)
      .post('/api/eventos')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send(eventoPayload())

    expect(res.statusCode).toBe(201)
    expect(res.body.evento.financiadores).toEqual([])
  })

  test('POST com financiador sem nome -> 400', async () => {
    const user = await createUser()
    const res = await request(app)
      .post('/api/eventos')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send(eventoPayload({ financiadores: [{ tipo: 'publico' }] }))

    expect(res.statusCode).toBe(400)
    expect(Array.isArray(res.body.errors)).toBe(true)
  })

  test('POST com tipo de financiador invalido -> 400', async () => {
    const user = await createUser()
    const res = await request(app)
      .post('/api/eventos')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send(eventoPayload({ financiadores: [{ nome: 'MEC', tipo: 'estatal' }] }))

    expect(res.statusCode).toBe(400)
    expect(Array.isArray(res.body.errors)).toBe(true)
  })

  test('POST com financiadores que nao e array -> 400', async () => {
    const user = await createUser()
    const res = await request(app)
      .post('/api/eventos')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send(eventoPayload({ financiadores: 'MEC' }))

    expect(res.statusCode).toBe(400)
    expect(Array.isArray(res.body.errors)).toBe(true)
  })

  test('POST com mais de 20 financiadores -> 400', async () => {
    const user = await createUser()
    const muitos = Array.from({ length: 21 }, (_, i) => ({ nome: `Financiador ${i}` }))
    const res = await request(app)
      .post('/api/eventos')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send(eventoPayload({ financiadores: muitos }))

    expect(res.statusCode).toBe(400)
    expect(Array.isArray(res.body.errors)).toBe(true)
  })
})
