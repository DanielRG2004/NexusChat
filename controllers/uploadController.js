const pool = require('../config/database');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Asegurar que la carpeta uploads existe
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage, 
  limits: { fileSize: 50 * 1024 * 1024 }
});

// Subir archivo
exports.uploadFile = async (req, res) => {
  let connection;
  try {
    const { conversationId } = req.body;
    const userId = req.user.id;
    const file = req.file;

    console.log('📤 Recibiendo archivo:', { 
      conversationId, 
      userId, 
      filename: file?.originalname,
      mimetype: file?.mimetype,
      size: file?.size
    });

    if (!file) {
      return res.status(400).json({ error: 'No se envió ningún archivo' });
    }

    if (!conversationId) {
      return res.status(400).json({ error: 'No se especificó la conversación' });
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

    // Insertar mensaje con el tipo correcto
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

    // Obtener receptor
    const [conv] = await connection.execute(
      `SELECT usuario1_id, usuario2_id FROM conversaciones WHERE id = ?`,
      [conversationId]
    );
    
    if (conv.length === 0) {
      throw new Error('Conversación no encontrada');
    }
    
    const receiverId = conv[0].usuario1_id === userId ? 
      conv[0].usuario2_id : conv[0].usuario1_id;

    // Crear estados del mensaje
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
      ...newMessage[0],
      fileUrl,
      fileType,
      fileName: file.originalname,
      fileSize: file.size
    });

  } catch (error) {
    if (connection) await connection.rollback();
    console.error('❌ Error uploading file:', error);
    res.status(500).json({ error: 'Error al subir archivo', details: error.message });
  } finally {
    if (connection) connection.release();
  }
};

// Obtener archivo
exports.getFile = async (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(__dirname, '../uploads', filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Archivo no encontrado' });
    }
    
    res.sendFile(filePath);
  } catch (error) {
    console.error('Error getting file:', error);
    res.status(500).json({ error: 'Error al obtener archivo' });
  }
};

exports.upload = upload;