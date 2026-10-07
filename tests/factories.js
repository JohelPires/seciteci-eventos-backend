const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { prisma } = require('./db')

let counter = 0

async function createUser(overrides = {}) {
  counter += 1
  const {
    nome = `Usuario ${counter}`,
    email = `usuario${counter}@teste.com`,
    senha = 'senha123',
    telefone = null,
    cpf = null,
    dataNascimento = null,
    tipoUsuario = 'participante',
    ativo = true,
  } = overrides

  const senhaHash = await bcrypt.hash(senha, 10)

  const user = await prisma.usuario.create({
    data: { nome, email, senha: senhaHash, telefone, cpf, dataNascimento, tipoUsuario, ativo },
  })

  return { ...user, senhaPlano: senha }
}

function tokenFor(user) {
  return jwt.sign({ id: user.id, tipo: user.tipoUsuario }, process.env.JWT_SECRET, {
    expiresIn: '1d',
  })
}

module.exports = { createUser, tokenFor }
