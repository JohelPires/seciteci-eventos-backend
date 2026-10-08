# Design: Deploy na VM Seciteci seguindo a convenção secitec-servidor

**Data:** 2026-10-08
**Status:** Aprovado pelo usuário
**Supersedência:** substitui `2026-10-08-deploy-gitlab-cicd-design.md` (plano custom com VPN/SSH bootstrap e compose de produção próprio), tornado obsoleto quando descobrimos a convenção oficial da SECITECI.

## Contexto e restrições

- A máquina do desenvolvedor **não** acessa a VPN nem a VM `192.168.30.149`; o único canal é o **GitLab** (`gitlab.risc.unemat.br`).
- A VM **já tem** o GitLab Runner do grupo `fic_dev`: **`secitec-vps (publicação)`** (executor `shell`, tag `secitec-vps`, **Protected**, só branch protegida, usuário no grupo `docker`, `concurrent = 1`).
- Existe **convenção documentada** em `fic_dev/secitec-servidor` (id 735): template de CI de deploy, Traefik por caminho, Postgres compartilhado e fluxo de branches/ambientes. Apps de exemplo em produção: `portal-inovacao-api` (734), `secitec-ola` (736).

## Decisões (aprovadas pelo usuário)

1. **Seguir a convenção** `secitec-servidor` em vez de pipeline/compose próprios.
2. **`APP: conectese-api`** — URLs: `https://apps.risc.unemat.br/dev/secitec/conectese-api`.
3. **Só produção agora**: branch `main` (protegida) → ambiente `producao`. Estruturas `develop`/`staging` podem ser adicionadas depois (o template já as define).
4. **Deploy automático** (sem botão): override local do job `publicar:producao` trocando só a regra de gatilho; o corpo vem do template via `extends`.
5. **Sem job de testes no CI** na primeira fase (os testes do repo seguem rodando localmente; `npx jest --runInBand` com DB de teste).
6. **Postgres próprio no `compose.yml`** da API (não o compartilhado da VM): o banco é criado pelo compose na primeira subida, sem precisar de admin na VM. Trade-off aceito: **sem backup** e +`mem_limit` 512m.

## Componentes

### `compose.yml` (raiz)
- `app`: `image: ${IMAGEM}:${IMAGEM_TAG}`, `env_file: .env`, labels Traefik (porta interna **80**, stripprefix do `${APP_CAMINHO}`), healthcheck `/health`, `mem_limit: 512m`, `stop_grace_period: 15s`, `depends_on: db healthy`.
- `db`: `postgres:16-alpine`, `POSTGRES_PASSWORD` vem do `.env`, volume `pgdata`, healthcheck `pg_isready`, `mem_limit: 512m`, `traefik.enable=false`.
- **Sem `name:` top-level**: o nome do projeto é `COMPOSE_PROJECT_NAME` (escrito pelo pipeline); labels usam `${COMPOSE_PROJECT_NAME}_default`.

### `.gitlab-ci.yml` (raiz)
```yaml
include:
  - project: 'fic_dev/secitec-servidor'
    file: 'gitlab/deploy.gitlab-ci.yml'
variables:
  APP: conectese-api
publicar:producao:
  extends: [.publicar-na-vm, .ambiente:producao]
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
```
Precedência local-v-sobre-incluído faz o override; `resource_group: conectese-api-prod` serializa deploys.

### Segredos — `APP_ENV` (File, escopo `producao`)
Conteúdo do `.env` escrito em `/opt/apps/conectese-api/prod/.env`:
`DATABASE_URL` (senha embaixo), `POSTGRES_PASSWORD`, `POSTGRES_DB=sistema_eventos`, `NODE_ENV=production`, `PORT=80`, `JWT_SECRET` novo, `EMAIL_*`, `SMTP_*` (app password do Gmail **sem espaços**). Senha do banco sem `:/@#` (entra na `DATABASE_URL`).

### Deploy (o que o template já faz)
Build da imagem no runner (`Dockerfile` multi-stage, `.dockerignore`), cópia do `compose.yml` + escrita do `.env` em `/opt/apps/conectese-api/prod/`, `docker compose up -d --remove-orphans --wait` (healthcheck), poda de imagens (2 por app). O CMD do `Dockerfile` já roda `prisma migrate deploy` ao subir cada versão.

## Fluxo / validação

1. Branch `feat/deploy-gitlab-cicd` → criar `APP_ENV` no GitLab → **MR para `main`** → merge.
2. Pipeline da `main` roda `publicar:producao` automaticamente (runner `secitec-vps`).
3. **Validação pública, sem VPN**: `https://apps.risc.unemat.br/dev/secitec/conectese-api/health` → `status: OK`; Swagger em `/…conectese-api/api-docs`.
4. Novo merge na `main` redeploya; rollback = re-run da pipeline do commit anterior (o `.env` guarda `IMAGEM_TAG`).
5. Smoke local já feito previamente ao merge: imagem buildada + compose com `.env` de teste → ambos os serviços `healthy`, `COMPOSE_PROJECT_NAME` governa rede/volume corretamente.

## Riscos

- **Backup do banco:** inexistente (decisão consciente). Follow-up sugerido: `pg_dump` agendado ou migração para o Postgres compartilhado (`criar-banco.sh`) no futuro.
- **Memória:** VM de 3,8 GB compartilhada; teto por serviço está definido, mas o disco (19 GB) é gerenciado pelo template.
- **Swagger sob prefixo:** a UI fica em `/…conectese-api/api-docs`; se recursos absolutos quebrarem, usar `X-Forwarded-Prefix` (follow-up).
- **Runner só em branch protegida:** branches desprotegidas ficam com jobs "stuck" se o pipeline tentar publicar nelas — o template filtra por `develop/staging/main`.
