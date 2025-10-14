const prisma = require('../config/prisma')

const getEventos = async (req, res) => {
   try {
      const { categoria, cidade, status = 'publicado', tipo, busca, page = 1, limit = 10 } = req.query

      const skip = (page - 1) * limit
      const where = {}

      if (categoria) {
         where.categoria = { nome: categoria }
      }

      if (cidade) {
         where.local = { cidade }
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
         ]
      }

      const [eventos, total] = await Promise.all([
         prisma.evento.findMany({
            where,
            include: {
               categoria: true,
               local: {
                  select: {
                     id: true,
                     nome: true,
                     cidade: true,
                     estado: true,
                     endereco: true,
                     latitude: true,
                     longitude: true,
                  },
               },
               organizador: {
                  select: {
                     id: true,
                     nome: true,
                     email: true,
                  },
               },
               _count: {
                  select: {
                     inscricoes: true,
                     avaliacoes: true,
                  },
               },
            },
            orderBy: { dataInicio: 'asc' },
            skip: parseInt(skip),
            take: parseInt(limit),
         }),
         prisma.evento.count({ where }),
      ])

      res.json({
         eventos,
         pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            totalPages: Math.ceil(total / limit),
         },
      })
   } catch (error) {
      console.error('Erro ao buscar eventos:', error)
      res.status(500).json({ error: 'Erro ao buscar eventos' })
   }
}

const getEventoById = async (req, res) => {
   try {
      const { id } = req.params

      const evento = await prisma.evento.findUnique({
         where: { id: parseInt(id) },
         include: {
            categoria: true,
            local: true,
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

      res.json({
         evento: {
            ...evento,
            mediaAvaliacoes: mediaAvaliacoes.toFixed(1),
         },
      })
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
         localId,
         dataInicio,
         dataFim,
         horarioAbertura,
         horarioEncerramento,
         capacidadeMaxima,
         valorInscricao,
         tipoEvento,
         linkOnline,
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
            localId: localId ? parseInt(localId) : null,
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
            imagemCapa,
            status: status || 'rascunho',
            publicoAlvo,
            requisitos,
         },
         include: {
            categoria: true,
            local: true,
            organizador: {
               select: {
                  id: true,
                  nome: true,
                  email: true,
               },
            },
         },
      })

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

      const eventoAtualizado = await prisma.evento.update({
         where: { id: parseInt(id) },
         data: dadosAtualizacao,
         include: {
            categoria: true,
            local: true,
         },
      })

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
            local: true,
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

module.exports = {
   getEventos,
   getEventoById,
   createEvento,
   updateEvento,
   deleteEvento,
   getMeusEventos,
}
