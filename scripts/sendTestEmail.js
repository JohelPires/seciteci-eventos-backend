require('dotenv').config()
const { sendEmail } = require('../services/emailService')

const destinatario = process.argv[2]

const main = async () => {
   if (!destinatario) {
      console.error('Uso: npm run email:test -- destinatario@email.com')
      process.exit(1)
   }

   console.log(`Enviando e-mail de teste para ${destinatario}...`)

   const messageId = await sendEmail({
      to: destinatario,
      subject: 'Teste do servico de e-mail - CONECTE-SE',
      html: '<p>Se voce recebeu este e-mail, o servico de envio esta funcionando.</p>',
      text: 'Se voce recebeu este e-mail, o servico de envio esta funcionando.',
   })

   if (!messageId) {
      console.error('Envio desativado: defina EMAIL_ENABLED=true e preencha SMTP_USER/SMTP_PASS no .env')
      process.exit(1)
   }

   console.log(`E-mail enviado (messageId: ${messageId})`)
   process.exit(0)
}

main().catch((error) => {
   console.error('Falha no envio:', error.message)
   process.exit(1)
})
