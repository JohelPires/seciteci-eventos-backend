const prisma = require('../config/prisma')

const getCategorias = async (req, res) => {
   try {
      const categorias = await prisma.categoria.findMany({
         where: { ativo: true },
         include: {
            _count: {
               select: { eventos: true },
            },
         },
      })

      res.json({ categorias })
   } catch (error) {
      console.error('Erro ao buscar categorias:', error)
      res.status(500).json({ error: 'Erro ao buscar categorias' })
   }
}

const createCategoria = async (req, res) => {
   try {
      const { nome, descricao, icone, cor } = req.body

      const categoriaExiste = await prisma.categoria.findUnique({
         where: { nome },
      })

      if (categoriaExiste) {
         return res.status(400).json({ error: 'Categoria já existe' })
      }

      const categoria = await prisma.categoria.create({
         data: { nome, descricao, icone, cor },
      })

      res.status(201).json({
         message: 'Categoria criada com sucesso',
         categoria,
      })
   } catch (error) {
      console.error('Erro ao criar categoria:', error)
      res.status(500).json({ error: 'Erro ao criar categoria' })
   }
}

module.exports = { getCategorias, createCategoria }
