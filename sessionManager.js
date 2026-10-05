// Pure, unit-testable session tracking logic.
// Contains zero Electron, Node timer, or OS-specific dependencies.

class SessionManager {
  constructor(deviceId = 1) {
    this.deviceId = deviceId;
    this.currentSession = null;
    this.lastSeenTime = null;
  }

  setDeviceId(id) {
    this.deviceId = id;
  }

  getCurrentApp() {
    if (!this.currentSession) return null;
    return {
      appName: this.currentSession.appName,
      appIdentifier: this.currentSession.appIdentifier,
      startTime: new Date(this.currentSession.startTime).toISOString(),
    };
  }

  // Completes a session and returns the session object, or null if < 2 seconds
  _finalizeSession(session, endTimestamp) {
    const startMs = session.startTime;
    const endMs = Math.max(startMs, endTimestamp);
    const durationSeconds = Math.round((endMs - startMs) / 1000);

    // Rule: Ignore sessions shorter than 2 seconds
    if (durationSeconds < 2) {
      return null;
    }

    const randomSuffix = Math.random().toString(36).substring(2, 9);
    const clientSessionId = `${this.deviceId}-${startMs}-${randomSuffix}`;

    return {
      clientSessionId,
      appName: session.appName,
      appIdentifier: session.appIdentifier,
      startTime: new Date(startMs).toISOString(),
      endTime: new Date(endMs).toISOString(),
      durationSeconds,
    };
  }

  /**
   * Main state machine update step.
   * @param {Object} params
   * @param {string} [params.appName] - Display name of active window
   * @param {string} [params.appIdentifier] - Process executable name (e.g. chrome.exe)
   * @param {Date|number|string} params.now - Current timestamp
   * @param {boolean} [params.isIdle=false] - Whether user is currently idle
   * @returns {Array<Object>} Completed sessions (empty if none finished)
   */
  update({ appName, appIdentifier, now, isIdle = false }) {
    const timestamp = now instanceof Date ? now.getTime() : new Date(now).getTime();
    const completed = [];

    // Rule: Gap larger than 30s between updates (laptop sleep / process freeze)
    // Close old session at its lastSeenTime, not at "now"
    if (this.currentSession && this.lastSeenTime !== null) {
      const gapMs = timestamp - this.lastSeenTime;
      if (gapMs > 30000) {
        const closed = this._finalizeSession(this.currentSession, this.lastSeenTime);
        if (closed) completed.push(closed);
        this.currentSession = null;
      }
    }

    const hasActiveApp = Boolean(appName && appIdentifier);

    // Case 1: Idle or No active window (e.g. lock screen)
    if (isIdle || !hasActiveApp) {
      if (this.currentSession) {
        const closed = this._finalizeSession(this.currentSession, timestamp);
        if (closed) completed.push(closed);
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
        const closed = this._finalizeSession(this.currentSession, timestamp);
        if (closed) completed.push(closed);

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
   * Flush active session (used on quit, suspend, or shutdown).
   * @param {Date|number|string} now
   * @returns {Array<Object>} Completed sessions
   */
  flush(now = Date.now()) {
    const timestamp = now instanceof Date ? now.getTime() : new Date(now).getTime();
    const completed = [];

    if (this.currentSession) {
      let endTime = timestamp;
      // If a gap occurred right before flush, end at lastSeenTime
      if (this.lastSeenTime && (timestamp - this.lastSeenTime > 30000)) {
        endTime = this.lastSeenTime;
      }
      const closed = this._finalizeSession(this.currentSession, endTime);
      if (closed) completed.push(closed);
      this.currentSession = null;
    }

    this.lastSeenTime = timestamp;
    return completed;
  }
}

module.exports = SessionManager;
