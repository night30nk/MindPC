// Bridge to the desktop app. All data lives on this computer and is read
// through the preload script (see ../preload.js); there is no server.

function bridge() {
  if (!window.mindpc) {
    throw new Error('MindPC must be opened from the desktop app.');
  }
  return window.mindpc;
}

export const api = {
  getDaily: (from, to) => bridge().getDaily(from, to),
  getApps: (date) => bridge().getApps(date),
  getSessions: (date) => bridge().getSessions(date),
  getTracking: () => bridge().getTracking(),
  setTracking: (enabled) => bridge().setTracking(enabled),
  getAutostart: () => bridge().getAutostart(),
  setAutostart: (enabled) => bridge().setAutostart(enabled),
  exportData: () => bridge().exportData(),
  deleteAllData: () => bridge().deleteAllData(),
  onTrackingChange: (cb) => bridge().onTrackingChange(cb),
};

// ── Formatter Helpers ────────────────────────────────────────────────
export function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '0m';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

export function formatTime(isoString) {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
}

export function formatShortDate(dateStr) {
  if (!dateStr) return '';
  try {
    // dateStr is YYYY-MM-DD
    const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
    const d = new Date(year, month - 1, day);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

export function getTodayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getNDaysAgoString(daysAgo, baseDateStr) {
  const base = baseDateStr ? new Date(baseDateStr) : new Date();
  base.setDate(base.getDate() - daysAgo);
  const year = base.getFullYear();
  const month = String(base.getMonth() + 1).padStart(2, '0');
  const day = String(base.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
