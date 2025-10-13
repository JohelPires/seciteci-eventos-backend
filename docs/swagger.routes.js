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
 *     description: Locais onde eventos acontecem
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
 * /api/auth/register:
 *   post:
 *     tags:
 *       - Autenticação
 *     summary: Registrar novo usuário
 *     description: Cria uma nova conta de usuário no sistema
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nome
 *               - email
 *               - senha
 *             properties:
 *               nome:
 *                 type: string
 *                 example: João Silva
 *               email:
 *                 type: string
 *                 format: email
 *                 example: joao@email.com
 *               senha:
 *                 type: string
 *                 format: password
 *                 minLength: 6
 *                 example: senha123
 *               telefone:
 *                 type: string
 *                 example: (11) 98765-4321
 *               cpf:
 *                 type: string
 *                 example: 123.456.789-00
 *               dataNascimento:
 *                 type: string
 *                 format: date
 *                 example: 1990-05-15
 *               tipoUsuario:
 *                 type: string
 *                 enum: [participante, organizador, admin]
 *                 default: participante
 *     responses:
 *       201:
 *         description: Usuário cadastrado com sucesso
 *       400:
 *         description: Email ou CPF já cadastrado
 */

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     tags:
 *       - Autenticação
 *     summary: Fazer login
 *     description: Autentica usuário e retorna token JWT válido por 7 dias
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - senha
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: admin@eventos.com
 *               senha:
 *                 type: string
 *                 format: password
 *                 example: admin123
 *     responses:
 *       200:
 *         description: Login realizado com sucesso
 *       401:
 *         description: Credenciais inválidas
 */

/**
 * @swagger
 * /api/auth/profile:
 *   get:
 *     tags:
 *       - Autenticação
 *     summary: Obter perfil do usuário
 *     description: Retorna informações completas do usuário autenticado
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Perfil do usuário
 *       401:
 *         description: Token não fornecido ou inválido
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
 *     description: Retorna lista paginada de eventos com filtros
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
 *         description: Buscar por título ou descrição
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
 *     description: Retorna informações completas incluindo programação e avaliações
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
 *     description: Cria um novo evento (apenas organizadores e admins)
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
 *               localId:
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
 *               tipoEvento:
 *                 type: string
 *                 enum: [presencial, online, hibrido]
 *               linkOnline:
 *                 type: string
 *                 example: https://meet.google.com/abc-defg-hij
 *               imagemCapa:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [rascunho, publicado]
 *                 default: rascunho
 *               publicoAlvo:
 *                 type: string
 *               requisitos:
 *                 type: string
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
 *     description: Atualiza informações de um evento (apenas organizador ou admin)
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
 *     responses:
 *       200:
 *         description: Evento atualizado
 *       403:
 *         description: Sem permissão
 *       404:
 *         description: Evento não encontrado
 */

/**
 * @swagger
 * /api/eventos/{id}:
 *   delete:
 *     tags:
 *       - Eventos
 *     summary: Deletar evento
 *     description: Remove um evento (não permite se tiver inscrições)
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
 *     description: Lista eventos criados pelo organizador autenticado
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de eventos do organizador
 *       403:
 *         description: Apenas organizadores e admins
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
 *     description: Confirma presença de participante (apenas organizador ou admin)
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
 *                 example: #ff0000
 *     responses:
 *       201:
 *         description: Categoria criada
 *       400:
 *         description: Categoria já existe
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
 *     description: Retorna todos os locais cadastrados
 *     parameters:
 *       - in: query
 *         name: cidade
 *         schema:
 *           type: string
 *       - in: query
 *         name: estado
 *         schema:
 *           type: string
 *         example: SP
 *     responses:
 *       200:
 *         description: Lista de locais
 */

/**
 * @swagger
 * /api/locais:
 *   post:
 *     tags:
 *       - Locais
 *     summary: Criar local
 *     description: Cadastra um novo local (organizadores e admins)
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
 *                 example: Auditório Principal
 *               endereco:
 *                 type: string
 *                 example: Av. Paulista
 *               numero:
 *                 type: string
 *                 example: 1000
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
 *               capacidade:
 *                 type: integer
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *     responses:
 *       201:
 *         description: Local criado
 *       403:
 *         description: Sem permissão
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
