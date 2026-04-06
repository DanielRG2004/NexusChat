const pool = require('../config/database');

class Conversation {
  static async getConversations(userId) {
    // Get private conversations
    const [privateConvs] = await pool.execute(
      `SELECT c.id, c.tipo, c.created_at,
              CASE 
                WHEN c.usuario1_id = ? THEN u2.nombre
                ELSE u1.nombre
              END as other_user_name,
              CASE 
                WHEN c.usuario1_id = ? THEN u2.foto_perfil
                ELSE u1.foto_perfil
              END as other_user_avatar,
              CASE 
                WHEN c.usuario1_id = ? THEN u2.id
                ELSE u1.id
              END as other_user_id,
              (SELECT contenido FROM mensajes 
               WHERE conversacion_id = c.id 
               AND eliminado = 0
               AND NOT EXISTS (
                 SELECT 1 FROM mensajes_ocultos_usuario mou 
                 WHERE mou.mensaje_id = mensajes.id AND mou.usuario_id = ?
               )
               ORDER BY created_at DESC LIMIT 1) as last_message,
              (SELECT created_at FROM mensajes 
               WHERE conversacion_id = c.id 
               AND eliminado = 0
               AND NOT EXISTS (
                 SELECT 1 FROM mensajes_ocultos_usuario mou 
                 WHERE mou.mensaje_id = mensajes.id AND mou.usuario_id = ?
               )
               ORDER BY created_at DESC LIMIT 1) as last_message_time,
              'private' as type
       FROM conversaciones c
       LEFT JOIN usuarios u1 ON c.usuario1_id = u1.id
       LEFT JOIN usuarios u2 ON c.usuario2_id = u2.id
       WHERE c.tipo = 'privada'
         AND (c.usuario1_id = ? OR c.usuario2_id = ?)
       ORDER BY last_message_time DESC`,
      [userId, userId, userId, userId, userId, userId, userId]
    );
    
    // Get group conversations
    const [groupConvs] = await pool.execute(
      `SELECT g.id, g.nombre as group_name, g.imagen as group_avatar,
              'group' as type,
              (SELECT contenido FROM mensajes 
               WHERE grupo_id = g.id 
               AND eliminado = 0
               AND NOT EXISTS (
                 SELECT 1 FROM mensajes_ocultos_usuario mou 
                 WHERE mou.mensaje_id = mensajes.id AND mou.usuario_id = ?
               )
               ORDER BY created_at DESC LIMIT 1) as last_message,
              (SELECT created_at FROM mensajes 
               WHERE grupo_id = g.id 
               AND eliminado = 0
               AND NOT EXISTS (
                 SELECT 1 FROM mensajes_ocultos_usuario mou 
                 WHERE mou.mensaje_id = mensajes.id AND mou.usuario_id = ?
               )
               ORDER BY created_at DESC LIMIT 1) as last_message_time,
              (SELECT COUNT(*) FROM grupo_miembros WHERE grupo_id = g.id) as member_count
       FROM grupos g
       JOIN grupo_miembros gm ON g.id = gm.grupo_id
       WHERE gm.usuario_id = ?
       ORDER BY last_message_time DESC`,
      [userId, userId, userId]
    );
    
    return [...privateConvs, ...groupConvs];
  }

  static async createOrGetPrivate(userId1, userId2) {
    return new Promise(async (resolve, reject) => {
      try {
        const [result] = await pool.execute(
          'CALL sp_obtener_o_crear_conversacion(?, ?, @conversacion_id)',
          [userId1, userId2]
        );
        
        const [output] = await pool.execute('SELECT @conversacion_id as conversacion_id');
        
        const [conversation] = await pool.execute(
          `SELECT c.*, 'private' as type,
                  CASE WHEN c.usuario1_id = ? THEN u2.nombre ELSE u1.nombre END as other_user_name
           FROM conversaciones c
           LEFT JOIN usuarios u1 ON c.usuario1_id = u1.id
           LEFT JOIN usuarios u2 ON c.usuario2_id = u2.id
           WHERE c.id = ?`,
          [userId1, output[0].conversacion_id]
        );
        
        resolve(conversation[0]);
      } catch (error) {
        reject(error);
      }
    });
  }
}

module.exports = Conversation;