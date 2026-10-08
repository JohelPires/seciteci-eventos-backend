# Deploy na VM Seciteci via GitLab CI/CD — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy automático (backend + Postgres) na VM `192.168.30.149` via `docker compose`, disparado por push na `main` com pipeline GitLab (test → deploy) e GitLab Runner shell instalado na própria VM.

**Architecture:** Runner com executor `shell` na VM; o job roda localmente e usa `docker compose -f docker-compose.prod.yml up -d --build`. Segredos chegam como CI/CD Variables do GitLab → ambiente do job → interpolação `${VAR}` no compose (nunca viram arquivo). VPN OpenVPN é usada só no bootstrap único.

**Tech Stack:** Node 20 LTS, Docker Engine + compose plugin, gitlab-runner (shell), Postgres 16-alpine, OpenVPN, sshpass.

## Global Constraints

- Spec de referência: `docs/superpowers/specs/2026-10-08-deploy-gitlab-cicd-design.md`.
- GitLab: `https://gitlab.risc.unemat.br`, projeto `fic_dev/conecte-se-gest-o-de-eventos/gest-o-eventos-api/gestao-eventos-api`. Branch única de deploy: `main`.
- VM: `ubuntu@192.168.30.149`, senha `wkIH7E7JKA$XZf` (em `dados_vpn_secitec/openvpn_secitec.txt`). VPN: `dados_vpn_secitec/pfSense-UDP4-1194-secitec-config.ovpn`, endpoint `45.178.113.134:1194/udp`, usuário VPN `secitec`.
- `docker-compose.yml` e `Dockerfile.dev` (dev) NÃO são alterados.
- Segredos NÃO ganham default no compose de produção; `APP_HOST_PORT` e `TEST_PG_HOST_PORT` têm default em `.gitlab-ci.yml` (overridable por UI).
- `dados_vpn_secitec/` e `.env` ficam fora do git (já estão no `.gitignore`); credenciais temporárias em `/tmp/vpnsec/`.
- Runner: executor `shell`, tag `seciteci-vm`, usuário do serviço `gitlab-runner` (default do pacote) que passa a pertencer ao grupo `docker`.
- `NODE_ENV=production` na VM; app escuta interna na porta 80 (do `Dockerfile`), publicada no host via `APP_HOST_PORT` (default `3030`).

---

### Task 1: `docker-compose.prod.yml` (backend + banco de produção)

**Files:**
- Create: `docker-compose.prod.yml`

**Interfaces:**
- Consumes: `Dockerfile` (multi-stage) já existente; variáveis de ambiente `POSTGRES_PASSWORD`, `JWT_SECRET`, `APP_HOST_PORT`, `EMAIL_ENABLED`, `EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`.
- Produces: serviço Compose `app` (healthcheck `/health`), serviço `db` (healthcheck), volume `pgdata` com nome fixo `seciteci-eventos-pgdata-prod`.

- [ ] **Step 1: Criar o arquivo**

```yaml
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: sistema_eventos
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
      dockerfile: Dockerfile
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD}@db:5432/sistema_eventos?schema=public
      PORT: "80"
      NODE_ENV: production
      JWT_SECRET: ${JWT_SECRET}
      EMAIL_ENABLED: ${EMAIL_ENABLED:-false}
      EMAIL_FROM: ${EMAIL_FROM:-Seciteci Eventos <nao-responder@seciteci.local>}
      SMTP_HOST: ${SMTP_HOST:-smtp.gmail.com}
      SMTP_PORT: ${SMTP_PORT:-465}
      SMTP_SECURE: ${SMTP_SECURE:-true}
      SMTP_USER: ${SMTP_USER:-}
      SMTP_PASS: ${SMTP_PASS:-}
    ports:
      - "${APP_HOST_PORT:-3030}:80"
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:80/health >/dev/null 2>&1 || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 15s

volumes:
  pgdata:
    name: seciteci-eventos-pgdata-prod
```

- [ ] **Step 2: Validar sintaxe e interpolação**

```bash
cd /home/johel-pires/Documentos/GitHub/seciteci-eventos-backend && \
POSTGRES_PASSWORD=dummy JWT_SECRET=dummy docker compose -f docker-compose.prod.yml config --quiet
```

Expected: sem erro; avisos de variável em branco só para EMAIL/SMTP não informados.

- [ ] **Step 3: Commit**

```bash
cd /home/johel-pires/Documentos/GitHub/seciteci-eventos-backend && \
git add docker-compose.prod.yml && git commit -m "deploy: compose de producao (app+db, healthchecks, volume pgdata)"
```

---

### Task 2: `.gitlab-ci.yml` (pipeline test → deploy)

**Files:**
- Create: `.gitlab-ci.yml`

**Interfaces:**
- Consumes: `docker-compose.prod.yml` (Task 1), `db/init-test-db.sql`, `package-lock.json`.
- Produces: jobs `test` e `deploy` (tag `seciteci-vm`), job manual `seed`. Executor shell — o checkout já é o `$CI_PROJECT_DIR` do runner.

- [ ] **Step 1: Criar o arquivo**

```yaml
stages:
  - test
  - deploy

variables:
  APP_HOST_PORT: "3030"
  TEST_PG_HOST_PORT: "5433"

test:
  stage: test
  tags: [seciteci-vm]
  timeout: 15m
  resource_group: ci-tests-vm
  cache:
    key:
      files:
        - package-lock.json
    paths:
      - node_modules/
  script:
    - docker rm -f ci-pg-test || true
    - docker run -d --name ci-pg-test
        -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=sistema_eventos
        -p "127.0.0.1:${TEST_PG_HOST_PORT}":5432
        -v "$CI_PROJECT_DIR/db/init-test-db.sql":/docker-entrypoint-initdb.d/01-init.sql:ro
        postgres:16-alpine
    - |
      until [ "$(docker inspect --format '{{.State.Health.Status}}' ci-pg-test 2>/dev/null || echo starting)" = "healthy" ]; do
        sleep 2
      done
    - |
      cat > .env.test <<EOF
      DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:${TEST_PG_HOST_PORT}/sistema_eventos_test?schema=public
      NODE_ENV=test
      JWT_SECRET=test-secret
      EMAIL_ENABLED=false
      EOF
    - npm ci
    - npm test
  after_script:
    - docker rm -f ci-pg-test || true

deploy:
  stage: deploy
  tags: [seciteci-vm]
  rules:
    - if: '$CI_COMMIT_BRANCH == "main"'
  resource_group: deploy-vm-seciteci
  script:
    - >
      docker compose -f docker-compose.prod.yml up -d --build --wait --wait-timeout 180
      || (docker compose -f docker-compose.prod.yml logs --tail 100 && exit 1)
    - docker image prune -f
    - curl -fsS "http://127.0.0.1:${APP_HOST_PORT}/health"

seed:
  stage: deploy
  tags: [seciteci-vm]
  rules:
    - if: '$CI_COMMIT_BRANCH == "main"'
      when: manual
  script:
    - docker compose -f docker-compose.prod.yml exec -T app npm run prisma:seed
```

- [ ] **Step 2: Validar sintaxe** (validador local se houver; definitivo é o CI Lint do GitLab)

```bash
cd /home/johel-pires/Documentos/GitHub/seciteci-eventos-backend && \
python3 -c "import yaml,sys; yaml.safe_load(open('.gitlab-ci.yml')); print('yaml ok')" 2>/dev/null \
  || echo "python3+pyyaml indisponível — validar em CI/CD > Pipelines > Editor > Validate"
```

Expected: "sem validador local" é aceitável; validação definitiva no GitLab (**CI/CD > Pipelines > Editor > Validate**).

- [ ] **Step 3: Commit**

```bash
cd /home/johel-pires/Documentos/GitHub/seciteci-eventos-backend && \
git add .gitlab-ci.yml && git commit -m "deploy: pipeline CI (test com postgres efemero + deploy compose prod)"
```

---

### Task 3: Teste local do compose de produção

**Files:** — (nenhum; apenas execução)

**Interfaces:**
- Consumes: `docker-compose.prod.yml` (Task 1).
- Produces: confiança no build da imagem e no healthcheck antes de tocar na VM.

- [ ] **Step 1: Conferir Docker local**

```bash
docker --version && docker compose version
```

Expected: Docker 23+ e compose v2. Se ausente, pule os steps locais (a validação real acontece na VM no pipeline) e anote.

- [ ] **Step 2: Subir stack de produção localmente em porta livre**

```bash
cd /home/johel-pires/Documentos/GitHub/seciteci-eventos-backend && \
APP_HOST_PORT=3300 POSTGRES_PASSWORD=localtest JWT_SECRET=localtest-dummy \
docker compose -f docker-compose.prod.yml up -d --build --wait --wait-timeout 240
```

Expected: ambos os serviços `Up (healthy)`.

- [ ] **Step 3: Health e Swagger**

```bash
curl -fsS http://127.0.0.1:3300/health && curl -fsSI http://127.0.0.1:3300/api-docs | head -1
```

Expected: `status: OK` e `HTTP/1.1 200 OK`.

- [ ] **Step 4: Derrubar stack local (sem mexer no volume de dev)**

```bash
cd /home/johel-pires/Documentos/GitHub/seciteci-eventos-backend && \
docker compose -f docker-compose.prod.yml down && docker rmi api-eventos-app:latest 2>/dev/null || true
```

Expected: containers removidos; `pgdata` dev continua intacto (nome diferente).

---

### Task 4: VPN — conectar do host até a rede da VM

**Files:** — (só `/tmp/vpnsec/`)

**Interfaces:**
- Consumes: `dados_vpn_secitec/pfSense-UDP4-1194-secitec-config.ovpn` e credenciais do arquivo `openvpn_secitec.txt`.
- Produces: rota `192.168.30.0/24` ativa; SSH a `192.168.30.149` viável (usado por Tasks 5–9).

- [ ] **Step 1: Preparar o auth file (fora do repo)**

```bash
mkdir -p /tmp/vpnsec && printf 'secitec\nwkIH7E7JKA$XZf\n' > /tmp/vpnsec/auth.txt && chmod 600 /tmp/vpnsec/auth.txt
```

- [ ] **Step 2: Testar sudo não-interativo**

```bash
sudo -n true 2>/dev/null && echo "sudo: ok" || echo "sudo: precisa-de-senha"
```

Se "precisa-de-senha": pedir ao usuário para rodar no próprio terminal o comando do Step 3 (com sudo a senha dele), e pular para o Step 4. O agente NÃO pede a senha de sudo do usuário.

- [ ] **Step 3: Subir a VPN em background (daemon)**

```bash
sudo openvpn --config /home/johel-pires/Documentos/GitHub/seciteci-eventos-backend/dados_vpn_secitec/pfSense-UDP4-1194-secitec-config.ovpn \
  --auth-user-pass /tmp/vpnsec/auth.txt --daemon --log /tmp/vpnsec/vpn.log --writepid /tmp/vpnsec/vpn.pid
sleep 8
tail -5 /tmp/vpnsec/vpn.log
```

Expected: `Initialization Sequence Completed`. Em caso de `AUTH_FAILED`, revisar credenciais/2FA no pfSense.

- [ ] **Step 4: Confirmar rota e ICMP**

```bash
ip -brief addr show | grep tun; ping -c 2 -W 2 192.168.30.149
```

Expected: interface `tun0`/`tun1` ativa e ping respondendo. Sem resposta: checar rule "route 192.168.30.0 255.255.255.0" do ovpn já aplicada (`ip route | grep 192.168.30`).

---

### Task 5: SSH de primeira viagem + diagnóstico da VM

**Files:** — (só `/tmp/vpnsec/`)

**Interfaces:**
- Consumes: VPN do Task 4, `ubuntu@192.168.30.149`.
- Produces: SSH não-interativo funcionando (sshpass); inventário: portas em uso, versão do SO, Docker/Node presentes, conectividade de saída.

- [ ] **Step 1: Instalar sshpass se faltar**

```bash
command -v sshpass >/dev/null 2>&1 || (sudo -n apt-get install -y sshpass 2>/dev/null || \
  echo "[USUARIO] rode: sudo apt-get install -y sshpass")
```

- [ ] **Step 2: Testar SSH**

```bash
export SSHPASS='wkIH7E7JKA$XZf'
sshpass -e ssh -o StrictHostKeyChecking=accept-new ubuntu@192.168.30.149 'hostname && lsb_release -ds && free -h | head -2 && df -h / | tail -1'
```

Expected: hostname da VM, versão do Ubuntu, RAM e disco. Se falhar, `-o PreferredAuthentications=password` e revisar credenciais.

- [ ] **Step 3: Inventário (portas, node, docker, saída à internet)**

```bash
export SSHPASS='wkIH7E7JKA$XZf'
sshpass -e ssh ubuntu@192.168.30.149 '
echo "--- portas em uso ---"; ss -ltnp | sed "s/users.*//"
echo "--- docker ---"; command -v docker && docker --version || echo "sem docker"
echo "--- node ---"; command -v node && node -v || echo "sem node"
echo "--- git ---"; command -v git || echo "sem git"
echo "--- saida repos/apt ---"; curl -fsSI --max-time 8 https://deb.nodesource.com -o /dev/null && echo nodesource:ok || echo nodesource:falha
'
```

Escolher `APP_HOST_PORT`: default `3030` se livre; senão próximo inteiro livre (ex.: 3031). Anotar — a variável no GitLab será criada nessa Task 8.

---

### Task 6: Instalar Docker, Node 20 e gitlab-runner na VM

**Files:** — (apenas VM)

**Interfaces:**
- Consumes: SSH do Task 5, senha sudo da VM (via `sudo -S`, piping o password).
- Produces: `docker`+compose plugin, `node` 20, `gitlab-runner` serviço rodando, `gitlab-runner` no grupo `docker`.

- [ ] **Step 1: Instalar Docker (script oficial), curl e habilitar**

```bash
export SSHPASS='wkIH7E7JKA$XZf'
sshpass -e ssh ubuntu@192.168.30.149 'printf "%s\n" '"'"'wkIH7E7JKA$XZf'"'"' | sudo -S sh -c "command -v curl || apt-get install -y curl && curl -fsSL https://get.docker.com | sh && systemctl enable --now docker" 2>&1 | tail -4'
```

Expected: `Synchronizing state...`/`Active: active (running)` para `docker.service` — validar: `docker --version && docker compose version`.

- [ ] **Step 2: Instalar Node 20 LTS**

```bash
export SSHPASS='wkIH7E7JKA$XZf'
sshpass -e ssh ubuntu@192.168.30.149 'printf "%s\n" '"'"'wkIH7E7JKA$XZf'"'"' | sudo -S sh -c "curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs git" 2>&1 | tail -3'
```

Expected: `node -v` imprimir `v20.x.x`.

- [ ] **Step 3: Instalar gitlab-runner**

```bash
export SSHPASS='wkIH7E7JKA$XZf'
sshpass -e ssh ubuntu@192.168.30.149 'printf "%s\n" '"'"'wkIH7E7JKA$XZf'"'"' | sudo -S sh -c "curl -L https://packages.gitlab.com/install/repositories/runner/gitlab-runner/script.deb.sh | bash - && apt-get install -y gitlab-runner" 2>&1 | tail -3'
```

- [ ] **Step 4: Colocar `gitlab-runner` no grupo docker e reiniciar serviço**

```bash
export SSHPASS='wkIH7E7JKA$XZf'
sshpass -e ssh ubuntu@192.168.30.149 'printf "%s\n" '"'"'wkIH7E7JKA$XZf'"'"' | sudo -S sh -c "usermod -aG docker gitlab-runner && systemctl restart gitlab-runner" && systemctl is-active gitlab-runner'
```

Expected: `active`. Validar docker como runner: `sudo -u gitlab-runner docker info | head -3`.

---

### Task 7: Registrar runner no projeto (token do usuário no GitLab)

**Files:** — (runner config na VM)

**Interfaces:**
- Consumes: Token de runner obtido pelo usuário na UI do GitLab (**Settings > CI/CD > Runners > New project runner**; tag `seciteci-vm`, desmarcar "Run untagged", copiar o token `glrt-...`). Se a instância só ofertar "registration token" antigo, usar `--registration-token $RGST`.
- Produces: runner registrado, online, executor `shell`.

- [ ] **Step 1: Receber token do usuário (question tool se necessário)** — não colocá-lo em nenhum arquivo persistente.

- [ ] **Step 2: Registrar (token novo estilo glrt-)**

```bash
export SSHPASS='wkIH7E7JKA$XZf'
sshpass -e ssh ubuntu@192.168.30.149 'printf "%s\n" '"'"'wkIH7E7JKA$XZf'"'"' | sudo -S gitlab-runner register \
  --non-interactive --url https://gitlab.risc.unemat.br --token "$RUNNER_TOKEN" \
  --executor shell --description seciteci-vm --tag-list "seciteci-vm" --run-untagged=false 2>&1 | tail -6'
```

(Rodar com `RUNNER_TOKEN` exportado via sshpass: `sshpass -e env RUNNER_TOKEN='glrt-...' ssh ...`; token não é gravado na VM.)

Expected: `Runner registered successfully`.

- [ ] **Step 3: Confirmar config e saúde**

```bash
export SSHPASS='wkIH7E7JKA$XZf'
sshpass -e ssh ubuntu@192.168.30.149 'sudo gitlab-runner list && sudo gitlab-runner verify'
```

Expected: linha do runner em `~gitlab-runner/.gitlab-runner/config.toml` com tag `seciteci-vm`; `verify` → `is valid`. Runner aparece "online" na UI do GitLab.

---

### Task 8: Push, primeiro pipeline e variável APP_HOST_PORT

**Files:**
- Modify: `.gitlab-ci.yml` (já criado e commitado em Task 2)

**Interfaces:**
- Consumes: Tasks 1–7 todas prontas; variáveis de segredos JÁ cadastradas pelo usuário no GitLab.
- Produces: deploy ativo na VM.

- [ ] **Step 1: Solicitar ao usuário (UI GitLab) a variável `APP_HOST_PORT`**

Key `APP_HOST_PORT`, Value = porta decidida no Step 3 do Task 5, sem Masked. (Caso variável já exista, confirmar valor.)
Também validar `Settings > CI/CD > Variables`: chaves `JWT_SECRET`, `POSTGRES_PASSWORD`, `SMTP_PASS` com Masked+Protected; `EMAIL_*`/`SMTP_*` sem máscara. Validar editor do pipeline em **CI/CD > Pipelines > Editor > Validate** para o `.gitlab-ci.yml`.

- [ ] **Step 2: Push (main)**

```bash
cd /home/johel-pires/Documentos/GitHub/seciteci-eventos-backend && git push origin main
```

Expected: pipeline iniciado no GitLab; job `test` roda na VM (tag `seciteci-vm`).

- [ ] **Step 3: Acompanhar pipeline (UI ou API sem token? não há — pedir à usuária que confirme)**

Se `test` falhar: olhar log no GitLab; erros prováveis — porta `TEST_PG_HOST_PORT` ocupada na VM (mudar variável e re-run), ou prisma/jest sem node_modules cache (re-run resolve).
Se `deploy` falhar no `up --wait`: log completo já sai no job; `docker compose -f docker-compose.prod.yml logs app` na VM para diagnóstico.

- [ ] **Step 4: Validar de fora (com VPN conectada)**

```bash
curl -fsS "http://192.168.30.149:${APP_PORT:-3030}/health"
```

Expected: `status: OK`. Swagger: `curl -fsSI http://192.168.30.149:3030/api-docs | head -1` → 200.

- [ ] **Step 5: Idempotência automática**

Novo commit push (`--allow-empty` se necessário) → pipeline reexecuta → containers continuam `Up (healthy)`. Confirmação por comando:

```bash
export SSHPASS='wkIH7E7JKA$XZf'
sshpass -e ssh ubuntu@192.168.30.149 'docker ps --format "table {{.Names}}\t{{.Status}}" | head -5'
```

Expected: containers do compose de produção `Up (healthy)`.

---

### Task 9: Documentar o deploy no repo

**Files:**
- Modify: `AGENTS.md` (seção Dev commands/notes)
- Modify: `README.md` (seção deploy em produção)

**Interfaces:**
- Consumes: tudo pronto.
- Produces: documentação para humanos futuros.

- [ ] **Step 1: Agregar em `AGENTS.md`** as pequenas seções abaixo (inserir após a seção "Dev commands"):

```markdown
## Deploy (produção - via GitLab CI)
- Gatilho: push na `main`. Pipeline `test` (jest com Postgres efêmero na VM) → `deploy` (`docker compose -f docker-compose.prod.yml up -d --build --wait` na VM via runner shell tag `seciteci-vm`).
- Segredos: GitLab > Settings > CI/CD > Variables (Masked/Protected). `APP_HOST_PORT` define a porta publicada; `TEST_PG_HOST_PORT` a porta do Postgres efêmero do job `test`.
- Bootstrap do runner na VM (uso único): VPN + SSH, docker+node+gitlab-runner apt, register com token glrt- do projeto.
- Seed manual: job `seed` no GitLab (Play button) ou `docker compose -f docker-compose.prod.yml exec app npm run prisma:seed`.
- Logs na VM: `docker compose -f docker-compose.prod.yml logs -f app`.
```

- [ ] **Step 2: `README.md`** — adicionar seção curta "Produção", com a URL `http://192.168.30.149:<porta>/health` e nota de que segredos vivem no GitLab (não em `.env`).

- [ ] **Step 3: Commit**

```bash
cd /home/johel-pires/Documentos/GitHub/seciteci-eventos-backend && \
git add AGENTS.md README.md && git commit -m "docs: deploy producao na VM secitec via GitLab CI" && git push origin main
```

---

## Riscos cobertos/pendências

- **VPN/sudo:** se `sudo` no host pedir senha (Task 4 Step 2), o usuário roda o comando da VPN manualmente; agente guia sem pedir senha.
- **Porta em uso na VM:** o inventário (Task 5 Step 3) decide `APP_HOST_PORT`; se `TEST_PG_HOST_PORT:5433` estiver ocupada, muda variável no GitLab e re-runa o pipeline.
- **Token glrt- vs registration token:** se `--token` falhar, refazer com `--registration-token`.
- **Certificado GitLab tido como válido** (HTTPS público responde); se falhar cert na VM, `--tls-ca-file` no register.
- **Rollback:** re-run do pipeline de um commit anterior no GitLab (rebuild + up -d), sem tocar no volume `pgdata`.
