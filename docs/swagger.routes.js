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
 *                 enum: [participante]
 *                 default: participante
 *                 description: O cadastro público cria sempre um participante. Promoção a admin é feita via /api/usuarios/{id}/promover.
 *     responses:
 *       201:
 *         description: Usuário cadastrado com sucesso (tipoUsuario sempre participante)
 *       400:
 *         description: Email ou CPF já cadastrado, ou tipoUsuario inválido
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

/**
 * @swagger
 * /api/auth/senha:
 *   patch:
 *     tags:
 *       - Autenticação
 *     summary: Alterar senha do usuário autenticado
 *     description: Altera a senha do próprio usuário, exigindo a senha atual
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - senhaAtual
 *               - novaSenha
 *             properties:
 *               senhaAtual:
 *                 type: string
 *                 format: password
 *                 example: senha123
 *               novaSenha:
 *                 type: string
 *                 format: password
 *                 minLength: 6
 *                 example: novaSenha456
 *     responses:
 *       200:
 *         description: Senha alterada com sucesso
 *       400:
 *         description: Dados inválidos (nova senha curta ou igual à atual)
 *       401:
 *         description: Não autenticado ou senha atual incorreta
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
 *     description: Retorna lista paginada de usuários
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de usuários
 */

/**
 * @swagger
 * /api/usuarios/{id}/promover:
 *   patch:
 *     tags:
 *       - Autenticação
 *     summary: Promover usuário a administrador
 *     description: Define o tipo do usuário informado como admin. A mudança passa a valer a partir do próximo login do usuário, pois o tipo é embutido no token JWT.
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
 *         description: Buscar por título, descrição, cidade ou nome do local
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
 *     description: Cria um novo evento. Qualquer usuário autenticado pode criar, mas o evento nasce sempre como rascunho; apenas administradores podem criá-lo já como publicado.
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
 *               financiadorTipo:
 *                 type: string
 *                 enum: [publico, privado]
 *                 description: Natureza do financiador do evento
 *               financiadorNome:
 *                 type: string
 *                 example: Governo do Estado de Mato Grosso
 *                 description: Nome do financiador do evento
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
 *     description: Atualiza informações de um evento (dono do evento ou admin). Apenas administradores podem mudar o status para publicado; os demais ficam restritos a rascunho/cancelado/encerrado.
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
 *               financiadorTipo:
 *                 type: string
 *                 enum: [publico, privado]
 *                 description: Natureza do financiador do evento
 *               financiadorNome:
 *                 type: string
 *                 description: Nome do financiador do evento
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
 *     description: Lista eventos criados pelo usuário autenticado
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de eventos do usuário
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
