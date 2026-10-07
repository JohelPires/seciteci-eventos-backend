const nodemailer = require('nodemailer')

const emailEnabled = process.env.EMAIL_ENABLED === 'true'

const transporter = emailEnabled
   ? nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: Number(process.env.SMTP_PORT) || 465,
        secure: process.env.SMTP_SECURE !== 'false',
        auth: {
           user: process.env.SMTP_USER,
           pass: process.env.SMTP_PASS,
        },
     })
   : null

const verifyMailer = async () => {
   if (!emailEnabled) {
      console.log('Email desativado: defina EMAIL_ENABLED=true para enviar e-mails')
      return
   }

   if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.warn('AVISO: EMAIL_ENABLED=true, mas SMTP_USER/SMTP_PASS nao estao configurados')
      return
   }

   try {
      await transporter.verify()
      console.log(`Servico de e-mail pronto (${process.env.SMTP_USER})`)
   } catch (error) {
      console.error('Falha ao verificar SMTP:', error.message)
   }
}

module.exports = { transporter, emailEnabled, verifyMailer }
