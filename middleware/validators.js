const { body, param, query, validationResult } = require("express-validator");

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

const financiadoresValidator = [
  body("financiadores")
    .optional({ values: "falsy" })
    .custom((valor) => Array.isArray(valor))
    .withMessage("Financiadores deve ser um array")
    .bail()
    .custom((valor) => valor.length <= 20)
    .withMessage("Máximo de 20 financiadores por evento"),
  body("financiadores.*.nome")
    .isString()
    .withMessage("Nome do financiador inválido")
    .trim()
    .notEmpty()
    .withMessage("Nome do financiador é obrigatório")
    .isLength({ max: 150 })
    .withMessage("Nome do financiador deve ter no máximo 150 caracteres"),
  body("financiadores.*.tipo")
    .optional({ values: "falsy" })
    .isIn(["publico", "privado", "hibrido"])
    .withMessage("Tipo de financiador inválido"),
];

const eventoValidator = [
  body("titulo").trim().notEmpty().withMessage("Título é obrigatório"),
  body("dataInicio").isISO8601().withMessage("Data de início inválida"),
  body("dataFim").isISO8601().withMessage("Data de fim inválida"),
  body("tipoEvento")
    .isIn(["presencial", "online", "hibrido"])
    .withMessage("Tipo de evento inválido"),
  ...financiadoresValidator,
  body("status")
    .optional()
    .isIn(["rascunho", "publicado", "cancelado", "encerrado"])
    .withMessage("Status de evento inválido"),
  validate,
];

const eventoUpdateValidator = [
  body("titulo").optional({ values: "falsy" }).trim().notEmpty().withMessage("Título não pode ser vazio"),
  body("dataInicio").optional({ values: "falsy" }).isISO8601().withMessage("Data de início inválida"),
  body("dataFim").optional({ values: "falsy" }).isISO8601().withMessage("Data de fim inválida"),
  body("tipoEvento")
    .optional({ values: "falsy" })
    .isIn(["presencial", "online", "hibrido"])
    .withMessage("Tipo de evento inválido"),
  ...financiadoresValidator,
  body("status")
    .optional({ values: "falsy" })
    .isIn(["rascunho", "publicado", "cancelado", "encerrado"])
    .withMessage("Status de evento inválido"),
  validate,
];

const inscricaoValidator = [
  body("eventoId").isInt({ min: 1 }).withMessage("ID do evento inválido"),
  validate,
];

const atualizarProfileValidator = [
  body("nome")
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("Nome deve ter até 100 caracteres"),
  body("telefone")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 20 })
    .withMessage("Telefone deve ter até 20 caracteres"),
  body("cpf")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 14 })
    .withMessage("CPF deve ter até 14 caracteres"),
  body("dataNascimento")
    .optional({ nullable: true })
    .isISO8601()
    .withMessage("Data de nascimento inválida"),
  body("fotoPerfil")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 255 })
    .withMessage("Foto deve ter até 255 caracteres"),
  body("email")
    .not()
    .exists()
    .withMessage("O e-mail é gerenciado pelo Clerk e não pode ser alterado aqui"),
  body("tipoUsuario")
    .not()
    .exists()
    .withMessage("tipoUsuario não pode ser alterado"),
  body("ativo")
    .not()
    .exists()
    .withMessage("ativo não pode ser alterado"),
  validate,
];

module.exports = {
  financiadoresValidator,
  eventoValidator,
  eventoUpdateValidator,
  inscricaoValidator,
  atualizarProfileValidator,
};
