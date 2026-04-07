const express = require('express');
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

router.get('/health', authController.health);

router.get('/users', authController.getUsers);
router.post('/fake-login', authController.fakeLogin);
router.post('/register', authController.register);
router.post('/login', authController.login);

router.post('/request-code', authController.requestCode);
router.post('/verify-code', authController.verifyCode);
router.post('/complete-registration', authController.completeRegistration);

router.get('/me', authMiddleware, authController.getMe);
router.put('/me', authMiddleware, authController.updateProfile);

module.exports = router;