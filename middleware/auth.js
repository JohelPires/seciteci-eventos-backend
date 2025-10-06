const jwt = require("jsonwebtoken");

const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Token não fornecido" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id;
    req.userType = decoded.tipo;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Token inválido ou expirado" });
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
