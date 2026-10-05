const { BACKEND_URL } = require('./config');

let syncInterval = null;
let isSyncing = false;

// Last sync state for UI
let syncState = {
  isOnline: true,
  lastSyncTime: null,
  authError: false,
};

function getSyncState() {
  return { ...syncState };
}

/**
 * Perform a sync cycle.
 * Because the server handles inserts with ON CONFLICT (client_session_id) DO NOTHING,
 * network retries are always safe and completely idempotent — duplicate rows will never be created.
 *
 * @param {Object} options
 * @param {LocalQueue} options.localQueue
 * @param {Function} options.getAuth - Returns { token, deviceId }
 * @param {Function} [options.onStatusUpdate] - Called with updated syncState & queueStats
 */
async function performSync({ localQueue, getAuth, onStatusUpdate }) {
  if (isSyncing) return;
  const auth = getAuth();
  if (!auth || !auth.token || !auth.deviceId) {
    return;
  }

  const pending = localQueue.getPending(100);
  if (pending.length === 0) {
    if (typeof onStatusUpdate === 'function') {
      onStatusUpdate(getSyncState(), localQueue.getStats());
    }
    return;
  }

  isSyncing = true;
  try {
    const payload = {
      deviceId: auth.deviceId,
      sessions: pending.map((s) => ({
        clientSessionId: s.clientSessionId,
        appName: s.appName,
        appIdentifier: s.appIdentifier,
        startTime: s.startTime,
        endTime: s.endTime,
        durationSeconds: s.durationSeconds,
      })),
    };

    const res = await fetch(`${BACKEND_URL}/api/sessions/bulk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth.token}`,
      },
      body: JSON.stringify(payload),
    });

    if (res.status === 401) {
      // Token is invalid or expired
      syncState.authError = true;
      syncState.isOnline = true;
      stopSync();
      if (typeof onStatusUpdate === 'function') {
        onStatusUpdate(getSyncState(), localQueue.getStats());
      }
      return;
    }

    if (!res.ok) {
      // Non-auth server error (e.g. 500) — retry next cycle without spamming logs
      syncState.isOnline = false;
      return;
    }

    const json = await res.json();
    if (json.success) {
      // Mark uploaded sessions as synced
      const syncedIds = pending.map((s) => s.clientSessionId);
      localQueue.markSynced(syncedIds);

      syncState.isOnline = true;
      syncState.lastSyncTime = new Date().toISOString();
      syncState.authError = false;
    }
  } catch (err) {
    // Network offline / unreachable: silently wait for next cycle
    syncState.isOnline = false;
  } finally {
    isSyncing = false;
    if (typeof onStatusUpdate === 'function') {
      onStatusUpdate(getSyncState(), localQueue.getStats());
    }
  }
}

/**
 * Starts 60-second periodic sync timer.
 */
function startSync({ localQueue, getAuth, onStatusUpdate }) {
  if (syncInterval) return;

  syncState.authError = false;
  // Run an initial sync cycle after 5s, then every 60 seconds
  setTimeout(() => performSync({ localQueue, getAuth, onStatusUpdate }), 5000);
  syncInterval = setInterval(() => {
    performSync({ localQueue, getAuth, onStatusUpdate });
  }, 60000);
}

function stopSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

module.exports = {
  startSync,
  stopSync,
  performSync,
  getSyncState,
};
