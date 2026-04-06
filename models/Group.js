const pool = require('../config/database');

class Group {
  static async create(groupData) {
    const { nombre, descripcion, creadorId, avatar = null } = groupData;
    
    const [result] = await pool.execute(
      `INSERT INTO grupos (nombre, descripcion, creador_id, avatar) 
       VALUES (?, ?, ?, ?)`,
      [nombre, descripcion, creadorId, avatar]
    );
    
    return result.insertId;
  }

  static async getById(groupId) {
    const [groups] = await pool.execute(
      `SELECT * FROM grupos WHERE id = ?`,
      [groupId]
    );
    return groups[0];
  }

  static async addMember(groupId, userId, role = 'member') {
    const [result] = await pool.execute(
      `INSERT INTO grupo_miembros (grupo_id, usuario_id, role) 
       VALUES (?, ?, ?) 
       ON DUPLICATE KEY UPDATE role = ?`,
      [groupId, userId, role, role]
    );
    return result.insertId;
  }

  static async removeMember(groupId, userId) {
    const [result] = await pool.execute(
      `DELETE FROM grupo_miembros 
       WHERE grupo_id = ? AND usuario_id = ?`,
      [groupId, userId]
    );
    return result.affectedRows > 0;
  }

  static async getMembers(groupId) {
    const [members] = await pool.execute(
      `SELECT gm.*, u.nombre, u.email, u.avatar 
       FROM grupo_miembros gm
       JOIN usuarios u ON gm.usuario_id = u.id
       WHERE gm.grupo_id = ?`,
      [groupId]
    );
    return members;
  }

  static async isMember(groupId, userId) {
    const [members] = await pool.execute(
      `SELECT id FROM grupo_miembros 
       WHERE grupo_id = ? AND usuario_id = ?`,
      [groupId, userId]
    );
    return members.length > 0;
  }

  static async updateGroup(groupId, updates) {
    const fields = [];
    const values = [];
    
    if (updates.nombre) {
      fields.push('nombre = ?');
      values.push(updates.nombre);
    }
    if (updates.descripcion !== undefined) {
      fields.push('descripcion = ?');
      values.push(updates.descripcion);
    }
    if (updates.avatar !== undefined) {
      fields.push('avatar = ?');
      values.push(updates.avatar);
    }
    
    if (fields.length === 0) return false;
    
    values.push(groupId);
    const [result] = await pool.execute(
      `UPDATE grupos SET ${fields.join(', ')} WHERE id = ?`,
      values
    );
    
    return result.affectedRows > 0;
  }
}

module.exports = Group;