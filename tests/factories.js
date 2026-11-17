const bcrypt = require('bcryptjs')
const { prisma } = require('./db')
const clerkMock = require('./clerkMock')

let counter = 0

async function createUser(overrides = {}) {
  counter += 1
  const {
    nome = `Usuario ${counter}`,
    email = `usuario${counter}@teste.com`,
    senha = 'senha123',
    telefone = null,
    cpf = null,
    dataNascimento = null,
    tipoUsuario = 'participante',
    ativo = true,
    googleId = null,
  } = overrides

  const clerkUserId =
    'clerkUserId' in overrides ? overrides.clerkUserId : `clerk_u_${counter}`

  const data = { nome, email, telefone, cpf, dataNascimento, tipoUsuario, ativo, googleId, clerkUserId }
  data.senha = senha === null ? null : await bcrypt.hash(senha, 10)

  const user = await prisma.usuario.create({ data })

  if (clerkUserId) {
    clerkMock.mock.__registry.set(clerkUserId, { email, nome, foto: null })
  }

  return { ...user, senhaPlano: senha }
}

function tokenFor(user) {
  return `clerk-test:${user.clerkUserId}`
}

const emUmDia = 24 * 60 * 60 * 1000

function eventoPayload(overrides = {}) {
  return {
    titulo: 'Evento de Teste',
    descricao: 'Descrição do evento de teste',
    dataInicio: new Date(Date.now() + 7 * emUmDia).toISOString(),
    dataFim: new Date(Date.now() + 8 * emUmDia).toISOString(),
    tipoEvento: 'presencial',
    LocalNome: 'Estádio de Teste',
    LocalEndereco: 'Av. Teste, 123',
    LocalCidade: 'Cuiabá',
    LocalEstado: 'MT',
    ...overrides,
  }
}

async function createEvento(organizadorId, overrides = {}) {
  const d = eventoPayload(overrides)
  const status = overrides.status ?? 'publicado'
  const capacidadeMaxima = overrides.capacidadeMaxima ?? null
  const vagasDisponiveis = overrides.vagasDisponiveis ?? capacidadeMaxima

  return prisma.evento.create({
    data: {
      titulo: d.titulo,
      descricao: d.descricao,
      dataInicio: new Date(d.dataInicio),
      dataFim: new Date(d.dataFim),
      tipoEvento: d.tipoEvento,
      status,
      capacidadeMaxima,
      vagasDisponiveis,
      valorInscricao: overrides.valorInscricao ?? 0,
      LocalNome: d.LocalNome,
      LocalEndereco: d.LocalEndereco,
      LocalCidade: d.LocalCidade,
      LocalEstado: d.LocalEstado,
      organizadorId,
    },
  })
}

module.exports = { createUser, tokenFor, eventoPayload, createEvento }
