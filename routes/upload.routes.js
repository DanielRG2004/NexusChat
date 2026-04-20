const express = require('express');
const router = express.Router();

const { requireAuth } = require('../middleware/auth');
const { uploadGroupImage, uploadMessageMedia } = require('../middleware/upload.middleware');
const uploadController = require('../controllers/uploadController');

// Subir imagen de grupo
router.post(
  '/group-image',
  requireAuth,
  uploadGroupImage.single('image'),
  uploadController.uploadGroupImage
);

// Subir media de mensaje
router.post(
  '/message-media',
  requireAuth,
  uploadMessageMedia.single('file'),
  uploadController.uploadMessageMedia
);

// Obtener archivo
router.get('/file/:filename', uploadController.getFile);

module.exports = router;