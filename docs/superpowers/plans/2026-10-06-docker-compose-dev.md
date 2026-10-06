# Docker Compose Dev Environment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rodar a API (Node/Express + Prisma) e um Postgres local via `docker compose`, com hot-reload a cada alteração de código.

**Architecture:** Dois serviços no compose: `db` (postgres:16-alpine com volume nomeado e healthcheck) e `app` (build de um `Dockerfile.dev` novo, com bind-mount do código e nodemon). O `app` aplica `prisma migrate deploy` antes de subir o nodemon; o seed fica manual. O `Dockerfile` de produção e o `.env` local não são alterados (apenas o `.dockerignore` quebrado é corrigido).

**Tech Stack:** Docker Compose v2, Node 20 Alpine, Postgres 16, Prisma, nodemon.

**Spec:** `docs/superpowers/specs/2026-10-06-docker-compose-dev-design.md`

## Global Constraints

- Não alterar o `Dockerfile` de produção nem `server.js`.
- Não alterar o `.env` local (o compose define as env vars do container; dotenv/Prisma não sobrepõem variáveis já existentes no processo).
- Porta da API: `3030`. Porta exposta do Postgres no host: `5433` (container usa `5432`).
- Credenciais do Postgres local: `postgres/postgres`, banco `sistema_eventos`.
- Seed nunca roda automaticamente no startup.

---

### Task 1: Corrigir `.dockerignore`

**Files:**
- Modify: `.dockerignore` (arquivo inteiro, conteúdo atual é só comentário)

**Interfaces:**
- Produces: contexto de build sem `node_modules`/`.env` — exigido pelas Tasks 2 e 3 (`COPY . .` não deve sobrescrever o `node_modules` instalado).

- [ ] **Step 1: Substituir o conteúdo do `.dockerignore`**

O arquivo atual tem 15 linhas, todas começando com `#` (comentário). Substituir tudo por:

```
node_modules
npm-debug.log
.env
.git
.gitignore
.vscode
.idea
dist
build
coverage
.DS_Store
*.md
docker-compose.yml
```

- [ ] **Step 2: Commit**

```bash
git add .dockerignore
git commit -m "chore: corrige .dockerignore para builds dev/prod"
```

---

### Task 2: Criar `Dockerfile.dev`

**Files:**
- Create: `Dockerfile.dev`

**Interfaces:**
- Consumes: `.dockerignore` corrigido (Task 1).
- Produces: imagem de dev com `npm run dev` (nodemon) como CMD, usado pela Task 3.

- [ ] **Step 1: Criar o arquivo `Dockerfile.dev`**

```dockerfile
FROM node:20-alpine

RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY . .

EXPOSE 3030

CMD ["npm", "run", "dev"]
```

- [ ] **Step 2: Validar build da imagem**

Run: `docker build -f Dockerfile.dev -t eventos-dev .`
Expected: build termina com sucesso (pode demorar no primeiro `npm ci`).

- [ ] **Step 3: Commit**

```bash
git add Dockerfile.dev
git commit -m "feat: Dockerfile.dev com nodemon e prisma generate"
```

---

### Task 3: Criar `docker-compose.yml`

**Files:**
- Create: `docker-compose.yml`

**Interfaces:**
- Consumes: `Dockerfile.dev` (Task 2).
- Produces: ambiente completo `db` + `app` validado nas Tasks 4–5.

- [ ] **Step 1: Criar o arquivo `docker-compose.yml`**

```yaml
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: sistema_eventos
    ports:
      - "5433:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d sistema_eventos"]
      interval: 5s
      timeout: 5s
      retries: 10

  app:
    build:
      context: .
      dockerfile: Dockerfile.dev
    command: sh -c "npx prisma migrate deploy && npm run dev"
    environment:
      DATABASE_URL: "postgresql://postgres:postgres@db:5432/sistema_eventos?schema=public"
      PORT: "3030"
      NODE_ENV: development
      JWT_SECRET: "dev-secret-local"
    ports:
      - "3030:3030"
    volumes:
      - .:/app
      - /app/node_modules
    depends_on:
      db:
        condition: service_healthy

volumes:
  pgdata:
```

- [ ] **Step 2: Validar sintaxe**

Run: `docker compose config --quiet`
Expected: sem saída (sintaxe válida).

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: compose de dev com postgres local e hot-reload"
```

---

### Task 4: Validar ambiente completo

**Files:**
- Nenhum (validação apenas)

**Interfaces:**
- Consumes: Tasks 1–3.

- [ ] **Step 1: Subir o ambiente**

Run: `docker compose up --build -d`
Expected: containers `db` e `app` sobem; log do `app` mostra `prisma migrate deploy` aplicando as migrations `20251002203505_init` e `20251110201807_atributos_de_local_em_eventos`, seguido do banner do servidor com `Database: ✅ Conectado`.

- [ ] **Step 2: Testar health check**

Run: `curl -s localhost:3030/health`
Expected: JSON com `"status":"OK"` e `"database":"Conectado"`.

- [ ] **Step 3: Testar hot-reload**

Adicionar uma linha temporária de log em `server.js` (ex.: `console.log('hot-reload ok')` no topo do arquivo), aguardar ~3s e verificar:

Run: `docker compose logs app --tail 20`
Expected: nodemon detecta a alteração e reinicia (`restarting due to changes...` + o novo log). Reverter a alteração em `server.js` (deve voltar ao estado original do git via `git checkout -- server.js`) e confirmar novo restart nos logs.

- [ ] **Step 4: Testar seed manual**

Run: `docker compose exec app npm run prisma:seed`
Expected: seed executa sem erro de conexão (banco local). Se o seed falhar por dados que já existem, registrar o comportamento — o requisito é somente que a conexão funcione e os Inserts do seed executem em banco recém-criado.

---

### Task 5: Documentação de uso no README

**Files:**
- Modify: `README.md` (atualmente vazio)

**Interfaces:**
- Consumes: comandos validados nas Tasks 3–4.

- [ ] **Step 1: Escrever o README**

```markdown
# API Sistema de Eventos - Seciteci

API Node.js/Express + Prisma para cadastro de eventos.

## Rodando em desenvolvimento (Docker)

Requisitos: Docker com Compose v2.

    docker compose up --build

- API: http://localhost:3030
- Swagger: http://localhost:3030/api-docs
- Health: http://localhost:3030/health
- Postgres local: localhost:5433 (usuario/senha: postgres/postgres, banco: sistema_eventos)

O servidor recarrega automaticamente a cada alteração de código (nodemon + bind-mount).

### Comandos úteis

    # aplicar seed (manual, uma vez)
    docker compose exec app npm run prisma:seed

    # parar (mantém os dados do banco)
    docker compose down

    # parar e apagar os dados do banco
    docker compose down -v

    # logs do servidor
    docker compose logs -f app

    # abrir Prisma Studio
    docker compose exec app npm run prisma:studio

As migrations são aplicadas automaticamente ao subir (`prisma migrate deploy`).
Credenciais do Postgres local ficam definidas no `docker-compose.yml`; o `.env`
local não é usado pelo ambiente Docker.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: instruções de dev com docker compose"
```

---

## Notas de implementação

- **dotenv x compose:** `dotenv.config()` não sobrescreve variáveis já definidas no processo, então `DATABASE_URL`/`JWT_SECRET` do compose vencem o `.env` — mesmo com o bind-mount levando o `.env` para dentro do container.
- **Prisma Client:** gerado no build da imagem; o volume anônimo `/app/node_modules` o preserva em runtime, mesmo com o bind-mount de `.`.
- **Se `package.json` ou `prisma/schema.prisma` mudar:** rodar `docker compose up --build` para regenerar node_modules/client.
- **Postgres já ocupando a 5432 no host:** irrelevante, o compose usa 5433.
