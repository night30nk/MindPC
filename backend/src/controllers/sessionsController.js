const pool = require('../db');
const DEFAULT_TZ = 'Asia/Kolkata';

function isValidDate(str) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  return !isNaN(new Date(str).getTime());
}
const { ok, fail } = require('../respond');

// POST /api/sessions/bulk  { deviceId, sessions: [...] }
async function bulkUpload(req, res, next) {
  try {
    const { deviceId, sessions } = req.body;

    // ── Top-level payload validation ───────────────────────────────
    if (!deviceId) {
      return fail(res, 'deviceId is required', 400);
    }
    if (!Array.isArray(sessions) || sessions.length === 0) {
      return fail(res, 'sessions must be a non-empty array', 400);
    }

    // ── Verify device belongs to the logged-in user ────────────────
    const deviceCheck = await pool.query(
      'SELECT id FROM devices WHERE id = $1 AND user_id = $2',
      [deviceId, req.user.id]
    );
    if (!deviceCheck.rows[0]) {
      return fail(res, 'Device not found or does not belong to you', 403);
    }

    // ── Validate every session before touching the DB ──────────────
    for (let i = 0; i < sessions.length; i++) {
      const s = sessions[i];
      const tag = `sessions[${i}]`; // helpful error prefix for the client

      if (!s.clientSessionId || !s.appName || !s.appIdentifier || !s.startTime || !s.endTime) {
        return fail(
          res,
          `${tag}: clientSessionId, appName, appIdentifier, startTime, endTime are required`,
          400
        );
      }

      const start = new Date(s.startTime);
      const end   = new Date(s.endTime);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return fail(res, `${tag}: startTime and endTime must be valid ISO timestamps`, 400);
      }
      if (end <= start) {
        return fail(res, `${tag}: endTime must be after startTime`, 400);
      }
      if (s.durationSeconds != null && s.durationSeconds < 0) {
        return fail(res, `${tag}: durationSeconds must be >= 0`, 400);
      }
    }

    // ── Insert inside a transaction ────────────────────────────────
    // We insert one row at a time so we can count actual inserts vs skips.
    // ON CONFLICT (client_session_id) DO NOTHING makes this idempotent:
    // uploading the same batch twice will skip the duplicates silently.
    const client = await pool.connect();
    let inserted = 0;

    try {
      await client.query('BEGIN');

      for (const s of sessions) {
        const result = await client.query(
          `INSERT INTO sessions
             (user_id, device_id, client_session_id,
              app_name, app_identifier, start_time, end_time, duration_seconds)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (client_session_id) DO NOTHING`,
          [
            req.user.id,
            deviceId,
            s.clientSessionId,
            s.appName,
            s.appIdentifier,
            s.startTime,
            s.endTime,
            s.durationSeconds ?? null,
          ]
        );
        // rowCount is 1 when a row was inserted, 0 when it was skipped
        inserted += result.rowCount;
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err; // central error handler will catch this
    } finally {
      client.release(); // always return the connection to the pool
    }

    return ok(res, {
      total: sessions.length,
      inserted,
      skipped: sessions.length - inserted,
    });
  } catch (err) {
    return next(err);
  }
}

// GET /api/sessions?date=YYYY-MM-DD&tz=...
// Returns every session for the given calendar day, ordered by start time.
async function listByDate(req, res, next) {
  try {
    const { date, tz = DEFAULT_TZ } = req.query;

    if (!date) return fail(res, 'date query param is required', 400);
    if (!isValidDate(date)) return fail(res, 'Invalid date format. Use YYYY-MM-DD', 400);

    const result = await pool.query(
      `SELECT
         id, app_name, app_identifier,
         start_time, end_time, duration_seconds
       FROM sessions
       WHERE user_id = $1
         AND (start_time AT TIME ZONE $2)::date = $3::date
       ORDER BY start_time`,
      [req.user.id, tz, date]
    );

    return ok(res, result.rows);
  } catch (err) {
    return next(err);
  }
}

module.exports = { bulkUpload, listByDate };
