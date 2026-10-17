# Design: Financiador como tabela (relação 1:N com evento)

Data: 2026-10-16
Status: Aprovado pelo usuário (design em conversa)

## Objetivo

Transformar o financiador de evento, hoje em duas colunas planas de `eventos`
(`financiador_tipo`, `financiador_nome`), em uma **tabela própria** com relação
**um-para-muitos**: um evento pode ter **muitos financiadores**, e cada
financiador pertence a **um único evento**. A API de criação/edição de evento
passa a receber `financiadores` como **array embutido**, e todas as leituras
devolvem o array.

## Decisões aprovadas

| Tópico                  | Decisão                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| Relação                 | `Evento` 1 → N `Financiador` (FK `evento_id` em `financiadores`, cascade on delete)          |
| Contrato da API         | Array embutido `financiadores: [{ nome, tipo? }]` no POST/PUT do evento; sem rotas aninhadas |
| Colunas planas antigas  | Migradas para a nova tabela e **removidas** (sem retrocompatibilidade de leitura)            |
| Campos por financiador  | Apenas `tipo` (`publico|privado|hibrido`, opcional) + `nome` (obrigatório, ≤150)             |
| E-mails                 | Listam **todos os financiadores, apenas os nomes**, unidos por `", "` (ex.: `MEC, FIEMT`)    |
| Atualização (PUT)       | **Substituição total**: array presente apaga todos e recria; array ausente mantém o atual    |
| Obrigatoriedade         | `nome` obrigatório (trim, ≤150); `tipo` opcional, quando enviado precisa estar no enum        |
| Limite                  | Máximo de 20 financiadores por evento                                                        |
| Leitura                 | `financiadores` incluído em todas as leituras de evento (detalhe e listagens)                |

Fora de escopo: rotas dedicadas (`/eventos/:id/financiadores`), reuso de um
mesmo financiador entre eventos (N:N), campos extras (valor do aporte, CNPJ,
contato), histórico/auditoria de financiadores.

## Contexto do fluxo existente

- O financiador foi adicionado como colunas planas na migração
  `20261006212902_adicionar_financiador_evento`; `tipo` é opcional
  (`publico|privado|hibrido`) e `nome` opcional (≤150), validados
  independentemente em `middleware/validators.js` (POST e PUT).
- `services/eventoPayload.js` mantém a whitelist `WRITABLE_FIELDS` de campos
  escalares do modelo `Evento`; `sanitizeEventoInput` copia apenas essas chaves
  e normaliza tipos (hoje inclui `financiadorTipo`/`financiadorNome`).
- `createEvento`/`updateEvento` (`controllers/eventosController.js`) passam os
  dados saneados direto ao Prisma e depois fazem `cache.flushAll()`.
- Os e-mails `eventoCriado`/`eventoStatusAlterado` usam
  `formatarFinanciador` (`services/emailTemplates/helpers.js`), que hoje
  renderiza `Tipo - Nome` de um único financiador.
- `GET /api/eventos`, `GET /api/eventos/:id`, `GET /api/meus-eventos` e o
  (não roteado) `getEventosDestaque` já retornavam os campos planos porque eram
  colunas de `Evento` — com a relação, passam a precisar de `include`
  explícito para manter o financiador disponível nas respostas.
- `prisma/seed.js` cria um financiador por evento via colunas planas.

## Componentes

### `prisma/schema.prisma`

Novo modelo:

```prisma
model Financiador {
  id       Int     @id @default(autoincrement())
  eventoId Int     @map("evento_id")
  tipo     String? @db.VarChar(20)
  nome     String  @db.VarChar(150)

  evento Evento @relation(fields: [eventoId], references: [id], onDelete: Cascade)

  @@map("financiadores")
}
```

Em `Evento`:

- remover `financiadorTipo`/`financiadorNome`;
- adicionar `financiadores Financiador[]`.

### Migração `<timestamp>_financiador_como_tabela`

Gerada com `npm run prisma:migrate` e ajustada em SQL puro para incluir o
backfill antes do drop das colunas:

1. `CREATE TABLE "financiadores"` (id serial, `evento_id INTEGER NOT NULL`
   com FK `ON DELETE CASCADE`, `tipo VARCHAR(20)`, `nome VARCHAR(150) NOT NULL`).
2. Backfill **sem perder linhas** (dados atuais podem ter só tipo, só nome ou
   ambos; nome é NOT NULL na tabela nova):

```sql
INSERT INTO "financiadores" ("evento_id", "tipo", "nome")
SELECT
   id,
   financiador_tipo,
   COALESCE(
      NULLIF(BTRIM(financiador_nome), ''),
      NULLIF(BTRIM(financiador_tipo), ''),
      'Nao informado'
   )
FROM "eventos"
WHERE financiador_nome IS NOT NULL OR financiador_tipo IS NOT NULL;
```

3. `ALTER TABLE "eventos" DROP COLUMN "financiador_tipo", DROP COLUMN "financiador_nome";`

### `middleware/validators.js`

Substituir as regras de `financiadorTipo`/`financiadorNome` por validação do
array, em **ambos** `eventoValidator` e `eventoUpdateValidator`:

- `financiadores` opcional; quando enviado, precisa ser array
  (`Array.isArray` via `custom`), com no máximo 20 itens;
- cada item: `nome` obrigatório (string, `trim`, não vazio, ≤150) e `tipo`
  opcional em `publico|privado|hibrido` (quando presente não-vazio).

Mensagens em português, no padrão atual ("Nome do financiador inválido",
"Tipo de financiador inválido", etc.), sempre via `withMessage`.

### `services/eventoPayload.js`

- Remover `financiadorTipo`/`financiadorNome` de `WRITABLE_FIELDS` (o
  whitelist escalar não deve copiar `financiadores`, que é relação).
- Nova função `sanitizeFinanciadores(body)`:
  - retorna `undefined` quando `financiadores` não veio no body (PUT mantém o
    estado atual; POST trata ausente como vazio);
  - quando veio: mapeia cada item para `{ tipo, nome }` com `nome`/`tipo`
    trimmed, `tipo` vazio → `null` (nomes já garantidos válidos pelo validator);
  - exporta junto com as demais funções.

### `controllers/eventosController.js`

- **`createEvento`**: após `sanitizeEventoInput`, extrair
  `const financiadores = sanitizeFinanciadores(req.body) ?? []` e criar o
  evento com `financiadores: { create: financiadores }` (escrita aninhada,
  atômica). Adicionar `financiadores: true` ao `include` da resposta.
- **`updateEvento`**: quando `sanitizeFinanciadores` retornar array, adicionar
  `financiadores: { deleteMany: {}, create: financiadores }` aos
  `dadosAtualizacao` (substituição total dentro do mesmo update); quando
  retornar `undefined`, não tocar nos financiadores existentes. Adicionar
  `financiadores: true` ao `include` da resposta.
- **Leituras**: incluir `financiadores: true` (orderBy `id` para ordem
  estável) em `getEventoById`, `getEventos`, `getMeusEventos` e
  `getEventosDestaque`.
- Não muda nada em autorização, status, `motivoCancelamento`, e-mails de
  status nem `cache.flushAll()`.

### `services/emailTemplates/helpers.js`

- Substituir `rotuloFinanciadorTipo`/`formatarFinanciador` por:

```js
const formatarFinanciadores = (evento) => {
   const lista = Array.isArray(evento.financiadores) ? evento.financiadores : []
   const nomes = lista
      .map((f) => (f?.nome || '').trim())
      .filter(Boolean)
   return nomes.length ? nomes.join(', ') : null
}
```

  (só nomes, ignorando `tipo`; `null` quando não há financiadores).

### `services/emailTemplates/eventoCriado.js` e `eventoStatusAlterado.js`

- Usar `formatarFinanciadores`; rótulo singular/plural conforme a quantidade:
  - 1 financiador → `Financiador: MEC`;
  - vários → `Financiadores: MEC, FIEMT`;
  - nenhum → bloco/linha omitidos (como hoje).
- Estrutura do e-mail e demais linhas permanecem iguais.

### `prisma/seed.js`

Trocar `financiadorTipo`/`financiadorNome` por
`financiadores: { create: [{ tipo, nome }] }` (um financiador por evento,
mesmos dados atuais). Seed continua manual.

### `docs/swagger.routes.js` (hand-written)

- No `requestBody` de `POST /api/eventos` e `PUT /api/eventos/{id}`: remover
  `financiadorTipo`/`financiadorNome` e documentar

```yaml
financiadores:
  type: array
  maxItems: 20
  items:
    type: object
    required: [nome]
    properties:
      nome:
        type: string
        maxLength: 150
      tipo:
        type: string
        enum: [publico, privado, hibrido]
  description: Lista de financiadores do evento. No PUT, enviar o array substitui todos os financiadores existentes; omitir mantém os atuais.
```

- Mencionar nas `description`/respostas que GET (lista e detalhe) e as
  respostas de POST/PUT devolvem `financiadores: [{ id, eventoId, tipo, nome }]`.

### Testes

`tests/emailTemplates.test.js` — templates passam a receber
`financiadores: [{ tipo, nome }, ...]` no evento; cobrir:

- vários financiadores → `Financiadores: MEC, FIEMT` (html e text);
- um financiador → `Financiador: MEC`;
- nenhum → sem a palavra "Financiador".

`tests/eventos.test.js` — cobrir:

- POST com `financiadores` persiste e a resposta devolve o array;
- POST sem `financiadores` cria evento sem financiadores;
- item sem `nome` → 400; `tipo` inválido → 400; mais de 20 itens → 400;
- PUT com array novo **substitui** (antigos somem, ids recriados);
- PUT **sem** a chave mantém os financiadores existentes;
- PUT com `[]` limpa todos;
- DELETE do evento remove os financiadores (cascade);
- GET lista e detalhe incluem `financiadores`.

## Config / erros

- Nenhuma variável de ambiente, dependência nova ou mudança no docker-compose.
- Novos erros de validação: 400 (array inválido, item sem nome, tipo fora do
  enum, mais de 20 itens) — respostas no formato `errors[]` do express-validator.
- `DELETE` de evento com financiadores segue permitido (cascade no banco);
  a regra de bloqueio por inscrições permanece.
- Cache: `cache.flushAll()` nos writes já cobre as listas/detalhe.

## Verificação

- `node --check` em todos os arquivos tocados.
- `npx prisma migrate dev` (gera a migração) + `npx prisma generate` — em
  Docker, o compose já roda `prisma generate` no boot; nova **dependência não
  há**, então o volume `node_modules` não precisa ser recriado.
- Smoke da migração na base de dev: eventos com financiador antigo aparecem em
  `financiadores` (backfill), colunas planas removidas.
- Jest: `npx jest --runInBand` com `docker compose -f docker-compose.yml up -d db`
  (suites `eventos` e `emailTemplates` atualizadas + suite completa verde).
- Swagger sobe em `/api-docs` com os schemas atualizados.
