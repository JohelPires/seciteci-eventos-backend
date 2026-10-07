const fs = require('fs')
const path = require('path')
const { parseDockerignore, isExcluded, collectRuntimeFiles } = require('./docker-context')

const readDockerfile = () => fs.readFileSync(path.join(__dirname, '..', 'Dockerfile'), 'utf8')
const readDockerignore = () =>
   fs.readFileSync(path.join(__dirname, '..', '.dockerignore'), 'utf8')

describe('imagem de produção', () => {
   test('runner copia a aplicação inteira do builder', () => {
      expect(readDockerfile()).toMatch(/COPY --from=builder \/app \.\//)
   })

   test('nenhum arquivo de runtime é excluído do contexto de build', () => {
      const rules = parseDockerignore(readDockerignore())
      const files = collectRuntimeFiles(['server.js'])

      expect(files).toContain('app.js')
      expect(files).toContain('server.js')
      expect(files.some((f) => f.startsWith('docs/'))).toBe(true)

      for (const file of files) {
         expect(isExcluded(rules, file)).toEqual({ excluded: false, rule: null })
      }
   })

   test('arquivos de teste e ambiente ficam fora da imagem', () => {
      const rules = parseDockerignore(readDockerignore())

      expect(isExcluded(rules, 'tests/factories.js').excluded).toBe(true)
      expect(isExcluded(rules, 'jest.config.js').excluded).toBe(true)
      expect(isExcluded(rules, '.env.test').excluded).toBe(true)
      expect(isExcluded(rules, '.env').excluded).toBe(true)
      expect(isExcluded(rules, 'node_modules/express/package.json').excluded).toBe(true)
      expect(isExcluded(rules, 'package.json').excluded).toBe(false)
      expect(isExcluded(rules, 'prisma/schema.prisma').excluded).toBe(false)
   })
})
