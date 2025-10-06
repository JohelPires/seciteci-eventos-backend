const swaggerJsdoc = require('swagger-jsdoc')

const options = {
   definition: {
      openapi: '3.0.0',
      info: {
         title: 'API Sistema de Eventos',
         version: '1.0.0',
         description: 'API REST completa para gerenciamento de eventos com Node.js, Express, PostgreSQL e Prisma ORM',
         contact: {
            name: 'Suporte',
            email: 'suporte@eventos.com',
         },
      },
      servers: [
         {
            url: 'http://localhost:3000',
            description: 'Servidor de Desenvolvimento',
         },
         {
            url: 'https://api.eventos.com',
            description: 'Servidor de Produção',
         },
      ],
      // ===== ADICIONE ESTA SEÇÃO =====
      components: {
         securitySchemes: {
            bearerAuth: {
               type: 'http',
               scheme: 'bearer',
               bearerFormat: 'JWT',
               description: 'Entre com o token JWT obtido no endpoint /api/auth/login',
            },
         },
      },
      security: [
         {
            bearerAuth: [],
         },
      ],
      // ===============================
   },
   apis: ['./docs/*.js'],
}

const swaggerSpec = swaggerJsdoc(options)

module.exports = swaggerSpec
