const express = require('express');
const router = express.Router();
const storyController = require('../controllers/storyController');
const authMiddleware = require('../middleware/auth');
const { uploadMessageMedia } = require('../middleware/upload.middleware');

router.use(authMiddleware);

// Obtener estados de contactos
router.get('/', storyController.getStories);

// Obtener mi propio estado
router.get('/me', storyController.getMyStory);

// Crear estado (con soporte de archivo)
router.post('/', uploadMessageMedia.single('file'), storyController.createStory);

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