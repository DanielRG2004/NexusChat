const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const helmet = require('helmet');
const path = require('path');

dotenv.config();

const pool = require('./config/database');

// =========================
// RUTAS DEL COMPA
// =========================
const authRoutesOld = require('./routes/authRoutes');
const chatRoutes = require('./routes/chatRoutes');
const messageRoutes = require('./routes/messageRoutes');
const contactRoutes = require('./routes/contactRoutes');

// =========================
// TUS RUTAS
// =========================
const groupRoutes = require('./routes/group.routes');
const uploadRoutes = require('./routes/upload.routes');
const authRoutesNew = require('./routes/authRoutes');

// =========================
// MIDDLEWARES
// =========================
const { errorHandler, notFound } = require('./middleware/error.middleware');

const app = express();
const server = http.createServer(app);

// =========================
// SOCKET.IO
// =========================
const io = socketIO(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// =========================
// SEGURIDAD Y CONFIG
// =========================
app.use(helmet());

app.use(cors({
  origin: process.env.CORS_ORIGIN || "http://localhost:3000",
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
    version: '2.0',
    status: 'online'
  });
});

app.get('/api', (req, res) => {
  res.json({
    endpoints: [
      // NUEVAS
      'POST /api/auth/request-code',
      'POST /api/auth/verify-code',
      'POST /api/auth/complete-registration',
      'POST /api/auth/login',

      'GET /api/groups',
      'POST /api/groups',

      'POST /api/upload/group-image',

      // VIEJAS (compa)
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
// RUTAS DEL COMPA
// =========================
app.use('/api/auth-old', authRoutesOld); // opcional
app.use('/api/chats', chatRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/contacts', contactRoutes);

// =========================
// TUS RUTAS
// =========================
app.use('/api/auth', authRoutesNew);
app.use('/api/groups', groupRoutes);
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
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`\n✅ Server running on port ${PORT}`);
  console.log(`📍 API: http://localhost:${PORT}/api`);
  console.log(`🔌 Socket: ws://localhost:${PORT}`);
  console.log(`📂 Uploads: http://localhost:${PORT}/uploads\n`);
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