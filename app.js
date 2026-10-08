const express = require('express')
const cors = require('cors')
const rateLimit = require('express-rate-limit')
const swaggerUi = require('swagger-ui-express')
const swaggerSpec = require('./config/swagger')
require('dotenv').config()
const routes = require('./routes')

const app = express()
const PORT = process.env.PORT || 3000
// Publicação na VM da SECITECI (convenção secitec-servidor): opipeline
// grava APP_CAMINHO (ex.: /dev/secitec/conectese-api) no .env do ambiente;
// o prefixo público é retirado pelo Traefik antes de chegar aqui.
const APP_CAMINHO = (process.env.APP_CAMINHO || '').replace(/\/+$/, '')
const URL =
   process.env.APP_HOST && APP_CAMINHO
      ? `https://${process.env.APP_HOST}${APP_CAMINHO}`
      : process.env.NODE_ENV === 'development'
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

// Atrás do proxy por caminho (Traefik stripprefix), o redirect interno do
// swagger-ui (express.static) produziaria Location '/api-docs/' absoluto,
// perdendo o prefixo publico. Intercepta e redireciona com X-Forwarded-Prefix;
// sem o header (local/teste), segue o comportamento original do swagger-ui.
app.get('/api-docs', (req, res, next) => {
   const prefix = req.get('X-Forwarded-Prefix')
   // Só o caminho EXATO (sem barra) redireciona: swagger-ui atende
   // '/api-docs/' — e Express sem strict routing casa ambos com esta rota.
   if (!prefix || req.path !== '/api-docs') return next()
   res.redirect(302, `${prefix.replace(/\/+$/, '')}/api-docs/`)
})

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
