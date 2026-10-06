const NodeCache = require('node-cache')
const cache = new NodeCache({ stdTTL: 86400, checkperiod: 3600 }) // TTL = 60s

const prisma = require('../config/prisma')
const { sendMailSafe } = require('../services/emailService')
const { eventoCriadoTemplate } = require('../services/emailTemplates/eventoCriado')

const getEventos = async (req, res) => {
   try {
      const { categoria, cidade, status, tipo, busca, page = 1, limit = 10 } = req.query

      // Criar uma chave única com base nos filtros
      const cacheKey = `eventos:${JSON.stringify(req.query)}`
      const cachedData = cache.get(cacheKey)

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
      cache.set(cacheKey, responseData)

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
      const cachedEvento = cache.get(cacheKey)

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
      cache.set(cacheKey, responseData)

      res.json(responseData)
   } catch (error) {
      console.error('Erro ao buscar evento:', error)
      res.status(500).json({ error: 'Erro ao buscar evento' })
   }
}

const createEvento = async (req, res) => {
   try {
      const {
         titulo,
         descricao,
         categoriaId,
         dataInicio,
         dataFim,
         horarioAbertura,
         horarioEncerramento,
         capacidadeMaxima,
         valorInscricao,
         tipoEvento,
         linkOnline,
         LocalLinkGoogleMaps,
         linkPaginaEvento,
         LocalNome,
         LocalEndereco,
         LocalNumero,
         LocalComplemento,
         LocalBairro,
         LocalCidade,
         LocalEstado,
         LocalCep,
         LocalPais,
         LocalCapacidade,
         LocalLatitude,
         LocalLongitude,
         LocalObservacoes,
         imagemCapa,
         status,
         publicoAlvo,
         requisitos,
      } = req.body

      const evento = await prisma.evento.create({
         data: {
            titulo,
            descricao,
            categoriaId: categoriaId ? parseInt(categoriaId) : null,
            organizadorId: req.userId,
            dataInicio: new Date(dataInicio),
            dataFim: new Date(dataFim),
            horarioAbertura: horarioAbertura ? new Date(`1970-01-01T${horarioAbertura}`) : null,
            horarioEncerramento: horarioEncerramento ? new Date(`1970-01-01T${horarioEncerramento}`) : null,
            capacidadeMaxima: capacidadeMaxima ? parseInt(capacidadeMaxima) : null,
            vagasDisponiveis: capacidadeMaxima ? parseInt(capacidadeMaxima) : null,
            valorInscricao: valorInscricao || 0,
            tipoEvento: tipoEvento || 'presencial',
            linkOnline,
            LocalLinkGoogleMaps: LocalLinkGoogleMaps,
            linkPaginaEvento,
            LocalNome: LocalNome || 'A definir',
            LocalEndereco: LocalEndereco || '',
            LocalNumero,
            LocalComplemento,
            LocalBairro,
            LocalCidade: LocalCidade || 'Cuiabá',
            LocalEstado: LocalEstado || 'MT',
            LocalCep,
            LocalPais: LocalPais || 'Brasil',
            LocalCapacidade: LocalCapacidade ? parseInt(LocalCapacidade) : null,
            LocalLatitude: LocalLatitude ? parseFloat(LocalLatitude) : null,
            LocalLongitude: LocalLongitude ? parseFloat(LocalLongitude) : null,
            LocalObservacoes,
            imagemCapa,
            status: status || 'rascunho',
            publicoAlvo,
            requisitos,
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
      res.status(500).json({ error: 'Erro ao criar evento' })
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

      const dadosAtualizacao = { ...req.body }

      // Remover campos que não devem ser atualizados diretamente
      delete dadosAtualizacao.id
      delete dadosAtualizacao.organizadorId
      delete dadosAtualizacao.dataCriacao

      // Converter datas se fornecidas
      if (dadosAtualizacao.dataInicio) {
         dadosAtualizacao.dataInicio = new Date(dadosAtualizacao.dataInicio)
      }
      if (dadosAtualizacao.dataFim) {
         dadosAtualizacao.dataFim = new Date(dadosAtualizacao.dataFim)
      }
      if (dadosAtualizacao.horarioAbertura) {
         dadosAtualizacao.horarioAbertura = new Date(`1970-01-01T${dadosAtualizacao.horarioAbertura}`)
      }
      if (dadosAtualizacao.horarioEncerramento) {
         dadosAtualizacao.horarioEncerramento = new Date(`1970-01-01T${dadosAtualizacao.horarioEncerramento}`)
      }

      // Converter números se fornecidos
      if (dadosAtualizacao.capacidadeMaxima) {
         dadosAtualizacao.capacidadeMaxima = parseInt(dadosAtualizacao.capacidadeMaxima)
      }
      if (dadosAtualizacao.LocalCapacidade) {
         dadosAtualizacao.LocalCapacidade = parseInt(dadosAtualizacao.LocalCapacidade)
      }
      if (dadosAtualizacao.LocalLatitude) {
         dadosAtualizacao.LocalLatitude = parseFloat(dadosAtualizacao.LocalLatitude)
      }
      if (dadosAtualizacao.LocalLongitude) {
         dadosAtualizacao.LocalLongitude = parseFloat(dadosAtualizacao.LocalLongitude)
      }

      // Mapear nomes de campos se necessário
      if (dadosAtualizacao.linkGoogleMaps !== undefined) {
         dadosAtualizacao.LocalLinkGoogleMaps = dadosAtualizacao.linkGoogleMaps
         delete dadosAtualizacao.linkGoogleMaps
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

      res.json({
         message: 'Evento atualizado com sucesso',
         evento: eventoAtualizado,
      })
   } catch (error) {
      console.error('Erro ao atualizar evento:', error)
      res.status(500).json({ error: 'Erro ao atualizar evento' })
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
