const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const {
  ensureGroupUploadDir,
  groupsUploadDir
} = require('../services/upload.service');

const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif'
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    ensureGroupUploadDir()
      .then(() => cb(null, groupsUploadDir))
      .catch(err => cb(err));
  },
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '').toLowerCase();
    const safeExt = ext && ext.length <= 5 ? ext : '.jpg';
    const randomPart = crypto.randomBytes(8).toString('hex');
    cb(null, `${Date.now()}-${randomPart}${safeExt}`);
  }
});

const uploadGroupImage = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      return cb(new Error('Solo se permiten imagenes JPG, PNG, WEBP o GIF'));
    }
    cb(null, true);
  }
});

module.exports = {
  uploadGroupImage
};