const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const helmet = require('helmet');
const path = require('path');

dotenv.config();

const pool = require('./config/database');

// ==========================
// RUTAS DEL COMPAÑERO
// ==========================
const authRoutes = require('./routes/authRoutes');
const chatRoutes = require('./routes/chatRoutes');
const messageRoutes = require('./routes/messageRoutes');
const contactRoutes = require('./routes/contactRoutes');

// =========================
// TUS RUTAS
// =========================
const emailAuthRoutes = require('./routes/emailAuth.routes');
const groupRoutes = require('./routes/group.routes');
const uploadRoutes = require('./routes/upload.routes');

// Si ya creaste esta ruta separada para mensajes de grupo, descomenta estas 2 líneas.
// Si todavía no existe el archivo, déjalo comentado para que no rompa Render.
const groupMessagesRoutes = require('./routes/groupMessages.routes');

// =========================
// MIDDLEWARES
// =========================
const { errorHandler, notFound } = require('./middleware/error.middleware');

const app = express();
const server = http.createServer(app);

// =========================
// CONFIG
// =========================
const PORT = process.env.PORT || 10000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';

// =========================
// SOCKET.IO
// =========================
const io = socketIO(server, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// =========================
// SEGURIDAD
// =========================
app.use(helmet());

app.use(cors({
  origin: CORS_ORIGIN,
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// =========================
// ARCHIVOS ESTÁTICOS
// =========================
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// =========================
// RUTAS BASE
// =========================
app.get('/', (req, res) => {
  res.json({
    name: 'NexusChat API',
    status: 'online'
  });
});

app.get('/api', (req, res) => {
  res.json({
    endpoints: [
      'POST /api/auth/request-code',
      'POST /api/auth/verify-code',
      'POST /api/auth/complete-registration',
      'POST /api/auth/login',

      'POST /api/auth-email/request-code',
      'POST /api/auth-email/verify-code',
      'POST /api/auth-email/complete-registration',
      'POST /api/auth-email/login',

      'GET /api/groups/mine',
      'POST /api/groups',
      'POST /api/upload/group-image',

      'GET /api/chats',
      'GET /api/messages/:id',
      'GET /api/contacts'
    ]
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// =========================
// RUTAS
// =========================
app.use('/api/auth', authRoutes);
app.use('/api/auth-email', emailAuthRoutes);

app.use('/api/chats', chatRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/contacts', contactRoutes);

app.use('/api/groups', groupRoutes);

app.use('/api/groups', groupMessagesRoutes);

app.use('/api/upload', uploadRoutes);

// =========================
// ERRORES
// =========================
app.use(notFound);
app.use(errorHandler);

// =========================
// SOCKETS
// =========================
const socketHandler = require('./sockets/socketHandler');
socketHandler(io, pool);

// =========================
// TEST DB
// =========================
(async () => {
  try {
    await pool.execute('SELECT 1');
    console.log('✅ MySQL conectado');
  } catch (error) {
    console.error('❌ Error DB:', error.message);
  }
})();

// =========================
// START SERVER
// =========================
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ Server running on port ${PORT}`);
  console.log(`🌐 CORS origin: ${CORS_ORIGIN}`);
});

// =========================
// KEEP ALIVE DB
// =========================
setInterval(async () => {
  try {
    await pool.execute('SELECT 1');
  } catch (error) {
    console.error('Keep-alive error:', error.message);
  }
}, 30000);