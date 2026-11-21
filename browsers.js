// Which focused apps are browsers whose active site the companion extension can
// report. Matched on the whole app or executable name, so a "Chrome Remote
// Desktop" or "Arcade" app is not mistaken for a browser.

// Normalised names (lowercase, punctuation as spaces, no .app/.exe).
const BROWSER_NAMES = new Set([
  'google chrome', 'chrome', 'chromium', 'chromium browser', 'brave browser', 'brave',
  'microsoft edge', 'msedge', 'edge', 'arc', 'vivaldi', 'opera', 'opera gx',
]);

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\.(app|exe)$/, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .join(' ');
}

function isBrowser(appName, appIdentifier) {
  return BROWSER_NAMES.has(normalize(appName)) || BROWSER_NAMES.has(normalize(appIdentifier));
}

module.exports = { isBrowser };
