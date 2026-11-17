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
               description: 'Token de sessão do Clerk (Bearer). O frontend obtém via getToken() do Clerk e a API autoriza pela conta ligada ao clerk_user_id',
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
