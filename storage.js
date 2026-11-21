// Local SQLite storage. Uses Node's built-in node:sqlite (available in the Node
// bundled with Electron and in Node 22+), so there is no native module to build
// for Windows, macOS or Linux.
//
// Dates are grouped by the user's local calendar day: sessions never span local
// midnight (see SessionManager), so grouping by start time is exact.

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA_VERSION = 3;

class Storage {
  /**
   * @param {string} filePath - SQLite file path, or ':memory:' for tests
   */
  constructor(filePath) {
    if (filePath !== ':memory:') {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
    }
    this.db = new DatabaseSync(filePath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA foreign_keys = ON');
    this._migrate();
  }

  _migrate() {
    const { user_version: version } = this.db.prepare('PRAGMA user_version').get();
    if (version < 1) {
      this.db.exec(`
        CREATE TABLE sessions (
          id               INTEGER PRIMARY KEY AUTOINCREMENT,
          app_name         TEXT    NOT NULL,
          app_identifier   TEXT    NOT NULL,
          start_time       TEXT    NOT NULL,  -- ISO 8601 UTC
          end_time         TEXT    NOT NULL,
          duration_seconds INTEGER NOT NULL
        );
        CREATE INDEX idx_sessions_start ON sessions(start_time);

        -- Single row: the session currently in progress, rewritten every tick so
        -- a crash can be recovered on next launch.
        CREATE TABLE open_session (
          id             INTEGER PRIMARY KEY CHECK (id = 1),
          app_name       TEXT    NOT NULL,
          app_identifier TEXT    NOT NULL,
          start_ms       INTEGER NOT NULL,
          last_seen_ms   INTEGER NOT NULL
        );
      `);
    }
    if (version < 2) {
      this.db.exec(`
        -- Small key/value store for app preferences.
        CREATE TABLE settings (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);
    }
    if (version < 3) {
      this.db.exec(`
        -- The user's own category choice for an app, overriding the defaults.
        CREATE TABLE category_overrides (
          app_name TEXT PRIMARY KEY,
          category TEXT NOT NULL CHECK (category IN ('productive', 'neutral', 'distracting'))
        );
      `);
    }
    this.db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  }

  // Runs fn inside a transaction; rolls back and rethrows on error.
  _transaction(fn) {
    this.db.exec('BEGIN');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  addSessions(sessions) {
    if (!sessions || sessions.length === 0) return;
    const insert = this.db.prepare(
      `INSERT INTO sessions (app_name, app_identifier, start_time, end_time, duration_seconds)
       VALUES (?, ?, ?, ?, ?)`
    );
    this._transaction(() => {
      for (const s of sessions) {
        insert.run(s.appName, s.appIdentifier, s.startTime, s.endTime, s.durationSeconds);
      }
    });
  }

  saveOpenSession(open) {
    if (!open) {
      this.db.exec('DELETE FROM open_session');
      return;
    }
    this.db
      .prepare(
        `INSERT INTO open_session (id, app_name, app_identifier, start_ms, last_seen_ms)
         VALUES (1, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           app_name = excluded.app_name,
           app_identifier = excluded.app_identifier,
           start_ms = excluded.start_ms,
           last_seen_ms = excluded.last_seen_ms`
      )
      .run(open.appName, open.appIdentifier, open.startTime, open.lastSeenTime);
  }

  getOpenSession() {
    const row = this.db.prepare('SELECT * FROM open_session WHERE id = 1').get();
    if (!row) return null;
    return {
      appName: row.app_name,
      appIdentifier: row.app_identifier,
      startTime: row.start_ms,
      lastSeenTime: row.last_seen_ms,
    };
  }

  // Sessions on one local calendar day (YYYY-MM-DD), oldest first.
  getSessions(date) {
    return this.db
      .prepare(
        `SELECT id, app_name, app_identifier, start_time, end_time, duration_seconds
         FROM sessions
         WHERE date(start_time, 'localtime') = ?
         ORDER BY start_time`
      )
      .all(date);
  }

  getCategoryOverrides() {
    const overrides = {};
    for (const row of this.db.prepare('SELECT app_name, category FROM category_overrides').all()) {
      overrides[row.app_name] = row.category;
    }
    return overrides;
  }

  // category = null removes the override and returns the app to its default.
  setCategoryOverride(appName, category) {
    if (category === null) {
      this.db.prepare('DELETE FROM category_overrides WHERE app_name = ?').run(appName);
      return;
    }
    this.db
      .prepare(
        `INSERT INTO category_overrides (app_name, category) VALUES (?, ?)
         ON CONFLICT(app_name) DO UPDATE SET category = excluded.category`
      )
      .run(appName, category);
  }

  // Total seconds per app for one local day, biggest first. `identifier` is the
  // executable name of the app's most recent session that day (used to pick a
  // default category).
  getApps(date) {
    return this.db
      .prepare(
        `SELECT app_name AS name, MAX(app_identifier) AS identifier,
                SUM(duration_seconds) AS duration
         FROM sessions
         WHERE date(start_time, 'localtime') = ?
         GROUP BY app_name
         ORDER BY duration DESC`
      )
      .all(date);
  }

  // Total seconds per day for [from, to] inclusive. Days with no usage are
  // included with 0 so charts have no gaps.
  getDaily(from, to) {
    const rows = this.db
      .prepare(
        `SELECT date(start_time, 'localtime') AS date, SUM(duration_seconds) AS duration
         FROM sessions
         WHERE date(start_time, 'localtime') BETWEEN ? AND ?
         GROUP BY date`
      )
      .all(from, to);
    const byDate = new Map(rows.map((r) => [r.date, r.duration]));

    const result = [];
    const [fy, fm, fd] = from.split('-').map(Number);
    const [ty, tm, td] = to.split('-').map(Number);
    const end = new Date(ty, tm - 1, td);
    for (let d = new Date(fy, fm - 1, fd); d <= end; d.setDate(d.getDate() + 1)) {
      const key = [
        d.getFullYear(),
        String(d.getMonth() + 1).padStart(2, '0'),
        String(d.getDate()).padStart(2, '0'),
      ].join('-');
      result.push({ date: key, duration: byDate.get(key) || 0 });
    }
    return result;
  }

  // Settings are stored as JSON so booleans and numbers keep their type.
  getSetting(key, fallback = null) {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? JSON.parse(row.value) : fallback;
  }

  setSetting(key, value) {
    this.db
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .run(key, JSON.stringify(value));
  }

  exportAll() {
    return this.db
      .prepare(
        `SELECT app_name, app_identifier, start_time, end_time, duration_seconds
         FROM sessions ORDER BY start_time`
      )
      .all();
  }

  deleteAll() {
    // Tracked data only: preferences and category choices are kept.
    this._transaction(() => {
      this.db.exec('DELETE FROM sessions');
      this.db.exec('DELETE FROM open_session');
    });
  }

  // Drops sessions that started more than `days` days ago.
  purgeOlderThan(days, now = Date.now()) {
    const cutoff = new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
    return this.db.prepare('DELETE FROM sessions WHERE start_time < ?').run(cutoff).changes;
  }

  close() {
    this.db.close();
  }
}

module.exports = Storage;
