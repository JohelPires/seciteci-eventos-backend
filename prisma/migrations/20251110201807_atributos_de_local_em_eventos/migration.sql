/*
  Warnings:

  - Added the required column `local_cidade` to the `eventos` table without a default value. This is not possible if the table is not empty.
  - Added the required column `local_endereco` to the `eventos` table without a default value. This is not possible if the table is not empty.
  - Added the required column `local_estado` to the `eventos` table without a default value. This is not possible if the table is not empty.
  - Added the required column `local_nome` to the `eventos` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "categorias" ADD COLUMN     "cor" VARCHAR(50);

-- AlterTable
ALTER TABLE "eventos" ADD COLUMN     "link_google_maps" VARCHAR(255),
ADD COLUMN     "link_pagina_evento" VARCHAR(255),
ADD COLUMN     "local_bairro" VARCHAR(50),
ADD COLUMN     "local_capacidade" INTEGER,
ADD COLUMN     "local_cep" VARCHAR(9),
ADD COLUMN     "local_cidade" VARCHAR(50) NOT NULL,
ADD COLUMN     "local_complemento" VARCHAR(50),
ADD COLUMN     "local_endereco" VARCHAR(200) NOT NULL,
ADD COLUMN     "local_estado" CHAR(2) NOT NULL,
ADD COLUMN     "local_latitude" DECIMAL(10,8),
ADD COLUMN     "local_longitude" DECIMAL(11,8),
ADD COLUMN     "local_nome" VARCHAR(100) NOT NULL,
ADD COLUMN     "local_numero" VARCHAR(10),
ADD COLUMN     "local_observacoes" TEXT,
ADD COLUMN     "local_pais" VARCHAR(50) NOT NULL DEFAULT 'Brasil';
