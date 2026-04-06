const pool = require('../config/database');
const bcrypt = require('bcryptjs');

class User {
  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT u.id, u.nombre, u.telefono, u.email, u.foto_perfil, u.descripcion, 
              u.estado_cuenta, cp.codigo_telefono as codigo_pais,
              eu.disponibilidad, eu.descripcion as estado_descripcion
       FROM usuarios u
       LEFT JOIN codigos_pais cp ON u.codigo_pais_id = cp.id
       LEFT JOIN estado_usuario eu ON u.id = eu.usuario_id
       WHERE u.id = ?`,
      [id]
    );
    return rows[0];
  }

  static async findByPhone(telefono) {
    const [rows] = await pool.execute(
      `SELECT u.*, cp.codigo_telefono as codigo_pais
       FROM usuarios u
       LEFT JOIN codigos_pais cp ON u.codigo_pais_id = cp.id
       WHERE u.telefono = ?`,
      [telefono]
    );
    return rows[0];
  }

  static async create(userData) {
    const { nombre, telefono, codigo_pais_id, email, password, descripcion = '' } = userData;
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const [result] = await pool.execute(
      `INSERT INTO usuarios (nombre, telefono, codigo_pais_id, email, password, descripcion, estado_cuenta) 
       VALUES (?, ?, ?, ?, ?, ?, 'verificado')`,
      [nombre, telefono, codigo_pais_id, email, hashedPassword, descripcion]
    );
    
    // Create user status
    await pool.execute(
      `INSERT INTO estado_usuario (usuario_id, disponibilidad, descripcion) 
       VALUES (?, 'disponible', 'Disponible')`,
      [result.insertId]
    );
    
    return result.insertId;
  }

  static async verifyUser(userId) {
    const [result] = await pool.execute(
      `UPDATE usuarios SET estado_cuenta = 'verificado' WHERE id = ?`,
      [userId]
    );
    return result.affectedRows > 0;
  }

  static async updateStatus(userId, disponibilidad, descripcion) {
    const [result] = await pool.execute(
      `INSERT INTO estado_usuario (usuario_id, disponibilidad, descripcion) 
       VALUES (?, ?, ?) 
       ON DUPLICATE KEY UPDATE disponibilidad = ?, descripcion = ?`,
      [userId, disponibilidad, descripcion, disponibilidad, descripcion]
    );
    return result.affectedRows > 0;
  }

  static async searchUsers(query, excludeUserId) {
    const [rows] = await pool.execute(
      `SELECT u.id, u.nombre, u.telefono, u.email, u.foto_perfil, u.descripcion,
              cp.codigo_telefono as codigo_pais,
              eu.disponibilidad
       FROM usuarios u
       LEFT JOIN codigos_pais cp ON u.codigo_pais_id = cp.id
       LEFT JOIN estado_usuario eu ON u.id = eu.usuario_id
       WHERE (u.nombre LIKE ? OR u.telefono LIKE ? OR u.email LIKE ?) 
         AND u.id != ?
         AND u.estado_cuenta = 'verificado'
       LIMIT 20`,
      [`%${query}%`, `%${query}%`, `%${query}%`, excludeUserId]
    );
    return rows;
  }
}

module.exports = User;