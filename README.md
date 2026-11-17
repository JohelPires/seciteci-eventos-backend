# API Sistema de Eventos - Seciteci

API Node.js/Express + Prisma para cadastro de eventos.

## Rodando em desenvolvimento (Docker)

Requisitos: Docker com Compose v2.

```bash
docker compose -f docker-compose.yml up --build
```

> **Sempre use `-f docker-compose.yml`.** O repositório também tem `compose.yml`,
> o arquivo de **produção** exigido pela convenção `secitec-servidor`. O Docker
> Compose descobre o `compose.yml` primeiro, então um `docker compose` sem `-f`
> tentaria subir produção e falharia localmente por falta das variáveis
> `${IMAGEM}`, `${APP_HOST}`, `${POSTGRES_PASSWORD}` etc.

- API: http://localhost:3030
- Swagger: http://localhost:3030/api-docs
- Health: http://localhost:3030/health
- Postgres local: `localhost:5433` (usuário/senha: `postgres/postgres`, banco: `sistema_eventos`)

O servidor recarrega automaticamente a cada alteração de código (nodemon + bind-mount).

### Comandos úteis

```bash
# aplicar seed (manual, uma vez)
docker compose -f docker-compose.yml exec app npm run prisma:seed
# - NODE_ENV escolhe o seed: development roda o seed completo de dados de teste;
#   production roda o seed enxuto (admin + categorias Ciência/Tecnologia/Inovação)
# - e-mail do admin vem de ADMIN_EMAIL (a conta é criada SEM senha; ligue-a via
#   Clerk com o mesmo e-mail)
# - rodar em banco recém-criado: o seed de desenvolvimento duplica eventos em DB povoado

# parar (mantém os dados do banco)
docker compose -f docker-compose.yml down

# parar e apagar os dados do banco
docker compose -f docker-compose.yml down -v

# logs do servidor
docker compose -f docker-compose.yml logs -f app

# abrir Prisma Studio
docker compose -f docker-compose.yml exec app npm run prisma:studio
```

As migrations são aplicadas automaticamente ao subir (`prisma migrate deploy`).
Credenciais do Postgres local ficam definidas no `docker-compose.yml`; o `.env`
local não é usado pelo ambiente Docker.

## Autenticação (Clerk)

Login pelo Clerk (padrão `fic_dev/padroes-servicos/clerk.md`): a API valida o
session token (Bearer) e autoriza pela conta ligada por `clerk_user_id`; papel
(`participante|organizador|admin`) e `ativo` são SEMPRE do banco. Participante
entra por sign-up público; admin/organizador provisionados por e-mail
(seed/convite no dashboard do Clerk).

Webhook: configurar no dashboard do Clerk `POST https://<api>/api/webhooks/clerk`,
eventos `user.created`, `user.updated`, `user.deleted`.

Variáveis de ambiente (Clerk): `CLERK_SECRET_KEY`, `CLERK_JWT_KEY`,
`CLERK_AUTHORIZED_PARTIES`, `CLERK_WEBHOOK_SIGNING_SECRET`. O seed usa apenas
`ADMIN_EMAIL`.

## Produção (VM Seciteci)

A API é publicada automaticamente a cada push na `main` pela convenção
CI/CD de [`fic_dev/secitec-servidor`](https://gitlab.risc.unemat.br/fic_dev/secitec-servidor)
(runner `secitec-vps` na VM, template `gitlab/deploy.gitlab-ci.yml`, Traefik):

- URL: `https://apps.risc.unemat.br/dev/secitec/conectese-api`
- Health: `https://apps.risc.unemat.br/dev/secitec/conectese-api/health`
- Swagger: `https://apps.risc.unemat.br/dev/secitec/conectese-api/api-docs`

Segredos vivem no GitLab (variável `APP_ENV`, tipo File, escopo `producao`);
nada secreto entra no repo. O banco (`sistema_eventos`, Postgres próprio do
`compose.yml`) é criado na primeira publicação; migrations rodam no boot do
container. Rollback: re-executar a pipeline de um commit anterior.

O seed de produção é um job manual (`seed:producao`) no GitLab, após o
deploy: cria a conta do admin por `ADMIN_EMAIL` (sem senha — ligue-a via
Clerk com o mesmo e-mail) e as categorias Ciência, Tecnologia e Inovação.
