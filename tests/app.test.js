const request = require('supertest')
const app = require('../app')

describe('app exportável', () => {
  test('rota pública /api/categorias responde 200 com array', async () => {
    const res = await request(app).get('/api/categorias')
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(res.body.categorias)).toBe(true)
  })

  test('rota inexistente responde 404', async () => {
    const res = await request(app).get('/api/rota-inexistente')
    expect(res.statusCode).toBe(404)
    expect(res.body.error).toBe('Rota não encontrada')
  })
})
