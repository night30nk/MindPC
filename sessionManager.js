// Pure, unit-testable session tracking logic.
// Contains zero Electron, Node timer, or OS-specific dependencies.

const MIN_SESSION_SECONDS = 2;
const SLEEP_GAP_MS = 30000;

// First local-midnight strictly after the given timestamp.
function nextLocalMidnight(ms) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
}

class SessionManager {
  constructor() {
    this.currentSession = null;
    this.lastSeenTime = null;
  }

  getCurrentApp() {
    if (!this.currentSession) return null;
    return {
      appName: this.currentSession.appName,
      appIdentifier: this.currentSession.appIdentifier,
      startTime: new Date(this.currentSession.startTime).toISOString(),
    };
  }

  // Snapshot of the in-progress session, persisted every tick so a crash or
  // power cut loses at most one tick. Null when nothing is being tracked.
  getOpenState() {
    if (!this.currentSession) return null;
    return {
      appName: this.currentSession.appName,
      appIdentifier: this.currentSession.appIdentifier,
      startTime: this.currentSession.startTime,
      lastSeenTime: this.currentSession.lastSeenTime,
    };
  }

  // Closes a session left open by a crash, at the last time it was seen.
  recover(openState) {
    if (!openState) return [];
    return this._finalizeSession(
      {
        appName: openState.appName,
        appIdentifier: openState.appIdentifier,
        startTime: openState.startTime,
      },
      openState.lastSeenTime
    );
  }

  // Completes a session and returns an array of session objects.
  // Sessions under 2 seconds are dropped. Sessions that span local midnight are
  // split so each day gets only the time that actually fell on it.
  _finalizeSession(session, endTimestamp) {
    const startMs = session.startTime;
    const endMs = Math.max(startMs, endTimestamp);

    if (Math.round((endMs - startMs) / 1000) < MIN_SESSION_SECONDS) {
      return [];
    }

    const segments = [];
    let segStart = startMs;
    while (segStart < endMs) {
      const segEnd = Math.min(endMs, nextLocalMidnight(segStart));
      const durationSeconds = Math.round((segEnd - segStart) / 1000);
      if (durationSeconds >= 1) {
        segments.push({
          appName: session.appName,
          appIdentifier: session.appIdentifier,
          startTime: new Date(segStart).toISOString(),
          endTime: new Date(segEnd).toISOString(),
          durationSeconds,
        });
      }
      segStart = segEnd;
    }
    return segments;
  }

  /**
   * Main state machine update step.
   * @param {Object} params
   * @param {string} [params.appName] - Display name of active window
   * @param {string} [params.appIdentifier] - Process executable name (e.g. chrome.exe)
   * @param {Date|number|string} params.now - Current timestamp
   * @param {boolean} [params.isIdle=false] - Whether user is currently idle
   * @param {number} [params.idleSeconds=0] - How long the user has been idle. The
   *   session is closed at the moment the user stopped, not when idle was detected.
   * @returns {Array<Object>} Completed sessions (empty if none finished)
   */
  update({ appName, appIdentifier, now, isIdle = false, idleSeconds = 0 }) {
    const timestamp = now instanceof Date ? now.getTime() : new Date(now).getTime();
    const completed = [];

    // Rule: Gap larger than 30s between updates (laptop sleep / process freeze)
    // Close old session at its lastSeenTime, not at "now"
    if (this.currentSession && this.lastSeenTime !== null) {
      const gapMs = timestamp - this.lastSeenTime;
      if (gapMs > SLEEP_GAP_MS) {
        completed.push(...this._finalizeSession(this.currentSession, this.lastSeenTime));
        this.currentSession = null;
      }
    }

    const hasActiveApp = Boolean(appName && appIdentifier);

    // Case 1: Idle or No active window (e.g. lock screen)
    if (isIdle || !hasActiveApp) {
      if (this.currentSession) {
        // The idle threshold has already elapsed by the time we notice, so end
        // the session when the user last touched the machine.
        const endTs = isIdle
          ? Math.max(this.currentSession.startTime, timestamp - idleSeconds * 1000)
          : timestamp;
        completed.push(...this._finalizeSession(this.currentSession, endTs));
        this.currentSession = null;
      }
      this.lastSeenTime = timestamp;
      return completed;
    }

    // Case 2: Active application in use
    if (this.currentSession) {
      if (this.currentSession.appIdentifier === appIdentifier) {
        // Same app: extend current session
        this.currentSession.lastSeenTime = timestamp;
      } else {
        // Different app: close old session at timestamp, start new one
        completed.push(...this._finalizeSession(this.currentSession, timestamp));

        this.currentSession = {
          appName,
          appIdentifier,
          startTime: timestamp,
          lastSeenTime: timestamp,
        };
      }
    } else {
      // Idle ended or first app seen: start new session
      this.currentSession = {
        appName,
        appIdentifier,
        startTime: timestamp,
        lastSeenTime: timestamp,
      };
    }

    this.lastSeenTime = timestamp;
    return completed;
  }

  /**
   * Flush active session (used on quit, suspend, pause or shutdown).
   * @param {Date|number|string} now
   * @returns {Array<Object>} Completed sessions
   */
  flush(now = Date.now()) {
    const timestamp = now instanceof Date ? now.getTime() : new Date(now).getTime();
    let completed = [];

    if (this.currentSession) {
      let endTime = timestamp;
      // If a gap occurred right before flush, end at lastSeenTime
      if (this.lastSeenTime && (timestamp - this.lastSeenTime > SLEEP_GAP_MS)) {
        endTime = this.lastSeenTime;
      }
      completed = this._finalizeSession(this.currentSession, endTime);
      this.currentSession = null;
    }

    this.lastSeenTime = timestamp;
    return completed;
  }
}

module.exports = SessionManager;
