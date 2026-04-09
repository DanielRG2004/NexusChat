const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;

if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) {
  throw new Error('Faltan variables SMTP en el .env');
}

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS
  }
});

async function sendVerificationEmail({ to, name, code }) {
  const safeName = name || 'usuario';

  const subject = 'Código de verificación NexusChat';

  const text = `Hola ${safeName}, tu código de verificación es: ${code}`;

  const html = `
    <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:24px;">
      <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:28px;border:1px solid #e5e7eb;">
        <h1 style="margin:0 0 16px;color:#111827;">NexusChat</h1>
        <p style="margin:0 0 16px;color:#374151;font-size:16px;">
          Hola ${safeName}, usa este código para verificar tu correo:
        </p>
        <div style="font-size:34px;font-weight:700;letter-spacing:8px;text-align:center;padding:18px;background:#eff6ff;border-radius:12px;color:#1d4ed8;margin:24px 0;">
          ${code}
        </div>
        <p style="margin:0;color:#6b7280;font-size:14px;">
          Si no solicitaste este código, ignora este mensaje.
        </p>
      </div>
    </div>
  `;

  return transporter.sendMail({
    from: SMTP_FROM,
    to,
    subject,
    text,
    html
  });
}

module.exports = {
  sendVerificationEmail
};