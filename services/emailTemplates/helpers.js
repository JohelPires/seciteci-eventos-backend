const TIMEZONE = 'America/Cuiaba'

const formatarData = (data) =>
   data
      ? new Date(data).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: TIMEZONE })
      : 'Nao informado'

const ROTULOS_STATUS = {
   rascunho: 'Rascunho',
   publicado: 'Publicado',
   cancelado: 'Cancelado',
   encerrado: 'Encerrado',
}

const rotuloStatus = (status) => ROTULOS_STATUS[status] || status

const formatarFinanciadores = (evento) => {
   const lista = Array.isArray(evento?.financiadores) ? evento.financiadores : []
   const nomes = lista
      .map((f) => (f?.nome || '').trim())
      .filter(Boolean)
   if (!nomes.length) return null
   return {
      rotulo: nomes.length > 1 ? 'Financiadores' : 'Financiador',
      nomes: nomes.join(', '),
   }
}

module.exports = { TIMEZONE, formatarData, rotuloStatus, formatarFinanciadores }
