// Mock do adapter de Clerk para as suites HTTP: tokens "clerk-test:<id>" sao
// reconhecidos pelo verificarSessionToken e getUsuario responde pelo registry
// alimentado por tests/factories.js (nunca chamando o Clerk real).
const registry = new Map()

const mock = {
  __registry: registry,
  verificarSessionToken: jest.fn((token) => {
    const m = /^clerk-test:(.+)$/.exec(token || '')
    return m ? { userId: m[1] } : null
  }),
  getUsuario: jest.fn(async (id) => registry.get(id) ?? null),
  verificarWebhook: jest.fn(),
}

module.exports = { mock }
