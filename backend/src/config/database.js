const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;

// Managed PostgreSQL (Neon, Supabase, Render, Railway) requires TLS.
// node-postgres does NOT read `?sslmode=` from the URL, so SSL is configured here:
//   - local Postgres or PGSSL=disable  -> no TLS
//   - everything else (cloud)          -> TLS, trust the provider's cert chain
//     (rejectUnauthorized:false matches how Neon/Supabase managed certs are issued)
const isLocal = !connectionString || /localhost|127\.0\.0\.1/.test(connectionString);
const ssl = process.env.PGSSL === 'disable' || isLocal ? false : { rejectUnauthorized: false };

const pool = new Pool({
  connectionString,
  ssl,
  // Keep the pool small: cloud free tiers have tight connection caps
  // (Neon 0.25 CU: ~104 total; Render free Postgres: 10). One shared pool is enough.
  max: parseInt(process.env.PGPOOL_MAX, 10) || 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

// Log instead of process.exit(-1): on cloud hosts (autosuspend, failover) an
// occasional idle-client error is expected and must NOT crash the whole app.
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

module.exports = pool;
