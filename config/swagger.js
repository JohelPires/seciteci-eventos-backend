const swaggerJsdoc = require('swagger-jsdoc')

const options = {
   definition: {
      openapi: '3.0.0',
      info: {
         title: 'API Sistema de Eventos da Seciteci',
         version: '1.0.0',
         description: 'API Sistema de Eventos da Seciteci',
         contact: {
            name: 'Suporte',
            email: '',
         },
      },
      servers: [
         {
            url: 'https://seciteci-seciteci-eventos.qmono1.easypanel.host',
            description: 'Servidor de Produção',
         },
         {
            url: 'http://localhost:3030',
            description: 'Servidor de Desenvolvimento',
         },
      ],

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
   },
   apis: ['./docs/*.js'],
}

const swaggerSpec = swaggerJsdoc(options)

module.exports = swaggerSpec
