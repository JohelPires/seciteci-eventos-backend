const { eventoStatusAlteradoTemplate } = require('../services/emailTemplates/eventoStatusAlterado')

const base = {
   usuario: { nome: 'Ana' },
   evento: {
      titulo: 'Evento X',
      dataInicio: new Date('2026-01-01T10:00:00Z'),
      dataFim: new Date('2026-01-01T12:00:00Z'),
      tipoEvento: 'online',
      linkOnline: 'https://exemplo.test',
      status: 'cancelado',
   },
   statusAnterior: 'publicado',
   statusNovo: 'cancelado',
}

describe('eventoStatusAlteradoTemplate', () => {
   test('inclui o motivo quando o novo status e cancelado', () => {
      const t = eventoStatusAlteradoTemplate({ ...base, motivoCancelamento: 'Chuva forte' })
      expect(t.html).toContain('Motivo do cancelamento')
      expect(t.html).toContain('Chuva forte')
      expect(t.text).toContain('Motivo do cancelamento: Chuva forte')
   })

   test('nao inclui o motivo quando o novo status nao e cancelado', () => {
      const t = eventoStatusAlteradoTemplate({
         ...base,
         statusNovo: 'publicado',
         motivoCancelamento: 'Chuva forte',
      })
      expect(t.html).not.toContain('Motivo do cancelamento')
      expect(t.text).not.toContain('Motivo do cancelamento')
   })

   test('nao inclui o bloco quando nao ha motivo', () => {
      const t = eventoStatusAlteradoTemplate({ ...base })
      expect(t.html).not.toContain('Motivo do cancelamento')
      expect(t.text).not.toContain('Motivo do cancelamento')
   })
})
