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

const updateCategoria = async (req, res) => {
   try {
      const { id } = req.params
      const { nome, descricao, icone, cor } = req.body

      const categoria = await prisma.categoria.update({
         where: { id: parseInt(id) },
         data: { nome, descricao, icone, cor },
      })

      res.json({ message: 'Categoria atualizada com sucesso', categoria })
   } catch (error) {
      console.error('Erro ao atualizar categoria:', error)
      res.status(500).json({ error: 'Erro ao atualizar categoria' })
   }
}

const deleteCategoria = async (req, res) => {
   try {
      const { id } = req.params

      const categoria = await prisma.categoria.findUnique({
         where: { id: parseInt(id) },
         include: {
            _count: {
               select: { eventos: true },
            },
         },
      })

      if (!categoria) {
         return res.status(404).json({ error: 'Categoria nao encontrada' })
      }

      if (categoria._count.eventos > 0) {
         return res.status(400).json({ error: 'Nao é possivel deletar uma categoria com eventos' })
      }

      await prisma.categoria.delete({
         where: { id: parseInt(id) },
      })

      res.json({ message: 'Categoria deletada com sucesso' })
   } catch (error) {
      console.error('Erro ao deletar categoria:', error)
      res.status(500).json({ error: 'Erro ao deletar categoria' })
   }
}

module.exports = { getCategorias, createCategoria, deleteCategoria, updateCategoria }
