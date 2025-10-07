const express = require('express')
const cors = require('cors')
const rateLimit = require('express-rate-limit')
const swaggerUi = require('swagger-ui-express')
const swaggerSpec = require('./config/swagger')
require('dotenv').config()
const routes = require('./routes')
const prisma = require('./config/prisma')

const app = express()
const PORT = process.env.PORT || 3000

app.set('trust proxy', 1)

// Rate limiting
const limiter = rateLimit({
   windowMs: 15 * 60 * 1000, // 15 minutos
   max: 100, // limite de 100 requisições por IP
   message: 'Muitas requisições deste IP, tente novamente mais tarde.',
})

// Middlewares
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// ===== SWAGGER UI =====
app.use(
   '/api-docs',
   swaggerUi.serve,
   swaggerUi.setup(swaggerSpec, {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'API Eventos - Documentação',
   })
)

// Rota para obter spec em JSON
app.get('/api-docs.json', (req, res) => {
   res.setHeader('Content-Type', 'application/json')
   res.send(swaggerSpec)
})

app.use('/api/', limiter)

// Rotas
app.use('/api', routes)

// Rota de health check
app.get('/health', async (req, res) => {
   try {
      await prisma.$queryRaw`SELECT 1`
      res.json({
         status: 'OK',
         message: 'API funcionando perfeitamente',
         database: 'Conectado',
         timestamp: new Date().toISOString(),
      })
   } catch (error) {
      res.status(500).json({
         status: 'ERROR',
         message: 'Erro na conexão com o banco',
         error: error.message,
      })
   }
})

// Documentação básica da API
app.get('/', (req, res) => {
   res.json({
      message: 'API Sistema de Eventos',
      version: '1.0.0',
      endpoints: {
         auth: '/api/auth/register, /api/auth/login',
         eventos: '/api/eventos',
         inscricoes: '/api/inscricoes',
         categorias: '/api/categorias',
         locais: '/api/locais',
         avaliacoes: '/api/avaliacoes',
         notificacoes: '/api/notificacoes',
      },
      docs: 'Para documentação completa, consulte o README',
   })
})

// Tratamento de erros 404
app.use((req, res) => {
   res.status(404).json({ error: 'Rota não encontrada' })
})

// Tratamento global de erros
app.use((err, req, res, next) => {
   console.error('Erro não tratado:', err)
   res.status(500).json({
      error: 'Erro interno do servidor',
      message: process.env.NODE_ENV === 'development' ? err.message : undefined,
   })
})

// Graceful shutdown
process.on('SIGINT', async () => {
   console.log('\n🔴 Encerrando servidor...')
   await prisma.$disconnect()
   console.log('✅ Conexão com banco encerrada')
   process.exit(0)
})

process.on('SIGTERM', async () => {
   console.log('\n🔴 Encerrando servidor (SIGTERM)...')
   await prisma.$disconnect()
   process.exit(0)
})

// Iniciar servidor
app.listen(PORT, '0.0.0.0', async () => {
   console.log('\n====================================')
   console.log(' API Sistema de Eventos')
   console.log('====================================')
   console.log(`URL:      http://localhost:${PORT}`)
   console.log(`Swagger:  http://localhost:${PORT}/api-docs`)
   console.log('Database: PostgreSQL + Prisma')
   console.log(`Ambiente: ${process.env.NODE_ENV || 'development'}`)
   console.log('====================================\n')

   // Testar conexão com banco
   try {
      await prisma.$connect()
      console.log('✅ Conectado ao banco de dados!')
   } catch (error) {
      console.error('❌ Erro ao conectar no banco:', error.message)
      console.error('💡 Verifique a DATABASE_URL no .env')
   }
})

module.exports = app
