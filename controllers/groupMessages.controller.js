const pool = require('../config/database');

function toInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
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
         m.contenido_cifrado,
         m.algoritmo_cifrado,
         m.es_cifrado,
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
      contenido_cifrado,
      algoritmo_cifrado = 'AES-256-GCM',
      es_cifrado = 0,
      tipo = 'texto'
    } = req.body;

    if (!groupId) {
      return res.status(400).json({ ok: false, message: 'Grupo invalido' });
    }

    const membership = await getMembership(conn, groupId, req.user.id);
    if (!membership) {
      return res.status(403).json({ ok: false, message: 'No eres miembro de este grupo' });
    }

    if (membership.solo_admins && membership.rol !== 'admin') {
      return res.status(403).json({ ok: false, message: 'Solo los administradores pueden enviar mensajes en este grupo' });
    }

    const plainText = String(contenido || '').trim();
    const cipherText = String(contenido_cifrado || '').trim();
    const encrypted = Number(es_cifrado) === 1 || cipherText.length > 0;

    if (!plainText && !cipherText) {
      return res.status(400).json({ ok: false, message: 'El mensaje no puede estar vacio' });
    }

    await conn.beginTransaction();

    const conversationRows = await conn.query(
      'SELECT id FROM conversaciones WHERE tipo = "grupo" AND grupo_id = ? LIMIT 1',
      [groupId]
    );

    const conversacionId = conversationRows[0][0]?.id || await ensureGroupConversation(conn, groupId);

    const contenidoFinal = encrypted ? null : plainText;
    const contenidoCifradoFinal = encrypted ? (cipherText || plainText) : null;

    const [messageResult] = await conn.query(
      `INSERT INTO mensajes
       (conversacion_id, emisor_id, contenido, contenido_cifrado, algoritmo_cifrado, es_cifrado, tipo, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'sent')`,
      [conversacionId, req.user.id, contenidoFinal, contenidoCifradoFinal, encrypted ? algoritmo_cifrado : null, encrypted ? 1 : 0, tipo]
    );

    const mensajeId = messageResult.insertId;

    // --- NUEVO: Guardar en archivos_multimedia si es multimedia ---
    if (tipo !== 'texto') {
      const { mediaUrl, thumbnailUrl, duration, mimetype, size, originalName } = req.body;
      const filename = require('path').basename(mediaUrl || '');
      await conn.query(
        `INSERT INTO archivos_multimedia 
         (mensaje_id, usuario_id, nombre_original, nombre_archivo, url, tipo_mime, tipo, tamanio, duracion, thumbnail_url, estado)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'listo')`,
        [
          mensajeId, req.user.id,
          originalName || filename,
          filename,
          mediaUrl,
          mimetype || 'application/octet-stream',
          tipo,
          size || 0,
          duration || null,
          thumbnailUrl || null
        ]
      );
    }

    const [members] = await conn.query(
      'SELECT usuario_id FROM grupo_miembros WHERE grupo_id = ?',
      [groupId]
    );

    if (members.length > 0) {
      const values = members.map(m => [mensajeId, m.usuario_id, m.usuario_id === req.user.id ? 'read' : 'sent']);
      await conn.query(`INSERT INTO mensajes_estado_grupo (mensaje_id, usuario_id, estado) VALUES ?`, [values]);
    }

    await conn.commit();

    return res.status(201).json({
      ok: true,
      message: 'Mensaje enviado correctamente',
      data: { id: mensajeId, conversacion_id: conversacionId, contenido: contenidoFinal, contenido_cifrado: contenidoCifradoFinal, algoritmo_cifrado: encrypted ? algoritmo_cifrado : null, es_cifrado: encrypted ? 1 : 0, tipo }
    });
  } catch (error) {
    await conn.rollback();
    next(error);
  } finally {
    conn.release();
  }
}

module.exports = {
  getGroupMessages,
  sendGroupMessage
};