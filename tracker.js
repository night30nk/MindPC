const path = require('node:path');
const { getIdleSeconds, IDLE_THRESHOLD_SECONDS } = require('./idle');

const TICK_MS = 3000;

let intervalId = null;
let activeWinFn = null;

// Dynamic import for active-win (ESM package)
async function getActiveWindow() {
  try {
    if (!activeWinFn) {
      const mod = await import('active-win');
      activeWinFn = mod.activeWindow;
    }
    return await activeWinFn();
  } catch {
    // Treat errors (e.g. lock screen, screen saver, no focused window) as no active window
    return null;
  }
}

/**
 * Starts periodic polling every 3 seconds.
 * @param {SessionManager} sessionManager
 * @param {Storage} storage - Completed sessions and the open session are saved here
 * @param {Function} [onTick] - Optional callback receiving current state
 */
function startTracking(sessionManager, storage, onTick) {
  if (intervalId) return;

  const tick = async () => {
    const idleSeconds = getIdleSeconds();
    const isIdle = idleSeconds >= IDLE_THRESHOLD_SECONDS;
    let appName = null;
    let appIdentifier = null;

    if (!isIdle) {
      const winInfo = await getActiveWindow();
      // Tracking may have been stopped while we awaited the OS.
      if (!intervalId) return;
      if (winInfo && winInfo.owner) {
        appName = winInfo.owner.name || 'Unknown';
        appIdentifier = winInfo.owner.path
          ? path.basename(winInfo.owner.path)
          : `${appName}.exe`;
      }
    }

    const completed = sessionManager.update({
      appName,
      appIdentifier,
      now: new Date(),
      isIdle,
      idleSeconds,
    });

    try {
      storage.addSessions(completed);
      storage.saveOpenSession(sessionManager.getOpenState());
    } catch (err) {
      console.error('[TRACKER] Failed to save to local database:', err.message);
    }

    if (typeof onTick === 'function') {
      onTick({ currentApp: sessionManager.getCurrentApp(), isIdle });
    }
  };

  // Run first check immediately, then every 3 seconds
  tick();
  intervalId = setInterval(tick, TICK_MS);
}

function stopTracking() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

function isTracking() {
  return intervalId !== null;
}

module.exports = {
  startTracking,
  stopTracking,
  isTracking,
};
