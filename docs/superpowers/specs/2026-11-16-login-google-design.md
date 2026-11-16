# Design: Login via Google (ID token do frontend)

**Data:** 2026-11-16
**Status:** aprovado (design)
**Escopo:** apenas backend. O frontend usa Google Sign-In/One Tap, obtém um ID token e envia ao backend, que o valida e devolve o JWT próprio da API. Sem redirect OAuth server-side, sem Passport.

## Decisões (fornecidas pelo usuário)

- **Fluxo:** ID token do frontend (`POST /api/auth/google`). O backend valida o token com `google-auth-library` (biblioteca oficial) usando `GOOGLE_CLIENT_ID` como audience — não há `GOOGLE_CLIENT_SECRET` no servidor.
- **Vínculo de conta:** se o e-mail do Google já pertence a uma conta local, vincula automaticamente (grava `googleId`) e emite JWT. Seguro porque o endpoint exige `email_verified=true`.
- **Senha nullable:** contas criadas via Google ficam com `senha = NULL` (migração `DROP NOT NULL`). Modelagem correta; sem sentinelas.
- **Validação do payload:** exige `sub`, `email` e `email_verified === true`.

## API

`POST /api/auth/google` — rota pública (não requer `authMiddleware`).

Request: `{ "idToken": "<JWT do Google>" }` (validado por `googleLoginValidator`).

Fluxo:

1. Verifica o token (`verifyIdToken` com audience `GOOGLE_CLIENT_ID`); falha → `401 { error: 'Token do Google inválido' }`.
2. Exige `sub`, `email`, `email_verified === true`; caso contrário → `401 { error: 'Token do Google inválido' }`.
3. Busca por `googleId = payload.sub`:
   - achou e `ativo=false` → `401 { error: 'Credenciais inválidas' }` (consistente com `login`);
   - achou → atualiza `ultimoAcesso` e emite JWT.
4. Senão, busca por `email`:
   - achou e `ativo=false` → `401 { error: 'Credenciais inválidas' }`;
   - achou com `googleId` já setado e diferente do `sub` → `409 { error: 'Conta já vinculada a outro usuário Google' }`;
   - achou → vincula `googleId` (preenche `fotoPerfil` se nula), atualiza `ultimoAcesso` e emite JWT.
5. Senão, cria usuário: `nome` (claim `name`, ou prefixo do e-mail), `email`, `senha: null`, `googleId: sub`, `fotoPerfil` (claim `picture`, só se couber em VarChar(255); senão `null`), `tipoUsuario: "participante"`, `ultimoAcesso`.
6. Resposta `200 { token, user: { id, nome, email, tipoUsuario } }` — mesma forma do `login`. JWT `{ id, tipo, v }`, expira em 7 dias.

Erros:

| Situação | Resposta |
| --- | --- |
| `idToken` ausente/inválido (formato) | `400 { error: 'idToken é obrigatório' }` |
| Token do Google inválido/expirado/audience errada | `401 { error: 'Token do Google inválido' }` |
| E-mail não verificado no payload | `401 { error: 'Token do Google inválido' }` |
| Conta desativada (`ativo=false`) | `401 { error: 'Credenciais inválidas' }` |
| E-mail já vinculado a outro `googleId` | `409 { error: 'Conta já vinculada a outro usuário Google' }` |
| Erro inesperado | `500 { error: 'Erro ao fazer login com Google' }` |

## Schema e migração

- `Usuario.senha String?` (drop NOT NULL).
- Novo campo `googleId String? @unique @map("google_id") @db.VarChar(255)`.
- Migration SQL gerado por `prisma migrate dev`:
  - `ALTER TABLE "usuarios" ALTER COLUMN "senha" DROP NOT NULL;`
  - `ALTER TABLE "usuarios" ADD COLUMN "google_id" VARCHAR(255);`
  - `CREATE UNIQUE INDEX "usuarios_google_id_key" ON "usuarios"("google_id");`
- `fotoPerfil` continua `VarChar(255)`: grava `picture` apenas se couber; senão `null` (evita erro/queda silenciosa do Postgres). Follow-up opcional: migrar a coluna para `Text` se necessário.

## Código

- `services/googleAuth.js` (novo): `verifyGoogleIdToken(idToken)` encapsula `OAuth2Client.verifyIdToken({ idToken, audience })` e devolve o `payload`. Isola a lib e permite `jest.mock` nos testes. Audience aceita lista separada por vírgula em `GOOGLE_CLIENT_ID` (múltiplos clientes).
- `middleware/validators.js`: `googleLoginValidator` (string não vazia).
- `controllers/authController.js`: `googleLogin` seguindo o padrão dos demais handlers (try/catch, `console.error`, `select` sem dados sensíveis).
- `routes/index.js`: `router.post('/auth/google', googleLoginValidator, authController.googleLogin)` no bloco de rotas públicas.
- `login` (existente): antes do `bcrypt.compare`, se `!user.senha` → `401 { error: 'Credenciais inválidas' }` (evita TypeError com null).
- `alterarSenha` (existente): se `!user.senha` → `400 { error: 'Conta sem senha definida. Use a redefinição de senha ou o login Google.' }`.
- `esqueciSenha`/`redefinirSenha` inalterados: permitem definir senha local em conta Google via código de e-mail (comportamento desejado).
- `docs/swagger.routes.js`: documentar `POST /api/auth/google` (tag Autenticação, 200/400/401/409/500).

## Configuração e deploy

- `.env.example`: `GOOGLE_CLIENT_ID=` (com comentário sobre lista por vírgula).
- `docker-compose.yml` (dev): passthrough `GOOGLE_CLIENT_ID: "${GOOGLE_CLIENT_ID:-}"`.
- `compose.yml` (prod): nada a mudar (`env_file: .env`); `GOOGLE_CLIENT_ID` entra no `APP_ENV` (File) dos escopos RISC e `conectese-api-prod`.
- Migração roda no boot do container (`prisma migrate deploy`), como as demais.
- **Nova dependência** (`google-auth-library`): localmente exige o refresh do volume nomeado `node_modules` (regra do AGENTS.md: `docker compose -f docker-compose.yml down && docker volume rm seciteci-eventos-backend_node_modules && docker compose -f docker-compose.yml up --build`).

## Testes

Novo `tests/google-auth.test.js` com `jest.mock('../services/googleAuth')` (nunca chamar o Google real). Cobertura:

1. `400` sem `idToken`
2. `401` token do Google inválido (verify falha)
3. `401` e-mail não verificado no payload
4. cria usuário novo → `200`, `senha = null`, `googleId` gravado, `tipoUsuario: 'participante'`, JWT decodifica `{ id, tipo: 'participante' }`
5. vincula conta local existente pelo e-mail (gravou `googleId`, mantém senha, `200` + token)
6. segundo login pelo mesmo Google → usa `googleId`, sem criar duplicata
7. `401` para conta desativada
8. `409` quando `googleId` já vinculado a outro `sub`
9. login por senha em conta Google (`senha = null`) → `401`
10. resposta não vaza `senha`

## Não-mudanças deliberadas

- `register` inalterado (não passa a aceitar cadastro sem senha fora do fluxo Google).
- `authMiddleware` inalterado (o JWT emitido é idêntico ao do login local).
- Sem endpoint de desvinculação Google nesta entrega (follow-up possível).
- Sem seed.
