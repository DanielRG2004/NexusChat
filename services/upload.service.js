const fs = require('fs').promises;
const path = require('path');

const uploadRoot = path.resolve(process.cwd(), 'uploads');
const groupsUploadDir = path.join(uploadRoot, 'groups');
const messagesUploadDir = path.join(uploadRoot, 'messages');

async function ensureGroupUploadDir() {
  await fs.mkdir(groupsUploadDir, { recursive: true });
}
async function ensureMessageUploadDir() {
  await fs.mkdir(messagesUploadDir, { recursive: true });
}

function toPublicGroupImagePath(filename) {
  return `/uploads/groups/${filename}`;
}
function toPublicMessageMediaPath(filename) {
  return `/uploads/messages/${filename}`;
}

module.exports = {
  uploadRoot,
  groupsUploadDir,
  messagesUploadDir,
  ensureGroupUploadDir,
  ensureMessageUploadDir,
  toPublicGroupImagePath,
  toPublicMessageMediaPath
};