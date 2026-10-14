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

const ROTULOS_FINANCIADOR = {
   publico: 'Publico',
   privado: 'Privado',
   hibrido: 'Hibrido',
}

const rotuloFinanciadorTipo = (tipo) => ROTULOS_FINANCIADOR[tipo] || tipo

const formatarFinanciador = (evento) => {
   const tipo = evento.financiadorTipo ? rotuloFinanciadorTipo(evento.financiadorTipo) : null
   const nome = evento.financiadorNome && evento.financiadorNome.trim() ? evento.financiadorNome.trim() : null
   if (tipo && nome) return `${tipo} - ${nome}`
   return tipo || nome || null
}

module.exports = { TIMEZONE, formatarData, rotuloStatus, rotuloFinanciadorTipo, formatarFinanciador }
