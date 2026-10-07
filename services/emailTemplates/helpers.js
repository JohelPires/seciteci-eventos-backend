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

module.exports = { TIMEZONE, formatarData, rotuloStatus }
