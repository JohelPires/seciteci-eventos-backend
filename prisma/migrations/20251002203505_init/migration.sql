-- CreateTable
CREATE TABLE "usuarios" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(100) NOT NULL,
    "email" VARCHAR(100) NOT NULL,
    "senha" VARCHAR(255) NOT NULL,
    "telefone" VARCHAR(20),
    "cpf" VARCHAR(14),
    "data_nascimento" DATE,
    "foto_perfil" VARCHAR(255),
    "tipo_usuario" VARCHAR(20) NOT NULL DEFAULT 'participante',
    "data_cadastro" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimo_acesso" TIMESTAMP(6),
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorias" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(50) NOT NULL,
    "descricao" TEXT,
    "icone" VARCHAR(50),
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "categorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locais" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(100) NOT NULL,
    "endereco" VARCHAR(200) NOT NULL,
    "numero" VARCHAR(10),
    "complemento" VARCHAR(50),
    "bairro" VARCHAR(50),
    "cidade" VARCHAR(50) NOT NULL,
    "estado" CHAR(2) NOT NULL,
    "cep" VARCHAR(9),
    "pais" VARCHAR(50) NOT NULL DEFAULT 'Brasil',
    "capacidade" INTEGER,
    "latitude" DECIMAL(10,8),
    "longitude" DECIMAL(11,8),
    "observacoes" TEXT,

    CONSTRAINT "locais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos" (
    "id" SERIAL NOT NULL,
    "titulo" VARCHAR(150) NOT NULL,
    "descricao" TEXT,
    "categoria_id" INTEGER,
    "local_id" INTEGER,
    "organizador_id" INTEGER NOT NULL,
    "data_inicio" TIMESTAMP(6) NOT NULL,
    "data_fim" TIMESTAMP(6) NOT NULL,
    "horario_abertura" TIME(6),
    "horario_encerramento" TIME(6),
    "capacidade_maxima" INTEGER,
    "vagas_disponiveis" INTEGER,
    "valor_inscricao" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "tipo_evento" VARCHAR(20) NOT NULL DEFAULT 'presencial',
    "link_online" VARCHAR(255),
    "imagem_capa" VARCHAR(255),
    "status" VARCHAR(20) NOT NULL DEFAULT 'rascunho',
    "publico_alvo" TEXT,
    "requisitos" TEXT,
    "data_criacao" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "data_atualizacao" TIMESTAMP(6) NOT NULL,
    "destaque" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "eventos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inscricoes" (
    "id" SERIAL NOT NULL,
    "evento_id" INTEGER NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "data_inscricao" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status_inscricao" VARCHAR(20) NOT NULL DEFAULT 'pendente',
    "status_pagamento" VARCHAR(20) NOT NULL DEFAULT 'pendente',
    "valor_pago" DECIMAL(10,2),
    "codigo_inscricao" VARCHAR(20) NOT NULL,
    "data_pagamento" TIMESTAMP(6),
    "presente" BOOLEAN NOT NULL DEFAULT false,
    "data_presenca" TIMESTAMP(6),
    "observacoes" TEXT,

    CONSTRAINT "inscricoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "palestrantes" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(100) NOT NULL,
    "email" VARCHAR(100),
    "telefone" VARCHAR(20),
    "biografia" TEXT,
    "foto" VARCHAR(255),
    "linkedin" VARCHAR(255),
    "twitter" VARCHAR(100),
    "website" VARCHAR(255),
    "especialidade" VARCHAR(100),

    CONSTRAINT "palestrantes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "programacao" (
    "id" SERIAL NOT NULL,
    "evento_id" INTEGER NOT NULL,
    "titulo" VARCHAR(150) NOT NULL,
    "descricao" TEXT,
    "palestrante_id" INTEGER,
    "data_atividade" DATE NOT NULL,
    "horario_inicio" TIME(6) NOT NULL,
    "horario_fim" TIME(6) NOT NULL,
    "local_atividade" VARCHAR(100),
    "tipo_atividade" VARCHAR(20) NOT NULL DEFAULT 'palestra',
    "capacidade" INTEGER,

    CONSTRAINT "programacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "avaliacoes" (
    "id" SERIAL NOT NULL,
    "evento_id" INTEGER NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "nota" INTEGER NOT NULL,
    "comentario" TEXT,
    "data_avaliacao" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "avaliacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificados" (
    "id" SERIAL NOT NULL,
    "inscricao_id" INTEGER NOT NULL,
    "codigo_validacao" VARCHAR(50) NOT NULL,
    "carga_horaria" INTEGER,
    "data_emissao" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "template_certificado" VARCHAR(255),
    "arquivo_pdf" VARCHAR(255),

    CONSTRAINT "certificados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificacoes" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "evento_id" INTEGER,
    "titulo" VARCHAR(100) NOT NULL,
    "mensagem" TEXT NOT NULL,
    "tipo" VARCHAR(20) NOT NULL DEFAULT 'info',
    "lida" BOOLEAN NOT NULL DEFAULT false,
    "data_envio" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificacoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_cpf_key" ON "usuarios"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "categorias_nome_key" ON "categorias"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "inscricoes_codigo_inscricao_key" ON "inscricoes"("codigo_inscricao");

-- CreateIndex
CREATE UNIQUE INDEX "inscricoes_evento_id_usuario_id_key" ON "inscricoes"("evento_id", "usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "avaliacoes_evento_id_usuario_id_key" ON "avaliacoes"("evento_id", "usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "certificados_inscricao_id_key" ON "certificados"("inscricao_id");

-- CreateIndex
CREATE UNIQUE INDEX "certificados_codigo_validacao_key" ON "certificados"("codigo_validacao");

-- AddForeignKey
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_local_id_fkey" FOREIGN KEY ("local_id") REFERENCES "locais"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_organizador_id_fkey" FOREIGN KEY ("organizador_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inscricoes" ADD CONSTRAINT "inscricoes_evento_id_fkey" FOREIGN KEY ("evento_id") REFERENCES "eventos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inscricoes" ADD CONSTRAINT "inscricoes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programacao" ADD CONSTRAINT "programacao_evento_id_fkey" FOREIGN KEY ("evento_id") REFERENCES "eventos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programacao" ADD CONSTRAINT "programacao_palestrante_id_fkey" FOREIGN KEY ("palestrante_id") REFERENCES "palestrantes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avaliacoes" ADD CONSTRAINT "avaliacoes_evento_id_fkey" FOREIGN KEY ("evento_id") REFERENCES "eventos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avaliacoes" ADD CONSTRAINT "avaliacoes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificados" ADD CONSTRAINT "certificados_inscricao_id_fkey" FOREIGN KEY ("inscricao_id") REFERENCES "inscricoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_evento_id_fkey" FOREIGN KEY ("evento_id") REFERENCES "eventos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
