/**
 * DOCUMENTAÇÃO SWAGGER - API SISTEMA DE EVENTOS - SECITECI
 *
 * Este arquivo contém toda a documentação OpenAPI 3.0 da API
 * Organizado por módulos: Autenticação, Eventos, Inscrições, etc.
 */

/**
 * @swagger
 * tags:
 *   - name: Autenticação
 *     description: Endpoints de autenticação e gerenciamento de usuários
 *   - name: Eventos
 *     description: Gerenciamento completo de eventos
 *   - name: Inscrições
 *     description: Inscrições e participação em eventos
 *   - name: Categorias
 *     description: Categorias de eventos
 *   - name: Locais
 *     description: Locais de eventos
 *   - name: Avaliações
 *     description: Sistema de avaliações de eventos
 *   - name: Notificações
 *     description: Sistema de notificações para usuários
 */

// ============================================
// AUTENTICAÇÃO
// ============================================

/**
 * @swagger
 * /api/webhooks/clerk:
 *   post:
 *     tags:
 *       - Autenticação
 *     summary: Webhook de sincronização de contas com o Clerk
 *     description: |
 *       Endpoint chamado pelo Clerk (configure no dashboard do Clerk com os
 *       eventos `user.created`, `user.updated` e `user.deleted`). A
 *       assinatura Svix é validada com `CLERK_WEBHOOK_SIGNING_SECRET`.
 *       Cria/atualiza/desativa a conta local e liga `clerk_user_id`.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Evento Svix do Clerk (type/data)
 *     responses:
 *       200:
 *         description: Evento processado (ou ignorado como duplicado)
 *       401:
 *         description: Assinatura do webhook inválida
 */

/**
 * @swagger
 * /api/auth/profile:
 *   get:
 *     tags:
 *       - Autenticação
 *     summary: Obter perfil do usuário
 *     description: Retorna informações completas do usuário autenticado (conta ligada ao clerk_user_id) e atualiza o último acesso
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Perfil do usuário
 *       401:
 *         description: Token não fornecido ou inválido
 *       403:
 *         description: Esta conta não tem acesso (conta desativada ou e-mail ligado a outro clerk_user_id)
 *       404:
 *         description: Usuário não encontrado
 *   patch:
 *     tags:
 *       - Autenticação
 *     summary: Atualizar perfil do usuário
 *     description: |
 *       Clerk é a identidade; este endpoint só completa/edita o perfil
 *       (nome, telefone, cpf, dataNascimento, fotoPerfil). E-mail vem do Clerk.
 *       Campos fora do schema (email, tipoUsuario, ativo) são rejeitados com 400.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nome:
 *                 type: string
 *                 maxLength: 100
 *                 example: João Silva
 *               telefone:
 *                 type: string
 *                 maxLength: 20
 *                 example: (65) 98765-4321
 *               cpf:
 *                 type: string
 *                 maxLength: 14
 *                 example: 12345678900
 *               dataNascimento:
 *                 type: string
 *                 format: date-time
 *                 example: 1990-05-15
 *               fotoPerfil:
 *                 type: string
 *                 maxLength: 255
 *     responses:
 *       200:
 *         description: Perfil atualizado com sucesso; retorna message e user
 *       400:
 *         description: Dados inválidos (validação ou CPF já cadastrado)
 *       401:
 *         description: Token não fornecido ou inválido
 *       403:
 *         description: Esta conta não tem acesso
 *       404:
 *         description: Usuário não encontrado
 */

/**
 * @swagger
 * /api/usuarios:
 *   get:
 *     tags:
 *       - Autenticação
 *     summary: Listar usuários
 *     description: Retorna lista paginada de usuários. Permite filtros exatos (nome, email, telefone, cpf, tipoUsuario, ativo) e busca parcial (busca). Exige admin.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: nome
 *         schema:
 *           type: string
 *       - in: query
 *         name: email
 *         schema:
 *           type: string
 *       - in: query
 *         name: telefone
 *         schema:
 *           type: string
 *       - in: query
 *         name: cpf
 *         schema:
 *           type: string
 *       - in: query
 *         name: tipoUsuario
 *         schema:
 *           type: string
 *           enum: [participante, organizador, admin]
 *       - in: query
 *         name: ativo
 *         schema:
 *           type: string
 *           enum: [true, false]
 *         description: Filtrar por situacao da conta
 *       - in: query
 *         name: busca
 *         schema:
 *           type: string
 *         description: Busca parcial (case-insensitive) por nome, email, telefone ou cpf
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *           minimum: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           minimum: 1
 *           maximum: 100
 *         description: Valores fora do intervalo ou invalidos sao ajustados (page<1 vira 1; limit limitado a 1..100)
 *     responses:
 *       200:
 *         description: Lista de usuários com paginação
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 usuarios:
 *                   type: array
 *                   items:
 *                     type: object
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Acesso negado. Apenas administradores.
 */

/**
 * @swagger
 * /api/usuarios/{id}/promover:
 *   patch:
 *     tags:
 *       - Autenticação
 *     summary: Promover usuário a administrador
 *     description: 'Define o tipo do usuário informado como admin. A mudança tem efeito imediato: o papel é lido do banco a cada requisição (não há re-login).'
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do usuário a ser promovido
 *     responses:
 *       200:
 *         description: Usuário promovido (ou já administrador)
 *       400:
 *         description: ID de usuário inválido
 *       401:
 *         description: Token não fornecido ou inválido
 *       403:
 *         description: Acesso negado. Apenas administradores.
 *       404:
 *         description: Usuário não encontrado
 */

/**
 * @swagger
 * /api/usuarios/{id}:
 *   delete:
 *     tags:
 *       - Autenticação
 *     summary: Desativar usuário (soft delete)
 *     description: Define ativo=false; a conta desativada é barrada no middleware de autenticação. Administradores não podem ser desativados (inclui o próprio admin, pois ele também é admin). Chamada idempotente. Os dados pessoais e o histórico (inscrições, avaliações, eventos) permanecem no banco.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do usuário a ser desativado
 *     responses:
 *       200:
 *         description: Usuário desativado com sucesso, ou já estava desativado
 *       400:
 *         description: ID de usuário inválido
 *       401:
 *         description: Token não fornecido ou inválido
 *       403:
 *         description: Apenas administradores executam a rota; administradores não podem ser desativados
 *       404:
 *         description: Usuário não encontrado
 *       500:
 *         description: Erro interno
 */

// ============================================
// EVENTOS
// ============================================

/**
 * @swagger
 * /api/eventos:
 *   get:
 *     tags:
 *       - Eventos
 *     summary: Listar eventos
 *     description: Retorna lista paginada de eventos com filtros. Cada evento da resposta inclui a sua lista de financiadores (nome e tipo).
 *     parameters:
 *       - in: query
 *         name: categoria
 *         schema:
 *           type: string
 *         description: Filtrar por nome da categoria
 *         example: Tecnologia
 *       - in: query
 *         name: cidade
 *         schema:
 *           type: string
 *         description: Filtrar por cidade
 *         example: Cuiabá
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [rascunho, publicado, cancelado, encerrado]
 *           default: publicado
 *       - in: query
 *         name: tipo
 *         schema:
 *           type: string
 *           enum: [presencial, online, hibrido]
 *       - in: query
 *         name: busca
 *         schema:
 *           type: string
 *         description: Buscar por título, descrição, cidade ou nome do local
 *       - in: query
 *         name: proximos
 *         schema:
 *           type: boolean
 *         description: "Quando true, retorna apenas eventos que terminam hoje ou depois (dataFim >= início de hoje no fuso do servidor)"
 *       - in: query
 *         name: ordem
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: "Direção da ordenação por data de início (padrão: mais recentes primeiro)"
 *       - in: query
 *         name: mes
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 12
 *         description: "Filtrar eventos cuja data de início está no mês (1=janeiro … 12=dezembro). Valores fora de 1-12 são ignorados."
 *       - in: query
 *         name: ano
 *         schema:
 *           type: integer
 *         description: "Ano do filtro de mês; padrão é o ano corrente. Só tem efeito junto com mes."
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *           minimum: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           minimum: 1
 *           maximum: 100
 *     responses:
 *       200:
 *         description: Lista de eventos com paginação
 */

/**
 * @swagger
 * /api/eventos/{id}:
 *   get:
 *     tags:
 *       - Eventos
 *     summary: Detalhes do evento
 *     description: Retorna informações completas incluindo programação, avaliações e financiadores
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do evento
 *     responses:
 *       200:
 *         description: Detalhes do evento
 *       404:
 *         description: Evento não encontrado
 */

/**
 * @swagger
 * /api/eventos:
 *   post:
 *     tags:
 *       - Eventos
 *     summary: Criar evento
 *     description: Cria um novo evento. Qualquer usuário autenticado pode criar, mas o evento nasce sempre como rascunho; apenas administradores podem criá-lo já como publicado. Aceita "financiadores" (lista de {nome, tipo}); a resposta devolve o evento com financiadores.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - titulo
 *               - dataInicio
 *               - dataFim
 *               - tipoEvento
 *               - LocalNome
 *               - LocalEndereco
 *               - LocalCidade
 *               - LocalEstado
 *             properties:
 *               titulo:
 *                 type: string
 *                 example: Workshop de Node.js
 *               descricao:
 *                 type: string
 *                 example: Aprenda Node.js do zero ao avançado
 *               categoriaId:
 *                 type: integer
 *                 example: 1
 *               dataInicio:
 *                 type: string
 *                 format: date-time
 *                 example: 2025-12-01T14:00:00Z
 *               dataFim:
 *                 type: string
 *                 format: date-time
 *                 example: 2025-12-01T18:00:00Z
 *               horarioAbertura:
 *                 type: string
 *                 example: 13:30:00
 *               horarioEncerramento:
 *                 type: string
 *                 example: 18:30:00
 *               capacidadeMaxima:
 *                 type: integer
 *                 example: 50
 *               valorInscricao:
 *                 type: number
 *                 example: 0
 *               tipoEvento:
 *                 type: string
 *                 enum: [presencial, online, hibrido]
 *               linkOnline:
 *                 type: string
 *                 example: https://meet.google.com/abc-defg-hij
 *               linkGoogleMaps:
 *                 type: string
 *                 example: https://maps.app.goo.gl/exemplo
 *                 description: Link do Google Maps para o local do evento
 *               linkPaginaEvento:
 *                 type: string
 *                 example: https://meuevento.com.br
 *                 description: Link da página do evento
 *               LocalNome:
 *                 type: string
 *                 example: Centro de Eventos do Pantanal
 *               LocalEndereco:
 *                 type: string
 *                 example: Av. Bernardo Antônio de Oliveira Neto
 *               LocalNumero:
 *                 type: string
 *                 example: 500
 *               LocalComplemento:
 *                 type: string
 *                 example: Centro de Convenções
 *               LocalBairro:
 *                 type: string
 *                 example: Centro Político Administrativo
 *               LocalCidade:
 *                 type: string
 *                 example: Cuiabá
 *               LocalEstado:
 *                 type: string
 *                 example: MT
 *               LocalCep:
 *                 type: string
 *                 example: 78049-900
 *               LocalPais:
 *                 type: string
 *                 default: Brasil
 *               LocalCapacidade:
 *                 type: integer
 *                 example: 800
 *               LocalLatitude:
 *                 type: number
 *                 format: double
 *                 example: -15.601
 *               LocalLongitude:
 *                 type: number
 *                 format: double
 *                 example: -56.0974
 *               LocalObservacoes:
 *                 type: string
 *               imagemCapa:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [rascunho, publicado]
 *                 default: rascunho
 *                 description: Não-admin sempre cria como rascunho, mesmo enviando publicado. Apenas admin pode criar como publicado.
 *               publicoAlvo:
 *                 type: string
 *               requisitos:
 *                 type: string
 *               financiadores:
 *                 type: array
 *                 maxItems: 20
 *                 description: Lista de financiadores do evento. Cada item exige "nome"; "tipo" é opcional (publico, privado ou hibrido). A resposta devolve o evento com financiadores.
 *                 items:
 *                   type: object
 *                   required:
 *                     - nome
 *                   properties:
 *                     nome:
 *                       type: string
 *                       maxLength: 150
 *                       example: Governo do Estado de Mato Grosso
 *                     tipo:
 *                       type: string
 *                       enum: [publico, privado, hibrido]
 *     responses:
 *       201:
 *         description: Evento criado com sucesso
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão
 */

/**
 * @swagger
 * /api/eventos/{id}:
 *   put:
 *     tags:
 *       - Eventos
 *     summary: Atualizar evento
 *     description: 'Atualiza informações de um evento (dono do evento ou admin). Apenas administradores podem mudar o status para publicado; os demais ficam restritos a rascunho/cancelado/encerrado. Aceita "motivoCancelamento" (opcional, máx. 1000 caracteres), limpo automaticamente quando o evento deixa de estar cancelado. Aceita "financiadores" (lista de {nome, tipo}); enviar o array substitui todos os financiadores do evento, omitir a chave mantém os atuais. Campos que não são colunas do evento (ex.: objeto completo do GET com categoria/organizador/_count) são ignorados; categoriaId, datas, horários e números podem vir como string e são convertidos. Campos não reconhecidos retornam 400; em NODE_ENV=development a resposta de erro traz o campo detalhe com a mensagem crua.'
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               titulo:
 *                 type: string
 *               descricao:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [rascunho, publicado, cancelado, encerrado]
 *               motivoCancelamento:
 *                 type: string
 *                 maxLength: 1000
 *                 description: Motivo do cancelamento. Opcional; exibido quando o status do evento é "cancelado" e limpo automaticamente ao reativar.
 *               linkGoogleMaps:
 *                 type: string
 *                 description: Link do Google Maps
 *               linkPaginaEvento:
 *                 type: string
 *                 description: Link da página do evento
 *               LocalNome:
 *                 type: string
 *               LocalEndereco:
 *                 type: string
 *               LocalCidade:
 *                 type: string
 *               LocalEstado:
 *                 type: string
 *               LocalLatitude:
 *                 type: number
 *               LocalLongitude:
 *                 type: number
 *               financiadores:
 *                 type: array
 *                 maxItems: 20
 *                 description: Lista de financiadores do evento. Enviar o array substitui todos os financiadores existentes; omitir a chave mantém os atuais. Cada item exige "nome"; "tipo" é opcional (publico, privado ou hibrido).
 *                 items:
 *                   type: object
 *                   required:
 *                     - nome
 *                   properties:
 *                     nome:
 *                       type: string
 *                       maxLength: 150
 *                       example: Governo do Estado de Mato Grosso
 *                     tipo:
 *                       type: string
 *                       enum: [publico, privado, hibrido]
 *     responses:
 *       200:
 *         description: Evento atualizado
 *       400:
 *         description: Dados inválidos (validação, referência inexistente ou motivo de cancelamento)
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Evento não encontrado
 *       409:
 *         description: Registro duplicado
 */

/**
 * @swagger
 * /api/eventos/{id}:
 *   delete:
 *     tags:
 *       - Eventos
 *     summary: Deletar evento
 *     description: Remove um evento (apenas o dono do evento ou admin; não permite se tiver inscrições)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Evento deletado
 *       400:
 *         description: Evento com inscrições não pode ser deletado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Evento não encontrado
 */

/**
 * @swagger
 * /api/meus-eventos:
 *   get:
 *     tags:
 *       - Eventos
 *     summary: Meus eventos
 *     description: Lista paginada de eventos criados pelo usuário autenticado
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *           minimum: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           minimum: 1
 *           maximum: 100
 *     responses:
 *       200:
 *         description: Lista de eventos do usuário com paginação
 *       401:
 *         description: Não autenticado
 */

/**
 * @swagger
 * /api/eventos/destaque:
 *   get:
 *     tags:
 *       - Eventos
 *     summary: Eventos em destaque
 *     description: Retorna eventos marcados como destaque e publicados
 *     responses:
 *       200:
 *         description: Lista de eventos em destaque (máximo 6)
 */

/**
 * @swagger
 * /api/eventos/por-cidade:
 *   get:
 *     tags:
 *       - Eventos
 *     summary: Eventos agrupados por cidade
 *     description: Retorna contagem de eventos publicados por cidade
 *     responses:
 *       200:
 *         description: Lista de cidades com contagem de eventos
 */

// ============================================
// INSCRIÇÕES
// ============================================

/**
 * @swagger
 * /api/inscricoes:
 *   post:
 *     tags:
 *       - Inscrições
 *     summary: Fazer inscrição em evento
 *     description: Inscreve o usuário autenticado em um evento
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - eventoId
 *             properties:
 *               eventoId:
 *                 type: integer
 *                 example: 1
 *     responses:
 *       201:
 *         description: Inscrição realizada com sucesso
 *       400:
 *         description: Erro (já inscrito, sem vagas, evento iniciado)
 *       404:
 *         description: Evento não encontrado
 */

/**
 * @swagger
 * /api/minhas-inscricoes:
 *   get:
 *     tags:
 *       - Inscrições
 *     summary: Minhas inscrições
 *     description: Lista todas as inscrições do usuário autenticado
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [confirmada, pendente, cancelada, lista_espera]
 *     responses:
 *       200:
 *         description: Lista de inscrições
 */

/**
 * @swagger
 * /api/inscricoes/{id}:
 *   get:
 *     tags:
 *       - Inscrições
 *     summary: Detalhes da inscrição
 *     description: Retorna informações detalhadas de uma inscrição
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Detalhes da inscrição
 *       404:
 *         description: Inscrição não encontrada
 */

/**
 * @swagger
 * /api/inscricoes/{id}:
 *   delete:
 *     tags:
 *       - Inscrições
 *     summary: Cancelar inscrição
 *     description: Cancela uma inscrição (não permite eventos já iniciados)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Inscrição cancelada
 *       400:
 *         description: Não pode cancelar (evento iniciado ou já cancelada)
 *       404:
 *         description: Inscrição não encontrada
 */

/**
 * @swagger
 * /api/inscricoes/{id}/presenca:
 *   patch:
 *     tags:
 *       - Inscrições
 *     summary: Confirmar presença
 *     description: Confirma presença de participante (apenas o dono do evento ou admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Presença confirmada
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Inscrição não encontrada
 */

// ============================================
// CATEGORIAS
// ============================================

/**
 * @swagger
 * /api/categorias:
 *   get:
 *     tags:
 *       - Categorias
 *     summary: Listar categorias
 *     description: Retorna todas as categorias ativas
 *     responses:
 *       200:
 *         description: Lista de categorias
 */

/**
 * @swagger
 * /api/categorias:
 *   post:
 *     tags:
 *       - Categorias
 *     summary: Criar categoria
 *     description: Cria uma nova categoria (apenas admins)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nome
 *             properties:
 *               nome:
 *                 type: string
 *                 example: Marketing Digital
 *               descricao:
 *                 type: string
 *               icone:
 *                 type: string
 *               cor:
 *                 type: string
 *                 example: bg-blue-600
 *     responses:
 *       201:
 *         description: Categoria criada
 *       400:
 *         description: Categoria já existe
 *       403:
 *         description: Apenas administradores
 */

/**
 * @swagger
 * /api/categorias/{id}:
 *   put:
 *     tags:
 *       - Categorias
 *     summary: Atualizar categoria
 *     description: Atualiza informações de uma categoria (apenas admins)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nome:
 *                 type: string
 *               descricao:
 *                 type: string
 *               icone:
 *                 type: string
 *               cor:
 *                 type: string
 *     responses:
 *       200:
 *         description: Categoria atualizada
 *       400:
 *         description: Categoria não pode ser atualizada
 *       403:
 *         description: Apenas administradores
 */

/**
 * @swagger
 * /api/categorias/{id}:
 *   delete:
 *     tags:
 *       - Categorias
 *     summary: Apagar categoria
 *     description: Apaga uma categoria (apenas admins)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Categoria apagada
 *       400:
 *         description: Categoria não pode ser apagada
 *       403:
 *         description: Apenas administradores
 */

// ============================================
// LOCAIS
// ============================================

/**
 * @swagger
 * /api/locais:
 *   get:
 *     tags:
 *       - Locais
 *     summary: Listar locais
 *     description: Retorna os locais de eventos, com contagem de eventos de cada local. Permite filtro por cidade e estado.
 *     parameters:
 *       - in: query
 *         name: cidade
 *         schema:
 *           type: string
 *         description: Filtrar por cidade (correspondência exata)
 *         example: Cuiabá
 *       - in: query
 *         name: estado
 *         schema:
 *           type: string
 *         description: Filtrar por estado (correspondência exata)
 *         example: MT
 *     responses:
 *       200:
 *         description: Lista de locais com contagem de eventos
 *   post:
 *     tags:
 *       - Locais
 *     summary: Criar local
 *     description: Cria um novo local de evento (apenas organizadores e admins)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nome
 *               - endereco
 *               - cidade
 *               - estado
 *             properties:
 *               nome:
 *                 type: string
 *                 example: Centro de Eventos do Pantanal
 *               endereco:
 *                 type: string
 *                 example: Av. Bernardo Antônio de Oliveira Neto
 *               numero:
 *                 type: string
 *                 example: "500"
 *               complemento:
 *                 type: string
 *               bairro:
 *                 type: string
 *               cidade:
 *                 type: string
 *                 example: Cuiabá
 *               estado:
 *                 type: string
 *                 example: MT
 *               cep:
 *                 type: string
 *                 example: 78049-900
 *               pais:
 *                 type: string
 *                 default: Brasil
 *               capacidade:
 *                 type: integer
 *                 example: 800
 *               latitude:
 *                 type: number
 *                 format: double
 *               longitude:
 *                 type: number
 *                 format: double
 *               observacoes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Local criado com sucesso
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão (requer organizador ou admin)
 */

// ============================================
// AVALIAÇÕES
// ============================================

/**
 * @swagger
 * /api/avaliacoes:
 *   post:
 *     tags:
 *       - Avaliações
 *     summary: Avaliar evento
 *     description: Cria avaliação (apenas participantes confirmados)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - eventoId
 *               - nota
 *             properties:
 *               eventoId:
 *                 type: integer
 *                 example: 1
 *               nota:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *                 example: 5
 *               comentario:
 *                 type: string
 *                 example: Evento excelente!
 *     responses:
 *       201:
 *         description: Avaliação criada
 *       400:
 *         description: Erro (já avaliou, não participou, nota inválida)
 */

/**
 * @swagger
 * /api/eventos/{eventoId}/avaliacoes:
 *   get:
 *     tags:
 *       - Avaliações
 *     summary: Listar avaliações do evento
 *     description: Retorna todas as avaliações com estatísticas
 *     parameters:
 *       - in: path
 *         name: eventoId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Lista de avaliações com média
 */

// ============================================
// NOTIFICAÇÕES
// ============================================

/**
 * @swagger
 * /api/notificacoes:
 *   get:
 *     tags:
 *       - Notificações
 *     summary: Listar notificações
 *     description: Retorna notificações do usuário
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: lida
 *         schema:
 *           type: boolean
 *         example: false
 *     responses:
 *       200:
 *         description: Lista de notificações
 */

/**
 * @swagger
 * /api/notificacoes/{id}/lida:
 *   patch:
 *     tags:
 *       - Notificações
 *     summary: Marcar como lida
 *     description: Marca uma notificação como lida
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Notificação marcada como lida
 *       404:
 *         description: Notificação não encontrada
 */

/**
 * @swagger
 * /api/notificacoes/marcar-todas-lidas:
 *   patch:
 *     tags:
 *       - Notificações
 *     summary: Marcar todas como lidas
 *     description: Marca todas as notificações do usuário como lidas
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Todas marcadas como lidas
 */
