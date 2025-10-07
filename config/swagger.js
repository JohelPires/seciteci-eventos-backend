const swaggerJsdoc = require('swagger-jsdoc')

const options = {
   definition: {
      openapi: '3.0.0',
      info: {
         title: 'API Sistema de Eventos',
         version: '1.0.0',
         description: 'API Sistema de Eventos da Seciteci',
         contact: {
            name: 'Suporte',
            email: '',
         },
      },
      servers: [
         {
            url: 'http://localhost:3000',
            description: 'Servidor de Desenvolvimento',
         },
         {
            url: 'https://seciteci-seciteci-eventos.qmono1.easypanel.host',
            description: 'Servidor de Produção',
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
