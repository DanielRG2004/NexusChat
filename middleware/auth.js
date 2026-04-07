const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'nexuschat_secret_key_2024';

function authMiddleware(req, res, next) {
  try {
    const authHeader = req.header('Authorization') || '';
    const tokenFromBearer = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null;

    const token = tokenFromBearer || req.header('x-token');

    if (!token) {
      return res.status(401).json({
        ok: false,
        message: 'Token requerido'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    req.user = {
      id: decoded.id || decoded.sub,
      sub: decoded.sub || decoded.id,
      telefono: decoded.telefono || null,
      nombre: decoded.nombre || null,
      isAdmin: decoded.isAdmin || false
    };

    next();
  } catch {
    return res.status(401).json({
      ok: false,
      message: 'Token invalido o expirado'
    });
  }
}

module.exports = authMiddleware;
module.exports.requireAuth = authMiddleware;