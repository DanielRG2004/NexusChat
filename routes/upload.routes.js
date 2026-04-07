const express = require('express');
const router = express.Router();

const { requireAuth } = require('../middleware/auth');
const { uploadGroupImage } = require('../middleware/upload.middleware');
const { toPublicGroupImagePath } = require('../services/upload.service');

router.post(
  '/group-image',
  requireAuth,
  uploadGroupImage.single('image'),
  (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          ok: false,
          message: 'No se recibio ninguna imagen'
        });
      }

      const baseUrl =
        process.env.PUBLIC_BASE_URL ||
        `${req.protocol}://${req.get('host')}`;

      const publicPath = toPublicGroupImagePath(req.file.filename);
      const url = `${baseUrl}${publicPath}`;

      return res.status(201).json({
        ok: true,
        message: 'Imagen subida correctamente',
        url,
        filename: req.file.filename
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        message: 'No se pudo subir la imagen'
      });
    }
  }
);

module.exports = router;