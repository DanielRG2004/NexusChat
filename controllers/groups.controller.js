const pool = require('../config/database');

function toInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function normalizeMemberIds(input, currentUserId) {
  const ids = Array.isArray(input) ? input : [];
  return [...new Set(
    ids
      .map(toInt)
      .filter((id) => id && id !== currentUserId)
  )];
}

async function ensureGroupConversation(conn, groupId) {
  const [existing] = await conn.query(
    'SELECT id FROM conversaciones WHERE tipo = "grupo" AND grupo_id = ? LIMIT 1',
    [groupId]
  );

  if (existing[0]) {
    return existing[0].id;
  }

  const [result] = await conn.query(
    'INSERT INTO conversaciones (tipo, grupo_id) VALUES ("grupo", ?)',
    [groupId]
  );

  return result.insertId;
}

async function getMembership(conn, groupId, userId) {
  const [rows] = await conn.query(
    `SELECT gm.usuario_id, gm.rol, gm.silenciado, g.creador_id, g.solo_admins
     FROM grupo_miembros gm
     INNER JOIN grupos g ON g.id = gm.grupo_id
     WHERE gm.grupo_id = ? AND gm.usuario_id = ?
     LIMIT 1`,
    [groupId, userId]
  );

  return rows[0] || null;
}

async function isGroupAdmin(conn, groupId, userId) {
  const membership = await getMembership(conn, groupId, userId);
  return membership && membership.rol === 'admin';
}

async function queryWithRetry(sql, params = [], retries = 1) {
  try {
    return await pool.query(sql, params);
  } catch (error) {
    if (error.code === 'ECONNRESET' && retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      return queryWithRetry(sql, params, retries - 1);
    }
    throw error;
  }
}


async function searchUsers(req, res, next) {
  try {
    const q = String(req.query.q || '').trim();
    const currentUserId = req.user.id;

    if (!q) {
      return res.json({ ok: true, users: [] });
    }

    const like = `%${q}%`;
    const digits = q.replace(/\D/g, '');
    const phoneLike = digits ? `%${digits}%` : like;

    const [rows] = await queryWithRetry(
      `SELECT id, nombre, telefono, foto_perfil, descripcion, estado_cuenta
       FROM usuarios
       WHERE id <> ?
         AND (
           nombre LIKE ?
           OR email LIKE ?
           OR telefono LIKE ?
           OR REPLACE(telefono, '+', '') LIKE ?
         )
       ORDER BY nombre ASC
       LIMIT 20`,
      [
        currentUserId,
        like,
        like,
        phoneLike,
        phoneLike
      ]
    );

    return res.json({ ok: true, users: rows });
  } catch (error) {
    next(error);
  }
}

async function createGroup(req, res, next) {
  const conn = await pool.getConnection();

  try {
    const {
      nombre,
      descripcion = '',
      imagen = 'group_default.png',
      solo_admins = 0,
      miembros = []
    } = req.body;

    const cleanNombre = String(nombre || '').trim();
    if (cleanNombre.length < 3) {
      return res.status(400).json({
        ok: false,
        message: 'El nombre del grupo debe tener al menos 3 caracteres'
      });
    }

    const memberIds = normalizeMemberIds(miembros, req.user.id);

    await conn.beginTransaction();

    const [groupResult] = await conn.query(
      `INSERT INTO grupos (nombre, descripcion, imagen, creador_id, solo_admins)
       VALUES (?, ?, ?, ?, ?)`,
      [cleanNombre, String(descripcion || '').trim(), String(imagen || 'group_default.png').trim(), req.user.id, solo_admins ? 1 : 0]
    );

    const groupId = groupResult.insertId;

    await conn.query(
      `INSERT INTO grupo_miembros (grupo_id, usuario_id, rol, silenciado)
       VALUES (?, ?, 'admin', 0)`,
      [groupId, req.user.id]
    );

    if (memberIds.length > 0) {
      const placeholders = memberIds.map(() => '?').join(',');
      const [existingUsers] = await conn.query(
        `SELECT id FROM usuarios WHERE id IN (${placeholders})`,
        memberIds
      );

      const validIds = existingUsers.map((u) => u.id);
      if (validIds.length > 0) {
        const values = validIds.map((id) => [groupId, id, 'miembro', 0]);

        await conn.query(
          `INSERT IGNORE INTO grupo_miembros (grupo_id, usuario_id, rol, silenciado)
           VALUES ?`,
          [values]
        );
      }
    }

    const conversacionId = await ensureGroupConversation(conn, groupId);

    await conn.commit();

    return res.status(201).json({
      ok: true,
      message: 'Grupo creado correctamente',
      group: {
        id: groupId,
        conversacion_id: conversacionId,
        nombre: cleanNombre,
        descripcion: String(descripcion || '').trim(),
        imagen: String(imagen || 'group_default.png').trim(),
        solo_admins: solo_admins ? 1 : 0,
        creador_id: req.user.id
      }
    });
  } catch (error) {
    await conn.rollback();
    next(error);
  } finally {
    conn.release();
  }
}

async function myGroups(req, res, next) {
  try {
    const userId = req.user.id;

    const [rows] = await pool.query(
      `SELECT
         g.id,
         g.nombre,
         g.descripcion,
         g.imagen,
         g.creador_id,
         g.solo_admins,
         g.created_at,
         g.updated_at,
         gm.rol AS mi_rol,
         gm.silenciado AS mi_silenciado,
         c.id AS conversacion_id,
         (
           SELECT COUNT(*)
           FROM grupo_miembros gm2
           WHERE gm2.grupo_id = g.id
         ) AS miembros_count,
         (
           SELECT m.contenido
           FROM mensajes m
           INNER JOIN conversaciones c2 ON c2.id = m.conversacion_id
           WHERE c2.grupo_id = g.id
           ORDER BY m.id DESC
           LIMIT 1
         ) AS ultimo_mensaje,
         (
           SELECT m.created_at
           FROM mensajes m
           INNER JOIN conversaciones c2 ON c2.id = m.conversacion_id
           WHERE c2.grupo_id = g.id
           ORDER BY m.id DESC
           LIMIT 1
         ) AS ultima_fecha
       FROM grupos g
       INNER JOIN grupo_miembros gm ON gm.grupo_id = g.id
       LEFT JOIN conversaciones c ON c.grupo_id = g.id AND c.tipo = 'grupo'
       WHERE gm.usuario_id = ?
       ORDER BY COALESCE(g.updated_at, g.created_at) DESC`,
      [userId]
    );

    return res.json({ ok: true, groups: rows });
  } catch (error) {
    next(error);
  }
}

async function getGroupById(req, res, next) {
  try {
    const groupId = toInt(req.params.groupId);
    if (!groupId) {
      return res.status(400).json({
        ok: false,
        message: 'Grupo invalido'
      });
    }

    const userId = req.user.id;

    const [groupRows] = await pool.query(
      `SELECT
         g.id,
         g.nombre,
         g.descripcion,
         g.imagen,
         g.creador_id,
         g.solo_admins,
         g.created_at,
         g.updated_at,
         c.id AS conversacion_id,
         gm.rol AS mi_rol,
         gm.silenciado AS mi_silenciado,
         (
           SELECT COUNT(*)
           FROM grupo_miembros gm2
           WHERE gm2.grupo_id = g.id
         ) AS miembros_count
       FROM grupos g
       INNER JOIN grupo_miembros gm ON gm.grupo_id = g.id AND gm.usuario_id = ?
       LEFT JOIN conversaciones c ON c.grupo_id = g.id AND c.tipo = 'grupo'
       WHERE g.id = ?
       LIMIT 1`,
      [userId, groupId]
    );

    const group = groupRows[0];
    if (!group) {
      return res.status(404).json({
        ok: false,
        message: 'Grupo no encontrado o no eres miembro'
      });
    }

    const [members] = await pool.query(
      `SELECT
         gm.usuario_id,
         gm.rol,
         gm.silenciado,
         gm.fecha_ingreso,
         u.nombre,
         u.telefono,
         u.foto_perfil,
         u.descripcion,
         u.estado_cuenta
       FROM grupo_miembros gm
       INNER JOIN usuarios u ON u.id = gm.usuario_id
       WHERE gm.grupo_id = ?
       ORDER BY gm.rol = 'admin' DESC, u.nombre ASC`,
      [groupId]
    );

    return res.json({
      ok: true,
      group,
      members
    });
  } catch (error) {
    next(error);
  }
}

async function updateGroup(req, res, next) {
  const conn = await pool.getConnection();

  try {
    const groupId = toInt(req.params.groupId);
    if (!groupId) {
      return res.status(400).json({
        ok: false,
        message: 'Grupo invalido'
      });
    }

    const {
      nombre,
      descripcion,
      imagen,
      solo_admins
    } = req.body;

    await conn.beginTransaction();

    const membership = await getMembership(conn, groupId, req.user.id);
    if (!membership) {
      await conn.rollback();
      return res.status(403).json({
        ok: false,
        message: 'No eres miembro de este grupo'
      });
    }

    if (membership.rol !== 'admin') {
      await conn.rollback();
      return res.status(403).json({
        ok: false,
        message: 'Solo un admin puede modificar el grupo'
      });
    }

    const fields = [];
    const values = [];

    if (nombre !== undefined) {
      const clean = String(nombre || '').trim();
      if (clean.length < 3) {
        await conn.rollback();
        return res.status(400).json({
          ok: false,
          message: 'El nombre debe tener al menos 3 caracteres'
        });
      }
      fields.push('nombre = ?');
      values.push(clean);
    }

    if (descripcion !== undefined) {
      fields.push('descripcion = ?');
      values.push(String(descripcion || '').trim());
    }

    if (imagen !== undefined) {
      fields.push('imagen = ?');
      values.push(String(imagen || 'group_default.png').trim());
    }

    if (solo_admins !== undefined) {
      fields.push('solo_admins = ?');
      values.push(solo_admins ? 1 : 0);
    }

    if (fields.length === 0) {
      await conn.rollback();
      return res.status(400).json({
        ok: false,
        message: 'No hay cambios para aplicar'
      });
    }

    values.push(groupId);

    await conn.query(
      `UPDATE grupos SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    await conn.commit();

    return res.json({
      ok: true,
      message: 'Grupo actualizado correctamente'
    });
  } catch (error) {
    await conn.rollback();
    next(error);
  } finally {
    conn.release();
  }
}

async function addMembers(req, res, next) {
  const conn = await pool.getConnection();

  try {
    const groupId = toInt(req.params.groupId);
    const { miembros = [] } = req.body;

    if (!groupId) {
      return res.status(400).json({
        ok: false,
        message: 'Grupo invalido'
      });
    }

    const memberIds = normalizeMemberIds(miembros, req.user.id);
    if (memberIds.length === 0) {
      return res.status(400).json({
        ok: false,
        message: 'Debes enviar al menos un participante'
      });
    }

    await conn.beginTransaction();

    const membership = await getMembership(conn, groupId, req.user.id);
    if (!membership) {
      await conn.rollback();
      return res.status(403).json({
        ok: false,
        message: 'No eres miembro de este grupo'
      });
    }

    if (membership.rol !== 'admin') {
      await conn.rollback();
      return res.status(403).json({
        ok: false,
        message: 'Solo un admin puede agregar participantes'
      });
    }

    const placeholders = memberIds.map(() => '?').join(',');
    const [users] = await conn.query(
      `SELECT id FROM usuarios WHERE id IN (${placeholders})`,
      memberIds
    );

    const validIds = users.map((u) => u.id);
    if (validIds.length === 0) {
      await conn.rollback();
      return res.status(404).json({
        ok: false,
        message: 'No se encontraron usuarios validos'
      });
    }

    const rows = validIds.map((id) => [groupId, id, 'miembro', 0]);
    await conn.query(
      `INSERT IGNORE INTO grupo_miembros (grupo_id, usuario_id, rol, silenciado)
       VALUES ?`,
      [rows]
    );

    await conn.commit();

    return res.json({
      ok: true,
      message: 'Participantes agregados correctamente',
      added: validIds.length
    });
  } catch (error) {
    await conn.rollback();
    next(error);
  } finally {
    conn.release();
  }
}

async function updateMember(req, res, next) {
  const conn = await pool.getConnection();

  try {
    const groupId = toInt(req.params.groupId);
    const targetUserId = toInt(req.params.userId);
    const { rol, silenciado } = req.body;

    if (!groupId || !targetUserId) {
      return res.status(400).json({
        ok: false,
        message: 'Parametros invalidos'
      });
    }

    await conn.beginTransaction();

    const membership = await getMembership(conn, groupId, req.user.id);
    if (!membership) {
      await conn.rollback();
      return res.status(403).json({
        ok: false,
        message: 'No eres miembro de este grupo'
      });
    }

    if (membership.rol !== 'admin') {
      await conn.rollback();
      return res.status(403).json({
        ok: false,
        message: 'Solo un admin puede administrar miembros'
      });
    }

    const [targetRows] = await conn.query(
      'SELECT * FROM grupo_miembros WHERE grupo_id = ? AND usuario_id = ? LIMIT 1',
      [groupId, targetUserId]
    );

    const target = targetRows[0];
    if (!target) {
      await conn.rollback();
      return res.status(404).json({
        ok: false,
        message: 'El usuario no pertenece al grupo'
      });
    }

    const updates = [];
    const values = [];

    if (rol !== undefined) {
      if (!['admin', 'miembro'].includes(rol)) {
        await conn.rollback();
        return res.status(400).json({
          ok: false,
          message: 'Rol invalido'
        });
      }

      updates.push('rol = ?');
      values.push(rol);
    }

    if (silenciado !== undefined) {
      updates.push('silenciado = ?');
      values.push(silenciado ? 1 : 0);
    }

    if (updates.length === 0) {
      await conn.rollback();
      return res.status(400).json({
        ok: false,
        message: 'No hay cambios para aplicar'
      });
    }

    values.push(groupId, targetUserId);

    await conn.query(
      `UPDATE grupo_miembros SET ${updates.join(', ')}
       WHERE grupo_id = ? AND usuario_id = ?`,
      values
    );

    await conn.commit();

    return res.json({
      ok: true,
      message: 'Miembro actualizado correctamente'
    });
  } catch (error) {
    await conn.rollback();
    next(error);
  } finally {
    conn.release();
  }
}

async function removeMember(req, res, next) {
  const conn = await pool.getConnection();

  try {
    const groupId = toInt(req.params.groupId);
    const targetUserId = toInt(req.params.userId);

    if (!groupId || !targetUserId) {
      return res.status(400).json({
        ok: false,
        message: 'Parametros invalidos'
      });
    }

    await conn.beginTransaction();

    const membership = await getMembership(conn, groupId, req.user.id);
    if (!membership) {
      await conn.rollback();
      return res.status(403).json({
        ok: false,
        message: 'No eres miembro de este grupo'
      });
    }

    const [targetRows] = await conn.query(
      'SELECT * FROM grupo_miembros WHERE grupo_id = ? AND usuario_id = ? LIMIT 1',
      [groupId, targetUserId]
    );

    const target = targetRows[0];
    if (!target) {
      await conn.rollback();
      return res.status(404).json({
        ok: false,
        message: 'El usuario no pertenece al grupo'
      });
    }

    const isSelfLeave = targetUserId === req.user.id;
    const isAdminAction = membership.rol === 'admin';

    if (!isSelfLeave && !isAdminAction) {
      await conn.rollback();
      return res.status(403).json({
        ok: false,
        message: 'No tienes permisos para expulsar miembros'
      });
    }

    if (!isSelfLeave && target.rol === 'admin' && targetUserId !== req.user.id) {
      await conn.rollback();
      return res.status(403).json({
        ok: false,
        message: 'No puedes expulsar a otro admin'
      });
    }

    await conn.query(
      'DELETE FROM grupo_miembros WHERE grupo_id = ? AND usuario_id = ?',
      [groupId, targetUserId]
    );

    const [remaining] = await conn.query(
      'SELECT COUNT(*) AS total FROM grupo_miembros WHERE grupo_id = ?',
      [groupId]
    );

    if (Number(remaining[0].total) <= 0) {
      await conn.query('DELETE FROM grupos WHERE id = ?', [groupId]);
    }

    await conn.commit();

    return res.json({
      ok: true,
      message: isSelfLeave ? 'Saliste del grupo correctamente' : 'Miembro eliminado correctamente'
    });
  } catch (error) {
    await conn.rollback();
    next(error);
  } finally {
    conn.release();
  }
}

async function getGroupMessages(req, res, next) {
  try {
    const groupId = toInt(req.params.groupId);
    if (!groupId) {
      return res.status(400).json({
        ok: false,
        message: 'Grupo invalido'
      });
    }

    const userId = req.user.id;
    const page = Math.max(1, toInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, toInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    const [membershipRows] = await pool.query(
      'SELECT rol, silenciado FROM grupo_miembros WHERE grupo_id = ? AND usuario_id = ? LIMIT 1',
      [groupId, userId]
    );

    if (!membershipRows[0]) {
      return res.status(403).json({
        ok: false,
        message: 'No eres miembro de este grupo'
      });
    }

    const [rows] = await pool.query(
      `SELECT
         m.id,
         m.conversacion_id,
         m.emisor_id,
         u.nombre AS emisor_nombre,
         u.foto_perfil AS emisor_foto,
         m.contenido,
         m.tipo,
         m.estado,
         m.eliminado,
         m.created_at,
         meg.estado AS mi_estado
       FROM mensajes m
       INNER JOIN conversaciones c ON c.id = m.conversacion_id
       INNER JOIN usuarios u ON u.id = m.emisor_id
       LEFT JOIN mensajes_estado_grupo meg
         ON meg.mensaje_id = m.id AND meg.usuario_id = ?
       WHERE c.grupo_id = ?
       ORDER BY m.id ASC
       LIMIT ? OFFSET ?`,
      [userId, groupId, limit, offset]
    );

    return res.json({
      ok: true,
      messages: rows,
      page,
      limit
    });
  } catch (error) {
    next(error);
  }
}

async function sendGroupMessage(req, res, next) {
  const conn = await pool.getConnection();

  try {
    const groupId = toInt(req.params.groupId);
    const {
      contenido,
      tipo = 'texto'
    } = req.body;

    if (!groupId) {
      return res.status(400).json({
        ok: false,
        message: 'Grupo invalido'
      });
    }

    const text = String(contenido || '').trim();
    if (!text) {
      return res.status(400).json({
        ok: false,
        message: 'El mensaje no puede estar vacio'
      });
    }

    await conn.beginTransaction();

    const membership = await getMembership(conn, groupId, req.user.id);
    if (!membership) {
      await conn.rollback();
      return res.status(403).json({
        ok: false,
        message: 'No eres miembro de este grupo'
      });
    }

    if (membership.solo_admins && membership.rol !== 'admin') {
      await conn.rollback();
      return res.status(403).json({
        ok: false,
        message: 'Solo los administradores pueden enviar mensajes en este grupo'
      });
    }

    const [conversationRows] = await conn.query(
      'SELECT id FROM conversaciones WHERE tipo = "grupo" AND grupo_id = ? LIMIT 1',
      [groupId]
    );

    const conversacionId = conversationRows[0]
      ? conversationRows[0].id
      : await ensureGroupConversation(conn, groupId);

    const [messageResult] = await conn.query(
      `INSERT INTO mensajes (conversacion_id, emisor_id, contenido, tipo, estado)
       VALUES (?, ?, ?, ?, 'sent')`,
      [conversacionId, req.user.id, text, tipo]
    );

    const mensajeId = messageResult.insertId;

    const [members] = await conn.query(
      'SELECT usuario_id FROM grupo_miembros WHERE grupo_id = ?',
      [groupId]
    );

    if (members.length > 0) {
      const values = members.map((m) => [
        mensajeId,
        m.usuario_id,
        m.usuario_id === req.user.id ? 'read' : 'sent'
      ]);

      await conn.query(
        `INSERT INTO mensajes_estado_grupo (mensaje_id, usuario_id, estado)
         VALUES ?`,
        [values]
      );
    }

    await conn.commit();

    return res.status(201).json({
      ok: true,
      message: 'Mensaje enviado correctamente',
      data: {
        id: mensajeId,
        conversacion_id: conversacionId,
        contenido: text,
        tipo
      }
    });
  } catch (error) {
    await conn.rollback();
    next(error);
  } finally {
    conn.release();
  }
}

module.exports = {
  searchUsers,
  createGroup,
  myGroups,
  getGroupById,
  updateGroup,
  addMembers,
  updateMember,
  removeMember,
  getGroupMessages,
  sendGroupMessage
};