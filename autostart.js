// Launch at login on Windows, macOS and Linux.
//
// Windows and macOS have a login-item API in Electron. Linux has none, so there
// we manage an XDG autostart entry (~/.config/autostart/mindpc.desktop).
//
// The login launch passes --hidden so the app starts in the tray instead of
// opening a window every time you sign in.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HIDDEN_FLAG = '--hidden';

// Quotes a path for the Exec= key of a .desktop file. Inside double quotes the
// spec requires " ` $ and \ to be backslash-escaped.
function quoteExecArg(value) {
  return `"${value.replace(/(["`$\\])/g, '\\$1')}"`;
}

function buildDesktopEntry(execPath) {
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=MindPC',
    'Comment=Local-first digital wellbeing tracker',
    `Exec=${quoteExecArg(execPath)} ${HIDDEN_FLAG}`,
    'Terminal=false',
    'X-GNOME-Autostart-enabled=true',
    '',
  ].join('\n');
}

function linuxAutostartPath(env = process.env, home = os.homedir()) {
  const configHome = env.XDG_CONFIG_HOME || path.join(home, '.config');
  return path.join(configHome, 'autostart', 'mindpc.desktop');
}

// An AppImage runs from a temporary mount, so its real path is in $APPIMAGE.
function linuxExecPath(env = process.env) {
  return env.APPIMAGE || process.execPath;
}

function isLinuxAutostartEnabled(file = linuxAutostartPath()) {
  return fs.existsSync(file);
}

function setLinuxAutostart(enabled, execPath = linuxExecPath(), file = linuxAutostartPath()) {
  if (enabled) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, buildDesktopEntry(execPath), 'utf8');
  } else {
    fs.rmSync(file, { force: true });
  }
}

function getAutostart(app) {
  if (process.platform === 'linux') return isLinuxAutostartEnabled();
  return app.getLoginItemSettings({ args: [HIDDEN_FLAG] }).openAtLogin;
}

function setAutostart(app, enabled) {
  if (process.platform === 'linux') {
    setLinuxAutostart(enabled);
    return;
  }
  app.setLoginItemSettings({ openAtLogin: enabled, args: [HIDDEN_FLAG] });
}

// True when the OS started us at login, so the window should stay hidden.
function wasStartedHidden(app) {
  if (process.argv.includes(HIDDEN_FLAG)) return true;
  // macOS login items cannot pass arguments; it reports the launch reason instead.
  if (process.platform === 'darwin') {
    try {
      return app.getLoginItemSettings().wasOpenedAtLogin;
    } catch {
      return false;
    }
  }
  return false;
}

module.exports = {
  HIDDEN_FLAG,
  buildDesktopEntry,
  linuxAutostartPath,
  linuxExecPath,
  isLinuxAutostartEnabled,
  setLinuxAutostart,
  getAutostart,
  setAutostart,
  wasStartedHidden,
};
