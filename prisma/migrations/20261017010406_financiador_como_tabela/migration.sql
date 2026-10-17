-- CreateTable
CREATE TABLE "financiadores" (
    "id" SERIAL NOT NULL,
    "evento_id" INTEGER NOT NULL,
    "tipo" VARCHAR(20),
    "nome" VARCHAR(150) NOT NULL,

    CONSTRAINT "financiadores_pkey" PRIMARY KEY ("id")
);

-- CreateForeignKey
ALTER TABLE "financiadores" ADD CONSTRAINT "financiadores_evento_id_fkey" FOREIGN KEY ("evento_id") REFERENCES "eventos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: uma linha em "financiadores" para cada evento que tinha os campos
-- planos. "nome" é NOT NULL: fallback para o tipo e, por fim, 'Nao informado'.
INSERT INTO "financiadores" ("evento_id", "tipo", "nome")
SELECT
   id,
   financiador_tipo,
   COALESCE(
      NULLIF(BTRIM(financiador_nome), ''),
      NULLIF(BTRIM(financiador_tipo), ''),
      'Nao informado'
   )
FROM "eventos"
WHERE financiador_nome IS NOT NULL OR financiador_tipo IS NOT NULL;

-- DropColumns
ALTER TABLE "eventos" DROP COLUMN "financiador_tipo",
DROP COLUMN "financiador_nome";
