const spec = require('../config/swagger')

describe('documentação swagger', () => {
   test('spec é gerada sem blocos YAML inválidos', () => {
      expect(spec.openapi).toBe('3.0.0')
      expect(Object.keys(spec.paths).length).toBeGreaterThan(20)
   })

   test('GET /api/eventos documenta todos os filtros', () => {
      const nomes = spec.paths['/api/eventos'].get.parameters.map((p) => p.name)

      expect(nomes).toEqual(
         expect.arrayContaining([
            'categoria',
            'cidade',
            'status',
            'tipo',
            'busca',
            'proximos',
            'ordem',
            'mes',
            'ano',
            'page',
            'limit',
         ])
      )
   })

   test('PUT /api/eventos/{id} mantém a descrição completa', () => {
      const { description } = spec.paths['/api/eventos/{id}'].put

      expect(description).toContain('motivoCancelamento')
      expect(description).toContain('financiadores')
      expect(description).toContain('(ex.:')
   })
})
