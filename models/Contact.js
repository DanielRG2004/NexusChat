const pool = require('../config/database');

class Contact {
  static async getContacts(userId) {
    const [rows] = await pool.execute(
      `SELECT c.id, c.apodo, c.bloqueado, c.archivado, c.fijado, c.created_at,
              u.id AS contacto_id,
              u.nombre, u.telefono, u.foto_perfil, u.descripcion,
              eu.disponibilidad
       FROM contactos c
       JOIN usuarios u ON c.contacto_id = u.id
       LEFT JOIN estado_usuario eu ON u.id = eu.usuario_id
       WHERE c.usuario_id = ?
       ORDER BY c.fijado DESC, u.nombre ASC`,
      [userId]
    );
    return rows;
  }

  static async updateContact(userId, contactId, updates) {
    const fields = [];
    const values = [];
    
    if (updates.apodo !== undefined) {
      fields.push('apodo = ?');
      values.push(updates.apodo);
    }
    if (updates.bloqueado !== undefined) {
      fields.push('bloqueado = ?');
      values.push(updates.bloqueado);
    }
    if (updates.archivado !== undefined) {
      fields.push('archivado = ?');
      values.push(updates.archivado);
    }
    if (updates.fijado !== undefined) {
      fields.push('fijado = ?');
      values.push(updates.fijado);
    }
    
    if (fields.length === 0) return false;
    
    values.push(userId, contactId);
    const [result] = await pool.execute(
      `UPDATE contactos SET ${fields.join(', ')} 
       WHERE usuario_id = ? AND contacto_id = ?`,
      values
    );
    
    return result.affectedRows > 0;
  }

  static async archiveContact(userId, contactId) {
    const [result] = await pool.execute(
      `UPDATE contactos SET archivado = 1 
       WHERE usuario_id = ? AND contacto_id = ?`,
      [userId, contactId]
    );
    return result.affectedRows > 0;
  }

  static async pinContact(userId, contactId) {
    const [result] = await pool.execute(
      `UPDATE contactos SET fijado = NOT fijado 
       WHERE usuario_id = ? AND contacto_id = ?`,
      [userId, contactId]
    );
    return result.affectedRows > 0;
  }

  static async blockContact(userId, contactId) {
    const [result] = await pool.execute(
      `UPDATE contactos SET bloqueado = 1 
       WHERE usuario_id = ? AND contacto_id = ?`,
      [userId, contactId]
    );
    return result.affectedRows > 0;
  }

  static async unblockContact(userId, contactId) {
    const [result] = await pool.execute(
      `UPDATE contactos SET bloqueado = 0 
       WHERE usuario_id = ? AND contacto_id = ?`,
      [userId, contactId]
    );
    return result.affectedRows > 0;
  }
}

module.exports = Contact;