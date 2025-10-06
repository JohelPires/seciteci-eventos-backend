const prisma = require("../config/prisma");

const getLocais = async (req, res) => {
  try {
    const { cidade, estado } = req.query;
    const where = {};

    if (cidade) where.cidade = cidade;
    if (estado) where.estado = estado;

    const locais = await prisma.local.findMany({
      where,
      include: {
        _count: {
          select: { eventos: true },
        },
      },
    });

    res.json({ locais });
  } catch (error) {
    console.error("Erro ao buscar locais:", error);
    res.status(500).json({ error: "Erro ao buscar locais" });
  }
};

const createLocal = async (req, res) => {
  try {
    const {
      nome,
      endereco,
      numero,
      complemento,
      bairro,
      cidade,
      estado,
      cep,
      pais,
      capacidade,
      latitude,
      longitude,
      observacoes,
    } = req.body;

    const local = await prisma.local.create({
      data: {
        nome,
        endereco,
        numero,
        complemento,
        bairro,
        cidade,
        estado,
        cep,
        pais,
        capacidade,
        latitude,
        longitude,
        observacoes,
      },
    });

    res.status(201).json({
      message: "Local criado com sucesso",
      local,
    });
  } catch (error) {
    console.error("Erro ao criar local:", error);
    res.status(500).json({ error: "Erro ao criar local" });
  }
};

module.exports = { getLocais, createLocal };
