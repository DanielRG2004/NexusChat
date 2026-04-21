console.log('🔵 1 - Iniciando servidor...');

// =========================
// CAPTURA GLOBAL DE ERRORES
// =========================
process.on('uncaughtException', err => {
  console.error('💥 UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', err => {
  console.error('💥 UNHANDLED REJECTION:', err);
});

// =========================
// IMPORTS
// =========================
const express = require('express');
console.log('🔵 2 - express OK');

const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const helmet = require('helmet');
const path = require('path');

dotenv.config();
console.log('🔵 3 - dotenv cargado');

// =========================
// DATABASE
// =========================
let pool;
try {
  pool = require('./config/database');
  console.log('🔵 4 - database OK');
} catch (err) {
  console.error('💥 ERROR cargando database:', err);
}

// =========================
// CREAR APP Y SERVIDOR (IMPORTANTE: ANTES DE USAR app)
// =========================
const app = express();
const server = http.createServer(app);

// =========================
// CONFIG
// =========================
const PORT = process.env.PORT || 10000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';

console.log('🔵 5 - Config OK');

// =========================
// SOCKET.IO
// =========================
let io;
try {
  io = socketIO(server, {
    cors: {
      origin: CORS_ORIGIN,
      methods: ['GET', 'POST'],
      credentials: true
    }
  });
  console.log('🔵 6 - Socket.IO OK');
} catch (err) {
  console.error('💥 ERROR socket.io:', err);
}

// =========================
// SEGURIDAD Y MIDDLEWARES
// =========================
app.use(helmet());

app.use(cors({
  origin: CORS_ORIGIN,
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

console.log('🔵 7 - Middlewares Express OK');

// =========================
// ARCHIVOS ESTÁTICOS
// =========================
app.use('/uploads', (req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
});
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// =========================
// RUTAS BASE
// =========================
app.get('/', (req, res) => {
  res.json({ name: 'NexusChat API', status: 'online' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK' });
});

// ==========================
// CARGA DE RUTAS (segura)
// ==========================
function safeRequire(routePath, name) {
  try {
    const r = require(routePath);
    console.log(`🔵 Ruta OK: ${name}`);
    return r;
  } catch (err) {
    console.error(`💥 ERROR en ruta ${name}:`, err.message);
    return null;
  }
}

const authRoutes = safeRequire('./routes/authRoutes', 'authRoutes');
const chatRoutes = safeRequire('./routes/chatRoutes', 'chatRoutes');
const messageRoutes = safeRequire('./routes/messageRoutes', 'messageRoutes');
const contactRoutes = safeRequire('./routes/contactRoutes', 'contactRoutes');
const storyRoutes = safeRequire('./routes/storyRoutes', 'storyRoutes');

const emailAuthRoutes = safeRequire('./routes/emailAuth.routes', 'emailAuthRoutes');
const groupRoutes = safeRequire('./routes/group.routes', 'groupRoutes');
const uploadRoutes = safeRequire('./routes/upload.routes', 'uploadRoutes');
const groupMessagesRoutes = safeRequire('./routes/groupMessages.routes', 'groupMessagesRoutes');
const adminRoutes = safeRequire('./routes/adminRoutes', 'adminRoutes');

// =========================
// MONTAJE DE RUTAS
// =========================
if (authRoutes) app.use('/api/auth', authRoutes);
if (emailAuthRoutes) app.use('/api/auth-email', emailAuthRoutes);
if (chatRoutes) app.use('/api/chats', chatRoutes);
if (messageRoutes) app.use('/api/messages', messageRoutes);
if (contactRoutes) app.use('/api/contacts', contactRoutes);
if (groupRoutes) app.use('/api/groups', groupRoutes);
if (groupMessagesRoutes) app.use('/api/groups', groupMessagesRoutes);
if (uploadRoutes) app.use('/api/upload', uploadRoutes);
if (storyRoutes) app.use('/api/stories', storyRoutes);
if (adminRoutes) app.use('/api/admin', adminRoutes);

console.log('🔵 8 - Rutas montadas');

// =========================
// ERRORES
// =========================
let errorHandler, notFound;
try {
  ({ errorHandler, notFound } = require('./middleware/error.middleware'));
  if (notFound && errorHandler) {
    app.use(notFound);
    app.use(errorHandler);
  }
  console.log('🔵 Middlewares de error OK');
} catch (err) {
  console.error('💥 ERROR middlewares de error:', err);
}

// =========================
// SOCKET HANDLER
// =========================
try {
  const socketHandler = require('./sockets/socketHandler');
  socketHandler(io, pool);
  console.log('🔵 9 - Socket handler OK');
} catch (err) {
  console.error('💥 ERROR socketHandler:', err);
}

// =========================
// TEST DB
// =========================
(async () => {
  try {
    if (pool) {
      await pool.execute('SELECT 1');
      console.log('✅ MySQL conectado');
    }
  } catch (error) {
    console.error('❌ Error DB:', error.message);
  }
})();

// =========================
// START SERVER
// =========================
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// =========================
// KEEP ALIVE
// =========================
setInterval(async () => {
  try {
    if (pool) await pool.execute('SELECT 1');
  } catch (error) {
    console.error('Keep-alive error:', error.message);
  }
}, 30000);