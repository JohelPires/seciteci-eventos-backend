# Design: Recuperação de senha ("Esqueci minha senha")

Data: 2026-10-09
Status: Aprovado pelo usuário (design em conversa)

## Objetivo

Permitir que um usuário que esqueceu a senha a redefina sozinho, por e-mail,
sem contato com suporte. O usuário informa o e-mail, recebe um **código de 6
dígitos** e, com ele, define uma nova senha.

Fluxo em **2 endpoints públicos**:

1. `POST /api/auth/esqueci-senha` — solicita o código.
2. `POST /api/auth/redefinir-senha` — valida o código e troca a senha.

Após a troca, todos os JWTs emitidos antes são invalidados.

## Fora de escopo

- "Manter conectado" / lembrar sessão (é outro fluxo).
- Cooldown de reenvio por e-mail (usamos o rate-limit global de 100 req/3min).
- Histórico/auditoria de solicitações de reset.
- Link com token (optou-se por código de 6 dígitos).
- Reset via SMS/telefone.

## Decisões aprovadas

| Tópico                      | Decisão                                                        |
| --------------------------- | ------------------------------------------------------------- |
| Entrega                     | Código numérico de 6 dígitos por e-mail                        |
| Endpoints                   | 2 (solicitar e redefinir); sem etapa intermediária             |
| Armazenamento               | Colunas em `Usuario` (sem tabela nova)                         |
| Validade do código          | 15 minutos                                                      |
| Tentativas                  | Máximo 5; ao exceder, o código é invalidado                     |
| Anti-enumeração             | Resposta genérica `200` sempre, exista ou não o e-mail         |
| Código com e-mail desligado | Apenas log no console (nunca no corpo da resposta)             |
| Invalidação de JWT          | `tokenVersion` (int) em `Usuario` + checagem no middleware     |
| Troca de senha autenticada  | Também incrementa `tokenVersion` e retorna novo `token`         |

## Arquitetura

`POST /api/auth/esqueci-senha` gera o código, persiste apenas o **hash**
(bcrypt) e a expiração em `Usuario`, e dispara o e-mail de forma
não-bloqueante (fire-and-forget, via `sendMailSafe`). Responde `200` genérico
independentemente de o e-mail existir.

`POST /api/auth/redefinir-senha` localiza o usuário, compara o código com o
hash armazenado (respeitando expiração e limite de tentativas) e, em caso de
sucesso, grava a nova senha, limpa os campos de reset e incrementa
`tokenVersion` — invalidando os JWTs antigos.

O `authMiddleware` passa a ser `async`: após verificar a assinatura do JWT,
consulta o `tokenVersion` atual do usuário e rejeita o token se o valor do
payload (`v`) divergir. Isso adiciona **uma consulta por rota autenticada**.

## Componentes

### Schema `Usuario` (Prisma)

Campos novos (mapeados para snake_case, seguindo o padrão do projeto):

```prisma
resetCodigo     String?   @map("reset_codigo") @db.VarChar(255)
resetExpira     DateTime? @map("reset_expira") @db.Timestamp(6)
resetTentativas Int       @default(0) @map("reset_tentativas")
tokenVersion    Int       @default(0) @map("token_version")
```

Migration única: `prisma migrate dev --name add-password-reset`.

- `resetCodigo` guarda o hash bcrypt do código (nunca o código em claro).
- `resetExpira` é o instante limite (agora + 15 min).
- `resetTentativas` conta tentativas erradas desde a última solicitação.
- `tokenVersion` é o contador de invalidação de sessões.

### `services/emailTemplates/resetSenha.js`

Função pura `resetSenhaTemplate({ usuario, codigo })` → `{ subject, html, text }`,
no mesmo estilo de `eventoCriado.js` (template literals, sem dependências).

- `subject`: `Redefinição de senha - CONECTE-SE`
- `html`/`text`: saudação por `usuario.nome`, código em destaque, validade de
  15 minutos e aviso para ignorar caso não tenha solicitado.

### `middleware/validators.js`

- `esqueciSenhaValidator`: `body("email").isEmail()`.
- `redefinirSenhaValidator`:
  - `body("email").isEmail()`
  - `body("codigo").trim().isLength({ min: 6, max: 6 }).isNumeric()`
  - `body("novaSenha").isLength({ min: 6 })`

### `controllers/authController.js`

Novas funções exportadas: `esqueciSenha`, `redefinirSenha`. `login` e
`alterarSenha` são ajustados para emitir/incrementar `tokenVersion`.

### `middleware/auth.js`

`authMiddleware` passa a ser `async`; consulta `tokenVersion` via Prisma e
retorna `401 "Token inválido ou expirado"` em divergência. `isOrganizador` e
`isAdmin` permanecem síncronos.

### Rotas (`routes/index.js`)

```js
router.post('/auth/esqueci-senha', esqueciSenhaValidator, authController.esqueciSenha)
router.post('/auth/redefinir-senha', redefinirSenhaValidator, authController.redefinirSenha)
```

Ambas públicas, junto de `login`/`register`. O rate-limit global de `/api`
(100/3min por IP) já cobre abuso.

### Swagger (`docs/swagger.routes.js`)

Documentar os dois endpoints (públicos, corpo e respostas 200/400) manualmente,
como os demais.

## Fluxos

### `POST /api/auth/esqueci-senha`

Request: `{ "email": "usuario@exemplo.com" }`

1. Valida o e-mail (senão `400` com `errors`).
2. Busca usuário por `email` com `ativo: true`.
3. Se existir:
   - Gera código: `crypto.randomInt(0, 1000000).toString().padStart(6, '0')`.
   - Persiste `resetCodigo = bcrypt.hash(codigo, 10)`,
     `resetExpira = now + 15min`, `resetTentativas = 0`.
   - Se `isEmailEnabled()`: `sendMailSafe(email, resetSenhaTemplate({ usuario, codigo }))`.
   - Senão: `console.log` do código (apenas no servidor).
4. Responde **sempre** `200 { message: "Se o e-mail existir, enviaremos um código" }`.

Não existir o e-mail, ou estar inativo, cai no mesmo passo 4 (sem gerar nada).

### `POST /api/auth/redefinir-senha`

Request: `{ "email", "codigo", "novaSenha" }`

1. Valida o corpo (senão `400` com `errors`).
2. Busca usuário por `email` (sem filtrar `ativo`).
3. Rejeita com `400 "Código inválido ou expirado"` se:
   - usuário inexistente; ou
   - `resetCodigo`/`resetExpira` ausentes; ou
   - `resetExpira < now`; ou
   - `resetTentativas >= 5`.
4. `bcrypt.compare(codigo, resetCodigo)`:
   - Errado → `resetTentativas += 1`; se chegar a 5, limpa
     `resetCodigo`/`resetExpira`; responde `400 "Código inválido ou expirado"`.
   - Correto → grava `senha = bcrypt.hash(novaSenha, 10)`, limpa
     `resetCodigo`/`resetExpira`/`resetTentativas` (`resetTentativas = 0`) e
     incrementa `tokenVersion`; responde `200 { message: "Senha redefinida com sucesso" }`.

### `login`

Assina `{ id, tipo, v: user.tokenVersion }` (expiração 7d inalterada).

### `PATCH /api/auth/senha` (troca autenticada)

Após gravar a nova senha, incrementa `tokenVersion` e **retorna um `token`
novo** na resposta (campo adicional, retrocompatível), para não deslogar quem
acabou de trocar. O middleware já haveria invalidado o token da requisição.

## Tratamento de erros

- Envio de e-mail é fire-and-forget (`sendMailSafe`): falha não altera a
  resposta HTTP nem o estado do banco; é apenas logada.
- Erros inesperados usam o padrão existente: `500 { error: "..." }` e
  `console.error`.
- Mensagens idênticas para "e-mail inexistente" e "código errado" evitam
  vazamento de informação.

## Segurança

- Código nunca é persistido em claro (bcrypt) nem retornado no corpo da resposta.
- Expiração de 15 min e limite de 5 tentativas (invalida o código ao exceder).
- Resposta genérica anti-enumeração em `/esqueci-senha`.
- `tokenVersion` invalida sessões antigas no reset e na troca de senha.
- Rate-limit global existente limita abuso do endpoint de solicitação.

## Testes

Novo suite `tests/password-reset.test.js` (`supertest` + Prisma), mockando
`services/emailService` (`sendMailSafe`) para capturar o código gerado.

Casos previstos:

- `/esqueci-senha` retorna `200` genérico para e-mail existente e inexistente.
- Código persistido vem hasheado; `resetExpira` ~15 min à frente.
- Fluxo feliz: código correto → `200`, senha nova funciona no login.
- Código errado → `400` e incrementa `resetTentativas`.
- 5 tentativas erradas → código invalidado (nova tentativa com código certo falha).
- Código expirado → `400`.
- Nova senha curta / código fora do formato → `400` (validator).
- Reset incrementa `tokenVersion`: token antigo → `401` e novo login funciona.
- `PATCH /api/auth/senha` retorna `token` novo utilizável.

Ajustes em `tests/factories.js`: `tokenFor` inclui `v: user.tokenVersion ?? 0`.

## Verificação

1. `docker compose up --build` após a migration (Prisma Client regenerado).
2. `npm test` no host com `docker compose up -d db`.
3. Teste manual: `EMAIL_ENABLED=false` → código no log; `EMAIL_ENABLED=true` →
   e-mail com o código.
