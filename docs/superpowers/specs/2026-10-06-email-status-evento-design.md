# Design: E-mail de mudança de status do evento

Data: 2026-10-06
Status: Aprovado pelo usuário (design em conversa)

## Objetivo

Quando o status de um evento é alterado (ex.: rascunho → publicado, ou →
cancelado), enviar um e-mail informando a mudança ao organizador dono do
evento, reutilizando o serviço de e-mail já existente
(`config/mailer.js` + `services/emailService.js`).

Fora de escopo: notificação in-app (`Notificacao`), endpoint dedicado de
status, validação de transições permitidas, campo de motivo/cancelamento,
notificar outros destinatários (admins/participantes), fuso por evento.

## Decisões aprovadas

| Tópico         | Decisão                                                        |
| -------------- | -------------------------------------------------------------- |
| Gatilho        | Qualquer mudança de status, seja qual for o autor              |
| Destinatário   | Organizador dono do evento (`evento.organizador.email`)        |
| Transições     | Qualquer valor de status diferente do anterior                 |
| Conteúdo       | Resumo do evento + "status anterior → novo" com rótulos legíveis |
| Abordagem      | Hook direto no `updateEvento` + template novo (padrão do `createEvento`) |

## Contexto do fluxo existente

- Não há endpoint de status: a mudança ocorre via `PUT /api/eventos/:id`
  (`controllers/eventosController.js`, `updateEvento`), protegido por
  `isOrganizador` (organizador ou admin; admin edita qualquer evento).
- `updateEvento` já busca o evento antes do update (`evento.status` = status
  antigo) e o `prisma.evento.update` inclui `organizador { id, nome, email }`
  — destinatário e valor anterior disponíveis sem query extra.
- Serviço de e-mail: `sendMailSafe(to, template)` fire-and-forget, log-only em
  falha; `EMAIL_ENABLED=false` desliga tudo. Nada disso muda.

## Componentes

### `services/emailTemplates/helpers.js` (novo)

Módulo compartilhado pelos templates:

- `TIMEZONE = 'America/Cuiaba'` (hoje duplicado hardcoded em `eventoCriado.js`).
- `formatarData(data)` → `new Date(data).toLocaleString('pt-BR', { dateStyle:
  'short', timeStyle: 'short', timeZone: TIMEZONE })` ou `'Nao informado'`.
- `rotuloStatus(status)` → mapa legível: `rascunho→Rascunho`,
  `publicado→Publicado`, `cancelado→Cancelado`, `encerrado→Encerrado`;
  valor cru como fallback.
- Apenas utilitários puros (sem I/O, sem dependências).

### Refactor `services/emailTemplates/eventoCriado.js`

Passa a importar `formatarData`/`TIMEZONE` de `helpers.js`, removendo a
duplicação local. Comportamento do e-mail de criação permanece idêntico.

### `services/emailTemplates/eventoStatusAlterado.js` (novo)

Função pura `eventoStatusAlteradoTemplate({ usuario, evento, statusAnterior,
statusNovo })` → `{ subject, html, text }`.

- `subject`: `Status do evento atualizado: <titulo>`
- `html`: saudação pelo `usuario.nome`; frase "O status do evento
  **<titulo>** foi alterado de **<Anterior>** para **<Novo>**" (rótulos via
  `rotuloStatus`); resumo do evento (título, datas início/fim via
  `formatarData`, local `LocalNome` + cidade/UF ou `linkOnline` quando
  `tipoEvento !== 'presencial'`); rodapé de mensagem automática.
- `text`: versão texto puro com as mesmas informações.
- Somente template literals, sem dependências.

### Hook no `controllers/eventosController.js` (`updateEvento`)

- `statusNovo = dadosAtualizacao.status`; enviar **somente se** o corpo trouxe
  `status` e `dadosAtualizacao.status !== evento.status`.
- Após o update bem-sucedido e `cache.flushAll()`:

```js
if (dadosAtualizacao.status && dadosAtualizacao.status !== evento.status) {
   sendMailSafe(
      eventoAtualizado.organizador.email,
      eventoStatusAlteradoTemplate({
         usuario: eventoAtualizado.organizador,
         evento: eventoAtualizado,
         statusAnterior: evento.status,
         statusNovo: dadosAtualizacao.status,
      })
   )
}
```

- Import do novo template no topo do controller. Sem `await` (resposta nunca
  espera o SMTP); resposta e status codes do `PUT` não mudam.

## Config / erros

- Nenhuma variável de ambiente, dependência ou mudança no docker-compose.
- Falhas de envio: apenas log (`[email] Falha ao enviar...`), sem retry, sem
  persistência. `EMAIL_ENABLED=false` = nada é enviado.

## Verificação

- `node --check` em todos os arquivos tocados; smoke test do template com
  `node -e` (subject/text impressos, rótulos corretos).
- Smoke de regressão do template de criação (refactor de helpers).
- E2E manual: `PUT /api/eventos/:id` mudando `status` → e-mail para o
  organizador; `PUT` sem `status`, ou com o mesmo valor → **nenhum** e-mail.
