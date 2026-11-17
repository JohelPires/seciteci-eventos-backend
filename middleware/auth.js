const prisma = require("../config/prisma");
const { verificarSessionToken, getUsuario } = require("../services/clerkAuth");

// O Clerk diz quem a pessoa e; o banco diz o que ela pode (clerk.md). O papel
// vem da conta A CADA request: promover/desativar tem efeito imediato.
const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Token não fornecido" });
  }

  const identidade = await verificarSessionToken(token);
  if (!identidade) {
    return res.status(401).json({ error: "Token inválido ou expirado" });
  }

  try {
    let usuario = await prisma.usuario.findUnique({
      where: { clerkUserId: identidade.userId },
    });

    // Fallback: token válido sem conta ligada (webhook atrasado/falho ou
    // conta anterior ao Clerk). O e-mail do claim evita ir à rede; sem ele,
    // busca o usuário no Clerk para achar o e-mail.
    if (!usuario) {
      const info = identidade.email
        ? { email: identidade.email, nome: null, foto: null }
        : await getUsuario(identidade.userId);

      if (!info) {
        return res.status(401).json({ error: "Token inválido ou expirado" });
      }

      const porEmail = await prisma.usuario.findUnique({
        where: { email: info.email },
      });

      if (porEmail && porEmail.clerkUserId && porEmail.clerkUserId !== identidade.userId) {
        return res.status(403).json({ error: "Esta conta não tem acesso" });
      }

      if (porEmail) {
        usuario = await prisma.usuario.update({
          where: { id: porEmail.id },
          data: {
            clerkUserId: identidade.userId,
            ...(porEmail.nome || !info.nome ? {} : { nome: info.nome }),
            ...(porEmail.fotoPerfil || !info.foto ? {} : { fotoPerfil: info.foto }),
            ultimoAcesso: new Date(),
          },
        });
      } else {
        usuario = await prisma.usuario.create({
          data: {
            nome: (info.nome || info.email.split("@")[0]).slice(0, 100),
            email: info.email,
            clerkUserId: identidade.userId,
            fotoPerfil: info.foto,
            tipoUsuario: "participante",
            ultimoAcesso: new Date(),
          },
        });
      }
    }

    if (!usuario.ativo) {
      return res.status(403).json({ error: "Esta conta não tem acesso" });
    }

    req.userId = usuario.id;
    req.userType = usuario.tipoUsuario;
    next();
  } catch (error) {
    next(error);
  }
};

const isOrganizador = (req, res, next) => {
  if (req.userType !== "organizador" && req.userType !== "admin") {
    return res
      .status(403)
      .json({
        error: "Acesso negado. Apenas organizadores e administradores.",
      });
  }
  next();
};

const isAdmin = (req, res, next) => {
  if (req.userType !== "admin") {
    return res
      .status(403)
      .json({ error: "Acesso negado. Apenas administradores." });
  }
  next();
};

module.exports = { authMiddleware, isOrganizador, isAdmin };
