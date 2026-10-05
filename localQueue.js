const fs = require('node:fs');
const path = require('node:path');

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

class LocalQueue {
  constructor(filePath) {
    this.filePath = filePath;
    this.sessions = [];
    this.load();
    this.cleanupOldSynced();
  }

  load() {
    try {
      if (this.filePath && fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        this.sessions = JSON.parse(raw);
        if (!Array.isArray(this.sessions)) {
          this.sessions = [];
        }
      } else {
        this.sessions = [];
      }
    } catch (err) {
      console.error('[LOCAL_QUEUE] Error reading queue file, resetting:', err.message);
      this.sessions = [];
    }
  }

  // Atomic write: write to a temporary file in the same directory, then rename.
  // This guarantees that a crash or power cut will never leave a corrupted partial file.
  save() {
    if (!this.filePath) return;
    const tempPath = `${this.filePath}.tmp`;
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(tempPath, JSON.stringify(this.sessions, null, 2), 'utf8');
      fs.renameSync(tempPath, this.filePath);
    } catch (err) {
      console.error('[LOCAL_QUEUE] Failed atomic write:', err.message);
      // Clean up temp file if rename failed
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch {
        // ignore
      }
    }
  }

  // Drop synced sessions older than 7 days on startup
  cleanupOldSynced(now = Date.now()) {
    const initialCount = this.sessions.length;
    this.sessions = this.sessions.filter((s) => {
      if (!s.synced) return true; // keep all pending sessions
      if (!s.syncedAt) return false;
      const age = now - new Date(s.syncedAt).getTime();
      return age < SEVEN_DAYS_MS;
    });

    if (this.sessions.length !== initialCount) {
      this.save();
    }
  }

  /**
   * Add a single session or array of sessions to the queue.
   * @param {Object|Array<Object>} sessionOrSessions
   */
  add(sessionOrSessions) {
    const items = Array.isArray(sessionOrSessions) ? sessionOrSessions : [sessionOrSessions];
    for (const item of items) {
      if (!item || !item.clientSessionId) continue;
      // Prevent duplicate clientSessionId in local queue
      const existing = this.sessions.find((s) => s.clientSessionId === item.clientSessionId);
      if (!existing) {
        this.sessions.push({
          ...item,
          synced: false,
          syncedAt: null,
        });
      }
    }
    this.save();
  }

  /**
   * Returns up to limit unsynced sessions.
   * @param {number} [limit=100]
   */
  getPending(limit = 100) {
    return this.sessions.filter((s) => !s.synced).slice(0, limit);
  }

  /**
   * Marks sessions matching clientSessionIds as synced.
   * @param {Array<string>} clientSessionIds
   */
  markSynced(clientSessionIds) {
    if (!Array.isArray(clientSessionIds) || clientSessionIds.length === 0) return;
    const idSet = new Set(clientSessionIds);
    const nowIso = new Date().toISOString();

    let updated = false;
    for (const s of this.sessions) {
      if (idSet.has(s.clientSessionId) && !s.synced) {
        s.synced = true;
        s.syncedAt = nowIso;
        updated = true;
      }
    }

    if (updated) {
      this.save();
    }
  }

  /**
   * Returns count statistics for UI.
   */
  getStats() {
    let pending = 0;
    let synced = 0;
    for (const s of this.sessions) {
      if (s.synced) synced++;
      else pending++;
    }
    return {
      pending,
      synced,
      total: this.sessions.length,
    };
  }
}

module.exports = LocalQueue;
