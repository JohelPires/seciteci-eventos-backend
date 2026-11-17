# Design: Migração da autenticação para o Clerk

**Data:** 2026-11-17
**Status:** aprovado (design)
**Escopo:** apenas backend (`gestao-eventos-api`). O frontend (`gestao-eventos-web`) migra para o Clerk em tarefa separada.
**Padrão de referência:** `fic_dev/padroes-servicos/clerk.md` (e implementação de exemplo em `portal-da-inovacao/portal-inovacao-api`).

## Problema

A API hoje é a fonte de identidade: cadastro/senha (bcrypt), login com Google (ID token), JWT próprio (`{ id, tipo, v }` com `tokenVersion`), reset de senha por código de e-mail. O padrão Seciteci manda o login para o Clerk: **o Clerk diz quem a pessoa é; o nosso banco diz o que ela pode** (nível de acesso e status ficam na tabela da API, nunca nos metadados do Clerk).

## Decisões (aprovadas com o usuário)

1. **Clerk para todos**, com **sign-up público para participante** e admin/organizador provisionados na tabela. Divergência consciente do "Invite-only" do clerk.md: como participantes públicos precisam se cadastrar, o controle de papel é 100% na nossa tabela (sign-up nunca cria `organizador`/`admin`).
2. **Evoluir `usuarios`**: nova coluna `clerk_user_id` (única, nullable). `tipoUsuario` + `ativo` continuam sendo a autorização. NÃO criar tabela `contas` separada (refararia todas as relações).
3. **Colunas de login antigo** (`senha`, `googleId`, `reset_codigo`, `reset_expira`, `reset_tentativas`, `tokenVersion`) ficam por uma release, nullable e sem escrita, para permitir rollback de imagem. Remoção definitiva é follow-up.
4. **SDK `@clerk/backend`** (verificação local do token com PEM, webhook via `verifyWebhook`/svix, `getUser` para o fallback). Não `jose` manual, não troca por JWT próprio.
5. **Remover** os endpoints `POST /auth/register`, `/auth/login`, `/auth/google`, `/auth/esqueci-senha`, `/auth/redefinir-senha`, `PATCH /auth/senha`. Manter `GET /auth/profile` e criar `PATCH /auth/profile`.
6. **Webhook + fallback no 1º request**: o caminho normal de ligação é o webhook; se o token for válido mas não houver conta ligada, o middleware consulta o e-mail no Clerk e liga à conta existente (por e-mail) ou cria `participante`. Cobre webhook atrasado/falho no sign-up público.
7. Dependências: **adicionar `@clerk/backend`**, remover `bcryptjs`, `jsonwebtoken`, `google-auth-library` (refresh do volume `node_modules` obrigatório, regra do AGENTS.md).

## Arquitetura

```
Clerk (identidade/sessão)
  └─ frontend envia Authorization: Bearer <session token>
       └─ authMiddleware
            ├─ verifyToken (CLERK_JWT_KEY local + CLERK_AUTHORIZED_PARTIES)
            ├─ busca usuarios por clerk_user_id
            ├─ fallback: getUser(sub) → liga por e-mail ou cria participante
            └─ exige ativo=true → req.userId / req.userType
  Clerk webhook ──POST /api/webhooks/clerk──> user.created/updated/deleted
                                              └─ liga/cria/desativa conta
```

O papel vem **sempre do banco a cada request** (não do token): promover/rebaixar tem efeito imediato, sem re-login.

## API

| Rota | Estado |
| --- | --- |
| `GET /api/auth/profile` | mantida, agora autenticada pelo Clerk |
| `PATCH /api/auth/profile` | nova: `nome`, `telefone`, `cpf`, `dataNascimento`, `fotoPerfil`; nunca e-mail/tipo/ativo; CPF duplicado → 400 |
| `POST /api/webhooks/clerk` | nova: pública com assinatura (svix), idempotente por `svix-id` |
| `register`/`login`/`google`/`esqueci-senha`/`redefinir-senha`/`senha` | removidas |

Mensagens preservadas onde há contrato: `401 "Token não fornecido"` (sem Bearer), `401 "Token inválido ou expirado"` (token inválido). Mudança deliberada: conta existente porém `ativo=false` (ou sem conta após fallback) → **403** `"Esta conta não tem acesso"` (identidade válida ≠ autorização), alinhado ao portal.

### authMiddleware (ordem das decisões)

1. Sem Bearer → 401. Token inválido (`verifyToken` falha) → 401.
2. Busca conta por `clerkUserId`; não achou → fallback:
   - e-mail do claim (se presente) ou `clerkClient.users.getUser(sub)`;
   - conta existente sem vínculo → liga (`clerkUserId`) e segue;
   - e-mail já ligado a outro `clerkUserId` → 403;
   - nenhuma conta → cria `participante` (nome/foto do Clerk, e-mail) e segue;
   - falha ao obter e-mail (usuário removido no Clerk) → 401.
3. `ativo=false` → 403.
4. `req.userId`/`req.userType` setados; `isOrganizador`/`isAdmin` inalterados.

`ultimoAcesso` passa a ser atualizado no vínculo/criação e no `GET /auth/profile` (não a cada request).

### Webhook

- Assinatura inválida → 401. Evento duplicado (`webhook_eventos`) → 200 `{ processado: false, motivo: 'duplicado' }`.
- `user.created`/`user.updated`: liga conta por `clerk_user_id` ou por e-mail (minúsculo) com `clerk_user_id IS NULL`; se não existir, cria `participante`. Não sobrescreve `nome`/`fotoPerfil` já preenchidos. E-mail já ligado a outro usuário → ignora (200).
- `user.deleted`: `ativo=false` + `clerk_user_id=NULL` (conta não se recadastra sozinha: novo sign-up com o mesmo e-mail encontra a linha desativada e não reativa).
- Eventos desconhecidos → 200 ignorado. Marca o evento só DEPOIS de aplicar (reenvio do Clerk reprocessa com segurança; efeitos idempotentes).

## Schema e migração

- `Usuario.clerkUserId String? @unique @map("clerk_user_id") @db.VarChar(255)`.
- Novo `WebhookEvento`: `id String @id` (svix-id), `tipo String`, `recebidoEm DateTime @default(now()) @map("recebido_em")` → `@@map("webhook_eventos")`.
- Migration aditiva (não destrutiva; rollback de imagem continua funcionando).

## Código

- `services/clerkAuth.js` (novo, adapter único): `verifySessionToken(token) -> { userId, email? } | null`, `getPrimaryEmail(userId)`, `verifyWebhook(request) -> evento normalizado`. Isola o SDK; testes fazem `jest.mock`. Nunca loga token/segredo.
- `middleware/auth.js`: reescrito conforme acima.
- `controllers/clerkWebhookController.js` (novo) + `controllers/authController.js` reescrito para perfil.
- `app.js`: captura `req.rawBody` via `express.json({ verify })` para o webhook; rota do webhook registrada antes do rate limit (exempta do limiter).
- `middleware/validators.js`: remove validators de login/register/reset; cria `atualizarProfileValidator`.
- `usuariosController.desativarUsuario`: deixa de incrementar `tokenVersion` (`ativo=false` já barra no middleware).
- Removidos: `services/googleAuth.js`, `services/emailTemplates/resetSenha.js`.

## Configuração

- `config/env.js` (novo, chamado no `server.js`): exige `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET`, `CLERK_AUTHORIZED_PARTIES`; `CLERK_JWT_KEY` opcional (vazio → SDK busca JWKS pela rede). Em produção: `sk_live_` e origens `https://`.
- Remover dos exemplos/compose/docs: `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `ADMIN_PASSWORD`.
- `docker-compose.yml` (dev): placeholders `CLERK_*` via `${VAR:-}`; `.env.test(.example)` com valores falsos (testes usam mock, sem rede).
- Deploy (`APP_ENV`): as 4 variáveis Clerk; webhook no dashboard apontando para `https://<api>/api/webhooks/clerk` com `user.created`, `user.updated`, `user.deleted`; `CLERK_AUTHORIZED_PARTIES` = origem do painel.

## Seed

- `prod.js`/`dev.js` sem bcrypt/senha: admin/organizadores/participantes criados por e-mail (admin com `tipoUsuario: 'admin'`). Para entrar, a pessoa faz sign-up/convite no Clerk com o **mesmo e-mail**; webhook (ou fallback) liga. Idempotente por e-mail; `ADMIN_PASSWORD` deixa de existir.

## Testes

- `setupEnv.js`: variáveis Clerk falsas; remover expectativa de `JWT_SECRET` (`sanity.test.js` junto).
- `factories.js`: `createUser` sem bcrypt, com `clerkUserId` gerado; `tokenFor(user)` vira token opaco reconhecido pelo mock (`test:<clerkUserId>`), preservando as chamadas existentes nos suites.
- Mock de `services/clerkAuth`: token válido/inválido, e-mail, webhook.
- Reescrita: `auth.test.js` (perfil GET/PATCH), `permissoes.test.js` (401/403/fallback/conta ligada); remover `google-auth.test.js` e `password-reset.test.js`.
- Novo `clerk-webhook.test.js`: assinatura inválida, created/updated ligando por e-mail, criação de participante, deleted desativando, duplicado idempotente.
- `eventos`/`inscricoes`/`app`/`swagger`/`deploy`: ajustes pontuais.

## Não-mudanças deliberadas

- `isOrganizador` em `POST /eventos` continua comentado (achado pré-existente; follow-up separado).
- Gestão de convites pela API não entra nesta entrega (convites no dashboard do Clerk, como o clerk.md manda).
- Nada de migração de dados de login (senhas/googleIds antigos ficam inertes nas colunas).

## Riscos e rollback

- Migration aditiva + colunas antigas preservadas → voltar a imagem anterior funciona; reverter dados = `UPDATE usuarios SET clerk_user_id = NULL`.
- Segurança: `authorizedParties` obrigatório; webhook só com assinatura; sign-up público sempre cria `participante`; e-mail do Clerk (verificado por ele) é a âncora de vínculo.
- Dependência nova exige refresh do volume `node_modules` (passo documentado no AGENTS.md).
