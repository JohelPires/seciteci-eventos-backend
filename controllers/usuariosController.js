const prisma = require('../config/prisma')

const getUsuarios = async (req, res) => {
   try {
      const { nome, email, telefone, cpf, tipoUsuario, ativo, busca, page = 1, limit = 10 } = req.query

      const skip = (page - 1) * limit
      const where = {}

      if (nome) {
         where.nome = nome
      }

      if (email) {
         where.email = email
      }

      if (telefone) {
         where.telefone = telefone
      }

      if (cpf) {
         where.cpf = cpf
      }

      if (tipoUsuario) {
         where.tipoUsuario = tipoUsuario
      }

      if (ativo) {
         where.ativo = ativo
      }

      if (busca) {
         where.OR = [
            { nome: { contains: busca, mode: 'insensitive' } },
            { email: { contains: busca, mode: 'insensitive' } },
            { telefone: { contains: busca, mode: 'insensitive' } },
            { cpf: { contains: busca, mode: 'insensitive' } },
         ]
      }

      const [usuarios, total] = await Promise.all([
         prisma.usuario.findMany({
            where,
            orderBy: { nome: 'asc' },
            skip: parseInt(skip),
            take: parseInt(limit),
         }),
         prisma.usuario.count({ where }),
      ])

      res.json({
         usuarios,
         pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            totalPages: Math.ceil(total / limit),
         },
      })
   } catch (error) {
      console.error('Erro ao buscar usuários:', error)
      res.status(500).json({ error: 'Erro ao buscar usuários' })
   }
}

const promoverUsuarioAdmin = async (req, res) => {
   try {
      const id = parseInt(req.params.id, 10)

      if (!Number.isInteger(id) || id < 1) {
         return res.status(400).json({ error: 'ID de usuário inválido' })
      }

      const usuario = await prisma.usuario.findUnique({
         where: { id },
         select: { id: true, nome: true, email: true, tipoUsuario: true },
      })

      if (!usuario) {
         return res.status(404).json({ error: 'Usuário não encontrado' })
      }

      if (usuario.tipoUsuario === 'admin') {
         return res.status(200).json({
            message: 'Usuário já é administrador',
            user: usuario,
         })
      }

      const user = await prisma.usuario.update({
         where: { id },
         data: { tipoUsuario: 'admin' },
         select: { id: true, nome: true, email: true, tipoUsuario: true },
      })

      res.status(200).json({
         message: 'Usuário promovido a administrador',
         user,
      })
   } catch (error) {
      console.error('Erro ao promover usuário a administrador:', error)
      res.status(500).json({ error: 'Erro ao promover usuário a administrador' })
   }
}

module.exports = {
   getUsuarios,
   promoverUsuarioAdmin,
}
