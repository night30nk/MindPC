const express = require('express');
const cors    = require('cors');
const pool    = require('./db');
const { ok, fail } = require('./respond');
const authRoutes    = require('./routes/auth');
const deviceRoutes  = require('./routes/devices');
const sessionRoutes = require('./routes/sessions');
const statsRoutes   = require('./routes/stats');

const app = express();

// ── Middleware ──────────────────────────────────────────────────────
app.use(cors());            // allow requests from the dashboard (localhost:5173)
app.use(express.json());    // parse JSON request bodies

// ── Routes ──────────────────────────────────────────────────────────
app.use('/api/auth',     authRoutes);
app.use('/api/devices',  deviceRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/stats',    statsRoutes);

// Health check – verifies the app is up AND the DB connection works
app.get('/api/health', async (req, res, next) => {
  try {
    await pool.query('SELECT 1');           // will throw if DB is unreachable
    return ok(res, { status: 'ok', db: 'connected' });
  } catch (err) {
    return next(err);                       // handled by the central error handler below
  }
});

// ── 404 handler ─────────────────────────────────────────────────────
app.use((req, res) => {
  return fail(res, `Route not found: ${req.method} ${req.path}`, 404);
});

// ── Central error handler ────────────────────────────────────────────
// Must have 4 parameters so Express recognises it as an error handler.
// Never send raw DB errors to the client – just log them server-side.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  return fail(res, 'Internal server error', 500);
});

module.exports = app;
