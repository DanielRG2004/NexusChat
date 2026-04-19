const express = require('express');
const router = express.Router();

const { requireAuth } = require('../middleware/auth');
const { uploadGroupImage, uploadMessageMedia } = require('../middleware/upload.middleware');
const { toPublicGroupImagePath, toPublicMessageMediaPath } = require('../services/upload.service');

router.post(
  '/group-image',
  requireAuth,
  uploadGroupImage.single('image'),
  (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ ok: false, message: 'No se recibió ninguna imagen' });
      }
      const baseUrl = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
      const publicPath = toPublicGroupImagePath(req.file.filename);
      const url = `${baseUrl}${publicPath}`;
      return res.status(201).json({ ok: true, url, filename: req.file.filename });
    } catch {
      return res.status(500).json({ ok: false, message: 'No se pudo subir la imagen' });
    }
  }
);

router.post(
  '/message-media',
  requireAuth,
  uploadMessageMedia.single('file'),
  (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ ok: false, message: 'No se recibió ningún archivo' });
      }
      const baseUrl = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
      const publicPath = toPublicMessageMediaPath(req.file.filename);
      const url = `${baseUrl}${publicPath}`;
      return res.status(201).json({
        ok: true,
        url,
        filename: req.file.filename,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size
      });
    } catch {
      return res.status(500).json({ ok: false, message: 'No se pudo subir el archivo' });
    }
  }
);

module.exports = router;