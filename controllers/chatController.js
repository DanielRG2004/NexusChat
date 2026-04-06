const pool = require('../config/database');

// Get all conversations (sin contador de no leídos)
exports.getConversations = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log('📥 Fetching conversations for user:', userId);
    
    const [conversations] = await pool.execute(
      `SELECT 
        c.id,
        c.tipo,
        c.created_at,
        CASE 
          WHEN c.usuario1_id = ? THEN u2.id
          ELSE u1.id
        END as other_user_id,
        CASE 
          WHEN c.usuario1_id = ? THEN u2.nombre
          ELSE u1.nombre
        END as other_user_name,
        CASE 
          WHEN c.usuario1_id = ? THEN u2.telefono
          ELSE u1.telefono
        END as other_user_phone,
        CASE 
          WHEN c.usuario1_id = ? THEN u2.foto_perfil
          ELSE u1.foto_perfil
        END as other_user_avatar,
        CASE 
          WHEN c.usuario1_id = ? THEN c2.apodo
          ELSE c3.apodo
        END as other_user_apodo,
        'private' as type,
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
        CASE WHEN c2.id IS NOT NULL OR c3.id IS NOT NULL THEN true ELSE false END as is_contact,
        -- ARCHIVADO Y FIJADO correctos para el usuario actual
        COALESCE(
          CASE WHEN c.usuario1_id = ? THEN c2.archivado ELSE c3.archivado END,
          0
        ) as archivado,
        COALESCE(
          CASE WHEN c.usuario1_id = ? THEN c2.fijado ELSE c3.fijado END,
          0
        ) as fijado
      FROM conversaciones c
      LEFT JOIN usuarios u1 ON c.usuario1_id = u1.id
      LEFT JOIN usuarios u2 ON c.usuario2_id = u2.id
      LEFT JOIN contactos c2 ON c2.contacto_id = u2.id AND c2.usuario_id = ?
      LEFT JOIN contactos c3 ON c3.contacto_id = u1.id AND c3.usuario_id = ?
      WHERE c.tipo = 'privada'
        AND (c.usuario1_id = ? OR c.usuario2_id = ?)
        AND COALESCE(
          CASE WHEN c.usuario1_id = ? THEN c2.archivado ELSE c3.archivado END,
          0
        ) = 0
      ORDER BY COALESCE(
          CASE WHEN c.usuario1_id = ? THEN c2.fijado ELSE c3.fijado END,
          0
        ) DESC, last_message_time DESC, c.created_at DESC`,
      [
        userId, userId, userId, userId, userId,
        userId, // para mensajes ocultos (last_message)
        userId, // para mensajes ocultos (last_message_time)
        userId, // para archivado (cuando es usuario1)
        userId, // para fijado (cuando es usuario1)
        userId, // para c2.usuario_id
        userId, // para c3.usuario_id
        userId, // para WHERE (c.usuario1_id = ?)
        userId, // para WHERE (c.usuario2_id = ?)
        userId, // para WHERE archivado
        userId  // para ORDER BY fijado
      ]
    );
    
    console.log(`📊 Found ${conversations.length} conversations`);
    res.json(conversations);
  } catch (error) {
    console.error('❌ Error fetching conversations:', error);
    res.status(500).json({ error: 'Error al cargar conversaciones' });
  }
};

// Get archived conversations
exports.getArchivedConversations = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log('📥 Fetching archived conversations for user:', userId);
    
    const [conversations] = await pool.execute(
      `SELECT 
        c.id,
        c.tipo,
        c.created_at,
        CASE 
          WHEN c.usuario1_id = ? THEN u2.id
          ELSE u1.id
        END as other_user_id,
        CASE 
          WHEN c.usuario1_id = ? THEN u2.nombre
          ELSE u1.nombre
        END as other_user_name,
        CASE 
          WHEN c.usuario1_id = ? THEN u2.telefono
          ELSE u1.telefono
        END as other_user_phone,
        CASE 
          WHEN c.usuario1_id = ? THEN u2.foto_perfil
          ELSE u1.foto_perfil
        END as other_user_avatar,
        CASE 
          WHEN c.usuario1_id = ? THEN c2.apodo
          ELSE c3.apodo
        END as other_user_apodo,
        'private' as type,
        (SELECT contenido FROM mensajes 
         WHERE conversacion_id = c.id 
         AND eliminado = 0
         ORDER BY created_at DESC LIMIT 1) as last_message,
        (SELECT created_at FROM mensajes 
         WHERE conversacion_id = c.id 
         AND eliminado = 0
         ORDER BY created_at DESC LIMIT 1) as last_message_time,
        CASE WHEN c2.id IS NOT NULL OR c3.id IS NOT NULL THEN true ELSE false END as is_contact,
        -- ARCHIVADO Y FIJADO correctos para el usuario actual
        COALESCE(
          CASE WHEN c.usuario1_id = ? THEN c2.archivado ELSE c3.archivado END,
          0
        ) as archivado,
        COALESCE(
          CASE WHEN c.usuario1_id = ? THEN c2.fijado ELSE c3.fijado END,
          0
        ) as fijado
      FROM conversaciones c
      LEFT JOIN usuarios u1 ON c.usuario1_id = u1.id
      LEFT JOIN usuarios u2 ON c.usuario2_id = u2.id
      LEFT JOIN contactos c2 ON c2.contacto_id = u2.id AND c2.usuario_id = ?
      LEFT JOIN contactos c3 ON c3.contacto_id = u1.id AND c3.usuario_id = ?
      WHERE c.tipo = 'privada'
        AND (c.usuario1_id = ? OR c.usuario2_id = ?)
        AND COALESCE(
          CASE WHEN c.usuario1_id = ? THEN c2.archivado ELSE c3.archivado END,
          0
        ) = 1
      ORDER BY last_message_time DESC, c.created_at DESC`,
      [
        userId, userId, userId, userId, userId,
        userId, // para archivado (cuando es usuario1)
        userId, // para fijado (cuando es usuario1)
        userId, // para c2.usuario_id
        userId, // para c3.usuario_id
        userId, // para WHERE (c.usuario1_id = ?)
        userId, // para WHERE (c.usuario2_id = ?)
        userId  // para WHERE archivado
      ]
    );
    
    console.log(`📊 Found ${conversations.length} archived conversations`);
    res.json(conversations);
  } catch (error) {
    console.error('❌ Error fetching archived conversations:', error);
    res.status(500).json({ error: 'Error al cargar conversaciones archivadas' });
  }
};

// Archive conversation
exports.archiveConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;
    
    const [conversation] = await pool.execute(
      `SELECT usuario1_id, usuario2_id FROM conversaciones WHERE id = ?`,
      [conversationId]
    );
    
    if (conversation.length === 0) {
      return res.status(404).json({ error: 'Conversación no encontrada' });
    }
    
    const otherUserId = conversation[0].usuario1_id === userId ? 
      conversation[0].usuario2_id : conversation[0].usuario1_id;
    
    await pool.execute(
      `UPDATE contactos SET archivado = 1 
       WHERE usuario_id = ? AND contacto_id = ?`,
      [userId, otherUserId]
    );
    
    res.json({ message: 'Conversación archivada' });
  } catch (error) {
    console.error('Error archiving conversation:', error);
    res.status(500).json({ error: 'Error al archivar conversación' });
  }
};

// Unarchive conversation
exports.unarchiveConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;
    
    const [conversation] = await pool.execute(
      `SELECT usuario1_id, usuario2_id FROM conversaciones WHERE id = ?`,
      [conversationId]
    );
    
    if (conversation.length === 0) {
      return res.status(404).json({ error: 'Conversación no encontrada' });
    }
    
    const otherUserId = conversation[0].usuario1_id === userId ? 
      conversation[0].usuario2_id : conversation[0].usuario1_id;
    
    await pool.execute(
      `UPDATE contactos SET archivado = 0 
       WHERE usuario_id = ? AND contacto_id = ?`,
      [userId, otherUserId]
    );
    
    res.json({ message: 'Conversación desarchivada' });
  } catch (error) {
    console.error('Error unarchiving conversation:', error);
    res.status(500).json({ error: 'Error al desarchivar conversación' });
  }
};

// Pin conversation
exports.pinConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;
    
    const [conversation] = await pool.execute(
      `SELECT usuario1_id, usuario2_id FROM conversaciones WHERE id = ?`,
      [conversationId]
    );
    
    if (conversation.length === 0) {
      return res.status(404).json({ error: 'Conversación no encontrada' });
    }
    
    const otherUserId = conversation[0].usuario1_id === userId ? 
      conversation[0].usuario2_id : conversation[0].usuario1_id;
    
    await pool.execute(
      `UPDATE contactos SET fijado = NOT fijado 
       WHERE usuario_id = ? AND contacto_id = ?`,
      [userId, otherUserId]
    );
    
    const [result] = await pool.execute(
      `SELECT fijado FROM contactos WHERE usuario_id = ? AND contacto_id = ?`,
      [userId, otherUserId]
    );
    
    const isPinned = result[0]?.fijado === 1;
    res.json({ 
      message: isPinned ? 'Conversación fijada' : 'Conversación desfijada',
      pinned: isPinned
    });
  } catch (error) {
    console.error('Error pinning conversation:', error);
    res.status(500).json({ error: 'Error al fijar conversación' });
  }
};

// Create private conversation
exports.createPrivateConversation = async (req, res) => {
  try {
    const { userId1, userId2 } = req.body;
    console.log('🔨 Creating conversation between:', userId1, 'and', userId2);
    
    const [users] = await pool.execute(
      'SELECT id, nombre FROM usuarios WHERE id IN (?, ?)',
      [userId1, userId2]
    );
    
    if (users.length !== 2) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    const [existing] = await pool.execute(
      `SELECT id FROM conversaciones 
       WHERE tipo = 'privada'
         AND ((usuario1_id = ? AND usuario2_id = ?) 
          OR (usuario1_id = ? AND usuario2_id = ?))`,
      [userId1, userId2, userId2, userId1]
    );
    
    if (existing.length > 0) {
      console.log('✅ Conversation already exists:', existing[0].id);
      
      const [conversation] = await pool.execute(
        `SELECT 
          c.id,
          c.tipo,
          c.created_at,
          CASE 
            WHEN c.usuario1_id = ? THEN u2.id
            ELSE u1.id
          END as other_user_id,
          CASE 
            WHEN c.usuario1_id = ? THEN u2.nombre
            ELSE u1.nombre
          END as other_user_name,
          CASE 
            WHEN c.usuario1_id = ? THEN u2.telefono
            ELSE u1.telefono
          END as other_user_phone,
          CASE 
            WHEN c.usuario1_id = ? THEN u2.foto_perfil
            ELSE u1.foto_perfil
          END as other_user_avatar,
          CASE 
            WHEN c.usuario1_id = ? THEN c2.apodo
            ELSE c3.apodo
          END as other_user_apodo,
          'private' as type,
          true as is_contact,
          COALESCE(
            CASE WHEN c.usuario1_id = ? THEN c2.archivado ELSE c3.archivado END,
            0
          ) as archivado,
          COALESCE(
            CASE WHEN c.usuario1_id = ? THEN c2.fijado ELSE c3.fijado END,
            0
          ) as fijado
        FROM conversaciones c
        LEFT JOIN usuarios u1 ON c.usuario1_id = u1.id
        LEFT JOIN usuarios u2 ON c.usuario2_id = u2.id
        LEFT JOIN contactos c2 ON c2.contacto_id = u2.id AND c2.usuario_id = ?
        LEFT JOIN contactos c3 ON c3.contacto_id = u1.id AND c3.usuario_id = ?
        WHERE c.id = ?`,
        [userId1, userId1, userId1, userId1, userId1, userId1, userId1, userId1, existing[0].id]
      );
      
      return res.json(conversation[0]);
    }
    
    const [result] = await pool.execute(
      `INSERT INTO conversaciones (tipo, usuario1_id, usuario2_id, created_at) 
       VALUES ('privada', ?, ?, NOW())`,
      [userId1, userId2]
    );
    
    const conversationId = result.insertId;
    console.log('✅ New conversation created with ID:', conversationId);
    
    const [conversation] = await pool.execute(
      `SELECT 
        c.id,
        c.tipo,
        c.created_at,
        CASE 
          WHEN c.usuario1_id = ? THEN u2.id
          ELSE u1.id
        END as other_user_id,
        CASE 
          WHEN c.usuario1_id = ? THEN u2.nombre
          ELSE u1.nombre
        END as other_user_name,
        CASE 
          WHEN c.usuario1_id = ? THEN u2.telefono
          ELSE u1.telefono
        END as other_user_phone,
        CASE 
          WHEN c.usuario1_id = ? THEN u2.foto_perfil
          ELSE u1.foto_perfil
        END as other_user_avatar,
        NULL as other_user_apodo,
        'private' as type,
        false as is_contact,
        0 as archivado,
        0 as fijado
      FROM conversaciones c
      LEFT JOIN usuarios u1 ON c.usuario1_id = u1.id
      LEFT JOIN usuarios u2 ON c.usuario2_id = u2.id
      WHERE c.id = ?`,
      [userId1, userId1, userId1, userId1, conversationId]
    );
    
    console.log('📤 Returning new conversation:', conversation[0]);
    res.status(201).json(conversation[0]);
    
  } catch (error) {
    console.error('❌ Error creating conversation:', error);
    res.status(500).json({ error: 'Error al crear conversación' });
  }
};

// Get all conversations with contact status (alias)
exports.getAllConversationsWithUnknown = async (req, res) => {
  try {
    await exports.getConversations(req, res);
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ error: 'Error al cargar conversaciones' });
  }
};