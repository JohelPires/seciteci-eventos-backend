const { formatarData } = require('./helpers')

const eventoCriadoTemplate = ({ usuario, evento }) => {
   const presencial = evento.tipoEvento === 'presencial'
   const local = presencial
      ? `${evento.LocalNome || 'A definir'}${
           evento.LocalCidade ? ` - ${evento.LocalCidade}/${evento.LocalEstado || ''}` : ''
        }`
      : evento.linkOnline || 'A definir'

   const ehRascunho = evento.status === 'rascunho'
   const subject = `Evento criado: ${evento.titulo}`

   const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
         <h2 style="color: #2c3e50;">Ola, ${usuario.nome}!</h2>
         <p>Seu evento foi criado com sucesso na plataforma Seciteci Eventos.</p>
         <h3 style="color: #2c3e50;">${evento.titulo}</h3>
         <ul>
            <li><strong>Início:</strong> ${formatarData(evento.dataInicio)}</li>
            <li><strong>Fim:</strong> ${formatarData(evento.dataFim)}</li>
            <li><strong>${presencial ? 'Local' : 'Link'}:</strong> ${local}</li>
            <li><strong>Status:</strong> ${evento.status}</li>
         </ul>
         ${
            ehRascunho
               ? '<p style="background-color: #fff3cd; padding: 12px; border-radius: 4px;">O evento esta em <strong>rascunho</strong> e ainda nao esta visivel ao publico.</p>'
               : ''
         }
         <p style="color: #7f8c8d; font-size: 12px;">Esta e uma mensagem automatica. Nao responda este e-mail.</p>
      </div>
   `

   const text = [
      `Ola, ${usuario.nome}!`,
      '',
      'Seu evento foi criado com sucesso na plataforma Seciteci Eventos.',
      '',
      `Evento: ${evento.titulo}`,
      `Inicio: ${formatarData(evento.dataInicio)}`,
      `Fim: ${formatarData(evento.dataFim)}`,
      `${presencial ? 'Local' : 'Link'}: ${local}`,
      `Status: ${evento.status}`,
      ehRascunho ? 'O evento esta em rascunho e ainda nao esta visivel ao publico.' : '',
   ]
      .filter(Boolean)
      .join('\n')

   return { subject, html, text }
}

module.exports = { eventoCriadoTemplate }
