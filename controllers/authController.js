const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const prisma = require("../config/prisma");
const { sendMailSafe, isEmailEnabled } = require("../services/emailService");
const { resetSenhaTemplate } = require("../services/emailTemplates/resetSenha");
const { verifyGoogleIdToken } = require("../services/googleAuth");

const CODIGO_TTL_MINUTOS = 15;
const MAX_TENTATIVAS_RESET = 5;

const register = async (req, res) => {
  try {
    const { nome, email, senha, telefone, cpf, dataNascimento } = req.body;

    const userExists = await prisma.usuario.findUnique({
      where: { email },
    });

    if (userExists) {
      return res.status(400).json({ error: "Email já cadastrado" });
    }

    if (cpf) {
      const cpfExists = await prisma.usuario.findUnique({
        where: { cpf },
      });

      if (cpfExists) {
        return res.status(400).json({ error: "CPF já cadastrado" });
      }
    }

    const hashedPassword = await bcrypt.hash(senha, 10);

    const user = await prisma.usuario.create({
      data: {
        nome,
        email,
        senha: hashedPassword,
        telefone,
        cpf,
        dataNascimento: dataNascimento ? new Date(dataNascimento) : null,
        tipoUsuario: "participante",
      },
      select: {
        id: true,
        nome: true,
        email: true,
        tipoUsuario: true,
        dataCadastro: true,
      },
    });

    res.status(201).json({
      message: "Usuário cadastrado com sucesso",
      user,
    });
  } catch (error) {
    console.error("Erro no registro:", error);
    res.status(500).json({ error: "Erro ao cadastrar usuário" });
  }
};

const login = async (req, res) => {
  try {
    const { email, senha } = req.body;

    const user = await prisma.usuario.findUnique({
      where: { email, ativo: true },
    });

    if (!user || !user.senha) {
      return res.status(401).json({ error: "Credenciais inválidas" });
    }

    const validPassword = await bcrypt.compare(senha, user.senha);

    if (!validPassword) {
      return res.status(401).json({ error: "Credenciais inválidas" });
    }

    await prisma.usuario.update({
      where: { id: user.id },
      data: { ultimoAcesso: new Date() },
    });

    const token = jwt.sign(
      { id: user.id, tipo: user.tipoUsuario, v: user.tokenVersion },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: {
        id: user.id,
        nome: user.nome,
        email: user.email,
        tipoUsuario: user.tipoUsuario,
      },
    });
  } catch (error) {
    console.error("Erro no login:", error);
    res.status(500).json({ error: "Erro ao fazer login" });
  }
};

const getProfile = async (req, res) => {
  try {
    const user = await prisma.usuario.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        nome: true,
        email: true,
        telefone: true,
        cpf: true,
        dataNascimento: true,
        fotoPerfil: true,
        tipoUsuario: true,
        dataCadastro: true,
        ultimoAcesso: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    res.json({ user });
  } catch (error) {
    console.error("Erro ao buscar perfil:", error);
    res.status(500).json({ error: "Erro ao buscar perfil" });
  }
};

const alterarSenha = async (req, res) => {
  try {
    const { senhaAtual, novaSenha } = req.body;

    const user = await prisma.usuario.findUnique({
      where: { id: req.userId },
    });

    if (!user) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    if (!user.senha) {
      return res
        .status(400)
        .json({
          error:
            "Conta sem senha definida. Use a redefinição de senha ou o login Google.",
        });
    }

    const validPassword = await bcrypt.compare(senhaAtual, user.senha);

    if (!validPassword) {
      return res.status(401).json({ error: "Senha atual incorreta" });
    }

    const hashedPassword = await bcrypt.hash(novaSenha, 10);

    const updated = await prisma.usuario.update({
      where: { id: user.id },
      data: { senha: hashedPassword, tokenVersion: { increment: 1 } },
    });

    const token = jwt.sign(
      { id: updated.id, tipo: updated.tipoUsuario, v: updated.tokenVersion },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ message: "Senha alterada com sucesso", token });
  } catch (error) {
    console.error("Erro ao alterar senha:", error);
    res.status(500).json({ error: "Erro ao alterar senha" });
  }
};

const esqueciSenha = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await prisma.usuario.findUnique({
      where: { email, ativo: true },
    });

    if (user) {
      const codigo = crypto.randomInt(0, 1000000).toString().padStart(6, "0");
      const resetCodigo = await bcrypt.hash(codigo, 10);
      const resetExpira = new Date(Date.now() + CODIGO_TTL_MINUTOS * 60 * 1000);

      await prisma.usuario.update({
        where: { id: user.id },
        data: { resetCodigo, resetExpira, resetTentativas: 0 },
      });

      if (isEmailEnabled()) {
        sendMailSafe(user.email, resetSenhaTemplate({ usuario: user, codigo }));
      } else {
        console.log(`[reset-senha] Codigo para ${user.email}: ${codigo}`);
      }
    }

    res.json({ message: "Se o e-mail existir, enviaremos um código" });
  } catch (error) {
    console.error("Erro ao solicitar reset de senha:", error);
    res.status(500).json({ error: "Erro ao solicitar redefinição de senha" });
  }
};

const redefinirSenha = async (req, res) => {
  try {
    const { email, codigo, novaSenha } = req.body;

    const invalido = () =>
      res.status(400).json({ error: "Código inválido ou expirado" });

    const user = await prisma.usuario.findUnique({ where: { email } });

    if (!user || !user.resetCodigo || !user.resetExpira) {
      return invalido();
    }

    if (
      user.resetExpira < new Date() ||
      user.resetTentativas >= MAX_TENTATIVAS_RESET
    ) {
      return invalido();
    }

    const codigoValido = await bcrypt.compare(codigo, user.resetCodigo);

    if (!codigoValido) {
      const tentativas = user.resetTentativas + 1;
      const data = { resetTentativas: tentativas };
      if (tentativas >= MAX_TENTATIVAS_RESET) {
        data.resetCodigo = null;
        data.resetExpira = null;
      }
      await prisma.usuario.update({ where: { id: user.id }, data });
      return invalido();
    }

    const senha = await bcrypt.hash(novaSenha, 10);

    await prisma.usuario.update({
      where: { id: user.id },
      data: {
        senha,
        resetCodigo: null,
        resetExpira: null,
        resetTentativas: 0,
        tokenVersion: { increment: 1 },
      },
    });

    res.json({ message: "Senha redefinida com sucesso" });
  } catch (error) {
    console.error("Erro ao redefinir senha:", error);
    res.status(500).json({ error: "Erro ao redefinir senha" });
  }
};

const googleLogin = async (req, res) => {
  try {
    const { idToken } = req.body;

    let payload;
    try {
      payload = await verifyGoogleIdToken(idToken);
    } catch (error) {
      console.error("Token do Google inválido:", error.message);
      return res.status(401).json({ error: "Token do Google inválido" });
    }

    const {
      sub,
      email,
      email_verified: emailVerified,
      name,
      picture,
    } = payload;

    if (!sub || !email || emailVerified !== true) {
      return res.status(401).json({ error: "Token do Google inválido" });
    }

    const fotoGoogle = picture && picture.length <= 255 ? picture : null;

    let user = await prisma.usuario.findUnique({ where: { googleId: sub } });

    if (user) {
      if (!user.ativo) {
        return res.status(401).json({ error: "Credenciais inválidas" });
      }
      user = await prisma.usuario.update({
        where: { id: user.id },
        data: { ultimoAcesso: new Date() },
      });
    } else {
      const porEmail = await prisma.usuario.findUnique({ where: { email } });

      if (porEmail && porEmail.googleId && porEmail.googleId !== sub) {
        return res
          .status(409)
          .json({ error: "Conta já vinculada a outro usuário Google" });
      }

      if (porEmail) {
        if (!porEmail.ativo) {
          return res.status(401).json({ error: "Credenciais inválidas" });
        }
        user = await prisma.usuario.update({
          where: { id: porEmail.id },
          data: {
            googleId: sub,
            ultimoAcesso: new Date(),
            ...(porEmail.fotoPerfil ? {} : { fotoPerfil: fotoGoogle }),
          },
        });
      } else {
        user = await prisma.usuario.create({
          data: {
            nome: (name && name.trim()) || email.split("@")[0],
            email,
            senha: null,
            googleId: sub,
            fotoPerfil: fotoGoogle,
            tipoUsuario: "participante",
            ultimoAcesso: new Date(),
          },
        });
      }
    }

    const token = jwt.sign(
      { id: user.id, tipo: user.tipoUsuario, v: user.tokenVersion },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: {
        id: user.id,
        nome: user.nome,
        email: user.email,
        tipoUsuario: user.tipoUsuario,
      },
    });
  } catch (error) {
    console.error("Erro no login com Google:", error);
    res.status(500).json({ error: "Erro ao fazer login com Google" });
  }
};

module.exports = { register, login, getProfile, alterarSenha, esqueciSenha, redefinirSenha, googleLogin };
