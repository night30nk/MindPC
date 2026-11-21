// Bridge to the desktop app. All data lives on this computer and is read
// through the preload script (see ../preload.js); there is no server.

function bridge() {
  if (!window.mindpc) {
    throw new Error("MindPC must be opened from the desktop app.");
  }
  return window.mindpc;
}

export const api = {
  getDaily: (from, to) => bridge().getDaily(from, to),
  getApps: (date) => bridge().getApps(date),
  getSessions: (date) => bridge().getSessions(date),
  getHourly: (date) => bridge().getHourly(date),
  getWeek: (from, to) => bridge().getWeek(from, to),
  getAppsRange: (from, to) => bridge().getAppsRange(from, to),
  getAppInfo: () => bridge().getAppInfo(),
  setCategory: (appName, category) => bridge().setCategory(appName, category),
  getGoal: () => bridge().getGoal(),
  setGoal: (minutes) => bridge().setGoal(minutes),
  getBrowserStatus: () => bridge().getBrowserStatus(),
  resetBrowserToken: () => bridge().resetBrowserToken(),
  revealExtension: () => bridge().revealExtension(),
  getTracking: () => bridge().getTracking(),
  setTracking: (enabled) => bridge().setTracking(enabled),
  getAutostart: () => bridge().getAutostart(),
  setAutostart: (enabled) => bridge().setAutostart(enabled),
  exportData: () => bridge().exportData(),
  deleteAllData: () => bridge().deleteAllData(),
  onTrackingChange: (cb) => bridge().onTrackingChange(cb),
};

export function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return "0m";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

export function formatTime(isoString) {
  if (!isoString) return "—";
  const d = new Date(isoString);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export const SITE_PREFIX = "site:";
export const isSite = (entry) => Boolean(entry.identifier && entry.identifier.startsWith(SITE_PREFIX));

export const CATEGORIES = {
  productive: { label: "Productive", color: "var(--prod)" },
  neutral: { label: "Neutral", color: "var(--neu)" },
  distracting: { label: "Distracting", color: "var(--dis)" },
};
export const CATEGORY_ORDER = ["productive", "neutral", "distracting"];
