console.log('🟡 DB 1 - Iniciando configuración DB');

const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

console.log('🟡 DB 2 - Variables cargadas');

// =========================
// VALIDACIÓN ENV
// =========================
const requiredEnv = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`💥 FALTA ENV: ${key}`);
    throw new Error(`Falta la variable de entorno: ${key}`);
  }
}

console.log('🟡 DB 3 - Variables OK');

// =========================
// CREAR POOL
// =========================
let pool;

try {
  pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    connectTimeout: 30000
  });

  console.log('🟡 DB 4 - Pool creado');
} catch (err) {
  console.error('💥 ERROR creando pool:', err);
}

// =========================
// TEST CONEXIÓN
// =========================
async function testConnection() {
  try {
    console.log('🟡 DB 5 - Probando conexión...');
    const connection = await pool.getConnection();
    console.log('✅ DB conectada a:', process.env.DB_HOST);
    connection.release();
  } catch (error) {
    console.error('💥 DB ERROR conexión:', error.message);
  }
}

testConnection();

module.exports = pool;