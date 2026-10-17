# AGENTS.md

## Project
REST API for event registration (Seciteci). Node.js + Express + Prisma + PostgreSQL, plain JavaScript/CommonJS. Entrypoint `server.js`; every endpoint is mounted under `/api` from `routes/index.js`.

## Dev commands
- **Always pass `-f docker-compose.yml` locally.** The repo also has `compose.yml` (production, required by the `secitec-servidor` CI convention); Compose discovers `compose.yml` first, so a bare `docker compose` targets production and fails locally with missing `${IMAGEM}`/`${APP_HOST}`/`${POSTGRES_PASSWORD}` env vars.
- Full stack (preferred): `docker compose -f docker-compose.yml up --build` — API http://localhost:3030, Swagger `/api-docs`, health `/health`. Postgres on host `5433` (container `db:5432`), db/user/pass `sistema_eventos`/`postgres`/`postgres`.
- Hot reload via nodemon + bind mount. Changing `prisma/schema.prisma` needs no extra step: the compose app command runs `npx prisma generate` on every startup because the **named volume** `node_modules` (mounted at `/app/node_modules`) shadows the client generated in the image — a pre-existing volume is NEVER repopulated by `up --build` (that being the cause of the Oct/2026 outage where `PUT /eventos/:id` 500'd with `Unknown argument motivoCancelamento` until the client was regenerated). New **dependencies** are still NOT visible until that volume is refreshed: `docker compose -f docker-compose.yml down && docker volume rm seciteci-eventos-backend_node_modules && docker compose -f docker-compose.yml up --build`. (Do NOT use `docker compose down -v` for this — it also wipes `pgdata`.)
- Migrations run automatically on startup (`prisma migrate deploy`). Seed is manual only: `docker compose -f docker-compose.yml exec app npm run prisma:seed`. `prisma/seed.js` is a dispatcher: `NODE_ENV=production` runs the lean prod seed (`prisma/seeds/prod.js`: admin + categorias Ciência/Tecnologia/Inovação, idempotent via upsert), otherwise the full dev seed (`prisma/seeds/dev.js`). Admin email/password come from `ADMIN_EMAIL`/`ADMIN_PASSWORD` (required — no fallback in code; dev defaults live in `docker-compose.yml`/`.env.example`, prod ones in GitLab's `APP_ENV`). Run dev seed on a fresh DB: it duplicates eventos on a populated DB.
- Without Docker: `npm run dev`, but `.env` has `DATABASE_URL` commented out, so it fails until you set one. Inside Docker the compose env wins over `.env` (dotenv does not override existing process vars).
- Prisma: `npm run prisma:generate | prisma:migrate | prisma:studio | prisma:seed`.
- Tests: `npm test` (or `npm run test:watch`) on the host, with `docker compose -f docker-compose.yml up -d db` running. One-time: `docker compose -f docker-compose.yml exec db createdb -U postgres sistema_eventos_test` only needed when pgdata existed before (fresh volumes get it via `db/init-test-db.sql`). Tests use `.env.test` (DB `sistema_eventos_test`) and NEVER touch the dev DB. `NODE_ENV=test` disables rate limit and cache. Suites: HTTP suites (app, auth, eventos, inscricoes, permissoes) import `app.js` (supertest); sanity imports `db.js` directly.
  Adding new deps requires the named volume refresh per the second bullet above.

## Tests / lint / typecheck
No lint or typecheck exist. `teste.js` is scratch algorithm practice, not a test suite. Jest suites live in `tests/` (6 suites — sanity, app, auth, eventos, inscricoes, permissoes — 55 tests, run with `npx jest --runInBand`).

## Architecture
- `routes/index.js` — single registration point for all routes; add route here, controller in `controllers/`, validation in `middleware/validators.js`.
- `middleware/auth.js` — `authMiddleware` verifies JWT `{ id, tipo }` into `req.userId`/`req.userType`; `isOrganizador` (organizador|admin), `isAdmin`.
- `config/prisma.js` shared client; `config/swagger.js` loads spec from `./docs/*.js`.
- Roles: `participante`, `organizador`, `admin`; register accepts client-supplied `tipoUsuario`.

## Deploy (produção - VM Seciteci)
- Convenção `fic_dev/secitec-servidor` (readme do projeto 735): runner **`secitec-vps`** (shell, na VM, tag `secitec-vps`, **Protected** — só branches protegidas), template `gitlab/deploy.gitlab-ci.yml` incluído no `.gitlab-ci.yml`, URL pública `https://apps.risc.unemat.br/dev/secitec/conectese-api` (Traefik tira o prefixo antes da API).
- **Push na `main` (protegida) sobe automaticamente** (`publicar:producao` com rules override; o template deixaria manual). Rollback: re-run da pipeline de um commit anterior.
- Segredos: variável **`APP_ENV`** (tipo **File**, escopo `producao`) no GitLab — conteúdo é o `.env` do ambiente (DATABASE_URL do Postgres próprio, JWT_SECRET, SMTP…). Nada secreto no repo. Seed de produção (`seed:producao`, job manual) também lê `ADMIN_EMAIL`/`ADMIN_PASSWORD` daí.
- Banco: Postgres **próprio** declarado no `compose.yml` (banco `sistema_eventos` criado pelo compose, senha via `APP_ENV`); **sem backup automático** (follow-up pendente). Migrations rodam no boot do container (`Dockerfile` CMD).
- Rollback da migração `financiador como tabela`: ver `docs/rollback-financiadores-como-tabela.md` (SQL reverso manual; re-run da pipeline de commit anterior só volta a imagem, não o schema).
- Na VM, só existem `/opt/apps/conectese-api/prod/{compose.yml,.env}` — o código nunca vai para lá; a imagem é buildada no runner. Logs: `docker compose logs` via admin/RISC (sem acesso SSH do dev).
- Swagger is hand-written in `docs/swagger.routes.js`, not generated. Update it manually when endpoints change.
- `docs/swagger.routes.js` documents `/api/eventos/destaque` and `/api/eventos/por-cidade`, but neither is in `routes/index.js`; `getEventosDestaque`/`getEventosPorCidade` in `eventosController.js` are unused. Trust `routes/index.js` over the docs.
- `eventosController` caches list/detail 24h via `node-cache` (keyed by query, flushes all on write; responses carry a `cache` flag). Stale reads possible after direct DB writes.
- Prisma fields are camelCase mapped to snake_case via `@map`/`@@map`. `Evento` keeps denormalized `Local*` columns alongside legacy `local`/`Local` relations.
- Rate limit: 100 req / 3 min per IP on `/api` (`app.js`). Times stored as `@db.Time` via `new Date('1970-01-01T...')`.

## Gotchas

## Repo conventions
- Git primary remote is GitLab (`gitlab.risc.unemat.br/...`); `origin` also pushes to GitHub. Default branch `main`. No CI config.
- `docs/superpowers/plans|specs/` holds agent plans/specs; `.gitlab/issues_templates/` has issue templates. `.dockerignore` excludes `*.md`, `docker-compose.yml`, tests/infra (`tests/`, `jest.config.js`, `db/`, `.env.test{,.example}`, `.superpowers`, `.gitlab`); the prod `Dockerfile` copies the whole builder `/app` into the runner, so a runtime file excluded by `.dockerignore` breaks the image — `tests/deploy.test.js` guards this (runtime `require` graph vs `.dockerignore` + full-copy runner strategy).
