const { eventoStatusAlteradoTemplate } = require('../services/emailTemplates/eventoStatusAlterado')
const { eventoCriadoTemplate } = require('../services/emailTemplates/eventoCriado')

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

   test('inclui o financiador quando informado', () => {
      const t = eventoStatusAlteradoTemplate({
         ...base,
         evento: { ...base.evento, financiadorTipo: 'publico', financiadorNome: 'MEC' },
      })
      expect(t.html).toContain('Financiador:')
      expect(t.html).toContain('Publico - MEC')
      expect(t.text).toContain('Financiador: Publico - MEC')
   })

   test('nao inclui financiador quando ausente', () => {
      const t = eventoStatusAlteradoTemplate({ ...base })
      expect(t.html).not.toContain('Financiador')
      expect(t.text).not.toContain('Financiador')
   })
})

describe('eventoCriadoTemplate', () => {
   const base = {
      usuario: { nome: 'Ana' },
      evento: {
         titulo: 'Evento X',
         dataInicio: new Date('2026-01-01T10:00:00Z'),
         dataFim: new Date('2026-01-01T12:00:00Z'),
         tipoEvento: 'online',
         linkOnline: 'https://exemplo.test',
         status: 'rascunho',
      },
   }

   test('nao contem a palavra rascunho quando aguardando aprovacao', () => {
      const t = eventoCriadoTemplate({ ...base })
      expect(t.html.toLowerCase()).not.toContain('rascunho')
      expect(t.text.toLowerCase()).not.toContain('rascunho')
   })

   test('informa que o evento aguarda aprovacao do moderador', () => {
      const t = eventoCriadoTemplate({ ...base })
      expect(t.html).toContain('aguardando aprovacao do moderador')
      expect(t.text).toContain('aguardando aprovacao do moderador')
   })

   test('evento publicado mostra Publicado e nao menciona aprovacao', () => {
      const t = eventoCriadoTemplate({ ...base, evento: { ...base.evento, status: 'publicado' } })
      expect(t.html).toContain('Publicado')
      expect(t.text).toContain('Publicado')
      expect(t.html.toLowerCase()).not.toContain('rascunho')
      expect(t.html).not.toContain('aguardando aprovacao do moderador')
      expect(t.text).not.toContain('aguardando aprovacao do moderador')
   })

   test('inclui o financiador quando informado', () => {
      const t = eventoCriadoTemplate({
         ...base,
         evento: { ...base.evento, financiadorTipo: 'hibrido', financiadorNome: 'Fulano de Tal' },
      })
      expect(t.html).toContain('Financiador:')
      expect(t.html).toContain('Hibrido - Fulano de Tal')
      expect(t.text).toContain('Financiador: Hibrido - Fulano de Tal')
   })

   test('nao inclui financiador quando ausente', () => {
      const t = eventoCriadoTemplate({ ...base })
      expect(t.html).not.toContain('Financiador')
      expect(t.text).not.toContain('Financiador')
   })
})
