const path = require('node:path');
const { getIdleSeconds, IDLE_THRESHOLD_SECONDS } = require('./idle');

const TICK_MS = 3000;

let intervalId = null;
let activeWinFn = null;
let lastError = null;

// Reads the focused window, throwing if get-windows cannot be loaded or run.
// Dynamic import because get-windows is an ESM package.
async function readActiveWindow() {
  if (!activeWinFn) {
    const mod = await import('get-windows');
    activeWinFn = mod.activeWindow;
  }
  // MindPC only needs the app name. Disabling these checks means macOS never
  // asks for Accessibility or Screen Recording access, and window titles and
  // URLs are never read.
  return await activeWinFn({
    accessibilityPermission: false,
    screenRecordingPermission: false,
  });
}

async function getActiveWindow() {
  try {
    return await readActiveWindow();
  } catch (err) {
    // Treat errors (e.g. lock screen, screen saver, no focused window) as no
    // active window. Log each distinct error once so a broken install is
    // visible instead of silently recording nothing.
    if (err.message !== lastError) {
      lastError = err.message;
      console.error('[TRACKER] Could not read the active window:', err.message);
    }
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
  probeActiveWindow: readActiveWindow,
  startTracking,
  stopTracking,
  isTracking,
};
