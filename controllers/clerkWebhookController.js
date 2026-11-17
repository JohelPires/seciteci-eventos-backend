const prisma = require("../config/prisma");
const { verificarWebhook } = require("../services/clerkAuth");

// O webhook é idempotente: o Clerk pode reenviar o mesmo evento e fora de
// ordem. Cada id é processado uma vez só (webhook_eventos) e cada efeito é
// seguro de repetir.
const aplicarEvento = async (evento) => {
  if (evento.tipo === "usuario.criado" || evento.tipo === "usuario.atualizado") {
    if (!evento.clerkUserId || !evento.email) {
      return { processado: false, motivo: "evento-invalido" };
    }

    const peloId = await prisma.usuario.findUnique({
      where: { clerkUserId: evento.clerkUserId },
    });
    if (peloId) return { processado: true };

    const porEmail = await prisma.usuario.findUnique({
      where: { email: evento.email },
    });

    if (porEmail && porEmail.clerkUserId && porEmail.clerkUserId !== evento.clerkUserId) {
      return { processado: false, motivo: "sem-conta-correspondente" };
    }

    if (porEmail) {
      await prisma.usuario.update({
        where: { id: porEmail.id },
        data: {
          clerkUserId: evento.clerkUserId,
          ...(porEmail.nome || !evento.nome ? {} : { nome: evento.nome }),
          ...(porEmail.fotoPerfil || !evento.foto ? {} : { fotoPerfil: evento.foto }),
        },
      });
      return { processado: true };
    }

    await prisma.usuario.create({
      data: {
        nome: (evento.nome || evento.email.split("@")[0]).slice(0, 100),
        email: evento.email,
        clerkUserId: evento.clerkUserId,
        fotoPerfil: evento.foto,
        tipoUsuario: "participante",
      },
    });
    return { processado: true };
  }

  if (evento.tipo === "usuario.removido") {
    if (!evento.clerkUserId) {
      return { processado: false, motivo: "evento-invalido" };
    }
    await prisma.usuario.updateMany({
      where: { clerkUserId: evento.clerkUserId },
      data: { ativo: false, clerkUserId: null },
    });
    return { processado: true };
  }

  return { processado: false, motivo: "evento-ignorado" };
};

const receber = async (req, res) => {
  let evento;
  try {
    evento = await verificarWebhook(req);
  } catch (error) {
    return res.status(401).json({ error: "Assinatura do webhook inválida" });
  }

  try {
    if (evento.id) {
      const visto = await prisma.webhookEvento.findUnique({
        where: { id: evento.id },
      });
      if (visto) {
        return res.json({ processado: false, motivo: "duplicado" });
      }
    }

    const resultado = await aplicarEvento(evento);

    // Marca como visto só DEPOIS de aplicar: se falhar, o reenvio do Clerk
    // processa de novo (efeitos idempotentes).
    if (evento.id) {
      await prisma.webhookEvento
        .create({ data: { id: evento.id, tipo: evento.tipo } })
        .catch(() => {});
    }

    return res.json(resultado);
  } catch (error) {
    console.error("Erro ao processar webhook do Clerk:", error);
    return res.status(500).json({ error: "Erro ao processar webhook" });
  }
};

module.exports = { receber };
