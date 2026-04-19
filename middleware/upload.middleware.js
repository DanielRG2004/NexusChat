const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const uploadRoot = path.resolve(process.cwd(), 'uploads');
const groupsUploadDir = path.join(uploadRoot, 'groups');
const messagesUploadDir = path.join(uploadRoot, 'messages');

// Crear carpetas si no existen
[groupsUploadDir, messagesUploadDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Configuración para imágenes de grupo
const groupImageStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, groupsUploadDir),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const imageFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  cb(null, allowed.includes(file.mimetype));
};

const uploadGroupImage = multer({
  storage: groupImageStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: imageFilter
});

// Configuración para archivos multimedia de mensajes
const messageMediaStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, messagesUploadDir),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const mediaFilter = (req, file, cb) => {
  const allowed = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'video/mp4', 'video/quicktime', 'video/x-msvideo',
    'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/mp4',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip', 'application/x-rar-compressed',
    'text/plain'
  ];
  cb(null, allowed.includes(file.mimetype));
};

const uploadMessageMedia = multer({
  storage: messageMediaStorage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: mediaFilter
});

module.exports = { uploadGroupImage, uploadMessageMedia };