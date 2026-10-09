const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const prisma = require("../config/prisma");
const { sendMailSafe, isEmailEnabled } = require("../services/emailService");
const { resetSenhaTemplate } = require("../services/emailTemplates/resetSenha");

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

    if (!user) {
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

    const validPassword = await bcrypt.compare(senhaAtual, user.senha);

    if (!validPassword) {
      return res.status(401).json({ error: "Senha atual incorreta" });
    }

    const hashedPassword = await bcrypt.hash(novaSenha, 10);

    await prisma.usuario.update({
      where: { id: user.id },
      data: { senha: hashedPassword },
    });

    res.json({ message: "Senha alterada com sucesso" });
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

module.exports = { register, login, getProfile, alterarSenha, esqueciSenha, redefinirSenha };
