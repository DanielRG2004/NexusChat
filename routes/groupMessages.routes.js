const express = require('express');
const router = express.Router();

const { requireAuth } = require('../middleware/auth');
const {
  getGroupMessages,
  sendGroupMessage
} = require('../controllers/groupMessages.controller');

router.use(requireAuth);

router.get('/:groupId/messages', getGroupMessages);
router.post('/:groupId/messages', sendGroupMessage);

module.exports = router;