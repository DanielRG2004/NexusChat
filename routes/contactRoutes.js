const express = require('express');
const router = express.Router();
const contactController = require('../controllers/contactController');
const authMiddleware = require('../middleware/auth');

// All contact routes require authentication
router.use(authMiddleware);

// IMPORTANTE: Las rutas específicas DEBEN ir ANTES de las rutas con parámetros

// Buscar usuario por teléfono (ruta específica)
router.get('/find-by-phone/:phone', contactController.findUserByPhone);

// Buscar usuarios por nombre/email (ruta específica)
router.get('/search', contactController.searchUsers);

// Verificar si un usuario es contacto (ruta específica)
router.get('/check/:usuario_id/:contacto_id', contactController.checkIsContact);

// Obtener todos los contactos de un usuario
router.get('/:usuario_id', contactController.getContacts);

// Agregar un nuevo contacto
router.post('/', contactController.addContact);

module.exports = router;