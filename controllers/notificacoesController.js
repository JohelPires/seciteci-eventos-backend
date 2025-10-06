const prisma = require("../config/prisma");

const getNotificacoes = async (req, res) => {
  try {
    const { lida } = req.query;
    const where = { usuarioId: req.userId };

    if (lida !== undefined) {
      where.lida = lida === "true";
    }

    const notificacoes = await prisma.notificacao.findMany({
      where,
      include: {
        evento: {
          select: {
            id: true,
            titulo: true,
          },
        },
      },
      orderBy: { dataEnvio: "desc" },
      take: 50,
    });

    const naoLidas = await prisma.notificacao.count({
      where: { usuarioId: req.userId, lida: false },
    });

    res.json({ notificacoes, naoLidas });
  } catch (error) {
    console.error("Erro ao buscar notificações:", error);
    res.status(500).json({ error: "Erro ao buscar notificações" });
  }
};

const marcarComoLida = async (req, res) => {
  try {
    const { id } = req.params;

    const notificacao = await prisma.notificacao.findFirst({
      where: {
        id: parseInt(id),
        usuarioId: req.userId,
      },
    });

    if (!notificacao) {
      return res.status(404).json({ error: "Notificação não encontrada" });
    }

    await prisma.notificacao.update({
      where: { id: parseInt(id) },
      data: { lida: true },
    });

    res.json({ message: "Notificação marcada como lida" });
  } catch (error) {
    console.error("Erro ao marcar notificação:", error);
    res.status(500).json({ error: "Erro ao marcar notificação" });
  }
};

const marcarTodasComoLidas = async (req, res) => {
  try {
    await prisma.notificacao.updateMany({
      where: {
        usuarioId: req.userId,
        lida: false,
      },
      data: { lida: true },
    });

    res.json({ message: "Todas as notificações foram marcadas como lidas" });
  } catch (error) {
    console.error("Erro ao marcar notificações:", error);
    res.status(500).json({ error: "Erro ao marcar notificações" });
  }
};

module.exports = { getNotificacoes, marcarComoLida, marcarTodasComoLidas };
