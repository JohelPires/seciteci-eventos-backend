# Design: Ambiente de Desenvolvimento com Docker Compose

**Data:** 2026-10-06
**Status:** Aprovado pelo usuário

## Objetivo

Rodar o projeto (API Node/Express + Prisma) e um banco Postgres local via
`docker compose`, com recarga automática (hot-reload) a cada alteração de
código, sem interferir no `Dockerfile` de produção nem no `.env` local.

## Decisões (aprovadas pelo usuário)

- Postgres **local novo** no compose (não o remoto do `.env`).
- **Migrate automático** (`prisma migrate deploy`) ao subir; **seed manual**
  (`docker compose exec app npm run prisma:seed`).
- Arquivos de dev separados dos de produção (arquivos novos, sem mexer no
  `Dockerfile` existente).

## Componentes

### 1. `Dockerfile.dev` (novo)

Imagem de desenvolvimento baseada em `node:20-alpine`:

- `apk add libc6-compat openssl` (compatibilidade Prisma no Alpine).
- `npm ci` com `package.json`/`package-lock.json`.
- `npx prisma generate` (gera o Prisma Client na imagem; preservado pelo
  volume anônimo em runtime).
- `CMD ["npm", "run", "dev"]` (nodemon).
- Porta exposta: 3030.

### 2. `docker-compose.yml` (novo)

Serviços:

- **db**: `postgres:16-alpine`
  - usuário/senha: `postgres`/`postgres`, banco `sistema_eventos`.
  - Porta host `5433` → container `5432` (evita conflito com Postgres local).
  - Volume nomeado `pgdata` para persistência entre `down`/`up`.
  - Healthcheck `pg_isready`.
- **app**: build de `Dockerfile.dev`
  - Bind-mount `.:/app` (código do host) + volume anônimo `/app/node_modules`
    (preserva módulos e Prisma Client do container).
  - `command: sh -c "npx prisma migrate deploy && npm run dev"`.
  - `depends_on: db (condition: service_healthy)`.
  - `environment` sobrescreve o `.env` (dotenv/Prisma não sobrepõem variáveis
    já definidas no ambiente do processo):
    - `DATABASE_URL=postgresql://postgres:postgres@db:5432/sistema_eventos?schema=public`
    - `PORT=3030`, `NODE_ENV=development`, `JWT_SECRET=dev-secret-local`.
  - Porta host `3030` → container `3030`.

### 3. `.dockerignore` (corrigido)

O arquivo atual contém apenas comentários (nada é ignorado). Isso faria
`COPY . .` copiar o `node_modules` do host por cima do instalado na imagem.
Substituir por lista real: `node_modules`, `npm-debug.log`, `.env`, `.git`,
`.gitignore`, `.vscode`, `.idea`, `dist`, `build`, `coverage`, `.DS_Store`,
`*.md`.

## Hot-reload

- nodemon observa `/app` (código vindinho do bind-mount).
- Linux: inotify nativo funciona em bind-mounts (sem polling).
- nodemon ignora `node_modules` por padrão → sem loops de reload.
- `package.json` novo exige `docker compose up --build` (rebuild da imagem).

## Fluxo de uso

- Subir: `docker compose up --build`
- API: `http://localhost:3030` · Health: `/health` · Swagger: `/api-docs`
- Seed (manual): `docker compose exec app npm run prisma:seed`
- Parar: `docker compose down` (dados mantidos)
- Resetar banco: `docker compose down -v`

## Validação

1. `docker compose up --build` → log mostra migrations aplicadas e
   `Database: ✅ Conectado`.
2. `curl localhost:3030/health` → `status: OK`.
3. Editar um arquivo no host → nodemon reinicia o servidor no container.
4. Seed popula o banco.
