const pool = require('../config/database');

// ============================================
// OBTENER TODOS LOS CONTACTOS DE UN USUARIO
// ============================================
exports.getContacts = async (req, res) => {
  try {
    const { usuario_id } = req.params;
    console.log('📋 GET CONTACTS for user:', usuario_id);
    
    const [contacts] = await pool.execute(
      `SELECT c.id, c.apodo, c.bloqueado, c.archivado, c.fijado, 
              u.id AS contacto_id,
              u.nombre, u.telefono, u.email, u.foto_perfil, u.descripcion,
              eu.disponibilidad
       FROM contactos c
       JOIN usuarios u ON c.contacto_id = u.id
       LEFT JOIN estado_usuario eu ON u.id = eu.usuario_id
       WHERE c.usuario_id = ? AND c.estado = 'aceptado'
       ORDER BY c.fijado DESC, u.nombre ASC`,
      [usuario_id]
    );
    
    console.log(`✅ Found ${contacts.length} contacts`);
    res.json(contacts);
  } catch (error) {
    console.error('❌ Error fetching contacts:', error);
    res.status(500).json({ error: 'Error al cargar contactos' });
  }
};

// ============================================
// AGREGAR UN NUEVO CONTACTO
// ============================================
exports.addContact = async (req, res) => {
  try {
    const { usuario_id, contacto_id, apodo } = req.body;
    console.log('📝 ADD CONTACT - Usuario:', usuario_id, '-> Contacto:', contacto_id);
    console.log('📝 Apodo proporcionado:', apodo);
    
    // Check if contact already exists
    const [existing] = await pool.execute(
      `SELECT id, apodo FROM contactos 
       WHERE usuario_id = ? AND contacto_id = ?`,
      [usuario_id, contacto_id]
    );
    
    if (existing.length > 0) {
      console.log('⚠️ Contact already exists, current apodo:', existing[0].apodo);
      
      // Si ya existe pero queremos actualizar el apodo
      if (apodo && apodo !== existing[0].apodo) {
        await pool.execute(
          `UPDATE contactos SET apodo = ? WHERE id = ?`,
          [apodo, existing[0].id]
        );
        console.log('✅ Apodo actualizado a:', apodo);
      }
      
      return res.status(400).json({ 
        error: 'El contacto ya existe',
        alreadyExists: true,
        contact: existing[0]
      });
    }
    
    // Check if users exist
    const [users] = await pool.execute(
      `SELECT id, nombre FROM usuarios WHERE id IN (?, ?)`,
      [usuario_id, contacto_id]
    );
    
    if (users.length !== 2) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    // Obtener el nombre del contacto para usarlo como apodo por defecto
    const contactoNombre = users.find(u => u.id === parseInt(contacto_id))?.nombre;
    
    // Si se proporcionó un apodo personalizado, usarlo; si no, usar el nombre del contacto
    const finalApodo = apodo && apodo.trim() !== '' ? apodo.trim() : contactoNombre;
    
    console.log('📝 Final apodo a guardar:', finalApodo);
    
    // Add new contact
    const [result] = await pool.execute(
      `INSERT INTO contactos (usuario_id, contacto_id, apodo, estado, origen) 
       VALUES (?, ?, ?, 'aceptado', 'app')`,
      [usuario_id, contacto_id, finalApodo]
    );
    
    // Get the added contact details
    const [contact] = await pool.execute(
      `SELECT c.id, c.apodo, u.id as contacto_id, u.nombre, u.telefono, u.foto_perfil
       FROM contactos c
       JOIN usuarios u ON c.contacto_id = u.id
       WHERE c.id = ?`,
      [result.insertId]
    );
    
    console.log('✅ Contact added successfully with apodo:', contact[0].apodo);
    res.status(201).json({ 
      message: 'Contacto agregado correctamente',
      contact: contact[0]
    });
    
  } catch (error) {
    console.error('❌ Error adding contact:', error);
    res.status(500).json({ error: 'Error al agregar contacto' });
  }
};

// ============================================
// VERIFICAR SI UN USUARIO ES CONTACTO
// ============================================
exports.checkIsContact = async (req, res) => {
  try {
    const { usuario_id, contacto_id } = req.params;
    console.log('🔍 CHECK IS CONTACT:', usuario_id, '->', contacto_id);
    
    const [result] = await pool.execute(
      `SELECT id FROM contactos 
       WHERE usuario_id = ? AND contacto_id = ? AND estado = 'aceptado'`,
      [usuario_id, contacto_id]
    );
    
    res.json({ isContact: result.length > 0 });
  } catch (error) {
    console.error('Error checking contact:', error);
    res.status(500).json({ error: 'Error al verificar contacto' });
  }
};

// ============================================
// BUSCAR USUARIOS POR NOMBRE, EMAIL O TELÉFONO
// ============================================
exports.searchUsers = async (req, res) => {
  try {
    const { query } = req.query;
    const userId = req.user.id;
    
    console.log('========================================');
    console.log('🔍 SEARCH USERS - Query:', query);
    console.log('🔍 SEARCH USERS - User ID:', userId);
    console.log('========================================');
    
    if (!query || query.length < 2) {
      console.log('Query too short, returning empty');
      return res.json([]);
    }
    
    const searchTerm = `%${query}%`;
    
    // Buscar usuarios
    const [users] = await pool.execute(
      `SELECT 
        u.id, 
        u.nombre, 
        u.telefono, 
        u.email, 
        u.foto_perfil, 
        u.descripcion,
        CASE WHEN c.id IS NOT NULL THEN true ELSE false END as is_contact
      FROM usuarios u
      LEFT JOIN contactos c ON c.contacto_id = u.id AND c.usuario_id = ?
      WHERE u.id != ? 
        AND u.estado_cuenta = 'verificado'
        AND (u.nombre LIKE ? OR u.telefono LIKE ? OR u.email LIKE ?)
      LIMIT 20`,
      [userId, userId, searchTerm, searchTerm, searchTerm]
    );
    
    console.log(`✅ Found ${users.length} users matching "${query}"`);
    res.json(users);
  } catch (error) {
    console.error('❌ Error searching users:', error);
    res.status(500).json({ error: 'Error al buscar usuarios', details: error.message });
  }
};

// ============================================
// BUSCAR USUARIO POR TELÉFONO (FLEXIBLE)
// ============================================
exports.findUserByPhone = async (req, res) => {
  try {
    const { phone } = req.params;
    const userId = req.user.id;
    
    console.log('========================================');
    console.log('📞 FIND USER BY PHONE - Phone:', phone);
    console.log('📞 FIND USER BY PHONE - User ID:', userId);
    console.log('========================================');
    
    if (!phone || phone.length < 5) {
      return res.status(400).json({ 
        found: false, 
        error: 'Número inválido' 
      });
    }
    
    // Limpiar el teléfono (remover espacios, guiones, paréntesis)
    let cleanPhone = phone.replace(/[\s\-\(\)]/g, '');
    
    // Crear variaciones del número para buscar
    const variations = [];
    
    // 1. El número tal como está
    variations.push(cleanPhone);
    
    // 2. Si no tiene +, agregar +
    if (!cleanPhone.startsWith('+')) {
      variations.push(`+${cleanPhone}`);
    } else {
      // 3. Si tiene +, también buscar sin +
      variations.push(cleanPhone.substring(1));
    }
    
    // 4. Si tiene código de país +506, también buscar sin él
    if (cleanPhone.includes('+506')) {
      variations.push(cleanPhone.replace('+506', ''));
      variations.push(cleanPhone.replace('+506', '506'));
    } 
    // 5. Si empieza con 506, buscar con +506 y sin 506
    else if (cleanPhone.startsWith('506')) {
      variations.push(`+${cleanPhone}`);
      variations.push(cleanPhone.substring(3));
    }
    // 6. Si tiene + y luego código, extraer el número sin código
    else if (cleanPhone.startsWith('+')) {
      const match = cleanPhone.match(/^\+(\d{1,3})(.+)$/);
      if (match) {
        variations.push(match[2]); // número sin código
        variations.push(match[1] + match[2]); // código sin +
      }
    }
    
    // Eliminar duplicados y valores vacíos
    const uniqueVariations = [...new Set(variations.filter(v => v && v.length >= 5))];
    
    console.log('📞 Phone variations to try:', uniqueVariations);
    
    // Buscar en la base de datos
    let foundUser = null;
    let matchedVariation = null;
    
    for (const phoneVar of uniqueVariations) {
      console.log('📞 Trying variation:', phoneVar);
      
      const [users] = await pool.execute(
        `SELECT id, nombre, telefono, email, foto_perfil, descripcion
         FROM usuarios 
         WHERE telefono = ? OR telefono = ? OR telefono LIKE ?
         AND id != ?
         LIMIT 1`,
        [phoneVar, `+${phoneVar}`, `%${phoneVar}%`, userId]
      );
      
      if (users.length > 0) {
        foundUser = users[0];
        matchedVariation = phoneVar;
        console.log('✅ User found with variation:', matchedVariation);
        break;
      }
    }
    
    if (foundUser) {
      console.log('✅ User found:', foundUser.nombre, foundUser.telefono);
      res.json({ 
        found: true, 
        user: foundUser,
        matchedPhone: matchedVariation
      });
    } else {
      console.log('❌ User not found for phone:', phone);
      res.json({ 
        found: false, 
        message: 'No existe un usuario con ese número de teléfono' 
      });
    }
  } catch (error) {
    console.error('❌ Error finding user by phone:', error);
    res.status(500).json({ 
      found: false, 
      error: 'Error al buscar usuario' 
    });
  }
};