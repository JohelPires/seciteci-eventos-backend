const { createClerkClient, verifyToken } = require("@clerk/backend");
const { verifyWebhook } = require("@clerk/backend/webhooks");

const FOTO_MAX = 255;
const NOME_MAX = 100;

// Cliente criado com preguica: o modulo nao exige env no load (os testes
// mockam o modulo inteiro; em dev, faltar CLERK_SECRET_KEY so falha no uso).
let cliente = null;
const clienteClerk = () => {
  if (!cliente) {
    cliente = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  }
  return cliente;
};

const origensAutorizadas = () =>
  (process.env.CLERK_AUTHORIZED_PARTIES || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

const verificarSessionToken = async (token) => {
  const jwtKey = process.env.CLERK_JWT_KEY;

  let payload;
  try {
    payload = await verifyToken(token, {
      // Com a chave PEM a verificacao e local; sem ela, o SDK busca o JWKS
      // pela rede usando a CLERK_SECRET_KEY.
      ...(jwtKey ? { jwtKey } : { secretKey: process.env.CLERK_SECRET_KEY }),
      authorizedParties: origensAutorizadas(),
    });
  } catch (error) {
    return null;
  }

  if (!payload || typeof payload.sub !== "string" || !payload.sub) {
    return null;
  }
  const email =
    typeof payload.email === "string" ? payload.email.toLowerCase() : undefined;
  return { userId: payload.sub, email };
};

const getUsuario = async (clerkUserId) => {
  try {
    const u = await clienteClerk().users.getUser(clerkUserId);
    const primario =
      u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId) ||
      u.emailAddresses[0];
    if (!primario || !primario.emailAddress) return null;
    return {
      email: primario.emailAddress.toLowerCase(),
      nome: `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim().slice(0, NOME_MAX) || null,
      foto: u.imageUrl && u.imageUrl.length <= FOTO_MAX ? u.imageUrl : null,
    };
  } catch (error) {
    return null;
  }
};

const verificarWebhook = async (req) => {
  const cabecalhos = Object.entries(req.headers).flatMap(([k, v]) =>
    typeof v === "string" ? [[k, v]] : []
  );
  const request = new Request("http://localhost/api/webhooks/clerk", {
    method: "POST",
    headers: cabecalhos,
    body: req.rawBody ?? Buffer.alloc(0),
  });

  const evt = await verifyWebhook(request, {
    signingSecret: process.env.CLERK_WEBHOOK_SIGNING_SECRET,
  });

  if (evt.type === "user.created" || evt.type === "user.updated") {
    const primario =
      evt.data.email_addresses.find(
        (e) => e.id === evt.data.primary_email_address_id
      ) || evt.data.email_addresses[0];
    const nome =
      `${evt.data.first_name ?? ""} ${evt.data.last_name ?? ""}`
        .trim()
        .slice(0, NOME_MAX) || null;
    return {
      id: evt.data.id,
      tipo: evt.type === "user.created" ? "usuario.criado" : "usuario.atualizado",
      clerkUserId: evt.data.id,
      email: primario ? primario.email_address.toLowerCase() : null,
      nome,
      foto:
        evt.data.image_url && evt.data.image_url.length <= FOTO_MAX
          ? evt.data.image_url
          : null,
    };
  }

  if (evt.type === "user.deleted") {
    return {
      id: evt.data.id ?? null,
      tipo: "usuario.removido",
      clerkUserId: evt.data.id ?? null,
      email: null,
      nome: null,
      foto: null,
    };
  }

  return {
    id: evt.data.id ?? null,
    tipo: "ignorado",
    clerkUserId: null,
    email: null,
    nome: null,
    foto: null,
  };
};

module.exports = { verificarSessionToken, getUsuario, verificarWebhook };
