const pool = require('../config/database');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Get all users (for login)
exports.getUsers = async (req, res) => {
  try {
    console.log('📥 GET /api/auth/users - Fetching users...');
    
    const [users] = await pool.execute(
      `SELECT id, nombre, telefono, email, foto_perfil, descripcion
       FROM usuarios 
       WHERE estado_cuenta = 'verificado'
       ORDER BY nombre ASC
       LIMIT 50`
    );
    
    console.log(`✅ Found ${users.length} users`);
    
    if (users.length === 0) {
      const [allUsers] = await pool.execute(
        `SELECT id, nombre, telefono, email FROM usuarios LIMIT 20`
      );
      console.log(`Found ${allUsers.length} unverified users`);
      return res.json(allUsers);
    }
    
    res.json(users);
  } catch (error) {
    console.error('❌ Error fetching users:', error);
    res.status(500).json({ 
      error: 'Error al cargar usuarios', 
      details: error.message 
    });
  }
};

// Fake login (select user by ID)
exports.fakeLogin = async (req, res) => {
  try {
    const { userId } = req.body;
    console.log(`🔐 Fake login attempt for user ID: ${userId}`);
    
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
    console.log(`✅ User found: ${user.nombre} (ID: ${user.id})`);
    
    const token = jwt.sign(
      { id: user.id, nombre: user.nombre },
      process.env.JWT_SECRET || 'nexuschat_secret_key_2024',
      { expiresIn: '7d' }
    );
    
    res.json({ user, token });
  } catch (error) {
    console.error('❌ Fake login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Register new user
exports.register = async (req, res) => {
  try {
    const { nombre, telefono, codigo_pais_id, email, password } = req.body;
    
    console.log('📝 Registering new user:', nombre, telefono);
    
    // Check if user exists
    const [existing] = await pool.execute(
      'SELECT id FROM usuarios WHERE telefono = ? OR email = ?',
      [telefono, email]
    );
    
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Usuario ya existe' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const [result] = await pool.execute(
      `INSERT INTO usuarios (nombre, telefono, codigo_pais_id, email, password, estado_cuenta) 
       VALUES (?, ?, ?, ?, ?, 'verificado')`,
      [nombre, telefono, codigo_pais_id || 1, email, hashedPassword]
    );
    
    const [user] = await pool.execute(
      'SELECT id, nombre, telefono, email FROM usuarios WHERE id = ?',
      [result.insertId]
    );
    
    const token = jwt.sign(
      { id: user[0].id, nombre: user[0].nombre },
      process.env.JWT_SECRET || 'nexuschat_secret_key_2024',
      { expiresIn: '7d' }
    );
    
    res.status(201).json({ user: user[0], token });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Error al registrar usuario' });
  }
};

// Login with phone and password
exports.login = async (req, res) => {
  try {
    const { telefono, password } = req.body;
    
    console.log('🔐 Login attempt for phone:', telefono);
    
    const [users] = await pool.execute(
      'SELECT * FROM usuarios WHERE telefono = ?',
      [telefono]
    );
    
    if (users.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    
    const user = users[0];
    const isValidPassword = await bcrypt.compare(password, user.password);
    
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    
    const token = jwt.sign(
      { id: user.id, nombre: user.nombre },
      process.env.JWT_SECRET || 'nexuschat_secret_key_2024',
      { expiresIn: '7d' }
    );
    
    const { password: _, ...userWithoutPassword } = user;
    res.json({ user: userWithoutPassword, token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
};

// Get current user profile
exports.getMe = async (req, res) => {
  try {
    console.log('📥 Getting profile for user:', req.user.id);
    
    const [users] = await pool.execute(
      'SELECT id, nombre, telefono, email, foto_perfil, descripcion FROM usuarios WHERE id = ?',
      [req.user.id]
    );
    
    if (users.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    res.json(users[0]);
  } catch (error) {
    console.error('Error getting user:', error);
    res.status(500).json({ error: 'Error al obtener usuario' });
  }
};

// Update user profile
exports.updateProfile = async (req, res) => {
  try {
    const { nombre, descripcion } = req.body;
    const userId = req.user.id;
    
    console.log('📝 Updating profile for user:', userId);
    console.log('Update data:', { nombre, descripcion });
    
    const updates = [];
    const values = [];
    
    if (nombre !== undefined && nombre !== null) {
      updates.push('nombre = ?');
      values.push(nombre);
    }
    if (descripcion !== undefined) {
      updates.push('descripcion = ?');
      values.push(descripcion);
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
      'SELECT id, nombre, telefono, email, foto_perfil, descripcion FROM usuarios WHERE id = ?',
      [userId]
    );
    
    console.log('✅ Profile updated successfully');
    res.json(users[0]);
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Error al actualizar perfil' });
  }
};