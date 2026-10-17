# Rollback da migração "financiador como tabela"

A migração `20261017010406_financiador_como_tabela` criou a tabela `financiadores` (1:N com `eventos`), fez o backfill das colunas planas `financiador_tipo`/`financiador_nome` para a nova tabela e, por fim, derrubou as colunas planas de `eventos`.

## O problema

O rollback por re-run da pipeline de um commit anterior só volta a **imagem** antiga, não o schema: o Prisma client dessa imagem espera as colunas `financiador_tipo`/`financiador_nome`, que a migração já derrubou do banco, e toda leitura/escrita de eventos falha com **P2022** ("column does not exist") até alguém reverter o schema manualmente. Como o push na `main` sobe automaticamente para produção, o caminho reverso abaixo precisa estar disponível no momento do merge.

## SQL reverso (manual, via psql como admin/RISC)

```sql
ALTER TABLE "eventos" ADD COLUMN "financiador_tipo" VARCHAR(20);
ALTER TABLE "eventos" ADD COLUMN "financiador_nome" VARCHAR(150);

UPDATE "eventos" e
SET financiador_tipo = f.tipo, financiador_nome = f.nome
FROM (
   SELECT DISTINCT ON (evento_id) evento_id, tipo, nome
   FROM "financiadores"
   ORDER BY evento_id, id
) f
WHERE e.id = f.evento_id;

DROP TABLE "financiadores";
```

## Caveats

1. **Reversão é LOSSY** — eventos com vários financiadores voltam com apenas o primeiro (ordem por `id` via `DISTINCT ON`); os demais são perdidos no `DROP TABLE`.
2. O `prisma migrate deploy` da imagem antiga **não desfaz** a migração (ela já está gravada em `_prisma_migrations`) — o SQL acima é manual.
3. Depois de reverter os dados, o ambiente de dev ficará em drift com o histórico de migrações; cuidar do registro (ex.: `prisma migrate resolve --rolled-back 20261017010406_financiador_como_tabela` ou tratamento equivalente) é um follow-up do ambiente de dev, não coberto aqui.

## Sem segredos

Este documento não contém credenciais nem valores de ambiente (convenção do projeto: segredos ficam na variável `APP_ENV` do GitLab, nada secreto no repositório).
