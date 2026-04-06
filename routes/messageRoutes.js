const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// Obtener mensajes
router.get('/:conversationId', messageController.getMessages);

// Enviar mensaje
router.post('/', messageController.sendMessage);

// Eliminar mensaje individual
router.delete('/:messageId', messageController.deleteMessage);

// Eliminar historial completo de conversación
router.delete('/history/:conversationId', messageController.deleteChatHistory);

module.exports = router;