# Design: Deploy na VM Seciteci via GitLab CI/CD

> **⚠️ SUPERSEDIDO** por `2026-10-08-deploy-vm-secitec-design.md` — a descoberta da convenção oficial `fic_dev/secitec-servidor` (runner shell já na VM, template de CI, Traefik, Postgres compartilhado) invalidou o bootstrap por VPN/SSH e o compose/CI customizados aqui descritos.

**Data:** 2026-10-08
**Status:** Aprovado pelo usuário

## Objetivo

Publicar a API (backend + Postgres) na VM `192.168.30.149` via `docker compose`,
com deploy automático disparado por push na `main` do GitLab
(`gitlab.risc.unemat.br/fic_dev/conecte-se-gest-o-de-eventos/gest-o-eventos-api/gestao-eventos-api`).

## Contexto e restrições

- A VM só é alcançável pela VPN Seciteci (OpenVPN para `45.178.113.134:1194/udp`,
  que roteia `192.168.30.0/24`). A máquina do desenvolvedor **não** tem acesso
  direto por restrição de IP; o GitLab (mesmo IP do endpoint da VPN) é acessível.
- A VM já hospeda **outras aplicações** → porta 3030 pode estar ocupada; a porta
  do host será parametrizável e descoberta no bootstrap.
- O `docker-compose.yml` atual é exclusivo de dev (bind-mount, nodemon,
  `Dockerfile.dev`, segredos de dev) e **não** será alterado.
- Há um `Dockerfile` de produção multi-stage (non-root, escuta 80) já coberto
  por `tests/deploy.test.js`, hoje sem nenhum compose que o use.
- `server.js:10` loga uma URL do EasyPanel quando `NODE_ENV=production` —
  decisão do usuário: essa URL ficará para **staging no futuro**; a produção
  real será outra. Cosmético (só log), ficará como está por ora.

## Decisões (aprovadas pelo usuário)

1. **Deploy é pipeline CI/CD automático** — não deploy manual por SSH.
2. **Runner GitLab instalado na VM** (executor `shell`): o job roda dentro da
   própria VM, então o GitLab nunca precisa alcançar a rede privada; só a VM
   precisa sair para o GitLab (público, via HTTPS). Alternativas descartadas:
   executor `docker` na VM (mais peças: socket, volumes, dind) e runner
   externo + SSH (dependeria de VPN no runner — frágil).
3. **Segredos como CI/CD Variables do GitLab** (masked/protected): JWT_SECRET,
   senhas, SMTP. Nada secreto entra no repositório.
4. **`docker-compose.prod.yml` novo** usando o `Dockerfile` de produção; o
   compose de dev continua intacto.
5. **Gatilho:** push na `main`; o deploy só roda **se os testes passarem**
   (estágio `test` antes de `deploy`).

## Arquitetura

```
push main ──► GitLab (45.178.113.134, público)
                 │  pipeline: test ─► deploy
                 ▼
        GitLab Runner (shell, VM 192.168.30.149, tag seciteci-vm)
                 │  (job roda localmente na VM)
                 ▼
        docker compose -f docker-compose.prod.yml up -d --build
                 ▼
        [db postgres:16-alpine]  ◄── rede interna do compose
        [app  build Dockerfile] ──► 0.0.0.0:${APP_HOST_PORT} no host
```

O runner gerencia o checkout do próprio código (`$CI_PROJECT_DIR`) — não há
clone manual na VM.

## Componentes

### 1. Bootstrap único (via VPN + SSH, executa-se uma vez)

Passos executados da máquina do desenvolvedor (documentados em script/gui no
plano de implementação):

1. **VPN:** `openvpn --config dados_vpn_secitec/pfSense-UDP4-1194-secitec-config.ovpn`
   com arquivo `auth-user-pass` contendo credenciais `secitec` (arquivo criado
   em `/tmp`, **fora** do repo; `dados_vpn_secitec/` já está no `.gitignore`).
2. **SSH:** `ubuntu@192.168.30.149` (senha em `dados_vpn_secitec/openvpn_secitec.txt`).
   Automatizado com `sshpass` (instalado na máquina local se necessário).
3. **Na VM (verificação antes de instalar):** SO/versões (`lsb_release`),
   portas em uso (`ss -ltnp` → escolhe `APP_HOST_PORT` livre, default 3030),
   conectividade de saída (HTTPS para GitLab e Docker Hub), espaço em disco.
4. **Instalação:** Docker Engine + compose plugin; Node 20 LTS (para o job de
   testes no executor shell); `gitlab-runner`.
5. **Registro do runner:** *project runner* com **executor `shell`**,
   `--tag-list seciteci-vm`, rodando como usuário `ubuntu` (que passa a ter
   acesso ao Docker via grupo `docker`). Token de registro obtido pelo usuário
   em Settings > CI/CD > Runners > New project runner. Se o certificado do
   GitLab não validar na VM, ajustar CA/tls (`--tls-ca-file`).
6. **Verificação pós-bootstrap:** runner “online” na UI do GitLab; job de smoke
   (`docker info`; `node -v`) executado com sucesso.

### 2. Segredos — CI/CD Variables (masked, protected)

| Variável            | Uso                                        |
|---------------------|--------------------------------------------|
| `JWT_SECRET`        | assinatura de token (obrigatória)          |
| `POSTGRES_PASSWORD` | senha do db de produção                    |
| `APP_HOST_PORT`     | porta host publicada (default 3030)        |
| `EMAIL_ENABLED`     | liga/desliga e-mail                        |
| `EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | e-mail |

O job exporta essas variáveis (o GitLab as injeta no shell do runner) e o
compose as resolve via `${VAR}` — mesmo mecanismo do compose dev.
**Sem defaults** para segredos no compose de produção (fail-fast).

### 3. `docker-compose.prod.yml` (novo arquivo)

- **db:** `postgres:16-alpine`, `restart: unless-stopped`, `POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}`,
  `POSTGRES_DB: sistema_eventos`, volume nomeado `pgdata` (persistência),
  healthcheck `pg_isready`, **sem** publicação de porta no host (rede interna
  do compose; acesso administrativo via `docker compose exec`).
- **app:** `build: { context: ., dockerfile: Dockerfile }` (multi-stage, non-root),
  `restart: unless-stopped`; `command` do Dockerfile já faz
  `prisma migrate deploy && node server.js`; `depends_on: db healthy`;
  `ports: "${APP_HOST_PORT}:80"`; variáveis `DATABASE_URL` (aponta para `db`),
  `PORT=80`, `NODE_ENV=production`, `JWT_SECRET`, `EMAIL_*` e `SMTP_*` — todas
  vindas de CI variables. Sem bind-mount, sem nodemon.

### 4. `.gitlab-ci.yml` (novo)

```yaml
stages: [test, deploy]

test:            # tag seciteci-vm, shell executor
  - sobe Postgres efêmero: docker run -d --rm --name ci-pg-test
    -e POSTGRES_PASSWORD=postgres -p 5433:5432 -v ./db/init-test-db.sql:...postgres:16-alpine
  - gera .env.test (DATABASE_URL -> localhost:5433/sistema_eventos_test,
    JWT_SECRET=test-secret, EMAIL_ENABLED=false)
  - npm ci && npm test   (globalSetup aplica migrations)
  - after_script: docker rm -f ci-pg-test

deploy:          # tag seciteci-vm, only main, resource_group deploy-vm
  - docker compose -f docker-compose.prod.yml up -d --build
  - docker image prune -f
  - verificação: curl http://localhost:$APP_HOST_PORT/health
```

- `resource_group: deploy-vm-seciteci` evita deploys concorrentes.
- Variáveis masked não aparecem nos logs; job de deploy fala pouco.
- Job manual opcional `seed` (`docker compose exec app npm run prisma:seed`).

### 5. Alterações no código (mínimas)

- **Nenhuma** em controllers/rotas. Opcional (fase 2, fora do escopo):
  parametrizar a URL logada em `server.js`.

## Fluxo de deploy

1. Push/merge na `main` → GitLab enfileira pipeline.
2. `test`: Postgres efêmero + `jest` (55 testes, `--runInBand`).
3. `deploy` (mesma VM, isolado por resource_group):
   build da imagem (cache de camadas no runner), `up -d`, migrations rodam
   dentro do `command` do `app`, healthcheck final.
4. Rollback: re-run do pipeline de um commit anterior (o `up -d --build`
   recria os serviços); dados preservados no volume `pgdata`.

## Validação

1. Bootstrap: runner “online” no GitLab.
2. Primeiro pipeline manualmente disparado ou por push vazio (`--allow-empty`)
   → `test` OK e `deploy` OK.
3. `curl http://192.168.30.149:<porta>/health` via VPN → `status: OK`.
4. `curl .../api-docs` responde; Swagger carrega.
5. Novo push na `main` → pipeline reexecuta e o serviço reinicia
   (`docker compose ps` mostra `Up (healthy)`).
6. Confirma que `.env`, `dados_vpn_secitec/` e segredos não aparecem em logs,
   no repo e na imagem (`tests/deploy.test.js` cobre a exclusão do contexto).

## Riscos

- **Token de runner:** precisa ser gerado pelo usuário (permissão Maintainer).
  Se a instância ainda exigir “registration token” antigo, adaptar o comando.
- **Certificado:** o GitLab responde por HTTPS público — baixo risco; fallback
  `--tls-ca-file`/`insecure` documentado no bootstrap.
- **Porta em uso:** resolvida no passo 3 do bootstrap (escolha de `APP_HOST_PORT`).
- **Postgres efêmero do job `test` usa a porta 5433 do host** — se ocupada na
  VM, parametrizamos `TEST_PG_HOST_PORT` (verificação no bootstrap).
- **Segredos na sessão do runner:** variáveis protected ficam restritas à
  `main`; masked escondem dos logs; nada é escrito em arquivo na VM.
