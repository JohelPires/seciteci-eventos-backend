const express = require('express')
const cors = require('cors')
const rateLimit = require('express-rate-limit')
const swaggerUi = require('swagger-ui-express')
const swaggerSpec = require('./config/swagger')
require('dotenv').config()
const routes = require('./routes')

const app = express()
const PORT = process.env.PORT || 3000
const URL =
   process.env.NODE_ENV === 'development'
      ? `http://localhost:${PORT}`
      : 'https://seciteci-seciteci-eventos.qmono1.easypanel.host'

app.set('trust proxy', 1)

const limiter = rateLimit({
   windowMs: 3 * 60 * 1000,
   max: 100,
   message: 'Muitas requisições deste IP, tente novamente mais tarde.',
})

app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use(
   '/api-docs',
   swaggerUi.serve,
   swaggerUi.setup(swaggerSpec, {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'API Eventos - Documentação',
   })
)

app.get('/api-docs.json', (req, res) => {
   res.setHeader('Content-Type', 'application/json')
   res.send(swaggerSpec)
})

if (process.env.NODE_ENV !== 'test') {
   app.use('/api/', limiter)
}

app.use('/api', routes)

app.get('/health', async (req, res) => {
   const prisma = require('./config/prisma')
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

app.get('/', (req, res) => {
   res.json({
      message: 'API Sistema de Eventos',
      version: '1.0.0',
      swagger: `${URL}/api-docs`,
      endpoints: {
         auth: `${URL}/api/auth/register, ${URL}/api/auth/login`,
         eventos: `${URL}/api/eventos`,
         inscricoes: `${URL}/api/inscricoes`,
         categorias: `${URL}/api/categorias`,
         locais: `${URL}/api/locais`,
         avaliacoes: `${URL}/api/avaliacoes`,
         notificacoes: `${URL}/api/notificacoes`,
      },
      docs: 'Para documentação completa, consulte o README',
   })
})

app.use((req, res) => {
   res.status(404).json({ error: 'Rota não encontrada' })
})

app.use((err, req, res, next) => {
   console.error('Erro não tratado:', err)
   res.status(500).json({
      error: 'Erro interno do servidor',
      message: process.env.NODE_ENV === 'development' ? err.message : undefined,
   })
})

module.exports = app
