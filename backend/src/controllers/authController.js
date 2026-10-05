const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');
const pool   = require('../db');
const { ok, fail } = require('../respond');

const SALT_ROUNDS = 12; // cost factor for bcrypt
const TOKEN_TTL   = '7d';

// ── POST /api/auth/register ──────────────────────────────────────────
async function register(req, res, next) {
  try {
    const { name, email, password } = req.body;

    // Manual validation — keep it simple
    if (!name || !email || !password) {
      return fail(res, 'name, email, and password are required', 400);
    }
    if (password.length < 6) {
      return fail(res, 'password must be at least 6 characters', 400);
    }
    if (!email.includes('@')) {
      return fail(res, 'invalid email address', 400);
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email, created_at`,
      [name.trim(), email.toLowerCase().trim(), passwordHash]
    );

    return ok(res, { user: result.rows[0] }, 201);
  } catch (err) {
    // Postgres unique-violation code = 23505
    if (err.code === '23505') {
      return fail(res, 'Email already registered', 409);
    }
    return next(err);
  }
}

// ── POST /api/auth/login ─────────────────────────────────────────────
async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return fail(res, 'email and password are required', 400);
    }

    const result = await pool.query(
      'SELECT id, name, email, password_hash FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    const user = result.rows[0];

    // Use a constant-time compare even if user doesn't exist,
    // to prevent timing attacks from revealing whether the email is registered.
    const dummyHash = '$2b$12$invalidhashusedtopreventtimingattacks000000000000000000000';
    const match = await bcrypt.compare(password, user ? user.password_hash : dummyHash);

    if (!user || !match) {
      // Generic message — don't reveal whether email or password was wrong
      return fail(res, 'Invalid email or password', 401);
    }

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: TOKEN_TTL });

    return ok(res, {
      token,
      user: { id: user.id, name: user.name, email: user.email },
    });
  } catch (err) {
    return next(err);
  }
}

// ── GET /api/auth/me (protected) ─────────────────────────────────────
async function me(req, res, next) {
  try {
    // req.user.id is set by the auth middleware
    const result = await pool.query(
      'SELECT id, name, email, created_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (!result.rows[0]) {
      return fail(res, 'User not found', 404);
    }

    return ok(res, { user: result.rows[0] });
  } catch (err) {
    return next(err);
  }
}

module.exports = { register, login, me };
