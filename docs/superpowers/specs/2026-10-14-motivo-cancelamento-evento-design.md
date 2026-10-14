# Design: Motivo do cancelamento de evento

Data: 2026-10-14
Status: Aprovado pelo usuário (design em conversa)

## Objetivo

Permitir registrar um **motivo** quando o status de um evento é alterado para
`cancelado`, via `PUT /api/eventos/:id`. O motivo é **opcional**, **público**
(aparece em todos os GET de evento), **editável** a qualquer momento e
**limpo automaticamente** se o evento deixar de estar cancelado. Quando o
cancelamento dispara o e-mail de mudança de status já existente, o motivo é
incluído na mensagem enviada ao organizador.

## Decisões aprovadas

| Tópico                | Decisão                                                               |
| --------------------- | --------------------------------------------------------------------- |
| Obrigatoriedade       | Opcional — cancelar sem motivo é permitido (fica `NULL`)              |
| Visibilidade          | Público — retornado em `GET /api/eventos` e `GET /api/eventos/:id`    |
| Reativação            | Se o status deixa de ser `cancelado`, o motivo é limpo (`NULL`)       |
| Edição                | `motivoCancelamento` pode ser enviado/alterado em qualquer `PUT`      |
| E-mail                | E-mail de status alterado exibe o motivo quando o novo status é cancelado |
| Campo vazio           | String vazia / só espaços é normalizada para `NULL`                   |
| Limite                | Máximo de 1000 caracteres (após `trim`)                               |
| Abordagem             | Coluna nullable em `Evento` (sem endpoint dedicado, sem tabela de histórico) |

Fora de escopo: endpoint dedicado de cancelamento, histórico de múltiplos
cancelamentos, cascade de cancelamento para `Inscricao`, notificação a
participantes, transições de status permitidas.

## Contexto do fluxo existente

- A mudança de status ocorre por `PUT /api/eventos/:id`
  (`controllers/eventosController.js`, `updateEvento`), protegido por
  `authMiddleware`; só o dono ou admin edita.
- `updateEvento` monta `dadosAtualizacao = { ...req.body }` (removendo `id`,
  `organizadorId`, `dataCriacao`) e passa direto ao `prisma.evento.update`,
  então um novo campo `motivoCancelamento` no body flui sem mapeamento extra.
- O `PUT` **não** passa por `eventoValidator` (só o `POST` usa o validator),
  por isso a validação do motivo será feita no próprio controller — o
  `eventoValidator` exige campos obrigatórios (`titulo`, `dataInicio`,
  `dataFim`) que quebrariam updates parciais.
- Após o update já há `cache.flushAll()` e o envio do e-mail
  `eventoStatusAlteradoTemplate` quando `status` muda.

## Componentes

### `prisma/schema.prisma` — model `Evento`

Adicionar campo nullable (após `status`):

```prisma
motivoCancelamento String? @map("motivo_cancelamento") @db.Text
```

Migração gerada com `npm run prisma:migrate` seguindo o padrão existente:
`<timestamp>_adicionar_motivo_cancelamento_evento`. Eventos existentes e não
cancelados permanecem com `NULL` (coluna nullable, sem backfill).

### `controllers/eventosController.js` (`updateEvento`)

Após montar `dadosAtualizacao` e a autorização de publicação existente,
antes do `prisma.evento.update`:

1. **Normalização** de `motivoCancelamento` (quando a chave estiver presente e
   não for `null`):
   - se não for `string` → `400 { error: 'Motivo de cancelamento inválido' }`.
   - `trim()`; se resultar vazio (`''`) → `null` (limpa o motivo).
   - se `length > 1000` →
     `400 { error: 'Motivo de cancelamento deve ter no máximo 1000 caracteres' }`.

2. **Limpeza automática** quando o status resultante não é `cancelado`:

```js
const statusEfetivo =
   dadosAtualizacao.status !== undefined ? dadosAtualizacao.status : evento.status

if (statusEfetivo !== 'cancelado') {
   dadosAtualizacao.motivoCancelamento = null
}
```

   - Cobre reativar o evento (mesmo que o body não traga o motivo).
   - Se o evento já está cancelado e o body só edita o motivo (sem `status`),
     `statusEfetivo === 'cancelado'` e o motivo novo é preservado.
   - Enviar motivo enquanto o status não é cancelado é silenciosamente
     descartado (`NULL`), não gera erro.

3. **E-mail**: incluir o motivo persistido no envio já existente:

```js
if (dadosAtualizacao.status && dadosAtualizacao.status !== evento.status) {
   sendMailSafe(
      eventoAtualizado.organizador.email,
      eventoStatusAlteradoTemplate({
         usuario: eventoAtualizado.organizador,
         evento: eventoAtualizado,
         statusAnterior: evento.status,
         statusNovo: dadosAtualizacao.status,
         motivoCancelamento: eventoAtualizado.motivoCancelamento,
      })
   )
}
```

   - Sem mudança nos status codes de sucesso/erro nem no `await` (o e-mail
     continua fire-and-forget). O `cache.flushAll()` permanece como está.

### `services/emailTemplates/eventoStatusAlterado.js`

- Assinatura passa a aceitar `motivoCancelamento`:
  `({ usuario, evento, statusAnterior, statusNovo, motivoCancelamento })`.
- Renderiza um bloco adicional **somente** quando
  `statusNovo === 'cancelado'` **e** `motivoCancelamento` (após trim) for
  não vazio:
  - html: `<li><strong>Motivo do cancelamento:</strong> ${motivo}</li>` dentro
    da mesma `<ul>` (ou parágrafo próprio).
  - text: linha `Motivo do cancelamento: ${motivo}`.
- Nos demais casos o template é idêntico ao atual (retrocompatível — a chave
  nova é opcional).

### `docs/swagger.routes.js` — `PUT /api/eventos/{id}`

Adicionar ao schema do requestBody:

```yaml
motivoCancelamento:
  type: string
  maxLength: 1000
  description: Motivo do cancelamento. Opcional; exibido quando o status do evento é "cancelado".
```

Atualizar a `description` do endpoint mencionando o campo e a limpeza
automática ao reativar.

## Config / erros

- Nenhuma variável de ambiente, dependência ou mudança no docker-compose.
- Novos erros: `400` para tipo inválido ou motivo acima de 1000 caracteres.
- Falhas de envio de e-mail seguem log-only (sem retry), como hoje.

## Verificação

- `node --check` em todos os arquivos tocados.
- Smoke do template com `node -e` (com e sem motivo; status não-cancelado).
- Jest (`npx jest --runInBand` com o DB de teste), em `tests/eventos.test.js`:
  1. Cancelar com motivo → `200` e `motivoCancelamento` persistido/retornado.
  2. Cancelar sem motivo → `200` e `motivoCancelamento === null`.
  3. Reativar (status sai de `cancelado`) → `motivoCancelamento === null`.
  4. `motivoCancelamento` com mais de 1000 caracteres → `400`.
  5. Editar o motivo de um evento já cancelado → `200` com o novo valor.
- E2E manual: `PUT /api/eventos/:id` com `status: 'cancelado'` + motivo →
  verificar campo no `GET` e o e-mail.
