const twilio = require('twilio');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

if (!accountSid || !authToken || !verifyServiceSid) {
  throw new Error('Faltan credenciales de Twilio en el archivo .env');
}

const client = twilio(accountSid, authToken);

async function sendVerificationCodeSms(to) {
  return client.verify.v2
    .services(verifyServiceSid)
    .verifications.create({
      to,
      channel: 'sms'
    });
}

async function checkVerificationCode(to, code) {
  return client.verify.v2
    .services(verifyServiceSid)
    .verificationChecks.create({
      to,
      code: String(code).trim()
    });
}

module.exports = {
  sendVerificationCodeSms,
  checkVerificationCode
};