# Design: Excluir usuário (soft delete administrativo)

**Data:** 2026-11-09
**Status:** aprovado (design)
**Escopo:** admin desativa (soft delete) qualquer usuário não-admin, pelo painel. Sem endpoint de restauração nesta entrega.

## Decisões (fornecidas pelo usuário)

Examinamos três abordagens — exclusão física em cascata, anonimização imediata e soft delete — e o usuário escolheu **soft delete**:

- **Exclusão = `ativo=false`.** Reversível em uma futura entrega (não haverá endpoint de restaurar agora).
- **Invalidação de sessão imediata:** incrementar `tokenVersion` no delete **e** o `authMiddleware` passa a rejeitar usuários com `ativo=false`.
- **Sem metadados de auditoria** (nada de `desativadoEm`/`desativadoPor` nem tabela de log) — decisão consciente do usuário.
- **Sem migration:** `ativo` e `tokenVersion` já existem no schema (`prisma/schema.prisma`).

## LGPD — enquadramento e ressalvas

1. **O que este recurso é:** desativação (bloqueio de acesso), reversível, para gestão administrativa. Não apaga dados pessoais.
2. **O que não é:** não atende, por si só, ao direito de eliminação do titular (art. 18, VI) nem ao fim do tratamento (arts. 15/16). Nome, e-mail, CPF, telefone, data de nascimento e foto continuam armazenados.
3. **Consequência de conformidade (registrada como follow-up):** se o titular solicitar eliminação efetiva, será preciso implementar anonimização/expurgo (substituição dos campos identificadores e/ou remoção física respeitando o art. 16 — retenção por obrigação legal em registros financeiros). Fora do escopo desta entrega.
4. **Base legal e prazo de retenção** dos dados de usuários desativados devem estar documentados pelo controlador; o spec não os define.
5. Como não há auditoria, a comprovação de quem desativou e quando dependerá de logs de aplicação/infraestrutura (levar em conta em eventual requisição da ANPD).

## API

`DELETE /api/usuarios/:id` — protegida por `authMiddleware, isAdmin`.

| Situação | Resposta |
| --- | --- |
| `id` não é inteiro ≥ 1 | `400 { error: 'ID de usuário inválido' }` |
| usuário inexistente | `404 { error: 'Usuário não encontrado' }` |
| alvo `tipoUsuario === 'admin'` (inclui o próprio admin, pois ele também é admin) | `403 { error: 'Acesso negado. Administradores não podem ser excluídos.' }` |
| já `ativo=false` | `200 { message: 'Usuário já está desativado' }` (idempotente) |
| caso normal | `UPDATE usuarios SET ativo=false, token_version=token_version+1` e `200 { message: 'Usuário desativado com sucesso' }` |

- A resposta **não** retorna dados pessoais do alvo.
- Erro inesperado → `500` seguindo o padrão dos demais controllers.

## Código

- `controllers/usuariosController.js`: nova função `desativarUsuario`, seguindo o padrão de `promoverUsuarioAdmin` (parse/validação do id, `findUnique` com `select: { id, tipoUsuario, ativo }`, `update` com `select` sem dados pessoais).
- `routes/index.js`: `router.delete('/usuarios/:id', authMiddleware, isAdmin, usuariosController.desativarUsuario)` — rotas admin existentes ficam no bloco "ROTAS PROTEGIDAS - USUÁRIOS".
- `middleware/auth.js`: no `authMiddleware`, o `select` passa a incluir `ativo`; rejeita `!user || !user.ativo || (decoded.v ?? 0) !== user.tokenVersion` com `401 "Token inválido ou expirado"`.
- `docs/swagger.routes.js`: documentar `DELETE /api/usuarios/{id}` (tags Autenticação, `bearerAuth`, respostas 200/400/401/403/404/500) — o Swagger é manual, atualização obrigatória por convenção do repo.
- `tests/permissoes.test.js`: casos novos:
  1. participante tentando deletar → `403`
  2. admin deleta participante → `200`; usuário fica `ativo=false` e `tokenVersion` incrementada
  3. token antigo do usuário desativado → `401"Token inválido ou expirado"`
  4. login do usuário desativado → `401`
  5. admin tenta deletar outro admin → `403`
  6. admin tenta deletar a si mesmo → `403`
  7. usuário inexistente → `404`
  8. `id` inválido (`"abc"`) → `400`
  9. segunda chamada sobre usuário já desativado → `200` idempotente

## Não-mudanças deliberadas

- Nenhuma migration/seed.
- `GET /api/usuarios` continua listando inativos (o filtro `?ativo=` já existe).
- Inscrições, avaliações, notificações e eventos organizados permanecem intactos (FKs preservadas — não há cascade a partir de `Usuario`).
- `promoverUsuarioAdmin` não passa a barrar promoção de usuário inativo (fora de escopo; se promovido, o `authMiddleware` também o bloquearia enquanto `ativo=false`, o que é aceitável).
