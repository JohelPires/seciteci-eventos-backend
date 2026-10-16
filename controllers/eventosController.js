const NodeCache = require('node-cache')
const cache = new NodeCache({ stdTTL: 86400, checkperiod: 3600 }) // TTL = 60s
const cacheEnabled = () => process.env.NODE_ENV !== 'test'

const prisma = require('../config/prisma')
const { sendMailSafe } = require('../services/emailService')
const { eventoCriadoTemplate } = require('../services/emailTemplates/eventoCriado')
const { eventoStatusAlteradoTemplate } = require('../services/emailTemplates/eventoStatusAlterado')
const { sanitizeEventoInput, respondPrismaError } = require('../services/eventoPayload')

const getEventos = async (req, res) => {
   try {
      const { categoria, cidade, status, tipo, busca, page = 1, limit = 10 } = req.query

      // Criar uma chave única com base nos filtros
      const cacheKey = `eventos:${JSON.stringify(req.query)}`
      const cachedData = cacheEnabled() ? cache.get(cacheKey) : null

      if (cachedData) {
         return res.json({ ...cachedData, cache: true }) // mostra se veio do cache
      }

      const skip = (page - 1) * limit
      const where = {}

      if (categoria) {
         where.categoria = { nome: categoria }
      }

      if (cidade) {
         where.LocalCidade = cidade
      }

      if (status) {
         where.status = status
      }

      if (tipo) {
         where.tipoEvento = tipo
      }

      if (busca) {
         where.OR = [
            { titulo: { contains: busca, mode: 'insensitive' } },
            { descricao: { contains: busca, mode: 'insensitive' } },
            { LocalCidade: { contains: busca, mode: 'insensitive' } },
            { LocalNome: { contains: busca, mode: 'insensitive' } },
         ]
      }

      const [eventos, total] = await Promise.all([
         prisma.evento.findMany({
            where,
            include: {
               categoria: true,
            },
            orderBy: { dataInicio: 'asc' },
            skip: parseInt(skip),
            take: parseInt(limit),
         }),
         prisma.evento.count({ where }),
      ])

      const responseData = {
         eventos,
         pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            totalPages: Math.ceil(total / limit),
         },
         cache: false,
      }

      // Armazenar os dados no cache
      if (cacheEnabled()) {
         cache.set(cacheKey, responseData)
      }

      res.json(responseData)
   } catch (error) {
      console.error('Erro ao buscar eventos:', error)
      res.status(500).json({ error: 'Erro ao buscar eventos' })
   }
}

const getEventoById = async (req, res) => {
   try {
      const { id } = req.params

      // Pegar do cache
      const cacheKey = `evento:${id}`
      const cachedEvento = cacheEnabled() ? cache.get(cacheKey) : null

      if (cachedEvento) {
         return res.json({ ...cachedEvento, cache: true })
      }

      const evento = await prisma.evento.findUnique({
         where: { id: parseInt(id) },
         include: {
            categoria: true,
            organizador: {
               select: {
                  id: true,
                  nome: true,
                  email: true,
                  telefone: true,
               },
            },
            programacao: {
               include: {
                  palestrante: true,
               },
               orderBy: [{ dataAtividade: 'asc' }, { horarioInicio: 'asc' }],
            },
            avaliacoes: {
               include: {
                  usuario: {
                     select: {
                        id: true,
                        nome: true,
                        fotoPerfil: true,
                     },
                  },
               },
               orderBy: { dataAvaliacao: 'desc' },
               take: 10,
            },
            _count: {
               select: {
                  inscricoes: true,
                  avaliacoes: true,
               },
            },
         },
      })

      if (!evento) {
         return res.status(404).json({ error: 'Evento não encontrado' })
      }

      // Calcular média de avaliações
      const mediaAvaliacoes =
         evento.avaliacoes.length > 0
            ? evento.avaliacoes.reduce((acc, av) => acc + av.nota, 0) / evento.avaliacoes.length
            : 0

      const responseData = {
         evento: {
            ...evento,
            mediaAvaliacoes: mediaAvaliacoes.toFixed(1),
         },
         cache: false,
      }

      // Armazenar os dados no cache
      if (cacheEnabled()) {
         cache.set(cacheKey, responseData)
      }

      res.json(responseData)
   } catch (error) {
      console.error('Erro ao buscar evento:', error)
      res.status(500).json({ error: 'Erro ao buscar evento' })
   }
}

const createEvento = async (req, res) => {
   try {
      // Apenas administradores podem criar o evento já publicado;
      // qualquer outro usuário cria sempre como rascunho.
      const statusFinal =
         req.userType === 'admin' ? req.body.status || 'rascunho' : 'rascunho'

      // Whitelist + normalização: converte categoriaId/datas/números, descarta
      // campos que não são coluna do modelo Evento.
      const dados = sanitizeEventoInput(req.body)

      const evento = await prisma.evento.create({
         data: {
            ...dados,
            organizadorId: req.userId,
            // Derivados e defaults (mantém comportamento anterior)
            vagasDisponiveis: dados.capacidadeMaxima ? dados.capacidadeMaxima : null,
            valorInscricao: dados.valorInscricao || 0,
            tipoEvento: dados.tipoEvento || 'presencial',
            LocalNome: dados.LocalNome || 'A definir',
            LocalEndereco: dados.LocalEndereco || '',
            LocalCidade: dados.LocalCidade || 'Cuiabá',
            LocalEstado: dados.LocalEstado || 'MT',
            LocalPais: dados.LocalPais || 'Brasil',
            status: statusFinal,
         },
         include: {
            categoria: true,
            organizador: {
               select: {
                  id: true,
                  nome: true,
                  email: true,
               },
            },
         },
      })

      cache.flushAll() // remove todo cache

      sendMailSafe(evento.organizador.email, eventoCriadoTemplate({ usuario: evento.organizador, evento }))

      res.status(201).json({
         message: 'Evento criado com sucesso',
         evento,
      })
   } catch (error) {
      console.error('Erro ao criar evento:', error)
      respondPrismaError(error, res, {
         validacao: 'Dados inválidos para criar o evento',
         duplicado: 'Registro duplicado',
         referencia: 'Referência inválida (categoria ou local inexistente)',
         padrao: 'Erro ao criar evento',
      })
   }
}

const updateEvento = async (req, res) => {
   try {
      const { id } = req.params

      const evento = await prisma.evento.findUnique({
         where: { id: parseInt(id) },
      })

      if (!evento) {
         return res.status(404).json({ error: 'Evento não encontrado' })
      }

      if (evento.organizadorId !== req.userId && req.userType !== 'admin') {
         return res.status(403).json({ error: 'Sem permissão para editar este evento' })
      }

      // Whitelist + normalização: ignoram-se campos que não são coluna (ex.:
      // resposta do GET com categoria/organizador/_count/cache) e convertem-se
      // tipos (categoriaId string, datas, horários, números).
      const dadosAtualizacao = sanitizeEventoInput(req.body)

      // Normalizar e validar o motivo de cancelamento
      if (
         dadosAtualizacao.motivoCancelamento !== undefined &&
         dadosAtualizacao.motivoCancelamento !== null
      ) {
         if (typeof dadosAtualizacao.motivoCancelamento !== 'string') {
            return res.status(400).json({ error: 'Motivo de cancelamento inválido' })
         }
         dadosAtualizacao.motivoCancelamento = dadosAtualizacao.motivoCancelamento.trim()
         if (dadosAtualizacao.motivoCancelamento.length > 1000) {
            return res
               .status(400)
               .json({ error: 'Motivo de cancelamento deve ter no máximo 1000 caracteres' })
         }
         if (dadosAtualizacao.motivoCancelamento === '') {
            dadosAtualizacao.motivoCancelamento = null
         }
      }

      // Limpar o motivo sempre que o status resultante não for "cancelado"
      const statusEfetivo =
         dadosAtualizacao.status !== undefined ? dadosAtualizacao.status : evento.status
      if (statusEfetivo !== 'cancelado') {
         dadosAtualizacao.motivoCancelamento = null
      }

      // Apenas administradores podem publicar eventos
      if (
         dadosAtualizacao.status !== undefined &&
         req.userType !== 'admin' &&
         dadosAtualizacao.status === 'publicado'
      ) {
         return res
            .status(403)
            .json({ error: 'Apenas administradores podem publicar eventos' })
      }

      const eventoAtualizado = await prisma.evento.update({
         where: { id: parseInt(id) },
         data: dadosAtualizacao,
         include: {
            categoria: true,
            organizador: {
               select: {
                  id: true,
                  nome: true,
                  email: true,
               },
            },
         },
      })

      cache.flushAll() // remove todo cache

      if (dadosAtualizacao.status && dadosAtualizacao.status !== evento.status) {
         sendMailSafe(
            eventoAtualizado.organizador.email,
            eventoStatusAlteradoTemplate({
               usuario: eventoAtualizado.organizador,
               evento: eventoAtualizado,
               statusAnterior: evento.status,
               statusNovo: dadosAtualizacao.status,
               motivoCancelamento: eventoAtualizado.motivoCancelamento,
            })
         )
      }

      res.json({
         message: 'Evento atualizado com sucesso',
         evento: eventoAtualizado,
      })
   } catch (error) {
      console.error('Erro ao atualizar evento:', error)
      respondPrismaError(error, res, {
         naoEncontrado: 'Evento não encontrado',
         duplicado: 'Registro duplicado',
         referencia: 'Referência inválida (categoria ou local inexistente)',
         validacao: 'Dados inválidos para atualização do evento',
         padrao: 'Erro ao atualizar evento',
      })
   }
}

const deleteEvento = async (req, res) => {
   try {
      const { id } = req.params

      const evento = await prisma.evento.findUnique({
         where: { id: parseInt(id) },
         include: {
            _count: {
               select: { inscricoes: true },
            },
         },
      })

      if (!evento) {
         return res.status(404).json({ error: 'Evento não encontrado' })
      }

      if (evento.organizadorId !== req.userId && req.userType !== 'admin') {
         return res.status(403).json({ error: 'Sem permissão para deletar este evento' })
      }

      if (evento._count.inscricoes > 0) {
         return res.status(400).json({
            error: 'Não é possível deletar evento com inscrições. Considere cancelá-lo.',
         })
      }

      await prisma.evento.delete({
         where: { id: parseInt(id) },
      })

      cache.flushAll() // remove todo cache

      res.json({ message: 'Evento deletado com sucesso' })
   } catch (error) {
      console.error('Erro ao deletar evento:', error)
      res.status(500).json({ error: 'Erro ao deletar evento' })
   }
}

const getMeusEventos = async (req, res) => {
   try {
      const eventos = await prisma.evento.findMany({
         where: { organizadorId: req.userId },
         include: {
            categoria: true,
            _count: {
               select: {
                  inscricoes: true,
                  avaliacoes: true,
               },
            },
         },
         orderBy: { dataCriacao: 'desc' },
      })

      res.json({ eventos })
   } catch (error) {
      console.error('Erro ao buscar meus eventos:', error)
      res.status(500).json({ error: 'Erro ao buscar eventos' })
   }
}

const getEventosPorCidade = async (req, res) => {
   try {
      const cidades = await prisma.evento.groupBy({
         by: ['LocalCidade'],
         _count: {
            _all: true,
         },
         where: {
            status: 'publicado',
         },
         orderBy: {
            _count: {
               LocalCidade: 'desc',
            },
         },
      })

      res.json({ cidades })
   } catch (error) {
      console.error('Erro ao buscar eventos por cidade:', error)
      res.status(500).json({ error: 'Erro ao buscar dados' })
   }
}

const getEventosDestaque = async (req, res) => {
   try {
      const eventos = await prisma.evento.findMany({
         where: {
            destaque: true,
            status: 'publicado',
         },
         include: {
            categoria: true,
            organizador: {
               select: {
                  id: true,
                  nome: true,
               },
            },
            _count: {
               select: {
                  inscricoes: true,
               },
            },
         },
         orderBy: { dataInicio: 'asc' },
         take: 6,
      })

      res.json({ eventos })
   } catch (error) {
      console.error('Erro ao buscar eventos em destaque:', error)
      res.status(500).json({ error: 'Erro ao buscar eventos' })
   }
}

module.exports = {
   getEventos,
   getEventoById,
   createEvento,
   updateEvento,
   deleteEvento,
   getMeusEventos,
   getEventosPorCidade,
   getEventosDestaque,
}
