const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const authMiddleware = require('../middleware/auth');

// All chat routes require authentication
router.use(authMiddleware);

// Get all conversations (excluye archivados)
router.get('/', chatController.getConversations);

// Get archived conversations
router.get('/archived', chatController.getArchivedConversations);

// Get conversations with contact status
router.get('/with-contacts', chatController.getAllConversationsWithUnknown);

// Create private conversation
router.post('/private', chatController.createPrivateConversation);

// Archive conversation
router.put('/:conversationId/archive', chatController.archiveConversation);

// Unarchive conversation
router.put('/:conversationId/unarchive', chatController.unarchiveConversation);

// Pin conversation
router.put('/:conversationId/pin', chatController.pinConversation);

module.exports = router;