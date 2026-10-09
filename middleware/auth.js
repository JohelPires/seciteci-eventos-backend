const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");

const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Token não fornecido" });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return res.status(401).json({ error: "Token inválido ou expirado" });
  }

  try {
    const user = await prisma.usuario.findUnique({
      where: { id: decoded.id },
      select: { tokenVersion: true },
    });

    // Tokens antigos (pre-deploy) nao tem `v`; tratamos como 0 para nao
    // deslogar todo mundo de uma vez. Reset/troca incrementam tokenVersion.
    if (!user || (decoded.v ?? 0) !== user.tokenVersion) {
      return res.status(401).json({ error: "Token inválido ou expirado" });
    }

    req.userId = decoded.id;
    req.userType = decoded.tipo;
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
