const express = require('express')
const router = express.Router()
const { authMiddleware, isOrganizador, isAdmin } = require('../middleware/auth')
const { registerValidator, loginValidator, eventoValidator, inscricaoValidator } = require('../middleware/validators')

const authController = require('../controllers/authController')
const eventosController = require('../controllers/eventosController')
const inscricoesController = require('../controllers/inscricoesController')
const categoriasController = require('../controllers/categoriasController')
const locaisController = require('../controllers/locaisController')
const avaliacoesController = require('../controllers/avaliacoesController')
const notificacoesController = require('../controllers/notificacoesController')
const usuariosController = require('../controllers/usuariosController')

// ===== ROTAS PÚBLICAS =====

router.post('/auth/register', registerValidator, authController.register)

router.post('/auth/login', loginValidator, authController.login)

// Eventos públicos

router.get('/eventos', eventosController.getEventos)

router.get('/eventos/:id', eventosController.getEventoById)

// Categorias e Locais públicos

router.get('/categorias', categoriasController.getCategorias)

router.get('/locais', locaisController.getLocais)

// Avaliações públicas
router.get('/eventos/:eventoId/avaliacoes', avaliacoesController.getAvaliacoesEvento)

// ===== ROTAS PROTEGIDAS - USUÁRIOS =====
router.get('/auth/profile', authMiddleware, authController.getProfile)

router.get('/usuarios', authMiddleware, isAdmin, usuariosController.getUsuarios)

router.patch('/usuarios/:id/promover', authMiddleware, isAdmin, usuariosController.promoverUsuarioAdmin)

// ===== ROTAS PROTEGIDAS - EVENTOS =====

// router.post('/eventos', authMiddleware, isOrganizador, eventoValidator, eventosController.createEvento)
router.post('/eventos', authMiddleware, eventoValidator, eventosController.createEvento)
router.put('/eventos/:id', authMiddleware, eventosController.updateEvento)
router.delete('/eventos/:id', authMiddleware, eventosController.deleteEvento)
router.get('/meus-eventos', authMiddleware, eventosController.getMeusEventos)

// ===== ROTAS PROTEGIDAS - INSCRIÇÕES =====

router.post('/inscricoes', authMiddleware, inscricaoValidator, inscricoesController.createInscricao)

router.get('/minhas-inscricoes', authMiddleware, inscricoesController.getMinhasInscricoes)
router.get('/inscricoes/:id', authMiddleware, inscricoesController.getInscricaoById)
router.delete('/inscricoes/:id', authMiddleware, inscricoesController.cancelarInscricao)
router.patch('/inscricoes/:id/presenca', authMiddleware, inscricoesController.confirmarPresenca)

// ===== ROTAS PROTEGIDAS - AVALIAÇÕES =====
router.post('/avaliacoes', authMiddleware, avaliacoesController.createAvaliacao)

// ===== ROTAS PROTEGIDAS - NOTIFICAÇÕES =====
router.get('/notificacoes', authMiddleware, notificacoesController.getNotificacoes)
router.patch('/notificacoes/:id/lida', authMiddleware, notificacoesController.marcarComoLida)
router.patch('/notificacoes/marcar-todas-lidas', authMiddleware, notificacoesController.marcarTodasComoLidas)

// ===== ROTAS ADMIN - CATEGORIAS E LOCAIS =====

router.post('/categorias', authMiddleware, isAdmin, categoriasController.createCategoria)

router.put('/categorias/:id', authMiddleware, isAdmin, categoriasController.updateCategoria)
router.delete('/categorias/:id', authMiddleware, isAdmin, categoriasController.deleteCategoria)

router.post('/locais', authMiddleware, isOrganizador, locaisController.createLocal)

module.exports = router
