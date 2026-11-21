// Recognises MindPC's own window, so looking at the dashboard is not counted as
// screen time in some other app (or as "MindPC" itself).

const path = require('node:path');

/**
 * @param {Object} owner - get-windows window owner: { processId, path, name }
 * @param {Object} [self] - Overridable for tests
 */
function isOwnWindow(owner, self = {}) {
  const {
    pid = process.pid,
    execPath = process.execPath,
    platform = process.platform,
  } = self;
  if (!owner) return false;
  if (owner.processId === pid) return true;
  if (!owner.path) return false;

  // Windows paths are case-insensitive.
  const norm = (p) => (platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p));
  const ownerPath = norm(owner.path);
  const exec = norm(execPath);
  // macOS reports the .app bundle; elsewhere the executable itself.
  return exec === ownerPath || exec.startsWith(ownerPath + path.sep);
}

module.exports = { isOwnWindow };
