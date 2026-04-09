const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/auth');
const emailAuthController = require('../controllers/emailAuthController');

router.get('/health', emailAuthController.health);

router.post('/request-code', emailAuthController.requestCode);
router.post('/verify-code', emailAuthController.verifyCode);
router.post('/complete-registration', emailAuthController.completeRegistration);
router.post('/login', emailAuthController.login);

router.get('/me', authMiddleware, emailAuthController.getMe);
router.put('/me', authMiddleware, emailAuthController.updateProfile);

module.exports = router;