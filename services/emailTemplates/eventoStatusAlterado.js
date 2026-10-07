const { formatarData, rotuloStatus } = require('./helpers')

const eventoStatusAlteradoTemplate = ({ usuario, evento, statusAnterior, statusNovo }) => {
   const presencial = evento.tipoEvento === 'presencial'
   const local = presencial
      ? `${evento.LocalNome || 'A definir'}${
           evento.LocalCidade ? ` - ${evento.LocalCidade}/${evento.LocalEstado || ''}` : ''
        }`
      : evento.linkOnline || 'A definir'

   const subject = `Status do evento atualizado: ${evento.titulo}`
   const rotuloAnterior = rotuloStatus(statusAnterior)
   const rotuloNovo = rotuloStatus(statusNovo)

   const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
         <h2 style="color: #2c3e50;">Ola, ${usuario.nome}!</h2>
         <p>O status do evento <strong>${evento.titulo}</strong> foi alterado de <strong>${rotuloAnterior}</strong> para <strong>${rotuloNovo}</strong>.</p>
         <ul>
            <li><strong>Início:</strong> ${formatarData(evento.dataInicio)}</li>
            <li><strong>Fim:</strong> ${formatarData(evento.dataFim)}</li>
            <li><strong>${presencial ? 'Local' : 'Link'}:</strong> ${local}</li>
            <li><strong>Status atual:</strong> ${rotuloNovo}</li>
         </ul>
         <p style="color: #7f8c8d; font-size: 12px;">Esta e uma mensagem automatica. Nao responda este e-mail.</p>
      </div>
   `

   const text = [
      `Ola, ${usuario.nome}!`,
      '',
      `O status do evento "${evento.titulo}" foi alterado de ${rotuloAnterior} para ${rotuloNovo}.`,
      '',
      `Evento: ${evento.titulo}`,
      `Inicio: ${formatarData(evento.dataInicio)}`,
      `Fim: ${formatarData(evento.dataFim)}`,
      `${presencial ? 'Local' : 'Link'}: ${local}`,
      `Status atual: ${rotuloNovo}`,
   ].join('\n')

   return { subject, html, text }
}

module.exports = { eventoStatusAlteradoTemplate }
