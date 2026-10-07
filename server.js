require('dotenv').config()
const app = require('./app')
const prisma = require('./config/prisma')
const { verifyMailer } = require('./config/mailer')

const PORT = process.env.PORT || 3000
const URL =
   process.env.NODE_ENV === 'development'
      ? `http://localhost:${PORT}`
      : 'https://seciteci-seciteci-eventos.qmono1.easypanel.host'

process.on('SIGINT', async () => {
   console.log('\n🔴 Encerrando servidor...')
   await prisma.$disconnect()
   console.log('✅ Conexão com banco encerrada')
   process.exit(0)
})

app.listen(PORT, '0.0.0.0', async () => {
   verifyMailer()

   let conectado = false
   try {
      await prisma.$connect()
      conectado = true
   } catch (error) {
      console.error('❌ Erro ao conectar no banco:', error.message)
      console.error('💡 Verifique a DATABASE_URL no .env')
   }
   console.log('\n====================================')
   console.log(' API Sistema de Eventos - Seciteci')
   console.log('====================================')
   console.log(`URL:      ${URL}`)
   console.log(`Swagger:  ${URL}/api-docs`)
   console.log(`Database: ${conectado ? '✅ Conectado' : '❌ Desconectado'}`)
   console.log(`Ambiente: ${process.env.NODE_ENV || 'development'}`)
   console.log('====================================\n')
})

module.exports = app
