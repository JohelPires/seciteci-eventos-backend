-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "google_id" VARCHAR(255),
ALTER COLUMN "senha" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_google_id_key" ON "usuarios"("google_id");
