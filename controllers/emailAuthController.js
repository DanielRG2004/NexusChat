const pool = require('../config/database');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { sendVerificationEmail } = require('../services/email.service');
const {
  generateVerificationCode,
  hashVerificationCode,
  verifyVerificationCode
} = require('../utils/verification-code');

const JWT_SECRET = process.env.JWT_SECRET || 'nexuschat_secret_key_2024';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30d';
const CODE_TTL_MINUTES = Number(process.env.EMAIL_VERIFICATION_CODE_TTL_MINUTES || 10);

const ADMIN_USERNAMES = new Set(
  String(process.env.ADMIN_USERNAMES || 'admin')
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
);

function isAdminUsername(username) {
  return ADMIN_USERNAMES.has(String(username || '').trim().toLowerCase());
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function sanitizeUser(user) {
  if (!user) return null;

  return {
    id: user.id,
    nombre: user.nombre,
    email: user.email,
    telefono: user.telefono,
    estado_cuenta: user.estado_cuenta,
    foto_perfil: user.foto_perfil,
    descripcion: user.descripcion,
    email_verificado_at: user.email_verificado_at || null,
    last_login_at: user.last_login_at || null
  };
}

function buildSessionToken(user) {
  return jwt.sign(
    {
      id: user.id,
      sub: user.id,
      email: user.email,
      nombre: user.nombre,
      telefono: user.telefono || null,
      isAdmin: isAdminUsername(user.email || user.nombre)
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function buildTempToken(user, purpose) {
  return jwt.sign(
    {
      id: user.id,
      sub: user.id,
      email: user.email,
      purpose
    },
    JWT_SECRET,
    { expiresIn: '15m' }
  );
}

async function findUserByEmailOrName(email, nombre) {
  const [rows] = await pool.query(
    `SELECT *
     FROM usuarios
     WHERE LOWER(email) = LOWER(?) OR LOWER(nombre) = LOWER(?)
     LIMIT 1`,
    [email, nombre]
  );

  return rows[0] || null;
}

async function findUserById(userId) {
  const [rows] = await pool.query(
    'SELECT * FROM usuarios WHERE id = ? LIMIT 1',
    [userId]
  );

  return rows[0] || null;
}

async function createOrReplaceEmailVerification(userId, codeHash, expiraAt) {
  await pool.query(
    `UPDATE verificaciones
     SET estado = 'expirado'
     WHERE usuario_id = ?
       AND canal = 'email'
       AND proposito = 'registro'
       AND estado = 'pendiente'`,
    [userId]
  );

  await pool.query(
    `INSERT INTO verificaciones
      (usuario_id, canal, proposito, codigo_hash, estado, intentos, expira_at)
     VALUES
      (?, 'email', 'registro', ?, 'pendiente', 0, ?)`,
    [userId, codeHash, expiraAt]
  );
}

async function getLatestPendingVerification(userId) {
  const [rows] = await pool.query(
    `SELECT *
     FROM verificaciones
     WHERE usuario_id = ?
       AND canal = 'email'
       AND proposito = 'registro'
       AND estado = 'pendiente'
     ORDER BY id DESC
     LIMIT 1`,
    [userId]
  );

  return rows[0] || null;
}

exports.health = async (req, res) => {
  res.json({
    ok: true,
    message: 'Email auth funcionando'
  });
};

exports.requestCode = async (req, res, next) => {
  try {
    const nombre = String(req.body.nombre || '').trim();
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');

    if (nombre.length < 3) {
      return res.status(400).json({
        ok: false,
        message: 'El usuario debe tener al menos 3 caracteres'
      });
    }

    if (!/^[a-zA-Z0-9_.-]{3,20}$/.test(nombre)) {
      return res.status(400).json({
        ok: false,
        message: 'El usuario solo puede tener letras, numeros, punto, guion bajo o guion'
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        ok: false,
        message: 'Ingresa un correo valido'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        ok: false,
        message: 'La contraseña debe tener al menos 6 caracteres'
      });
    }

    const existing = await findUserByEmailOrName(email, nombre);

    if (existing && existing.estado_cuenta === 'verificado') {
      return res.status(409).json({
        ok: false,
        message: 'Ese correo o usuario ya esta en uso'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    let userId;
    let user;

    if (existing) {
      await pool.query(
        `UPDATE usuarios
         SET nombre = ?,
             email = ?,
             telefono = NULL,
             codigo_pais_id = NULL,
             password = ?,
             estado_cuenta = 'pendiente',
             email_verificado_at = NULL
         WHERE id = ?`,
        [nombre, email, hashedPassword, existing.id]
      );

      userId = existing.id;
      user = await findUserById(userId);
    } else {
      const [result] = await pool.query(
        `INSERT INTO usuarios
          (nombre, telefono, codigo_pais_id, email, password, password_algo, foto_perfil, descripcion, estado_cuenta)
         VALUES
          (?, NULL, NULL, ?, ?, 'bcrypt', 'default.png', '', 'pendiente')`,
        [nombre, email, hashedPassword]
      );

      userId = result.insertId;
      user = await findUserById(userId);
    }

    const verificationCode = generateVerificationCode(6);
    const verificationHash = hashVerificationCode(verificationCode);
    const expiraAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);

    await createOrReplaceEmailVerification(userId, verificationHash, expiraAt);

    await sendVerificationEmail({
      to: email,
      name: nombre,
      code: verificationCode
    });

    return res.json({
      ok: true,
      message: 'Te enviamos un codigo a tu correo',
      tempToken: buildTempToken(user, 'complete-registration'),
      email,
      nombre
    });
  } catch (error) {
    next(error);
  }
};

exports.verifyCode = async (req, res, next) => {
  try {
    const { tempToken, codigo } = req.body;

    if (!tempToken) {
      return res.status(400).json({
        ok: false,
        message: 'Falta el token temporal'
      });
    }

    if (!codigo || String(codigo).trim().length !== 6) {
      return res.status(400).json({
        ok: false,
        message: 'El codigo debe tener 6 digitos'
      });
    }

    let payload;
    try {
      payload = jwt.verify(tempToken, JWT_SECRET);
    } catch {
      return res.status(401).json({
        ok: false,
        message: 'Token temporal invalido o expirado'
      });
    }

    if (payload.purpose !== 'complete-registration') {
      return res.status(401).json({
        ok: false,
        message: 'Token temporal invalido'
      });
    }

    const user = await findUserById(payload.sub || payload.id);
    if (!user) {
      return res.status(404).json({
        ok: false,
        message: 'No se encontro el usuario pendiente'
      });
    }

    const verificationRow = await getLatestPendingVerification(user.id);
    if (!verificationRow) {
      return res.status(404).json({
        ok: false,
        message: 'No hay un codigo pendiente'
      });
    }

    const expires = new Date(verificationRow.expira_at).getTime();
    if (expires < Date.now()) {
      await pool.query(
        "UPDATE verificaciones SET estado = 'expirado' WHERE id = ?",
        [verificationRow.id]
      );

      return res.status(400).json({
        ok: false,
        message: 'El codigo expiro. Solicita uno nuevo'
      });
    }

    const okCode = verifyVerificationCode(codigo, verificationRow.codigo_hash);

    if (!okCode) {
      const attempts = Number(verificationRow.intentos || 0) + 1;

      if (attempts >= 5) {
        await pool.query(
          "UPDATE verificaciones SET estado = 'expirado', intentos = ? WHERE id = ?",
          [attempts, verificationRow.id]
        );

        return res.status(400).json({
          ok: false,
          message: 'Demasiados intentos. El codigo fue expirado'
        });
      }

      await pool.query(
        'UPDATE verificaciones SET intentos = ? WHERE id = ?',
        [attempts, verificationRow.id]
      );

      return res.status(400).json({
        ok: false,
        message: 'Codigo incorrecto'
      });
    }

    await pool.query(
      `UPDATE verificaciones
       SET estado = 'usado',
           verificado_at = NOW()
       WHERE id = ?`,
      [verificationRow.id]
    );

    return res.json({
      ok: true,
      message: 'Codigo verificado correctamente',
      verificationToken: buildTempToken(user, 'finish-registration')
    });
  } catch (error) {
    next(error);
  }
};

exports.completeRegistration = async (req, res, next) => {
  try {
    const { verificationToken } = req.body;

    if (!verificationToken) {
      return res.status(400).json({
        ok: false,
        message: 'Falta el token de verificacion'
      });
    }

    let payload;
    try {
      payload = jwt.verify(verificationToken, JWT_SECRET);
    } catch {
      return res.status(401).json({
        ok: false,
        message: 'Token de verificacion invalido o expirado'
      });
    }

    if (payload.purpose !== 'finish-registration') {
      return res.status(401).json({
        ok: false,
        message: 'Token de verificacion invalido'
      });
    }

    const user = await findUserById(payload.sub || payload.id);
    if (!user) {
      return res.status(404).json({
        ok: false,
        message: 'No se encontro el usuario'
      });
    }

    if (user.estado_cuenta !== 'verificado') {
      await pool.query(
        `UPDATE usuarios
         SET estado_cuenta = 'verificado',
             email_verificado_at = NOW(),
             last_login_at = NOW()
         WHERE id = ?`,
        [user.id]
      );
    } else {
      await pool.query(
        `UPDATE usuarios
         SET last_login_at = NOW()
         WHERE id = ?`,
        [user.id]
      );
    }

    const updatedUser = await findUserById(user.id);
    const token = buildSessionToken(updatedUser);

    return res.json({
      ok: true,
      message: 'Registro completado correctamente',
      token,
      isAdmin: isAdminUsername(updatedUser.email || updatedUser.nombre),
      user: sanitizeUser(updatedUser)
    });
  } catch (error) {
    next(error);
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        ok: false,
        message: 'Correo y contraseña son obligatorios'
      });
    }

    const cleanEmail = normalizeEmail(email);

    const [rows] = await pool.query(
      `SELECT * FROM usuarios
       WHERE LOWER(email) = LOWER(?)
       LIMIT 1`,
      [cleanEmail]
    );

    const user = rows[0];
    if (!user) {
      return res.status(404).json({
        ok: false,
        message: 'Usuario no encontrado'
      });
    }

    if (user.estado_cuenta === 'bloqueado') {
      return res.status(403).json({
        ok: false,
        message: 'Tu cuenta esta bloqueada'
      });
    }

    if (user.estado_cuenta !== 'verificado') {
      return res.status(403).json({
        ok: false,
        message: 'Debes verificar tu correo antes de iniciar sesion'
      });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({
        ok: false,
        message: 'Credenciales incorrectas'
      });
    }

    await pool.query(
      `UPDATE usuarios
       SET last_login_at = NOW()
       WHERE id = ?`,
      [user.id]
    );

    const token = buildSessionToken(user);
    const isAdmin = isAdminUsername(user.email || user.nombre);

    return res.json({
      ok: true,
      message: 'Inicio de sesion correcto',
      token,
      isAdmin,
      user: sanitizeUser(user)
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error al iniciar sesion',
      details: error.message
    });
  }
};

exports.getMe = async (req, res) => {
  try {
    const userId = req.user.id;

    const [rows] = await pool.query(
      `SELECT id, nombre, email, telefono, foto_perfil, descripcion, estado_cuenta, email_verificado_at, last_login_at
       FROM usuarios
       WHERE id = ?`,
      [userId]
    );

    if (!rows[0]) {
      return res.status(404).json({
        ok: false,
        message: 'Usuario no encontrado'
      });
    }

    return res.json({
      ok: true,
      user: sanitizeUser(rows[0])
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error al obtener usuario'
    });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { nombre, descripcion, foto_perfil } = req.body;

    const updates = [];
    const values = [];

    if (nombre !== undefined) {
      const cleanNombre = String(nombre || '').trim();
      if (cleanNombre.length < 3) {
        return res.status(400).json({
          ok: false,
          message: 'El nombre debe tener al menos 3 caracteres'
        });
      }
      updates.push('nombre = ?');
      values.push(cleanNombre);
    }

    if (descripcion !== undefined) {
      updates.push('descripcion = ?');
      values.push(String(descripcion || '').trim());
    }

    if (foto_perfil !== undefined) {
      updates.push('foto_perfil = ?');
      values.push(String(foto_perfil || 'default.png').trim());
    }

    if (updates.length === 0) {
      return res.status(400).json({
        ok: false,
        message: 'No hay campos para actualizar'
      });
    }

    values.push(userId);

    await pool.query(
      `UPDATE usuarios SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    const [rows] = await pool.query(
      `SELECT id, nombre, email, telefono, foto_perfil, descripcion, estado_cuenta, email_verificado_at, last_login_at
       FROM usuarios
       WHERE id = ?`,
      [userId]
    );

    return res.json({
      ok: true,
      user: sanitizeUser(rows[0])
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Error al actualizar perfil'
    });
  }
};