const { Prisma } = require('@prisma/client')

// Campos escalares graváveis do modelo Evento (prisma/schema.prisma).
// Exclui id, organizadorId, dataCriacao, dataAtualizacao e relações
// (categoria, organizador, local, inscricoes, programacao, avaliacoes, notificacoes).
const WRITABLE_FIELDS = [
   'titulo',
   'descricao',
   'categoriaId',
   'localId',
   'dataInicio',
   'dataFim',
   'horarioAbertura',
   'horarioEncerramento',
   'capacidadeMaxima',
   'vagasDisponiveis',
   'valorInscricao',
   'tipoEvento',
   'linkOnline',
   'LocalLinkGoogleMaps',
   'linkPaginaEvento',
   'imagemCapa',
   'LocalNome',
   'LocalEndereco',
   'LocalNumero',
   'LocalComplemento',
   'LocalBairro',
   'LocalCidade',
   'LocalEstado',
   'LocalCep',
   'LocalPais',
   'LocalCapacidade',
   'LocalLatitude',
   'LocalLongitude',
   'LocalObservacoes',
   'status',
   'motivoCancelamento',
   'publicoAlvo',
   'requisitos',
   'destaque',
]

const INT_FIELDS = ['categoriaId', 'localId', 'capacidadeMaxima', 'vagasDisponiveis', 'LocalCapacidade']
const FLOAT_FIELDS = ['valorInscricao', 'LocalLatitude', 'LocalLongitude']
const DATE_FIELDS = ['dataInicio', 'dataFim']
const TIME_FIELDS = ['horarioAbertura', 'horarioEncerramento']

// Copia apenas as chaves permitidas do body (preserva undefined => ausente).
function pickEventoFields(body) {
   const picked = {}
   for (const field of WRITABLE_FIELDS) {
      if (body[field] !== undefined) {
         picked[field] = body[field]
      }
   }
   // Alias legacy do front (comportamento do update original: sobrescreve se enviado)
   if (body.linkGoogleMaps !== undefined) {
      picked.LocalLinkGoogleMaps = body.linkGoogleMaps
   }
   return picked
}

// '' ou null em Int/Float=> null (limpar campo). Valor inválido fica cru e o
// próprio Prisma rejeita (PrismaClientValidationError) => 400 pelo mapPrismaError.
function parseIntField(value) {
   if (value === null || value === '') return null
   const num = Number(value)
   if (!Number.isInteger(num)) return value
   return num
}

function parseFloatField(value) {
   if (value === null || value === '') return null
   const num = Number(value)
   if (Number.isNaN(num)) return value
   return num
}

function parseDateField(value) {
   if (value === null || value === '') return null
   const date = new Date(value)
   if (Number.isNaN(date.getTime())) return value
   return date
}

// Colunas @db.Time recebem "HH:MM[:SS]" e são montadas sobre 1970-01-01
// (mesma convenção do create/update anteriores).
function parseTimeField(value) {
   if (value === null || value === '') return null
   return new Date(`1970-01-01T${value}`)
}

function parseBoolField(value) {
   if (value === null) return null
   if (value === 'true') return true
   if (value === 'false') return false
   return value
}

function normalizeEventoFields(data) {
   const normalized = {}
   for (const [key, value] of Object.entries(data)) {
      if (INT_FIELDS.includes(key)) {
         normalized[key] = parseIntField(value)
      } else if (FLOAT_FIELDS.includes(key)) {
         normalized[key] = parseFloatField(value)
      } else if (DATE_FIELDS.includes(key)) {
         normalized[key] = parseDateField(value)
      } else if (TIME_FIELDS.includes(key)) {
         normalized[key] = parseTimeField(value)
      } else if (key === 'destaque') {
         normalized[key] = parseBoolField(value)
      } else {
         normalized[key] = value
      }
   }
   return normalized
}

// Normaliza o array `financiadores` do body (já validado pelo middleware).
// - chave ausente/falsy => undefined (PUT mantém o estado atual; POST cria vazio)
// - array => [{ tipo, nome }] já trimado, pronto para o create aninhado
function sanitizeFinanciadores(body) {
   if (!Array.isArray(body.financiadores)) return undefined
   return body.financiadores.map((item) => ({
      tipo: item?.tipo ? String(item.tipo).trim() || null : null,
      nome: String(item?.nome ?? '').trim(),
   }))
}

// Whitelist + normalização: descarta campos não-column (ex.: resposta do GET
// com categoria/organizador/_count/cache) e converte tipos.
function sanitizeEventoInput(body) {
   return normalizeEventoFields(pickEventoFields(body))
}

// Mapeia erros do Prisma para respostas HTTP com mensagens seguras.
// O detalhe técnico cru só é anexado em NODE_ENV=development.
function mapPrismaError(error, ctx = {}) {
   const isDev = process.env.NODE_ENV === 'development'
   const withDetail = (body) =>
      isDev && error?.message ? { ...body, detalhe: error.message } : body

   if (error instanceof Prisma.PrismaClientValidationError) {
      return { status: 400, body: withDetail({ error: ctx.validacao || 'Dados inválidos' }) }
   }

   if (error instanceof Prisma.PrismaClientKnownRequestError) {
      switch (error.code) {
         case 'P2025':
            return { status: 404, body: withDetail({ error: ctx.naoEncontrado || 'Registro não encontrado' }) }
         case 'P2002':
            return { status: 409, body: withDetail({ error: ctx.duplicado || 'Registro duplicado' }) }
         case 'P2003':
            return { status: 400, body: withDetail({ error: ctx.referencia || 'Referência inválida (registro relacionado inexistente)' }) }
      }
   }

   return { status: 500, body: withDetail({ error: ctx.padrao || 'Erro interno' }) }
}

function respondPrismaError(error, res, ctx = {}) {
   const mapped = mapPrismaError(error, ctx)
   return res.status(mapped.status).json(mapped.body)
}

module.exports = {
   WRITABLE_FIELDS,
   pickEventoFields,
   normalizeEventoFields,
   sanitizeEventoInput,
   sanitizeFinanciadores,
   mapPrismaError,
   respondPrismaError,
}
