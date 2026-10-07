const prisma = require("../config/prisma");

const createInscricao = async (req, res) => {
  try {
    const { eventoId } = req.body;
    const usuarioId = req.userId;

    const evento = await prisma.evento.findUnique({
      where: {
        id: parseInt(eventoId),
        status: "publicado",
      },
    });

    if (!evento) {
      return res.status(404).json({
        error: "Evento não encontrado ou não disponível para inscrição",
      });
    }

    // Verificar se o evento já passou
    if (new Date(evento.dataInicio) < new Date()) {
      return res
        .status(400)
        .json({ error: "Não é possível se inscrever em eventos já iniciados" });
    }

    if (evento.vagasDisponiveis !== null && evento.vagasDisponiveis <= 0) {
      return res.status(400).json({ error: "Evento sem vagas disponíveis" });
    }

    const inscricaoExistente = await prisma.inscricao.findUnique({
      where: {
        eventoId_usuarioId: {
          eventoId: parseInt(eventoId),
          usuarioId,
        },
      },
    });

    if (inscricaoExistente) {
      return res
        .status(400)
        .json({ error: "Você já está inscrito neste evento" });
    }

    const codigo = `INS${Date.now()}${Math.random()
      .toString(36)
      .substr(2, 4)
      .toUpperCase()}`;

    const inscricao = await prisma.$transaction(async (tx) => {
      const novaInscricao = await tx.inscricao.create({
        data: {
          eventoId: parseInt(eventoId),
          usuarioId,
          codigoInscricao: codigo,
          valorPago: evento.valorInscricao,
          statusInscricao: "confirmada",
          statusPagamento: evento.valorInscricao > 0 ? "pendente" : "isento",
        },
        include: {
          evento: {
            select: {
              titulo: true,
              dataInicio: true,
              dataFim: true,
            },
          },
        },
      });

      if (evento.vagasDisponiveis !== null) {
        await tx.evento.update({
          where: { id: parseInt(eventoId) },
          data: { vagasDisponiveis: { decrement: 1 } },
        });
      }

      // Criar notificação
      await tx.notificacao.create({
        data: {
          usuarioId,
          eventoId: parseInt(eventoId),
          titulo: "Inscrição confirmada",
          mensagem: `Sua inscrição no evento "${evento.titulo}" foi confirmada!`,
          tipo: "confirmacao",
        },
      });

      return novaInscricao;
    });

    res.status(201).json({
      message: "Inscrição realizada com sucesso",
      inscricao,
    });
  } catch (error) {
    console.error("Erro ao criar inscrição:", error);
    res.status(500).json({ error: "Erro ao realizar inscrição" });
  }
};

const getMinhasInscricoes = async (req, res) => {
  try {
    const { status } = req.query;
    const where = { usuarioId: req.userId };

    if (status) {
      where.statusInscricao = status;
    }

    const inscricoes = await prisma.inscricao.findMany({
      where,
      include: {
        evento: {
          include: {
            categoria: true,
            local: {
              select: {
                nome: true,
                cidade: true,
                estado: true,
              },
            },
          },
        },
      },
      orderBy: { dataInscricao: "desc" },
    });

    res.json({ inscricoes });
  } catch (error) {
    console.error("Erro ao buscar inscrições:", error);
    res.status(500).json({ error: "Erro ao buscar inscrições" });
  }
};

const getInscricaoById = async (req, res) => {
  try {
    const { id } = req.params;

    const inscricao = await prisma.inscricao.findFirst({
      where: {
        id: parseInt(id),
        usuarioId: req.userId,
      },
      include: {
        evento: {
          include: {
            categoria: true,
            local: true,
            organizador: {
              select: {
                nome: true,
                email: true,
                telefone: true,
              },
            },
          },
        },
        certificado: true,
      },
    });

    if (!inscricao) {
      return res.status(404).json({ error: "Inscrição não encontrada" });
    }

    res.json({ inscricao });
  } catch (error) {
    console.error("Erro ao buscar inscrição:", error);
    res.status(500).json({ error: "Erro ao buscar inscrição" });
  }
};

const cancelarInscricao = async (req, res) => {
  try {
    const { id } = req.params;

    const inscricao = await prisma.inscricao.findFirst({
      where: {
        id: parseInt(id),
        usuarioId: req.userId,
      },
      include: {
        evento: true,
      },
    });

    if (!inscricao) {
      return res.status(404).json({ error: "Inscrição não encontrada" });
    }

    if (inscricao.statusInscricao === "cancelada") {
      return res.status(400).json({ error: "Inscrição já cancelada" });
    }

    // Verificar se o evento já passou
    if (new Date(inscricao.evento.dataInicio) < new Date()) {
      return res.status(400).json({
        error: "Não é possível cancelar inscrição de eventos já iniciados",
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.inscricao.update({
        where: { id: parseInt(id) },
        data: {
          statusInscricao: "cancelada",
          statusPagamento:
            inscricao.statusPagamento === "pago"
              ? "reembolsado"
              : inscricao.statusPagamento,
        },
      });

      if (inscricao.evento.vagasDisponiveis !== null) {
        await tx.evento.update({
          where: { id: inscricao.eventoId },
          data: { vagasDisponiveis: { increment: 1 } },
        });
      }

      await tx.notificacao.create({
        data: {
          usuarioId: req.userId,
          eventoId: inscricao.eventoId,
          titulo: "Inscrição cancelada",
          mensagem: `Sua inscrição no evento "${inscricao.evento.titulo}" foi cancelada.`,
          tipo: "cancelamento",
        },
      });
    });

    res.json({ message: "Inscrição cancelada com sucesso" });
  } catch (error) {
    console.error("Erro ao cancelar inscrição:", error);
    res.status(500).json({ error: "Erro ao cancelar inscrição" });
  }
};

const confirmarPresenca = async (req, res) => {
  try {
    const { id } = req.params;

    const inscricao = await prisma.inscricao.findUnique({
      where: { id: parseInt(id) },
      include: { evento: true },
    });

    if (!inscricao) {
      return res.status(404).json({ error: "Inscrição não encontrada" });
    }

    // Apenas organizador ou admin pode confirmar presença
    if (
      inscricao.evento.organizadorId !== req.userId &&
      req.userType !== "admin"
    ) {
      return res
        .status(403)
        .json({ error: "Sem permissão para confirmar presença" });
    }

    const inscricaoAtualizada = await prisma.inscricao.update({
      where: { id: parseInt(id) },
      data: {
        presente: true,
        dataPresenca: new Date(),
      },
    });

    res.json({
      message: "Presença confirmada com sucesso",
      inscricao: inscricaoAtualizada,
    });
  } catch (error) {
    console.error("Erro ao confirmar presença:", error);
    res.status(500).json({ error: "Erro ao confirmar presença" });
  }
};

module.exports = {
  createInscricao,
  getMinhasInscricoes,
  getInscricaoById,
  cancelarInscricao,
  confirmarPresenca,
};
