const emailEnabled = process.env.EMAIL_ENABLED === 'true'

const plunkKey = process.env.PLUNK_SECRET_KEY || ''
const plunkApiUrl = (process.env.PLUNK_API_URL || 'https://next-api.useplunk.com').replace(/\/+$/, '')

const buildFrom = () => {
   const raw = (process.env.EMAIL_FROM || '').trim()
   if (!raw) return undefined

   const match = raw.match(/^(.*?)\s*<([^>]+)>\s*$/)
   if (match) {
      return { name: match[1].trim() || undefined, email: match[2].trim() }
   }

   return { email: raw }
}

const verifyMailer = () => {
   if (!emailEnabled) {
      console.log('Email desativado: defina EMAIL_ENABLED=true para enviar e-mails')
      return
   }

   if (!plunkKey) {
      console.warn('AVISO: EMAIL_ENABLED=true, mas PLUNK_SECRET_KEY nao esta configurada')
      return
   }

   if (!buildFrom()) {
      console.warn('AVISO: EMAIL_ENABLED=true, mas EMAIL_FROM nao esta configurado')
      return
   }

   console.log(`Servico de e-mail pronto (Plunk: ${plunkApiUrl})`)
}

module.exports = { emailEnabled, plunkKey, plunkApiUrl, buildFrom, verifyMailer }
