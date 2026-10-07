# Design: Suíte de testes automatizados (integração HTTP)

Data: 2026-10-07
Status: Aprovado pelo usuário (design em conversa)

## Objetivo

Criar suíte de testes de integração end-to-end cobrindo os caminhos críticos
da API (auth, eventos, inscrições, permissões) via HTTP real com Supertest,
contra um banco Postgres de teste fisicamente isolado.

Decisões aprovadas em conversa:

| Tópico               | Decisão                                                        |
| -------------------- | -------------------------------------------------------------- |
| Escopo               | Caminhos críticos e2e (auth, eventos, inscrições, permissões)   |
| Framework            | Jest + Supertest (devDependencies)                             |
| Banco de teste       | Database separado `sistema_eventos_test` no mesmo Postgres do compose |
| Testabilidade        | Extrair app Express do `server.js` (novo `app.js`)              |
| Execução             | Local, `npm test` (host), contra `localhost:5433`               |

Fora de escopo: testes unitários de validators/templates (podem entrar
depois), endpoints não críticos (avaliações, notificações, categorias,
locais, usuários), CI.

## Princípios

- Sem mocks de banco: SQL, relations, constraints e transações do Prisma são
  testados de verdade.
- O banco de produção `sistema_eventos` nunca é tocado.
- Mudanças mínimas no código de produção, apenas para testabilidade.

## Infraestrutura de teste

- **Jest** (`testEnvironment: node`) + **Supertest** como devDependencies
  (`npm install -D jest supertest`).
- `.env.test.example` (versionado) e `.env.test` (não versionado, gitignored):

  ```
  DATABASE_URL=postgresql://postgres:postgres@localhost:5433/sistema_eventos_test?schema=public
  NODE_ENV=test
  JWT_SECRET=test-secret
  EMAIL_ENABLED=false
  ```

- **Provisionamento do database de teste:**
  - Ambientes novos: `db/init-test-db.sql` com
    `CREATE DATABASE sistema_eventos_test;` montado em
    `/docker-entrypoint-initdb.d/` no serviço `db` do compose (roda só na
    1ª inicialização do volume).
  - Volume `pgdata` já existente: one-time manual
    `docker compose exec db createdb -U postgres sistema_eventos_test`.
- **Migrações:** `globalSetup` do Jest aplica `npx prisma migrate deploy`
  apontando `DATABASE_URL` para o banco de teste (sobrescrevendo via
  `execSync` com env próprio).
- **Limpeza entre testes:** `resetDb()` (helper, `beforeEach`) executa
  `TRUNCATE` de todas as tabelas do banco de teste com
  `RESTART IDENTITY CASCADE`. Suíte roda serial (`--runInBand`) para evitar
  corrida no banco.
- Alternativas descartadas: schema `?schema=test` (isolamento apenas lógico;
  o usuário preferiu banco físico) e mocking do PrismaClient (não testa
  SQL/relations).

## Refactor de testabilidade (mudanças mínimas)

- **Separar `app.js` de `server.js`:** `app.js` monta CORS, parsers, rate
  limit, swagger, rotas, 404 e error handler e exporta o app; `server.js`
  fica só com `listen`, `verifyMailer()`, conexão ao banco e graceful
  shutdown. Sem mudança de comportamento em dev/prod (`npm start`/`dev`
  continuam funcionando igual).
- **Rate limiter:** quando `NODE_ENV === 'test'`, o `rateLimit` não é
  aplicado (condição no `app.js`), para a suíte não bater no limite de
  100 req/3 min.
- **Cache do `eventosController`:** quando `NODE_ENV === 'test'`, pular
  leitura/escrita do `node-cache` (determinismo); produção inalterada.
- **E-mail:** `EMAIL_ENABLED=false` no `.env.test`; `sendEmail` já retorna
  `null` sem enviar — nenhuma mudança.

## Estrutura de arquivos

```
tests/
  globalSetup.js          # migrate deploy no banco de teste
  setupEnv.js             # setupFiles: carrega .env.test, NODE_ENV=test
  db.js                   # prisma de teste + resetDb()
  factories.js            # createUser(role), createEvento, tokenFor(user)
  auth.test.js
  eventos.test.js
  inscricoes.test.js
  permissoes.test.js
jest.config.js
.env.test.example
```

Notas:

- Papéis `organizador`/`admin` não existem no register público (só cria
  `participante`): `factories.js` cria esses usuários direto via Prisma
  (senha hasheada com bcryptjs) e gera JWT real com o mesmo payload
  `{ id, tipo }` do `middleware/auth.js`.
- `createEvento` factory insere evento publicado com data futura por padrão
  (necessário para inscrições).

## Casos de teste (caminhos críticos)

- **auth.test.js**
  - `POST /api/auth/register` → 201, tipo forçado a `participante`;
    e-mail duplicado → 400; CPF duplicado → 400; payload inválido → 400.
  - `POST /api/auth/login` → 200 com token; senha errada → 401; e-mail
    inexistente → 401; payload inválido → 400.
  - `GET /api/auth/profile` com token → 200; sem token → 401.
- **eventos.test.js**
  - `POST /api/eventos` sem token → 401; organizador cria → status
    `rascunho` (mesmo enviando `publicado`); admin cria com `publicado` → ok;
    payload inválido → 400.
  - `GET /api/eventos` listagem + paginação/filtro; `GET /api/eventos/:id`
    inexistente → 404.
  - `PUT /api/eventos/:id`: não-dono → 403; dono → 200; admin → 200;
    não-admin tentando `status: publicado` → 403.
  - `DELETE /api/eventos/:id`: com inscrição existente → 400; sem
    inscrições → 200 e some da listagem; não-dono → 403.
- **inscricoes.test.js**
  - `POST /api/inscricoes` em evento publicado: 201, decrementa
    `vagasDisponiveis`, cria `Notificacao` do tipo confirmação;
    duplicada → 400; evento inexistente/não publicado → 404; evento com
    `dataInicio` no passado → 400; `vagasDisponiveis = 0` → 400.
  - `GET /minhas-inscricoes` lista só as do usuário.
  - `DELETE /api/inscricoes/:id`: cancelamento devolve vaga, status
    `cancelada`, cria notificação de cancelamento; já cancelada → 400.
  - `PATCH /api/inscricoes/:id/presenca`: organizador/admin → 200
    (`presente: true`); participante → 403.
- **permissoes.test.js**
  - Sem token → 401; token inválido/expirado → 401.
  - Rotas admin (`POST /categorias`, `GET /usuarios`) com participante → 403;
    com admin → 2xx.

Comportamento verificado contra as rotas reais de `routes/index.js` e a
implementação atual dos controllers.

## Como rodar

1. `docker compose up -d db`
2. Uma vez: `docker compose exec db createdb -U postgres sistema_eventos_test`
   (desnecessário em ambiente novo — o init script cuida disso)
3. `npm install` → `npm test` (ou `npm run test:watch`)

Scripts em `package.json`:

```json
"test": "jest --runInBand",
"test:watch": "jest --watch"
```

## Riscos / notas

- `CREATE DATABASE` do init script não reroda em volume existente — daí o
  passo manual único.
- Instalar dev deps localmente; no Docker, o volume nomeado `node_modules`
  precisa ser recriado (já documentado no AGENTS.md) para `exec app npm test`
  funcionar — fora do escopo por enquanto (execução local).
- `TRUNCATE` roda apenas no banco de teste; produção intocada.
- Rate limit e cache desativados só sob `NODE_ENV=test`.
