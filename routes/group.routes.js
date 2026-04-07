const express = require('express');
const router = express.Router();

const { requireAuth } = require('../middleware/auth');
const {
  searchUsers,
  createGroup,
  myGroups,
  getGroupById,
  updateGroup,
  addMembers,
  updateMember,
  removeMember,
  getGroupMessages,
  sendGroupMessage
} = require('../controllers/groups.controller');

router.use(requireAuth);

router.get('/users/search', searchUsers);
router.get('/mine', myGroups);
router.post('/', createGroup);
router.get('/:groupId', getGroupById);
router.patch('/:groupId', updateGroup);
router.post('/:groupId/members', addMembers);
router.patch('/:groupId/members/:userId', updateMember);
router.delete('/:groupId/members/:userId', removeMember);
router.get('/:groupId/messages', getGroupMessages);
router.post('/:groupId/messages', sendGroupMessage);

module.exports = router;