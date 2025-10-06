const prisma = require("../config/prisma");

const createAvaliacao = async (req, res) => {
  try {
    const { eventoId, nota, comentario } = req.body;
    const usuarioId = req.userId;

    if (nota < 1 || nota > 5) {
      return res.status(400).json({ error: "Nota deve ser entre 1 e 5" });
    }

    // Verificar se usuário participou do evento
    const inscricao = await prisma.inscricao.findUnique({
      where: {
        eventoId_usuarioId: {
          eventoId: parseInt(eventoId),
          usuarioId,
        },
      },
    });

    if (!inscricao || inscricao.statusInscricao !== "confirmada") {
      return res
        .status(400)
        .json({ error: "Apenas participantes podem avaliar o evento" });
    }

    // Verificar se já avaliou
    const avaliacaoExiste = await prisma.avaliacao.findUnique({
      where: {
        eventoId_usuarioId: {
          eventoId: parseInt(eventoId),
          usuarioId,
        },
      },
    });

    if (avaliacaoExiste) {
      return res.status(400).json({ error: "Você já avaliou este evento" });
    }

    const avaliacao = await prisma.avaliacao.create({
      data: {
        eventoId: parseInt(eventoId),
        usuarioId,
        nota: parseInt(nota),
        comentario,
      },
      include: {
        usuario: {
          select: {
            nome: true,
            fotoPerfil: true,
          },
        },
      },
    });

    res.status(201).json({
      message: "Avaliação criada com sucesso",
      avaliacao,
    });
  } catch (error) {
    console.error("Erro ao criar avaliação:", error);
    res.status(500).json({ error: "Erro ao criar avaliação" });
  }
};

const getAvaliacoesEvento = async (req, res) => {
  try {
    const { eventoId } = req.params;

    const avaliacoes = await prisma.avaliacao.findMany({
      where: { eventoId: parseInt(eventoId) },
      include: {
        usuario: {
          select: {
            id: true,
            nome: true,
            fotoPerfil: true,
          },
        },
      },
      orderBy: { dataAvaliacao: "desc" },
    });

    const media =
      avaliacoes.length > 0
        ? avaliacoes.reduce((acc, av) => acc + av.nota, 0) / avaliacoes.length
        : 0;

    res.json({
      avaliacoes,
      estatisticas: {
        total: avaliacoes.length,
        media: media.toFixed(1),
      },
    });
  } catch (error) {
    console.error("Erro ao buscar avaliações:", error);
    res.status(500).json({ error: "Erro ao buscar avaliações" });
  }
};

module.exports = { createAvaliacao, getAvaliacoesEvento };
