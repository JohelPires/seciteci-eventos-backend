const prisma = require("../config/prisma");

const getProfile = async (req, res) => {
  try {
    const user = await prisma.usuario.update({
      where: { id: req.userId },
      data: { ultimoAcesso: new Date() },
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

    res.json({ user });
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }
    console.error("Erro ao buscar perfil:", error);
    res.status(500).json({ error: "Erro ao buscar perfil" });
  }
};

const atualizarProfile = async (req, res) => {
  try {
    const dados = {};
    if (req.body.nome !== undefined) dados.nome = req.body.nome;
    if (req.body.telefone !== undefined) dados.telefone = req.body.telefone;
    if (req.body.cpf !== undefined) dados.cpf = req.body.cpf;
    if (req.body.dataNascimento !== undefined) {
      dados.dataNascimento = req.body.dataNascimento
        ? new Date(req.body.dataNascimento)
        : null;
    }
    if (req.body.fotoPerfil !== undefined) dados.fotoPerfil = req.body.fotoPerfil;

    const user = await prisma.usuario.update({
      where: { id: req.userId },
      data: dados,
      select: {
        id: true,
        nome: true,
        email: true,
        telefone: true,
        cpf: true,
        dataNascimento: true,
        fotoPerfil: true,
        tipoUsuario: true,
      },
    });

    res.json({ message: "Perfil atualizado com sucesso", user });
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(400).json({ error: "CPF já cadastrado" });
    }
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }
    console.error("Erro ao atualizar perfil:", error);
    res.status(500).json({ error: "Erro ao atualizar perfil" });
  }
};

module.exports = { getProfile, atualizarProfile };
