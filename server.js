const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const pool = require('./config/database');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Middleware
app.use(cors({
  origin: "http://localhost:3000",
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Root route - API info
app.get('/', (req, res) => {
  res.json({
    name: 'NexusChat API',
    version: '1.0.0',
    status: 'online',
    endpoints: {
      auth: '/api/auth',
      chats: '/api/chats',
      messages: '/api/messages',
      contacts: '/api/contacts'
    }
  });
});

// API info route
app.get('/api', (req, res) => {
  res.json({
    name: 'NexusChat API',
    version: '1.0.0',
    available_endpoints: [
      'GET /api/auth/users',
      'POST /api/auth/fake-login',
      'POST /api/auth/register',
      'POST /api/auth/login',
      'GET /api/chats',
      'POST /api/chats/private',
      'GET /api/messages/:conversationId',
      'GET /api/contacts',
      'GET /api/contacts/search'
    ]
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Routes
const authRoutes = require('./routes/authRoutes');
const chatRoutes = require('./routes/chatRoutes');
const messageRoutes = require('./routes/messageRoutes');
const contactRoutes = require('./routes/contactRoutes');

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/contacts', contactRoutes);

// 404 handler for undefined routes
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method,
    available_routes: [
      '/',
      '/health',
      '/api',
      '/api/auth/users',
      '/api/auth/fake-login',
      '/api/chats',
      '/api/messages/:id',
      '/api/contacts'
    ]
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// Socket.io
const socketHandler = require('./sockets/socketHandler');
socketHandler(io, pool);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`\n✅ Server running on port ${PORT}`);
  console.log(`📍 API Base URL: http://localhost:${PORT}/api`);
  console.log(`🔌 WebSocket URL: ws://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`📚 API Info: http://localhost:${PORT}/api\n`);
});

// Keep-alive para mantener conexión activa
setInterval(async () => {
  try {
    const [result] = await pool.execute('SELECT 1');
    console.log('💓 Database keep-alive ping');
  } catch (error) {
    console.error('❌ Keep-alive failed:', error.message);
  }
}, 30000); // Cada 30 segundos