const crypto = require('crypto');

function generateVerificationCode(length = 6) {
  const max = 10 ** length;
  return String(crypto.randomInt(0, max)).padStart(length, '0');
}

function getVerificationSecret() {
  return process.env.VERIFICATION_CODE_SECRET || process.env.JWT_SECRET || 'nexuschat_verification_secret';
}

function hashVerificationCode(code) {
  const secret = getVerificationSecret();
  return crypto.createHash('sha256').update(`${String(code).trim()}|${secret}`).digest('hex');
}

function verifyVerificationCode(code, hashedCode) {
  if (!code || !hashedCode) return false;
  return hashVerificationCode(code) === hashedCode;
}

module.exports = {
  generateVerificationCode,
  hashVerificationCode,
  verifyVerificationCode
};