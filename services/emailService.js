const { transporter, emailEnabled } = require('../config/mailer')

const isEmailEnabled = () => emailEnabled && transporter !== null

const sendEmail = async ({ to, subject, html, text }) => {
   if (!isEmailEnabled()) {
      return null
   }

   if (!to || !subject) {
      throw new Error('sendEmail: campos obrigatorios ausentes (to, subject)')
   }

   const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.SMTP_USER,
      to,
      subject,
      html,
      text,
   })

   return info.messageId
}

const sendTemplatedEmail = async (to, template) => {
   return sendEmail({ to, ...template })
}

const sendMailSafe = (to, template) => {
   sendTemplatedEmail(to, template).catch((error) => {
      console.error(`[email] Falha ao enviar para ${to} ("${template?.subject || 'sem assunto'}"):`, error?.message || error)
   })
}

module.exports = { isEmailEnabled, sendEmail, sendTemplatedEmail, sendMailSafe }
