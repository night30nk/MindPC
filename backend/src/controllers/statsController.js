const pool = require('../db');
const { ok, fail } = require('../respond');

const DEFAULT_TZ = 'Asia/Kolkata';

// ── Timezone note ────────────────────────────────────────────────────
// Sessions are stored as TIMESTAMPTZ (always UTC internally in Postgres).
// To group by the user's *calendar* day we use:
//   (start_time AT TIME ZONE tz)::date
// This converts the UTC timestamp to the user's local clock time first,
// then extracts only the date portion. Without this, a session at
// 11:30 PM IST (= 6:00 PM UTC) would land on the wrong calendar day.
// ────────────────────────────────────────────────────────────────────

function isValidDate(str) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const d = new Date(str);
  return !isNaN(d.getTime());
}

// GET /api/stats/daily?from=YYYY-MM-DD&to=YYYY-MM-DD&tz=...
// Returns [{date, duration}] for every day in the range.
// generate_series fills in days with zero sessions so the chart has no gaps.
async function daily(req, res, next) {
  try {
    const { from, to, tz = DEFAULT_TZ } = req.query;

    if (!from || !to) {
      return fail(res, 'from and to query params are required', 400);
    }
    if (!isValidDate(from) || !isValidDate(to)) {
      return fail(res, 'Invalid date format. Use YYYY-MM-DD', 400);
    }
    if (from > to) {
      return fail(res, 'from must be before or equal to to', 400);
    }

    const result = await pool.query(
      `SELECT
         series.day::date                       AS date,
         COALESCE(SUM(s.duration_seconds), 0)::int AS duration
       FROM generate_series($1::date, $2::date, '1 day'::interval) AS series(day)
       LEFT JOIN sessions s
         ON  s.user_id = $3
         AND (s.start_time AT TIME ZONE $4)::date = series.day::date
         AND s.end_time IS NOT NULL
       GROUP BY series.day
       ORDER BY series.day`,
      [from, to, req.user.id, tz]
    );

    return ok(res, result.rows);
  } catch (err) {
    return next(err);
  }
}

// GET /api/stats/apps?date=YYYY-MM-DD&tz=...
// Returns [{name, duration}] sorted by total seconds descending.
async function apps(req, res, next) {
  try {
    const { date, tz = DEFAULT_TZ } = req.query;

    if (!date) return fail(res, 'date query param is required', 400);
    if (!isValidDate(date)) return fail(res, 'Invalid date format. Use YYYY-MM-DD', 400);

    const result = await pool.query(
      `SELECT
         app_name                   AS name,
         SUM(duration_seconds)::int AS duration
       FROM sessions
       WHERE user_id = $1
         AND (start_time AT TIME ZONE $2)::date = $3::date
         AND end_time IS NOT NULL
       GROUP BY app_name
       ORDER BY duration DESC`,
      [req.user.id, tz, date]
    );

    return ok(res, result.rows);
  } catch (err) {
    return next(err);
  }
}

module.exports = { daily, apps };
