const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const adminController = require('../controllers/adminController');

// Middleware para verificar que el usuario es administrador
function requireAdmin(req, res, next) {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ ok: false, message: 'Acceso denegado. Se requiere rol de administrador.' });
  }
  next();
}

// Todas las rutas requieren autenticación y ser admin
router.use(requireAuth);
router.use(requireAdmin);

// Dashboard
router.get('/dashboard', adminController.getDashboardStats);

// Usuarios
router.get('/users', adminController.getAllUsers);
router.put('/users/:userId/status', adminController.updateUserStatus);
router.delete('/users/:userId', adminController.deleteUser);

// Grupos
router.get('/groups', adminController.getAllGroups);
router.put('/groups/:groupId/status', adminController.updateGroupStatus);
router.delete('/groups/:groupId', adminController.deleteGroup);

// Configuración
router.get('/settings', adminController.getSettings);
router.put('/settings', adminController.updateSettings);

// Mensajes (moderación)
router.get('/messages', adminController.getAllMessages);

module.exports = router;