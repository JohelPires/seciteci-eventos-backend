// Validação das variáveis de ambiente no boot: falhar no arranque é melhor
// que falhar na primeira request de produção (padrão fic_dev/padroes-servicos).
const OBRIGATORIAS = [
  "CLERK_SECRET_KEY",
  "CLERK_WEBHOOK_SIGNING_SECRET",
  "CLERK_AUTHORIZED_PARTIES",
];

// QUAL ambiente publicado esta API é, com `NODE_ENV=production`
// (convenção fic_dev/secitec-servidor: desenvolvimento, homologação,
// produção). Ausente = `producao` — a regra mais dura é o padrão. Fora da
// produção, só a chave do Clerk afrouxa (homologação loga com a instância de
// DESENVOLVIMENTO; as contas reais não entram num banco de teste).
const AMBIENTES = ["producao", "homologacao", "desenvolvimento"];

const ambiente = () => {
  const valor = process.env.AMBIENTE || "producao";
  if (!AMBIENTES.includes(valor)) {
    throw new Error(
      `Variáveis de ambiente inválidas — AMBIENTE: valor inválido "${valor}" (${AMBIENTES.join(", ")})`
    );
  }
  return valor;
};

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
    const chave = process.env.CLERK_SECRET_KEY || "";
    if (ambiente() === "producao") {
      if (chave && !chave.startsWith("sk_live_")) {
        erros.push(
          "CLERK_SECRET_KEY: em produção, use a chave da instância de PRODUÇÃO (sk_live_…)"
        );
      }
    } else if (chave && !chave.startsWith("sk_test_")) {
      // O inverso também é incidente: homologação logando com as contas de
      // produção e gravando num banco de teste.
      erros.push(
        "CLERK_SECRET_KEY: em homologação/desenvolvimento publicado, use a chave da instância de DESENVOLVIMENTO (sk_test_…)"
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
