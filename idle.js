const { powerMonitor } = require('electron');

// 300 seconds = 5 minutes of no keyboard or mouse activity
const IDLE_THRESHOLD_SECONDS = 300;

function isSystemIdle() {
  if (!powerMonitor || typeof powerMonitor.getSystemIdleTime !== 'function') {
    return false;
  }
  return powerMonitor.getSystemIdleTime() >= IDLE_THRESHOLD_SECONDS;
}

module.exports = { isSystemIdle, IDLE_THRESHOLD_SECONDS };
