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
  removeMember
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

module.exports = router;