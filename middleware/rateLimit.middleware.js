const rateLimit = require('express-rate-limit');

const sendCodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    message: 'Demasiados intentos. Intenta nuevamente más tarde.'
  }
});

const verifyCodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    message: 'Demasiados intentos de verificación. Intenta más tarde.'
  }
});

module.exports = {
  sendCodeLimiter,
  verifyCodeLimiter
};