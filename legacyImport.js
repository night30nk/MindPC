// One-time import of history from the first, server-based version of MindPC,
// which kept sessions in a sessions-queue.json file in the app data folder.

const fs = require('node:fs');
const path = require('node:path');
const SessionManager = require('./sessionManager');

const LEGACY_FILE = 'sessions-queue.json';
const MAX_SESSION_MS = 24 * 60 * 60 * 1000; // anything longer is corrupt
const MAX_FUTURE_MS = 24 * 60 * 60 * 1000; // clock skew allowance

// The first version recorded its own window while it was being developed: the
// generic Electron binary, the MindPC build, and dev builds like MindPC-dev.
function isOwnAppIdentifier(identifier) {
  const name = identifier.toLowerCase().replace(/\.(app|exe)$/, '');
  return name === 'electron' || name === 'mindpc' || name.startsWith('mindpc-');
}

/**
 * Turns the contents of a legacy queue file into sessions for the new database.
 * Invalid rows are skipped, sessions are split at local midnight, and the old
 * app's own window is dropped.
 * @returns {{ sessions: Object[], skipped: number, ownApp: number, error?: string }}
 */
function parseLegacyQueue(raw, now = Date.now()) {
  let rows;
  try {
    rows = JSON.parse(raw);
  } catch {
    return { sessions: [], skipped: 0, ownApp: 0, error: 'not valid JSON' };
  }
  if (!Array.isArray(rows)) {
    return { sessions: [], skipped: 0, ownApp: 0, error: 'not a list of sessions' };
  }

  const sessions = [];
  const seen = new Set();
  let skipped = 0;
  let ownApp = 0;

  for (const row of rows) {
    const valid =
      row &&
      typeof row.appName === 'string' && row.appName.trim() &&
      typeof row.appIdentifier === 'string' && row.appIdentifier.trim() &&
      typeof row.startTime === 'string' && typeof row.endTime === 'string';
    if (!valid) {
      skipped++;
      continue;
    }

    const startMs = Date.parse(row.startTime);
    const endMs = Date.parse(row.endTime);
    const duration = endMs - startMs;
    if (
      Number.isNaN(startMs) || Number.isNaN(endMs) ||
      duration <= 0 || duration > MAX_SESSION_MS || endMs > now + MAX_FUTURE_MS
    ) {
      skipped++;
      continue;
    }

    if (isOwnAppIdentifier(row.appIdentifier)) {
      ownApp++;
      continue;
    }

    const key = `${startMs}|${row.appIdentifier}`;
    if (seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);

    sessions.push(
      ...SessionManager.splitAtMidnight(
        { appName: row.appName.trim(), appIdentifier: row.appIdentifier.trim(), startTime: startMs },
        endMs
      )
    );
  }

  return { sessions, skipped, ownApp };
}

// Legacy queue files that exist in the given folders. The same file reached
// through two spellings of a folder (macOS ignores case) is returned once.
function findLegacyQueues(dirs) {
  const found = new Map();
  for (const dir of dirs) {
    const file = path.join(dir, LEGACY_FILE);
    if (!fs.existsSync(file)) continue;
    found.set(fs.realpathSync.native(file), file);
  }
  return [...found.values()];
}

module.exports = { parseLegacyQueue, findLegacyQueues, LEGACY_FILE };
