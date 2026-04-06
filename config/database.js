const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 5, // Reducir para evitar sobrecarga
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000, // 10 segundos
  
  // 🔥 AUMENTAR TIMEOUTS
  connectTimeout: 30000,      // 30 segundos para conectar
  acquireTimeout: 30000,      // 30 segundos para adquirir conexión
  timeout: 60000,             // 60 segundos para consultas
  
  // 🔥 Para conexiones lentas
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  
  // 🔥 Reconexión automática
  retry: {
    retries: 3,
    factor: 2,
    minTimeout: 1000,
    maxTimeout: 10000
  }
});

// 🔥 Manejar errores de conexión
pool.on('error', (err) => {
  console.error('❌ Database pool error:', err.message);
  if (err.code === 'PROTOCOL_CONNECTION_LOST' || 
      err.code === 'ECONNRESET' || 
      err.code === 'ETIMEDOUT') {
    console.log('🔄 Connection lost, pool will automatically reconnect');
  }
});

// Función para probar conexión con timeout
const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Database connected successfully to:', process.env.DB_HOST);
    connection.release();
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.log('💡 Verifica que el host sea accesible y el firewall permita conexiones');
    return false;
  }
};

testConnection();

module.exports = pool;