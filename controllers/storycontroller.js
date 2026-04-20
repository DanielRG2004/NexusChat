const pool = require('../config/database');
const path = require('path');
const fs = require('fs');

// Asegurar que la carpeta de stories existe
const storiesDir = path.join(__dirname, '../uploads/stories');
if (!fs.existsSync(storiesDir)) {
    fs.mkdirSync(storiesDir, { recursive: true });
}

// ===============================
// OBTENER ESTADOS DE CONTACTOS
// ===============================
exports.getStories = async (req, res) => {
    try {
        const userId = req.user.id;
        const baseUrl = `${req.protocol}://${req.get('host')}`;

        const [stories] = await pool.execute(
            `SELECT s.*, u.nombre as user_name, u.foto_perfil as user_avatar,
              (SELECT COUNT(*) FROM stories_vistas sv 
               WHERE sv.story_id = s.id AND sv.usuario_id = ?) as viewed,
              (SELECT COUNT(*) FROM stories_vistas sv 
               WHERE sv.story_id = s.id) as total_views
       FROM stories s
       JOIN usuarios u ON s.usuario_id = u.id
       WHERE (
  s.usuario_id IN (
    SELECT contacto_id FROM contactos WHERE usuario_id = ? AND estado = 'aceptado'
  )
  OR s.usuario_id = ?  -- ← Esto muestra tus propios estados
)
AND s.usuario_id NOT IN (
  SELECT silenciado_id FROM stories_silenciadas WHERE usuario_id = ?
)
AND s.expira_at > NOW()
AND s.activo = 1
       ORDER BY s.created_at DESC`,
            [userId, userId, userId, userId]
        );

        const storiesWithFullUrl = stories.map(story => ({
            ...story,
            url_media: story.url_media ? `${baseUrl}${story.url_media}` : null
        }));

        console.log(`📸 Encontrados ${stories.length} estados para mostrar`);
        res.json(storiesWithFullUrl);
    } catch (error) {
        console.error('Error getting stories:', error);
        res.status(500).json({ error: 'Error al cargar estados' });
    }
};

// ===============================
// OBTENER MI PROPIO ESTADO
// ===============================
exports.getMyStory = async (req, res) => {
    try {
        const userId = req.user.id;
        const baseUrl = `${req.protocol}://${req.get('host')}`;

        const [story] = await pool.execute(
            `SELECT * FROM stories 
       WHERE usuario_id = ? AND activo = 1 AND expira_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
            [userId]
        );

        if (story[0] && story[0].url_media) {
            story[0].url_media = `${baseUrl}${story[0].url_media}`;
        }

        res.json(story[0] || null);
    } catch (error) {
        console.error('Error getting my story:', error);
        res.status(500).json({ error: 'Error al cargar tu estado' });
    }
};

// ===============================
// CREAR ESTADO
// ===============================
exports.createStory = async (req, res) => {
    try {
        const { tipo, contenido, color_fondo, url_media } = req.body;
        const userId = req.user.id;
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);

        let finalContenido = contenido;
        let finalUrlMedia = null;

        // Si es imagen y viene en base64, guardarla como archivo
        if (tipo === 'imagen' && url_media && url_media.startsWith('data:image')) {
            const matches = url_media.match(/^data:image\/([A-Za-z-+\/]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
                const extension = matches[1];
                const imageData = matches[2];
                const filename = `${Date.now()}-${userId}.${extension}`;
                const filepath = path.join(storiesDir, filename);

                fs.writeFileSync(filepath, Buffer.from(imageData, 'base64'));
                finalUrlMedia = `/uploads/stories/${filename}`;
                finalContenido = null;
            }
        }

        const [result] = await pool.execute(
            `INSERT INTO stories (usuario_id, tipo, contenido, url_media, color_fondo, expira_at, activo) 
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
            [userId, tipo, finalContenido, finalUrlMedia, color_fondo || '#075e54', expiresAt]
        );

        res.status(201).json({
            id: result.insertId,
            message: 'Estado creado correctamente'
        });

    } catch (error) {
        console.error('Error creating story:', error);
        res.status(500).json({ error: 'Error al crear estado', details: error.message });
    }
};

// ===============================
// MARCAR ESTADO COMO VISTO
// ===============================
exports.viewStory = async (req, res) => {
    try {
        const { storyId } = req.params;
        const userId = req.user.id;

        await pool.execute(
            `INSERT INTO stories_vistas (story_id, usuario_id, visto_at) 
       VALUES (?, ?, NOW()) 
       ON DUPLICATE KEY UPDATE visto_at = NOW()`,
            [storyId, userId]
        );

        res.json({ message: 'Story marcada como vista' });
    } catch (error) {
        console.error('Error viewing story:', error);
        res.status(500).json({ error: 'Error al marcar estado' });
    }
};

// ===============================
// ELIMINAR ESTADO
// ===============================
exports.deleteStory = async (req, res) => {
    try {
        const { storyId } = req.params;
        const userId = req.user.id;

        await pool.execute(
            `UPDATE stories SET activo = 0 WHERE id = ? AND usuario_id = ?`,
            [storyId, userId]
        );

        res.json({ message: 'Estado eliminado' });
    } catch (error) {
        console.error('Error deleting story:', error);
        res.status(500).json({ error: 'Error al eliminar estado' });
    }
};

// ===============================
// SILENCIAR ESTADOS DE UN USUARIO
// ===============================
exports.muteUserStories = async (req, res) => {
    try {
        const { silenciado_id } = req.body;
        const userId = req.user.id;

        await pool.execute(
            `INSERT INTO stories_silenciadas (usuario_id, silenciado_id, created_at) 
       VALUES (?, ?, NOW()) 
       ON DUPLICATE KEY UPDATE created_at = NOW()`,
            [userId, silenciado_id]
        );

        res.json({ message: 'Estados silenciados' });
    } catch (error) {
        console.error('Error muting stories:', error);
        res.status(500).json({ error: 'Error al silenciar' });
    }
};

// ===============================
// ACTIVAR ESTADOS DE UN USUARIO
// ===============================
exports.unmuteUserStories = async (req, res) => {
    try {
        const { silenciado_id } = req.params;
        const userId = req.user.id;

        await pool.execute(
            `DELETE FROM stories_silenciadas WHERE usuario_id = ? AND silenciado_id = ?`,
            [userId, silenciado_id]
        );

        res.json({ message: 'Estados activados' });
    } catch (error) {
        console.error('Error unmuting stories:', error);
        res.status(500).json({ error: 'Error al activar estados' });
    }
};

// ===============================
// OBTENER VISUALIZACIONES DE UN ESTADO
// ===============================
exports.getStoryViews = async (req, res) => {
  try {
    const { storyId } = req.params;
    const userId = req.user.id;

    // Verificar que el usuario es el dueño del estado
    const [story] = await pool.execute(
      `SELECT usuario_id FROM stories WHERE id = ?`,
      [storyId]
    );

    if (story.length === 0) {
      return res.status(404).json({ error: 'Estado no encontrado' });
    }

    if (story[0].usuario_id !== userId) {
      return res.status(403).json({ error: 'No tienes permiso para ver esto' });
    }

    const [views] = await pool.execute(
      `SELECT sv.*, u.nombre, u.foto_perfil
       FROM stories_vistas sv
       JOIN usuarios u ON sv.usuario_id = u.id
       WHERE sv.story_id = ?
       ORDER BY sv.visto_at DESC`,
      [storyId]
    );

    res.json(views);
  } catch (error) {
    console.error('Error getting story views:', error);
    res.status(500).json({ error: 'Error al obtener visualizaciones' });
  }
};