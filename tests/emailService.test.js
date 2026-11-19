const ORIGINAL_ENV = { ...process.env }
const ORIGINAL_FETCH = global.fetch

const carregarEmailService = (extra = {}) => {
   jest.resetModules()
   process.env = {
      ...ORIGINAL_ENV,
      EMAIL_ENABLED: 'true',
      EMAIL_FROM: 'Seciteci Eventos <no-reply@teste.com>',
      PLUNK_API_URL: 'https://plunk.test/',
      PLUNK_SECRET_KEY: 'sk_test_123',
      ...extra,
   }
   return require('../services/emailService')
}

afterEach(() => {
   global.fetch = ORIGINAL_FETCH
   jest.restoreAllMocks()
})

afterAll(() => {
   process.env = ORIGINAL_ENV
})

describe('emailService (Plunk)', () => {
   test('desativado retorna null e nao chama a API', async () => {
      const { sendEmail } = carregarEmailService({ EMAIL_ENABLED: 'false' })
      global.fetch = jest.fn()

      const id = await sendEmail({ to: 'a@teste.com', subject: 'Assunto', html: '<p>Oi</p>' })

      expect(id).toBeNull()
      expect(global.fetch).not.toHaveBeenCalled()
   })

   test('envia HTML como body e devolve o id do Plunk', async () => {
      const { sendEmail } = carregarEmailService()
      global.fetch = jest.fn().mockResolvedValue({
         ok: true,
         status: 200,
         json: async () => ({ success: true, data: { emails: [{ email: 'plunk-id' }] } }),
      })

      const id = await sendEmail({ to: 'a@teste.com', subject: 'Assunto', html: '<p>Oi</p>', text: 'Oi' })

      expect(id).toBe('plunk-id')
      const [url, options] = global.fetch.mock.calls[0]
      expect(url).toBe('https://plunk.test/v1/send')
      expect(options.headers.Authorization).toBe('Bearer sk_test_123')
      expect(JSON.parse(options.body)).toEqual({
         to: 'a@teste.com',
         subject: 'Assunto',
         body: '<p>Oi</p>',
         from: { name: 'Seciteci Eventos', email: 'no-reply@teste.com' },
      })
   })

   test('erro da API vira excecao com codigo e mensagem', async () => {
      const { sendEmail } = carregarEmailService()
      global.fetch = jest.fn().mockResolvedValue({
         ok: false,
         status: 422,
         statusText: 'Unprocessable Entity',
         json: async () => ({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'Request validation failed' },
         }),
      })

      await expect(
         sendEmail({ to: 'a@teste.com', subject: 'Assunto', html: '<p>Oi</p>' })
      ).rejects.toThrow('[Plunk VALIDATION_ERROR] Request validation failed')
   })

   test('sem EMAIL_FROM falha com mensagem clara', async () => {
      const { sendEmail } = carregarEmailService({ EMAIL_FROM: '' })
      global.fetch = jest.fn()

      await expect(
         sendEmail({ to: 'a@teste.com', subject: 'Assunto', html: '<p>Oi</p>' })
      ).rejects.toThrow('EMAIL_FROM')
      expect(global.fetch).not.toHaveBeenCalled()
   })
})
