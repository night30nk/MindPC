require('dotenv').config();
const { Pool } = require('pg');

// Use DATABASE_URL_TEST during tests if provided, otherwise DATABASE_URL
const connectionString =
  process.env.NODE_ENV === 'test' && process.env.DATABASE_URL_TEST
    ? process.env.DATABASE_URL_TEST
    : process.env.DATABASE_URL;

const pool = new Pool({
  connectionString,
});

// Log pool errors so they don't silently crash the process.
pool.on('error', (err) => {
  console.error('Unexpected DB pool error:', err.message);
});

module.exports = pool;
