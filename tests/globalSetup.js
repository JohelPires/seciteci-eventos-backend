const path = require('path')
const { execSync } = require('child_process')

module.exports = async () => {
  process.env.NODE_ENV = 'test'
  require('dotenv').config({ path: path.resolve(__dirname, '..', '.env.test') })

  const url = process.env.DATABASE_URL
  if (!url || !url.includes('sistema_eventos_test')) {
    throw new Error(
      'DATABASE_URL deve apontar para o banco de teste sistema_eventos_test. Crie .env.test a partir de .env.test.example.'
    )
  }

  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url },
  })
}
