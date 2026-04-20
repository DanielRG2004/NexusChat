const express = require('express');
const router = express.Router();
const uploadController = require('../controllers/uploadController');
const authMiddleware = require('../middleware/auth');
const multer = require('multer');

const upload = multer({ dest: 'uploads/' });

router.use(authMiddleware);

// Subir archivo
router.post('/upload', upload.single('file'), uploadController.uploadFile);

// Obtener archivo
router.get('/file/:filename', uploadController.getFile);

module.exports = router;