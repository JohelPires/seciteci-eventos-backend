// Validação das variáveis de ambiente no boot: falhar no arranque é melhor
// que falhar na primeira request de produção (padrão fic_dev/padroes-servicos).
const OBRIGATORIAS = [
  "CLERK_SECRET_KEY",
  "CLERK_WEBHOOK_SIGNING_SECRET",
  "CLERK_AUTHORIZED_PARTIES",
];

const origens = () =>
  (process.env.CLERK_AUTHORIZED_PARTIES || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

const validarEnv = () => {
  const erros = [];

  for (const nome of OBRIGATORIAS) {
    if (!process.env[nome]) erros.push(`${nome}: obrigatória`);
  }

  if (process.env.NODE_ENV === "production") {
    if (process.env.CLERK_SECRET_KEY && !process.env.CLERK_SECRET_KEY.startsWith("sk_live_")) {
      erros.push(
        "CLERK_SECRET_KEY: em produção, use a chave da instância de PRODUÇÃO (sk_live_…)"
      );
    }
    if (origens().length === 0) {
      erros.push("CLERK_AUTHORIZED_PARTIES: obrigatória em produção (claim azp do token)");
    }
    for (const origem of origens()) {
      if (!origem.startsWith("https://")) {
        erros.push(`CLERK_AUTHORIZED_PARTIES: origem inválida "${origem}" (só https://)`);
      }
    }
  }

  if (erros.length > 0) {
    throw new Error(`Variáveis de ambiente inválidas — ${erros.join("; ")}`);
  }
};

module.exports = { validarEnv };
