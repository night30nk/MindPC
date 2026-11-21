const { powerMonitor } = require('electron');

// 300 seconds = 5 minutes of no keyboard or mouse activity
const IDLE_THRESHOLD_SECONDS = 300;

function getIdleSeconds() {
  if (!powerMonitor || typeof powerMonitor.getSystemIdleTime !== 'function') {
    return 0;
  }
  return powerMonitor.getSystemIdleTime();
}

module.exports = { getIdleSeconds, IDLE_THRESHOLD_SECONDS };
