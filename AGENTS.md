# AGENTS.md

## Project
REST API for event registration (Seciteci). Node.js + Express + Prisma + PostgreSQL, plain JavaScript/CommonJS. Entrypoint `server.js`; every endpoint is mounted under `/api` from `routes/index.js`.

## Dev commands
- Full stack (preferred): `docker compose up --build` — API http://localhost:3030, Swagger `/api-docs`, health `/health`. Postgres on host `5433` (container `db:5432`), db/user/pass `sistema_eventos`/`postgres`/`postgres`.
- Hot reload via nodemon + bind mount. After changing `package.json` or `prisma/schema.prisma`, rerun `docker compose up --build` (Prisma Client is generated in the image). Dependencies live in the **named volume** `node_modules` (mounted at `/app/node_modules`); a new dep is NOT visible until that volume is refreshed: `docker compose down && docker volume rm seciteci-eventos-backend_node_modules && docker compose up --build`. (Do NOT use `docker compose down -v` for this — it also wipes `pgdata`.)
- Migrations run automatically on startup (`prisma migrate deploy`). Seed is manual only: `docker compose exec app npm run prisma:seed`.
- Without Docker: `npm run dev`, but `.env` has `DATABASE_URL` commented out, so it fails until you set one. Inside Docker the compose env wins over `.env` (dotenv does not override existing process vars).
- Prisma: `npm run prisma:generate | prisma:migrate | prisma:studio | prisma:seed`.
- Tests: `npm test` (or `npm run test:watch`) on the host, with `docker compose up -d db` running. One-time: `docker compose exec db createdb -U postgres sistema_eventos_test` only needed when pgdata existed before (fresh volumes get it via `db/init-test-db.sql`). Tests use `.env.test` (DB `sistema_eventos_test`) and NEVER touch the dev DB. `NODE_ENV=test` disables rate limit and cache. Suites: HTTP suites (app, auth, eventos, inscricoes, permissoes) import `app.js` (supertest); sanity imports `db.js` directly.
  Adding new deps requires the named volume refresh per the second bullet above.

## Tests / lint / typecheck
No lint or typecheck exist. `teste.js` is scratch algorithm practice, not a test suite. Jest suites live in `tests/` (6 suites — sanity, app, auth, eventos, inscricoes, permissoes — 55 tests, run with `npx jest --runInBand`).

## Architecture
- `routes/index.js` — single registration point for all routes; add route here, controller in `controllers/`, validation in `middleware/validators.js`.
- `middleware/auth.js` — `authMiddleware` verifies JWT `{ id, tipo }` into `req.userId`/`req.userType`; `isOrganizador` (organizador|admin), `isAdmin`.
- `config/prisma.js` shared client; `config/swagger.js` loads spec from `./docs/*.js`.
- Roles: `participante`, `organizador`, `admin`; register accepts client-supplied `tipoUsuario`.

## Gotchas
- Swagger is hand-written in `docs/swagger.routes.js`, not generated. Update it manually when endpoints change.
- `docs/swagger.routes.js` documents `/api/eventos/destaque` and `/api/eventos/por-cidade`, but neither is in `routes/index.js`; `getEventosDestaque`/`getEventosPorCidade` in `eventosController.js` are unused. Trust `routes/index.js` over the docs.
- `eventosController` caches list/detail 24h via `node-cache` (keyed by query, flushes all on write; responses carry a `cache` flag). Stale reads possible after direct DB writes.
- Prisma fields are camelCase mapped to snake_case via `@map`/`@@map`. `Evento` keeps denormalized `Local*` columns alongside legacy `local`/`Local` relations.
- Rate limit: 100 req / 3 min per IP on `/api` (`app.js`). Times stored as `@db.Time` via `new Date('1970-01-01T...')`.

## Repo conventions
- Git primary remote is GitLab (`gitlab.risc.unemat.br/...`); `origin` also pushes to GitHub. Default branch `main`. No CI config.
- `docs/superpowers/plans|specs/` holds agent plans/specs; `.gitlab/issues_templates/` has issue templates. `.dockerignore` excludes `*.md`, `docker-compose.yml`, tests/infra (`tests/`, `jest.config.js`, `db/`, `.env.test{,.example}`, `.superpowers`, `.gitlab`); the prod `Dockerfile` copies the whole builder `/app` into the runner, so a runtime file excluded by `.dockerignore` breaks the image — `tests/deploy.test.js` guards this (runtime `require` graph vs `.dockerignore` + full-copy runner strategy).
