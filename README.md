# API Sistema de Eventos - Seciteci

API Node.js/Express + Prisma para cadastro de eventos.

## Rodando em desenvolvimento (Docker)

Requisitos: Docker com Compose v2.

```bash
docker compose up --build
```

- API: http://localhost:3030
- Swagger: http://localhost:3030/api-docs
- Health: http://localhost:3030/health
- Postgres local: `localhost:5433` (usuário/senha: `postgres/postgres`, banco: `sistema_eventos`)

O servidor recarrega automaticamente a cada alteração de código (nodemon + bind-mount).

### Comandos úteis

```bash
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
```

As migrations são aplicadas automaticamente ao subir (`prisma migrate deploy`).
Credenciais do Postgres local ficam definidas no `docker-compose.yml`; o `.env`
local não é usado pelo ambiente Docker.
