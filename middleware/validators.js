const { body, param, query, validationResult } = require("express-validator");

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

const registerValidator = [
  body("nome").trim().notEmpty().withMessage("Nome é obrigatório"),
  body("email").isEmail().withMessage("Email inválido"),
  body("senha")
    .isLength({ min: 6 })
    .withMessage("Senha deve ter no mínimo 6 caracteres"),
  validate,
];

const loginValidator = [
  body("email").isEmail().withMessage("Email inválido"),
  body("senha").notEmpty().withMessage("Senha é obrigatória"),
  validate,
];

const eventoValidator = [
  body("titulo").trim().notEmpty().withMessage("Título é obrigatório"),
  body("dataInicio").isISO8601().withMessage("Data de início inválida"),
  body("dataFim").isISO8601().withMessage("Data de fim inválida"),
  body("tipoEvento")
    .isIn(["presencial", "online", "hibrido"])
    .withMessage("Tipo de evento inválido"),
  body("financiadorTipo")
    .optional({ values: "falsy" })
    .isIn(["publico", "privado"])
    .withMessage("Tipo de financiador inválido"),
  body("financiadorNome")
    .optional({ values: "falsy" })
    .isString()
    .withMessage("Nome do financiador inválido")
    .trim()
    .isLength({ max: 150 })
    .withMessage("Nome do financiador deve ter no máximo 150 caracteres"),
  validate,
];

const inscricaoValidator = [
  body("eventoId").isInt({ min: 1 }).withMessage("ID do evento inválido"),
  validate,
];

module.exports = {
  registerValidator,
  loginValidator,
  eventoValidator,
  inscricaoValidator,
};
