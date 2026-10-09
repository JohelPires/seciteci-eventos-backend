const resetSenhaTemplate = ({ usuario, codigo }) => {
   const subject = 'Redefinição de senha - CONECTE-SE'

   const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
         <h2 style="color: #2c3e50;">Ola, ${usuario.nome}!</h2>
         <p>Recebemos uma solicitacao para redefinir a senha da sua conta na plataforma CONECTE-SE.</p>
         <p style="color: #7f8c8d;">Seu codigo de verificacao e:</p>
         <p style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #2c3e50;">${codigo}</p>
         <p>Este codigo expira em <strong>15 minutos</strong>.</p>
         <p style="color: #7f8c8d; font-size: 12px;">Se voce nao solicitou a redefinicao, ignore este e-mail. Esta e uma mensagem automatica, nao responda.</p>
      </div>
   `

   const text = [
      `Ola, ${usuario.nome}!`,
      '',
      'Recebemos uma solicitacao para redefinir a senha da sua conta na plataforma CONECTE-SE.',
      '',
      `Seu codigo de verificacao e: ${codigo}`,
      'Este codigo expira em 15 minutos.',
      '',
      'Se voce nao solicitou a redefinicao, ignore este e-mail.',
   ].join('\n')

   return { subject, html, text }
}

module.exports = { resetSenhaTemplate }
