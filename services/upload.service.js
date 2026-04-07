const fs = require('fs').promises;
const path = require('path');

const uploadRoot = path.resolve(process.cwd(), 'uploads');
const groupsUploadDir = path.join(uploadRoot, 'groups');

async function ensureGroupUploadDir() {
  await fs.mkdir(groupsUploadDir, { recursive: true });
}

function toPublicGroupImagePath(filename) {
  return `/uploads/groups/${filename}`;
}

module.exports = {
  uploadRoot,
  groupsUploadDir,
  ensureGroupUploadDir,
  toPublicGroupImagePath
};