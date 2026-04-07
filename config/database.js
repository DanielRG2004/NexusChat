const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

const requiredEnv = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Falta la variable de entorno obligatoria: ${key}`);
  }
}

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  connectTimeout: 30000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  multipleStatements: false
});

async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('Database connected successfully to:', process.env.DB_HOST);
    connection.release();
  } catch (error) {
    console.error('Database connection failed:', error.message);
  }
}

testConnection();

module.exports = pool;