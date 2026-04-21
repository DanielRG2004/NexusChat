const pool = require('../config/database');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { normalizeCRPhone } = require('../utils/phone');
const {
  sendVerificationCodeSms,
  checkVerificationCode
} = require('../services/sms.service');

const CODE_TTL_MINUTES = Number(process.env.VERIFICATION_CODE_TTL_MINUTES || 10);
const JWT_SECRET = process.env.JWT_SECRET || 'nexuschat_secret_key_2024';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30d';

// ========== CAMBIO: ADMIN_EMAILS en lugar de ADMIN_USERNAMES ==========
const ADMIN_EMAILS = new Set(
  String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)
);

function isAdmin(email) {
  if (!email) return false;
  return ADMIN_EMAILS.has(email.toLowerCase());
}
// =======================================================================

function toInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    nombre: user.nombre,
    telefono: user.telefono,
    estado_cuenta: user.estado_cuenta,
    foto_perfil: user.foto_perfil,
    descripcion: user.descripcion,
    email: user.email || null
  };
}

function buildSessionToken(user) {
  const adminEmails = (process.env.ADMIN_EMAILS || '').toLowerCase().split(',').map(e => e.trim());
  const isAdmin = adminEmails.includes((user.email || '').toLowerCase());

  return jwt.sign(
    {
      id: user.id,
      sub: user.id,
      telefono: user.telefono,
      nombre: user.nombre,
      isAdmin: isAdmin
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function buildTempToken(user) {
  return jwt.sign(
    {
      id: user.id,
      sub: user.id,
      telefono: user.telefono,
      purpose: 'complete-registration'
    },
    JWT_SECRET,
    { expiresIn: '15m' }
  );
}

async function getUserByPhone(telefono) {
  const [rows] = await pool.query(
    'SELECT * FROM usuarios WHERE telefono = ? LIMIT 1',
    [telefono]
  );
  return rows[0] || null;
}

async function getUserByLogin(username) {
  const [rows] = await pool.query(
    `SELECT * FROM usuarios
     WHERE LOWER(nombre) = LOWER(?) OR LOWER(email) = LOWER(?)
     LIMIT 1`,
    [username, username]
  );
  return rows[0] || null;
}

async function getCostaRicaCountryId() {
  const [rows] = await pool.query(
    "SELECT id FROM codigos_pais WHERE codigo_iso = 'CR' LIMIT 1"
  );

  if (!rows[0]) {
    throw new Error('No existe el codigo de pais CR en la base de datos');
  }

  return rows[0].id;
}

async function createPendingUser(telefono, codigoPaisId) {
  const tempPassword = crypto.randomBytes(16).toString('hex');
  const hashedPassword = await bcrypt.hash(tempPassword, 10);
  const nombreBase = `pendiente_${telefono.slice(-8)}`;

  const [result] = await pool.query(
    `INSERT INTO usuarios
      (nombre, telefono, codigo_pais_id, email, password, password_algo, foto_perfil, descripcion, estado_cuenta)
     VALUES
      (?, ?, ?, NULL, ?, 'bcrypt', 'default.png', '', 'pendiente')`,
    [nombreBase, telefono, codigoPaisId, hashedPassword]
  );

  const [rows] = await pool.query(
    'SELECT * FROM usuarios WHERE id = ? LIMIT 1',
    [result.insertId]
  );

  return rows[0];
}

async function createVerificationRow(usuarioId, expiraAt) {
  await pool.query(
    "UPDATE verificaciones SET estado = 'expirado' WHERE usuario_id = ? AND tipo = 'sms' AND estado = 'pendiente'",
    [usuarioId]
  );

  await pool.query(
    `INSERT INTO verificaciones
      (usuario_id, dispositivo_id, codigo, tipo, estado, intentos, expira_at)
     VALUES
      (?, NULL, ?, 'sms', 'pendiente', 0, ?)`,
    [usuarioId, 'twilio', expiraAt]
  );
}

async function ensureUniqueUser(nombre, email, excludeId = null) {
  const params = [nombre, email, nombre, email];
  let sql = `
    SELECT id
    FROM usuarios
    WHERE (LOWER(nombre) = LOWER(?) OR LOWER(email) = LOWER(?))
  `;

  if (excludeId) {
    sql += ' AND id <> ?';
    params.push(excludeId);
  }

  sql += ' LIMIT 1';

  const [rows] = await pool.query(sql, params);
  return rows[0] || null;
}

exports.health = async (req, res) => {
  res.json({
    ok: true,
    message: 'NexusChat backend funcionando'
  });
};

exports.getUsers = async (req, res) => {
  try {
    const [users] = await pool.execute(
      `SELECT id, nombre, telefono, email, foto_perfil, descripcion
       FROM usuarios
       WHERE estado_cuenta = 'verificado'
       ORDER BY nombre ASC
       LIMIT 50`
    );

    if (users.length === 0) {
      const [allUsers] = await pool.execute(
        `SELECT id, nombre, telefono, email, foto_perfil, descripcion
         FROM usuarios
         ORDER BY id DESC
         LIMIT 20`
      );
      return res.json(allUsers);
    }

    res.json(users);
  } catch (error) {
    res.status(500).json({
      error: 'Error al cargar usuarios',
      details: error.message
    });
  }
};

exports.fakeLogin = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const [users] = await pool.execute(
      `SELECT id, nombre, telefono, email, foto_perfil, descripcion
       FROM usuarios
       WHERE id = ?`,
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = users[0];
    const token = buildSessionToken(user);

    res.json({
      user: sanitizeUser(user),
      token
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.register = async (req, res) => {
  try {
    const {
      nombre,
      telefono,
      codigo_pais_id,
      email,
      password
    } = req.body;

    const cleanNombre = String(nombre || '').trim();
    const cleanTelefono = String(telefono || '').trim();
    const cleanEmail = email ? String(email).trim() : null;

    if (cleanNombre.length < 3) {
      return res.status(400).json({ error: 'El nombre debe tener al menos 3 caracteres' });
    }

    if (!cleanTelefono) {
      return res.status(400).json({ error: 'El telefono es obligatorio' });
    }

    if (!password || String(password).length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    const existing = await ensureUniqueUser(cleanNombre, cleanEmail);
    const [phoneExists] = await pool.query(
      'SELECT id FROM usuarios WHERE telefono = ? LIMIT 1',
      [cleanTelefono]
    );

    if (existing || phoneExists[0]) {
      return res.status(400).json({ error: 'Usuario ya existe' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const countryId = toInt(codigo_pais_id) || (await getCostaRicaCountryId());

    const [result] = await pool.execute(
      `INSERT INTO usuarios
       (nombre, telefono, codigo_pais_id, email, password, estado_cuenta)
       VALUES (?, ?, ?, ?, ?, 'verificado')`,
      [cleanNombre, cleanTelefono, countryId, cleanEmail, hashedPassword]
    );

    const [userRows] = await pool.execute(
      `SELECT id, nombre, telefono, email, foto_perfil, descripcion, estado_cuenta
       FROM usuarios WHERE id = ?`,
      [result.insertId]
    );

    const user = userRows[0];
    const token = buildSessionToken(user);

    res.status(201).json({
      user: sanitizeUser(user),
      token
    });
  } catch (error) {
    res.status(500).json({
      error: 'Error al registrar usuario',
      details: error.message
    });
  }
};

exports.login = async (req, res) => {
  try {
    const { username, telefono, password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Usuario y contraseña son obligatorios' });
    }

    const rawLogin = String(username || telefono || '').trim();
    let user = null;

    if (telefono || rawLogin) {
      const normalizedPhone = normalizeCRPhone(telefono || rawLogin);
      if (normalizedPhone) {
        user = await getUserByPhone(normalizedPhone);
      }
    }

    if (!user && rawLogin) {
      user = await getUserByLogin(rawLogin);
    }

    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    if (user.estado_cuenta === 'bloqueado') {
      return res.status(403).json({ error: 'Tu cuenta esta bloqueada' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const token = buildSessionToken(user);
    const isAdmin = isAdmin(user.email);   // 👈 CORREGIDO

    res.json({
      ok: true,
      message: 'Inicio de sesion correcto',
      token,
      isAdmin,
      user: sanitizeUser(user)
    });
  } catch (error) {
    res.status(500).json({
      error: 'Error al iniciar sesión',
      details: error.message
    });
  }
};

exports.getMe = async (req, res) => {
  try {
    const userId = req.user.id;

    const [users] = await pool.execute(
      'SELECT id, nombre, telefono, email, foto_perfil, descripcion, estado_cuenta FROM usuarios WHERE id = ?',
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json(sanitizeUser(users[0]));
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener usuario' });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { nombre, descripcion, foto_perfil, telefono } = req.body;   // 👈 AÑADIDO telefono
    const userId = req.user.id;

    const updates = [];
    const values = [];

    if (telefono !== undefined) {
      const { normalizeCRPhone } = require('../utils/phone');
      const cleanPhone = String(telefono || '').trim();
      if (cleanPhone) {
        const normalized = normalizeCRPhone(cleanPhone);
        if (!normalized) return res.status(400).json({ ok: false, message: 'Formato de teléfono inválido' });
        updates.push('telefono = ?');
        values.push(normalized);
      } else {
        updates.push('telefono = NULL');
      }
    }

    if (nombre !== undefined) {
      const cleanNombre = String(nombre || '').trim();
      if (cleanNombre.length < 3) {
        return res.status(400).json({ error: 'El nombre debe tener al menos 3 caracteres' });
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
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }

    values.push(userId);

    await pool.execute(
      `UPDATE usuarios SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    const [users] = await pool.execute(
      'SELECT id, nombre, telefono, email, foto_perfil, descripcion, estado_cuenta FROM usuarios WHERE id = ?',
      [userId]
    );

    res.json(sanitizeUser(users[0]));
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar perfil' });
  }
};

exports.requestCode = async (req, res, next) => {
  try {
    const { telefono, numero } = req.body;
    const rawPhone = telefono || (numero ? `+506${numero}` : '');
    const normalizedPhone = normalizeCRPhone(rawPhone);

    if (!normalizedPhone) {
      return res.status(400).json({
        ok: false,
        message: 'Ingresa un numero valido de Costa Rica de 8 digitos'
      });
    }

    const codigoPaisId = await getCostaRicaCountryId();

    let user = await getUserByPhone(normalizedPhone);
    if (!user) {
      user = await createPendingUser(normalizedPhone, codigoPaisId);
    }

    if (user.estado_cuenta === 'bloqueado') {
      return res.status(403).json({
        ok: false,
        message: 'Tu cuenta esta bloqueada'
      });
    }

    await sendVerificationCodeSms(normalizedPhone);

    const expiraAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);
    await createVerificationRow(user.id, expiraAt);

    return res.json({
      ok: true,
      message: 'Codigo enviado correctamente',
      telefono: normalizedPhone
    });
  } catch (error) {
    next(error);
  }
};

exports.verifyCode = async (req, res, next) => {
  try {
    const { telefono, numero, codigo } = req.body;

    const rawPhone = telefono || (numero ? `+506${numero}` : '');
    const normalizedPhone = normalizeCRPhone(rawPhone);

    if (!normalizedPhone) {
      return res.status(400).json({
        ok: false,
        message: 'Telefono invalido'
      });
    }

    if (!codigo || String(codigo).trim().length !== 6) {
      return res.status(400).json({
        ok: false,
        message: 'El codigo debe tener 6 digitos'
      });
    }

    const user = await getUserByPhone(normalizedPhone);
    if (!user) {
      return res.status(404).json({
        ok: false,
        message: 'No existe un usuario con ese numero'
      });
    }

    const [rows] = await pool.query(
      `SELECT *
       FROM verificaciones
       WHERE usuario_id = ?
         AND tipo = 'sms'
         AND estado = 'pendiente'
       ORDER BY id DESC
       LIMIT 1`,
      [user.id]
    );

    const verificationRow = rows[0];
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

    const check = await checkVerificationCode(normalizedPhone, codigo);

    if (check.status !== 'approved') {
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
      "UPDATE verificaciones SET estado = 'usado' WHERE id = ?",
      [verificationRow.id]
    );

    const tempToken = buildTempToken(user);

    return res.json({
      ok: true,
      message: 'Telefono verificado correctamente',
      tempToken,
      phoneVerified: true,
      telefono: normalizedPhone
    });
  } catch (error) {
    next(error);
  }
};

exports.completeRegistration = async (req, res, next) => {
  try {
    const { tempToken, username, password } = req.body;

    if (!tempToken) {
      return res.status(400).json({
        ok: false,
        message: 'Falta el token temporal de verificacion'
      });
    }

    if (!username || String(username).trim().length < 3) {
      return res.status(400).json({
        ok: false,
        message: 'El usuario debe tener al menos 3 caracteres'
      });
    }

    if (!/^[a-zA-Z0-9_.-]{3,20}$/.test(String(username).trim())) {
      return res.status(400).json({
        ok: false,
        message: 'El usuario solo puede tener letras, numeros, punto, guion bajo o guion'
      });
    }

    if (!password || String(password).length < 6) {
      return res.status(400).json({
        ok: false,
        message: 'La contraseña debe tener al menos 6 caracteres'
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

    const [userRows] = await pool.query(
      'SELECT * FROM usuarios WHERE id = ? LIMIT 1',
      [payload.sub || payload.id]
    );

    const user = userRows[0];
    if (!user) {
      return res.status(404).json({
        ok: false,
        message: 'No se encontro el usuario a completar'
      });
    }

    const existing = await ensureUniqueUser(String(username).trim(), String(username).trim(), user.id);
    if (existing) {
      return res.status(409).json({
        ok: false,
        message: 'Ese usuario ya esta en uso'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const cleanUsername = String(username).trim();

    await pool.query(
      `UPDATE usuarios
       SET nombre = ?, email = ?, password = ?, estado_cuenta = 'verificado'
       WHERE id = ?`,
      [cleanUsername, cleanUsername, hashedPassword, user.id]
    );

    const [updatedRows] = await pool.query(
      'SELECT * FROM usuarios WHERE id = ? LIMIT 1',
      [user.id]
    );

    const updatedUser = updatedRows[0];
    const token = buildSessionToken(updatedUser);
    const isAdmin = isAdmin(updatedUser.email);   // 👈 CORREGIDO

    return res.json({
      ok: true,
      message: 'Registro completado correctamente',
      token,
      isAdmin,
      user: sanitizeUser(updatedUser)
    });
  } catch (error) {
    next(error);
  }
};
// ============================================
// ACTUALIZAR ESTADO DEL USUARIO
// ============================================
exports.updateStatus = async (req, res) => {
  try {
    const { disponibilidad, descripcion } = req.body;
    const userId = req.user.id;

    const validStatus = ['disponible', 'ocupado', 'ausente'];
    if (disponibilidad && !validStatus.includes(disponibilidad)) {
      return res.status(400).json({ error: 'Estado no válido' });
    }

    await pool.execute(
      `INSERT INTO estado_usuario (usuario_id, disponibilidad, descripcion) 
       VALUES (?, ?, ?) 
       ON DUPLICATE KEY UPDATE disponibilidad = ?, descripcion = ?, updated_at = NOW()`,
      [userId, disponibilidad || 'disponible', descripcion || 'Disponible', disponibilidad || 'disponible', descripcion || 'Disponible']
    );

    res.json({ message: 'Estado actualizado' });
  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({ error: 'Error al actualizar estado' });
  }
};

// ============================================
// OBTENER MI ESTADO
// ============================================
exports.getMyStatus = async (req, res) => {
  try {
    const userId = req.user.id;

    const [status] = await pool.execute(
      `SELECT disponibilidad, descripcion, updated_at 
       FROM estado_usuario 
       WHERE usuario_id = ?`,
      [userId]
    );

    if (status.length === 0) {
      return res.json({ disponibilidad: 'disponible', descripcion: 'Disponible' });
    }

    res.json(status[0]);
  } catch (error) {
    console.error('Error getting status:', error);
    res.status(500).json({ error: 'Error al obtener estado' });
  }
};