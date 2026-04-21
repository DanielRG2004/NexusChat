const pool = require('../config/database');
const path = require('path');
const fs = require('fs');

// Asegurar que las carpetas existen
const uploadRoot = path.join(__dirname, '../uploads');
const groupsUploadDir = path.join(uploadRoot, 'groups');
const messagesUploadDir = path.join(uploadRoot, 'messages');

[groupsUploadDir, messagesUploadDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// ========== SUBIR IMAGEN DE GRUPO (SIMPLE, SIN BD) ==========
exports.uploadGroupImage = async (req, res) => {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({ ok: false, message: 'No se recibió ninguna imagen' });
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const publicPath = `/uploads/groups/${file.filename}`;
    const url = `${baseUrl}${publicPath}`;

    return res.status(201).json({
      ok: true,
      message: 'Imagen subida correctamente',
      url,
      filename: file.filename
    });
  } catch (error) {
    console.error('❌ Error subiendo imagen de grupo:', error);
    return res.status(500).json({ ok: false, message: 'No se pudo subir la imagen' });
  }
};

// ========== SUBIR MEDIA DE MENSAJE (CON GUARDADO EN BD) ==========
exports.uploadMessageMedia = async (req, res) => {
  let connection;
  try {
    const { conversationId } = req.body;
    const userId = req.user.id;
    const file = req.file;

    console.log('📤 Subiendo media de mensaje:', { 
      conversationId, 
      userId, 
      filename: file?.originalname,
      mimetype: file?.mimetype,
      size: file?.size
    });

    if (!file) {
      return res.status(400).json({ ok: false, message: 'No se recibió ningún archivo' });
    }

    if (!conversationId) {
      return res.status(400).json({ ok: false, message: 'No se especificó la conversación' });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Determinar el tipo de archivo para la BD
    let fileType = 'archivo';
    if (file.mimetype.startsWith('image/')) fileType = 'imagen';
    else if (file.mimetype.startsWith('video/')) fileType = 'video';
    else if (file.mimetype.startsWith('audio/')) fileType = 'audio';

    // Crear URL del archivo
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const fileUrl = `${baseUrl}/uploads/${file.filename}`;

    // Insertar mensaje
    const [result] = await connection.execute(
      `INSERT INTO mensajes (conversacion_id, emisor_id, contenido, tipo, created_at) 
       VALUES (?, ?, ?, ?, NOW())`,
      [conversationId, userId, file.originalname, fileType]
    );

    const messageId = result.insertId;
    console.log('✅ Mensaje insertado ID:', messageId, 'Tipo:', fileType);

    // Guardar metadatos del archivo
    await connection.execute(
      `INSERT INTO archivos_multimedia (mensaje_id, usuario_id, nombre_original, nombre_archivo, url, tipo_mime, tipo, tamanio) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [messageId, userId, file.originalname, file.filename, fileUrl, file.mimetype, fileType, file.size]
    );
    console.log('✅ Archivo multimedia guardado');

    // Obtener el receptor de la conversación
    const [conv] = await connection.execute(
      `SELECT usuario1_id, usuario2_id FROM conversaciones WHERE id = ?`,
      [conversationId]
    );
    
    if (conv.length === 0) {
      throw new Error('Conversación no encontrada');
    }
    
    const receiverId = conv[0].usuario1_id === userId ? 
      conv[0].usuario2_id : conv[0].usuario1_id;

    // Crear estados del mensaje para ambos usuarios
    await connection.execute(
      `INSERT INTO mensajes_estado_privada (mensaje_id, usuario_id, estado) VALUES 
       (?, ?, 'sent'),
       (?, ?, 'sent')`,
      [messageId, userId, messageId, receiverId]
    );
    console.log('✅ Estados del mensaje creados');

    await connection.commit();

    // Obtener el mensaje completo para devolver
    const [newMessage] = await connection.execute(
      `SELECT m.*, u.nombre as sender_name 
       FROM mensajes m
       JOIN usuarios u ON m.emisor_id = u.id
       WHERE m.id = ?`,
      [messageId]
    );

    res.status(201).json({ 
      ok: true,
      message: newMessage[0],
      fileUrl,
      fileType,
      fileName: file.originalname,
      fileSize: file.size
    });

  } catch (error) {
    if (connection) await connection.rollback();
    console.error('❌ Error subiendo archivo:', error);
    res.status(500).json({ ok: false, error: 'Error al subir archivo', details: error.message });
  } finally {
    if (connection) connection.release();
  }
};

// ========== OBTENER ARCHIVO ==========
exports.getFile = async (req, res) => {
  try {
    const { filename } = req.params;
    
    // Buscar en ambas carpetas
    let filePath = path.join(__dirname, '../uploads/groups', filename);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(__dirname, '../uploads/messages', filename);
    }
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Archivo no encontrado' });
    }
    
    res.sendFile(filePath);
  } catch (error) {
    console.error('Error obteniendo archivo:', error);
    res.status(500).json({ error: 'Error al obtener archivo' });
  }
};