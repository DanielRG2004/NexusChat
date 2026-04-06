const pool = require('../config/database');

class Message {
  static async create(messageData) {
    const { conversationId, senderId, content, type = 'texto', grupoId = null } = messageData;
    
    return new Promise(async (resolve, reject) => {
      try {
        const [result] = await pool.execute(
          'CALL sp_guardar_mensaje(?, ?, ?, ?, @mensaje_id)',
          [conversationId, senderId, content, type]
        );
        
        const [output] = await pool.execute('SELECT @mensaje_id as mensaje_id');
        const messageId = output[0].mensaje_id;
        
        // Get the inserted message
        const [messages] = await pool.execute(
          `SELECT m.*, u.nombre as sender_name, u.foto_perfil as sender_avatar
           FROM mensajes m
           JOIN usuarios u ON m.emisor_id = u.id
           WHERE m.id = ?`,
          [messageId]
        );
        
        resolve(messages[0]);
      } catch (error) {
        reject(error);
      }
    });
  }

  static async getMessages(conversationId, userId) {
    const [messages] = await pool.execute(
      `SELECT m.*, u.nombre as sender_name, u.foto_perfil as sender_avatar,
              COALESCE(mep.estado, meg.estado) as user_state
       FROM mensajes m
       JOIN usuarios u ON m.emisor_id = u.id
       LEFT JOIN mensajes_estado_privada mep ON m.id = mep.mensaje_id AND mep.usuario_id = ?
       LEFT JOIN mensajes_estado_grupo meg ON m.id = meg.mensaje_id AND meg.usuario_id = ?
       WHERE (m.conversacion_id = ? OR m.grupo_id = ?)
         AND m.eliminado = 0
         AND NOT EXISTS (
           SELECT 1 FROM mensajes_ocultos_usuario mou 
           WHERE mou.mensaje_id = m.id AND mou.usuario_id = ?
         )
       ORDER BY m.created_at ASC`,
      [userId, userId, conversationId, conversationId, userId]
    );
    
    return messages;
  }

  static async updateState(messageId, userId, state) {
    // Check if it's a private or group message
    const [message] = await pool.execute(
      `SELECT conversacion_id, grupo_id FROM mensajes WHERE id = ?`,
      [messageId]
    );
    
    if (message[0]?.grupo_id) {
      // Group message
      await pool.execute(
        `UPDATE mensajes_estado_grupo 
         SET estado = ?, updated_at = NOW() 
         WHERE mensaje_id = ? AND usuario_id = ?`,
        [state, messageId, userId]
      );
    } else {
      // Private message
      await pool.execute(
        `UPDATE mensajes_estado_privada 
         SET estado = ?, actualizado_at = NOW() 
         WHERE mensaje_id = ? AND usuario_id = ?`,
        [state, messageId, userId]
      );
    }
  }

  static async markConversationAsRead(conversationId, userId) {
    const [result] = await pool.execute(
      'CALL sp_marcar_leidos_conversacion(?, ?)',
      [conversationId, userId]
    );
    return result.affectedRows;
  }

  static async deleteForUser(messageId, userId) {
    const [result] = await pool.execute(
      `INSERT INTO mensajes_ocultos_usuario (mensaje_id, usuario_id, tipo_enum) 
       VALUES (?, ?, 'ocultar') 
       ON DUPLICATE KEY UPDATE ocultado_at = CURRENT_TIMESTAMP`,
      [messageId, userId]
    );
    return result.affectedRows > 0;
  }

  static async getUnreadCount(userId, conversationId) {
    const [result] = await pool.execute(
      `SELECT COUNT(*) as count 
       FROM mensajes m
       LEFT JOIN mensajes_estado_privada mep ON m.id = mep.mensaje_id AND mep.usuario_id = ?
       LEFT JOIN mensajes_estado_grupo meg ON m.id = meg.mensaje_id AND meg.usuario_id = ?
       WHERE (m.conversacion_id = ? OR m.grupo_id = ?)
         AND m.emisor_id != ?
         AND m.eliminado = 0
         AND (mep.estado IS NULL OR mep.estado != 'read')
         AND (meg.estado IS NULL OR meg.estado != 'read')
         AND NOT EXISTS (
           SELECT 1 FROM mensajes_ocultos_usuario mou 
           WHERE mou.mensaje_id = m.id AND mou.usuario_id = ?
         )`,
      [userId, userId, conversationId, conversationId, userId, userId]
    );
    
    return result[0].count;
  }
}

module.exports = Message;