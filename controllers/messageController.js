const pool = require('../config/database');

// ===============================
// GET MESSAGES
// ===============================
exports.getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;
    
    const [messages] = await pool.execute(
      `SELECT 
        m.id,
        m.conversacion_id,
        m.emisor_id,
        m.contenido,
        m.tipo,
        m.created_at,
        u.nombre as sender_name,
        u.foto_perfil as sender_avatar,

        CASE 
          WHEN m.emisor_id = ? THEN (
            SELECT 
              CASE
                WHEN MAX(
                  CASE 
                    WHEN estado = 'read' THEN 3
                    WHEN estado = 'delivered' THEN 2
                    WHEN estado = 'sent' THEN 1
                  END
                ) = 3 THEN 'read'
                
                WHEN MAX(
                  CASE 
                    WHEN estado = 'read' THEN 3
                    WHEN estado = 'delivered' THEN 2
                    WHEN estado = 'sent' THEN 1
                  END
                ) = 2 THEN 'delivered'
                
                ELSE 'sent'
              END
            FROM mensajes_estado_privada 
            WHERE mensaje_id = m.id AND usuario_id != ?
          )
          ELSE mep.estado
        END as user_state

      FROM mensajes m
      JOIN usuarios u ON m.emisor_id = u.id
      LEFT JOIN mensajes_estado_privada mep 
        ON m.id = mep.mensaje_id AND mep.usuario_id = ?
      WHERE m.conversacion_id = ?
        AND m.eliminado = 0
        AND NOT EXISTS (
          SELECT 1 FROM mensajes_ocultos_usuario mou 
          WHERE mou.mensaje_id = m.id AND mou.usuario_id = ?
        )
      ORDER BY m.created_at ASC`,
      [userId, userId, userId, conversationId, userId]
    );
    
    res.json(messages);

  } catch (error) {
    console.error('❌ Error getting messages:', error);
    res.status(500).json({ error: 'Error al cargar mensajes' });
  }
};


// ===============================
// SEND MESSAGE
// ===============================
exports.sendMessage = async (req, res) => {
  try {
    const { conversationId, content, type = 'texto' } = req.body;
    const userId = req.user.id;

    const [result] = await pool.execute(
      `INSERT INTO mensajes (conversacion_id, emisor_id, contenido, tipo, created_at) 
       VALUES (?, ?, ?, ?, NOW())`,
      [conversationId, userId, content, type]
    );
    const messageId = result.insertId;

    const [conv] = await pool.execute(
      `SELECT usuario1_id, usuario2_id FROM conversaciones WHERE id = ?`,
      [conversationId]
    );
    const receiverId = conv[0].usuario1_id === userId ? conv[0].usuario2_id : conv[0].usuario1_id;

    await pool.execute(
      `INSERT INTO mensajes_estado_privada (mensaje_id, usuario_id, estado) VALUES 
       (?, ?, 'sent'), (?, ?, 'sent')`,
      [messageId, userId, messageId, receiverId]
    );

    // Si es multimedia, guardar en archivos_multimedia
    if (type !== 'texto') {
      const { mediaUrl, thumbnailUrl, duration, mimetype, size, originalName } = req.body;
      const filename = require('path').basename(mediaUrl || '');
      await pool.execute(
        `INSERT INTO archivos_multimedia 
         (mensaje_id, usuario_id, nombre_original, nombre_archivo, url, tipo_mime, tipo, tamanio, duracion, thumbnail_url, estado)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'listo')`,
        [
          messageId, userId,
          originalName || filename,
          filename,
          mediaUrl,
          mimetype || 'application/octet-stream',
          type,
          size || 0,
          duration || null,
          thumbnailUrl || null
        ]
      );
    }

    const [message] = await pool.execute(
      `SELECT m.*, u.nombre as sender_name 
       FROM mensajes m
       JOIN usuarios u ON m.emisor_id = u.id
       WHERE m.id = ?`,
      [messageId]
    );

    res.status(201).json(message[0]);
  } catch (error) {
    console.error('❌ Error sending message:', error);
    res.status(500).json({ error: 'Error al enviar mensaje' });
  }
};


// ===============================
// ELIMINAR MENSAJE INDIVIDUAL
// ===============================
exports.deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;
    
    console.log(`🗑️ Eliminando mensaje ${messageId} para usuario ${userId}`);
    
    await pool.execute(
      `INSERT INTO mensajes_ocultos_usuario (mensaje_id, usuario_id, tipo_enum) 
       VALUES (?, ?, 'ocultar') 
       ON DUPLICATE KEY UPDATE ocultado_at = NOW()`,
      [messageId, userId]
    );
    
    res.json({ message: 'Mensaje eliminado correctamente' });
    
  } catch (error) {
    console.error('❌ Error deleting message:', error);
    res.status(500).json({ error: 'Error al eliminar mensaje' });
  }
};


// ===============================
// ELIMINAR HISTORIAL COMPLETO
// ===============================
exports.deleteChatHistory = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;
    
    console.log(`🗑️ Eliminando historial de conversación ${conversationId} para usuario ${userId}`);
    
    const [messages] = await pool.execute(
      `SELECT id FROM mensajes WHERE conversacion_id = ? AND eliminado = 0`,
      [conversationId]
    );
    
    for (const msg of messages) {
      await pool.execute(
        `INSERT INTO mensajes_ocultos_usuario (mensaje_id, usuario_id, tipo_enum) 
         VALUES (?, ?, 'ocultar') 
         ON DUPLICATE KEY UPDATE ocultado_at = NOW()`,
        [msg.id, userId]
      );
    }
    
    res.json({ message: 'Historial eliminado correctamente' });
    
  } catch (error) {
    console.error('❌ Error deleting chat history:', error);
    res.status(500).json({ error: 'Error al eliminar historial' });
  }
};