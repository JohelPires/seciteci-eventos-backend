const { emailEnabled, plunkKey, plunkApiUrl, buildFrom } = require('../config/mailer')

const isEmailEnabled = () => emailEnabled && Boolean(plunkKey)

const sendEmail = async ({ to, subject, html, text }) => {
   if (!isEmailEnabled()) {
      return null
   }

   if (!to || !subject) {
      throw new Error('sendEmail: campos obrigatorios ausentes (to, subject)')
   }

   const body = html || text
   if (!body) {
      throw new Error('sendEmail: campos obrigatorios ausentes (html)')
   }

   const from = buildFrom()
   if (!from) {
      throw new Error('sendEmail: EMAIL_FROM nao configurado')
   }

   const response = await fetch(`${plunkApiUrl}/v1/send`, {
      method: 'POST',
      headers: {
         Authorization: `Bearer ${plunkKey}`,
         'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to, subject, body, from }),
      signal: AbortSignal.timeout(10000),
   })

   const payload = await response.json().catch(() => null)

   if (!response.ok || !payload?.success) {
      const code = payload?.error?.code || `HTTP_${response.status}`
      const message = payload?.error?.message || response.statusText || 'falha no envio'
      throw new Error(`[Plunk ${code}] ${message}`)
   }

   return payload?.data?.emails?.[0]?.email || null
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
