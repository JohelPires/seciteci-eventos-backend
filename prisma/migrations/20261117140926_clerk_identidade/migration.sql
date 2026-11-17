/*
  Warnings:

  - A unique constraint covering the columns `[clerk_user_id]` on the table `usuarios` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "clerk_user_id" VARCHAR(255);

-- CreateTable
CREATE TABLE "webhook_eventos" (
    "id" VARCHAR(255) NOT NULL,
    "tipo" VARCHAR(100) NOT NULL,
    "recebido_em" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_eventos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_clerk_user_id_key" ON "usuarios"("clerk_user_id");
