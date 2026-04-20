const express = require('express');
const router = express.Router();
const storyController = require('../controllers/storyController');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// Obtener estados
router.get('/', storyController.getStories);

// Obtener mi estado
router.get('/me', storyController.getMyStory);

// Crear estado
router.post('/', storyController.createStory);

// Marcar como visto
router.post('/:storyId/view', storyController.viewStory);

// Silenciar estados de un usuario
router.post('/mute', storyController.muteUserStories);

// Dejar de silenciar
router.delete('/mute/:silenciado_id', storyController.unmuteUserStories);

// Eliminar estado
router.delete('/:storyId', storyController.deleteStory);

router.get('/:storyId/views', storyController.getStoryViews);

module.exports = router;