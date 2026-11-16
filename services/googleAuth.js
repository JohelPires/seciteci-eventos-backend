const { OAuth2Client } = require("google-auth-library");

const client = new OAuth2Client();

const audientes = () =>
  (process.env.GOOGLE_CLIENT_ID || "")
    .split(",")
    .map((valor) => valor.trim())
    .filter(Boolean);

const verifyGoogleIdToken = async (idToken) => {
  const audience = audientes();
  if (audience.length === 0) {
    throw new Error("GOOGLE_CLIENT_ID não configurado");
  }

  const ticket = await client.verifyIdToken({ idToken, audience });
  return ticket.getPayload();
};

module.exports = { verifyGoogleIdToken };
