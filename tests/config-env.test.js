const { validarEnv } = require('../config/env')

const BASE = {
  NODE_ENV: 'production',
  AMBIENTE: 'producao',
  CLERK_SECRET_KEY: 'sk_live_xxx',
  CLERK_WEBHOOK_SIGNING_SECRET: 'whsec_xxx',
  CLERK_AUTHORIZED_PARTIES: 'https://painel.teste',
}

let salvo

beforeEach(() => {
  salvo = { ...process.env }
  for (const k of ['NODE_ENV', 'AMBIENTE', 'CLERK_SECRET_KEY', 'CLERK_WEBHOOK_SIGNING_SECRET', 'CLERK_AUTHORIZED_PARTIES']) {
    delete process.env[k]
  }
})

afterEach(() => {
  process.env = salvo
})

const com = (extras) => {
  for (const [k, v] of Object.entries({ ...BASE, ...extras })) {
    process.env[k] = v
  }
}

describe('config/env (validarEnv)', () => {
  test('producao (padrao) exige sk_live_ e origens https', () => {
    com({ AMBIENTE: undefined })
    delete process.env.AMBIENTE
    expect(() => validarEnv()).not.toThrow()
  })

  test('producao com chave de teste -> erro sk_live_', () => {
    com({ CLERK_SECRET_KEY: 'sk_test_xxx' })
    expect(() => validarEnv()).toThrow(/sk_live_/)
  })

  test('homologacao publicada aceita sk_test_ da instancia de DESENVOLVIMENTO', () => {
    com({ AMBIENTE: 'homologacao', CLERK_SECRET_KEY: 'sk_test_xxx' })
    expect(() => validarEnv()).not.toThrow()
  })

  test('homologacao publicada com chave sk_live_ -> erro (incidente invertido)', () => {
    com({ AMBIENTE: 'homologacao' })
    expect(() => validarEnv()).toThrow(/sk_test_/)
  })

  test('NODE_ENV=production sem origens -> erro', () => {
    com({ CLERK_AUTHORIZED_PARTIES: '' })
    expect(() => validarEnv()).toThrow(/CLERK_AUTHORIZED_PARTIES/)
  })

  test('origem sem https em producao -> erro', () => {
    com({ CLERK_AUTHORIZED_PARTIES: 'http://painel.teste' })
    expect(() => validarEnv()).toThrow(/só https/)
  })

  test('AMBIENTE invalido -> erro explicito', () => {
    com({ AMBIENTE: 'staging' })
    expect(() => validarEnv()).toThrow(/AMBIENTE/)
  })

  test('fora de producao as regras de producao nao se aplicam', () => {
    com({
      NODE_ENV: 'development',
      AMBIENTE: 'desenvolvimento',
      CLERK_SECRET_KEY: 'sk_test_xxx',
      CLERK_AUTHORIZED_PARTIES: 'http://localhost:3000',
    })
    expect(() => validarEnv()).not.toThrow()
  })

  test('fora de producao, sem authorizedParties (azp off) e ok (dev local)', () => {
    com({
      NODE_ENV: 'development',
      AMBIENTE: 'desenvolvimento',
      CLERK_SECRET_KEY: 'sk_test_xxx',
      CLERK_AUTHORIZED_PARTIES: '',
    })
    delete process.env.CLERK_AUTHORIZED_PARTIES
    expect(() => validarEnv()).not.toThrow()
  })

  test('faltam obrigatorias -> erro lista nomes', () => {
    for (const k of ['CLERK_SECRET_KEY', 'CLERK_WEBHOOK_SIGNING_SECRET']) {
      delete process.env[k]
    }
    expect(() => validarEnv()).toThrow(/CLERK_SECRET_KEY.*CLERK_WEBHOOK_SIGNING_SECRET/s)
  })
})
