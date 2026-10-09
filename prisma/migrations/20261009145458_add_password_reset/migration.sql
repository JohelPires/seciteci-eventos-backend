-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "reset_codigo" VARCHAR(255),
ADD COLUMN     "reset_expira" TIMESTAMP(6),
ADD COLUMN     "reset_tentativas" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "token_version" INTEGER NOT NULL DEFAULT 0;
