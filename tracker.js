const path = require('node:path');
const { isSystemIdle } = require('./idle');

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
 * @param {LocalQueue} [localQueue] - Local queue instance for persisting sessions
 * @param {Function} [onTick] - Optional callback receiving current state
 */
function startTracking(sessionManager, localQueue, onTick) {
  if (intervalId) return;

  const tick = async () => {
    const isIdle = isSystemIdle();
    let appName = null;
    let appIdentifier = null;

    if (!isIdle) {
      const winInfo = await getActiveWindow();
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
    });

    if (completed.length > 0) {
      for (const session of completed) {
        console.log('[TRACKER] Completed session:', session);
      }
      if (localQueue) {
        localQueue.add(completed);
      }
    }

    if (typeof onTick === 'function') {
      onTick({
        currentApp: sessionManager.getCurrentApp(),
        isIdle,
        queueStats: localQueue ? localQueue.getStats() : null,
      });
    }
  };

  // Run first check immediately, then every 3 seconds
  tick();
  intervalId = setInterval(tick, 3000);
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
