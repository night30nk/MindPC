const pool = require('../db');
const { ok, fail } = require('../respond');

// POST /api/devices  { deviceName, platform }
// Returns the existing device if the same user already registered it
// (so the desktop app can safely call this on every launch).
async function createOrGetDevice(req, res, next) {
  try {
    const { deviceName, platform } = req.body;

    if (!deviceName || !platform) {
      return fail(res, 'deviceName and platform are required', 400);
    }

    // Check if this user already registered a device with this name
    const existing = await pool.query(
      `SELECT id, device_name, platform, created_at
       FROM devices
       WHERE user_id = $1 AND device_name = $2`,
      [req.user.id, deviceName.trim()]
    );

    if (existing.rows[0]) {
      // Idempotent – return the existing row, not a 409
      return ok(res, { device: existing.rows[0], created: false });
    }

    const result = await pool.query(
      `INSERT INTO devices (user_id, device_name, platform)
       VALUES ($1, $2, $3)
       RETURNING id, device_name, platform, created_at`,
      [req.user.id, deviceName.trim(), platform.trim()]
    );

    return ok(res, { device: result.rows[0], created: true }, 201);
  } catch (err) {
    return next(err);
  }
}

module.exports = { createOrGetDevice };
