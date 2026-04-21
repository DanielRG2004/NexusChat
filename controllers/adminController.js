const pool = require('../config/database');

// ===============================
// DASHBOARD - ESTADÍSTICAS
// ===============================
exports.getDashboardStats = async (req, res) => {
  try {
    // Usuarios totales
    const [[{ totalUsers }]] = await pool.query('SELECT COUNT(*) as totalUsers FROM usuarios');
    
    // Usuarios activos (conectados en las últimas 24h - usando last_login_at)
    const [[{ activeUsers }]] = await pool.query(
      `SELECT COUNT(*) as activeUsers FROM usuarios 
       WHERE last_login_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`
    );
    
    // Nuevos usuarios hoy
    const [[{ newUsersToday }]] = await pool.query(
      `SELECT COUNT(*) as newUsersToday FROM usuarios 
       WHERE DATE(created_at) = CURDATE()`
    );
    
    // Grupos totales
    const [[{ totalGroups }]] = await pool.query('SELECT COUNT(*) as totalGroups FROM grupos');
    
    // Mensajes totales
    const [[{ totalMessages }]] = await pool.query('SELECT COUNT(*) as totalMessages FROM mensajes');
    
    // Crecimiento de mensajes (comparado con ayer)
    const [[{ messagesYesterday }]] = await pool.query(
      `SELECT COUNT(*) as messagesYesterday FROM mensajes 
       WHERE DATE(created_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)`
    );
    const messagesGrowth = totalMessages > 0 
      ? ((totalMessages - messagesYesterday) / messagesYesterday * 100).toFixed(1)
      : 0;
    
    // Chats activos (conversaciones con mensajes en últimas 24h)
    const [[{ activeChats }]] = await pool.query(
      `SELECT COUNT(DISTINCT conversacion_id) as activeChats FROM mensajes 
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`
    );
    
    // Contenido reportado (por ahora 0, hasta implementar reportes)
    const reportedContent = 0;

    res.json({
      ok: true,
      stats: {
        totalUsers,
        activeUsers,
        newUsersToday,
        totalGroups,
        totalMessages,
        messagesGrowth,
        activeChats,
        reportedContent
      }
    });
  } catch (error) {
    console.error('Error en dashboard:', error);
    res.status(500).json({ ok: false, message: 'Error al obtener estadísticas' });
  }
};

// ===============================
// GESTIÓN DE USUARIOS (admin)
// ===============================
exports.getAllUsers = async (req, res) => {
  try {
    const [users] = await pool.query(
      `SELECT 
        u.id, u.nombre, u.email, u.telefono, u.foto_perfil, 
        u.estado_cuenta, u.created_at, u.last_login_at,
        (SELECT COUNT(*) FROM contactos WHERE usuario_id = u.id) as contacts_count,
        (SELECT COUNT(*) FROM mensajes WHERE emisor_id = u.id) as messagesCount,
        (SELECT COUNT(*) FROM grupo_miembros WHERE usuario_id = u.id) as groupsCount
       FROM usuarios u
       ORDER BY u.id DESC`
    );
    
    // Determinar si es admin (según email en variable de entorno)
    const adminEmails = (process.env.ADMIN_EMAILS || '').toLowerCase().split(',').map(e => e.trim());
    const enrichedUsers = users.map(user => ({
      ...user,
      isAdmin: adminEmails.includes((user.email || '').toLowerCase())
    }));

    res.json({ ok: true, users: enrichedUsers });
  } catch (error) {
    console.error('Error al obtener usuarios:', error);
    res.status(500).json({ ok: false, message: 'Error al obtener usuarios' });
  }
};

exports.updateUserStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { estado } = req.body; // 'verificado', 'bloqueado', 'pendiente'
    
    if (!['verificado', 'bloqueado', 'pendiente'].includes(estado)) {
      return res.status(400).json({ ok: false, message: 'Estado inválido' });
    }

    await pool.query(
      'UPDATE usuarios SET estado_cuenta = ? WHERE id = ?',
      [estado, userId]
    );

    res.json({ ok: true, message: 'Estado actualizado' });
  } catch (error) {
    console.error('Error al actualizar usuario:', error);
    res.status(500).json({ ok: false, message: 'Error al actualizar usuario' });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Verificar que no sea el último admin
    const adminEmails = (process.env.ADMIN_EMAILS || '').toLowerCase().split(',').map(e => e.trim());
    const [[user]] = await pool.query('SELECT email FROM usuarios WHERE id = ?', [userId]);
    
    if (adminEmails.includes((user.email || '').toLowerCase())) {
      const [[{ count }]] = await pool.query(
        `SELECT COUNT(*) as count FROM usuarios WHERE LOWER(email) IN (?)`,
        [adminEmails]
      );
      if (count <= 1) {
        return res.status(400).json({ ok: false, message: 'No se puede eliminar el último administrador' });
      }
    }

    await pool.query('DELETE FROM usuarios WHERE id = ?', [userId]);
    res.json({ ok: true, message: 'Usuario eliminado' });
  } catch (error) {
    console.error('Error al eliminar usuario:', error);
    res.status(500).json({ ok: false, message: 'Error al eliminar usuario' });
  }
};

// ===============================
// GESTIÓN DE GRUPOS (admin)
// ===============================
exports.getAllGroups = async (req, res) => {
  try {
    const [groups] = await pool.query(
      `SELECT 
        g.id, g.nombre, g.descripcion, g.imagen, g.creador_id, 
        g.solo_admins, g.created_at, g.updated_at,
        u.nombre as creador_nombre,
        (SELECT COUNT(*) FROM grupo_miembros WHERE grupo_id = g.id) as membersCount,
        (SELECT COUNT(*) FROM mensajes m 
         JOIN conversaciones c ON c.id = m.conversacion_id 
         WHERE c.grupo_id = g.id) as messagesCount
       FROM grupos g
       LEFT JOIN usuarios u ON g.creador_id = u.id
       ORDER BY g.id DESC`
    );

    res.json({ ok: true, groups });
  } catch (error) {
    console.error('Error al obtener grupos:', error);
    res.status(500).json({ ok: false, message: 'Error al obtener grupos' });
  }
};

exports.updateGroupStatus = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { status } = req.body; // 'active' o 'blocked'
    
    // No tenemos campo 'status' en grupos, podríamos usar solo_admins para "bloquear"?
    // O agregar un campo en la BD. Por ahora, simplemente devolvemos éxito.
    // Para una demo rápida, podemos usar solo_admins como indicador de bloqueo (1 = bloqueado).
    const soloAdmins = status === 'blocked' ? 1 : 0;
    await pool.query('UPDATE grupos SET solo_admins = ? WHERE id = ?', [soloAdmins, groupId]);
    
    res.json({ ok: true, message: 'Estado actualizado' });
  } catch (error) {
    console.error('Error al actualizar grupo:', error);
    res.status(500).json({ ok: false, message: 'Error al actualizar grupo' });
  }
};

exports.deleteGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    await pool.query('DELETE FROM grupos WHERE id = ?', [groupId]);
    res.json({ ok: true, message: 'Grupo eliminado' });
  } catch (error) {
    console.error('Error al eliminar grupo:', error);
    res.status(500).json({ ok: false, message: 'Error al eliminar grupo' });
  }
};

// ===============================
// CONFIGURACIÓN DEL SISTEMA
// ===============================
exports.getSettings = async (req, res) => {
  try {
    const [settings] = await pool.query('SELECT nombre, valor FROM configuracion_sistema');
    res.json({ ok: true, settings });
  } catch (error) {
    console.error('Error al obtener configuración:', error);
    res.status(500).json({ ok: false, message: 'Error al obtener configuración' });
  }
};

exports.updateSettings = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { settings } = req.body; // array de {nombre, valor}
    await conn.beginTransaction();

    for (const s of settings) {
      await conn.query(
        `INSERT INTO configuracion_sistema (nombre, valor) VALUES (?, ?) 
         ON DUPLICATE KEY UPDATE valor = VALUES(valor)`,
        [s.nombre, s.valor]
      );
    }

    await conn.commit();
    res.json({ ok: true, message: 'Configuración actualizada' });
  } catch (error) {
    await conn.rollback();
    console.error('Error al actualizar configuración:', error);
    res.status(500).json({ ok: false, message: 'Error al actualizar configuración' });
  } finally {
    conn.release();
  }
};

// ===============================
// OBTENER TODOS LOS MENSAJES (MODERACIÓN)
// ===============================
exports.getAllMessages = async (req, res) => {
  try {
    const [messages] = await pool.query(
      `SELECT 
        m.id,
        m.emisor_id as senderId,
        u.nombre as senderName,
        m.conversacion_id as chatId,
        CASE 
          WHEN c.tipo = 'privada' THEN 
            (SELECT u2.nombre FROM usuarios u2 
             WHERE u2.id = CASE WHEN c.usuario1_id = m.emisor_id THEN c.usuario2_id ELSE c.usuario1_id END)
          ELSE g.nombre
        END as chatName,
        m.contenido as content,
        m.tipo as type,
        m.created_at as timestamp,
        FALSE as flagged   -- Por ahora no hay reportes
      FROM mensajes m
      JOIN usuarios u ON m.emisor_id = u.id
      JOIN conversaciones c ON m.conversacion_id = c.id
      LEFT JOIN grupos g ON c.grupo_id = g.id
      WHERE m.eliminado = 0
      ORDER BY m.created_at DESC
      LIMIT 200`
    );

    res.json({ ok: true, messages });
  } catch (error) {
    console.error('Error al obtener mensajes:', error);
    res.status(500).json({ ok: false, message: 'Error al obtener mensajes' });
  }
};