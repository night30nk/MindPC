const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, powerMonitor, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const SessionManager = require('./sessionManager');
const Storage = require('./storage');
const { startTracking, stopTracking, isTracking } = require('./tracker');
const autostart = require('./autostart');

const RETENTION_DAYS = 90;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Set by `pnpm dev` so the window loads the Vite dev server with hot reload.
const DEV_URL = process.env.MINDPC_DEV_URL;

let mainWindow = null;
let tray = null;
let isQuitting = false;
let storage = null;

const sessionManager = new SessionManager();

// ── Single instance: a second copy would double-count every session ──
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}
app.on('second-instance', () => showWindow());

// ── Tracking lifecycle ───────────────────────────────────────────────
function broadcastTracking() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('tracking:changed', { tracking: isTracking() });
  }
  updateTrayMenu();
}

// Closes the in-progress session and saves it. Used on pause, quit, sleep, lock.
function flushSession() {
  const flushed = sessionManager.flush();
  try {
    storage.addSessions(flushed);
    storage.saveOpenSession(null);
  } catch (err) {
    console.error('[TRACKER] Failed to save session:', err.message);
  }
}

function startAppTracking() {
  if (isTracking()) return;
  startTracking(sessionManager, storage);
  broadcastTracking();
}

function stopAppTracking() {
  if (!isTracking()) return;
  stopTracking();
  flushSession();
  broadcastTracking();
}

// If the app crashed or lost power, close whatever was open at the last tick.
function recoverCrashedSession() {
  const open = storage.getOpenSession();
  if (!open) return;
  storage.addSessions(sessionManager.recover(open));
  storage.saveOpenSession(null);
}

// ── Launch at login ──────────────────────────────────────────────────
// Only for the installed app: in development the "app" is the generic Electron
// binary, and registering that as a login item would be wrong.
function getAutostartState() {
  if (!app.isPackaged) return { available: false, enabled: false };
  try {
    return { available: true, enabled: autostart.getAutostart(app) };
  } catch (err) {
    console.error('[AUTOSTART] Could not read login item:', err.message);
    return { available: false, enabled: false };
  }
}

function setAutostartEnabled(enabled) {
  if (!app.isPackaged) return getAutostartState();
  try {
    autostart.setAutostart(app, Boolean(enabled));
  } catch (err) {
    console.error('[AUTOSTART] Could not change login item:', err.message);
  }
  updateTrayMenu();
  return getAutostartState();
}

// Asked once, on first run, because a tracker is only useful if it is running.
async function askAboutAutostartOnce() {
  if (!getAutostartState().available || storage.getSetting('autostartAsked', false)) return;
  storage.setSetting('autostartAsked', true);

  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    buttons: ['Start automatically', 'Not now'],
    defaultId: 0,
    cancelId: 1,
    title: 'Launch at login',
    message: 'Start MindPC when you log in?',
    detail:
      'MindPC only records time while it is running. It starts quietly in the tray. You can change this anytime from the tray menu or the dashboard.',
  });
  if (response === 0) setAutostartEnabled(true);
}

// ── Window ───────────────────────────────────────────────────────────
function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createWindow({ hidden = false } = {}) {
  mainWindow = new BrowserWindow({
    show: !hidden,
    width: 1100,
    height: 760,
    minWidth: 720,
    minHeight: 560,
    autoHideMenuBar: true,
    backgroundColor: '#020617',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (DEV_URL) {
    mainWindow.loadURL(DEV_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dashboard', 'dist', 'index.html'));
  }

  // Keep tracking in the background when the window is closed. Only possible if
  // there is a tray icon to bring it back from (some Linux desktops have none).
  mainWindow.on('close', (event) => {
    if (!isQuitting && tray) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

// ── Tray ─────────────────────────────────────────────────────────────
function updateTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open MindPC', click: () => showWindow() },
      {
        label: isTracking() ? 'Pause tracking' : 'Resume tracking',
        click: () => (isTracking() ? stopAppTracking() : startAppTracking()),
      },
      ...(getAutostartState().available
        ? [
            {
              label: 'Launch at login',
              type: 'checkbox',
              checked: getAutostartState().enabled,
              click: (item) => setAutostartEnabled(item.checked),
            },
          ]
        : []),
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ])
  );
}

function createTray() {
  try {
    // macOS menu bar wants a black "template" image it can recolour for dark
    // mode (trayTemplate@2x.png is picked up automatically). Elsewhere, use the
    // colour icon.
    const isMac = process.platform === 'darwin';
    const icon = nativeImage.createFromPath(
      path.join(__dirname, 'assets', isMac ? 'trayTemplate.png' : 'tray.png')
    );
    if (isMac) icon.setTemplateImage(true);
    tray = new Tray(icon);
    tray.setToolTip('MindPC');
    tray.on('double-click', () => showWindow());
    updateTrayMenu();
  } catch (err) {
    console.error('[TRAY] Could not create tray icon:', err.message);
    tray = null;
  }
}

// ── IPC: all data is local ───────────────────────────────────────────
function requireDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value) || Number.isNaN(new Date(value).getTime())) {
    throw new Error('Invalid date. Use YYYY-MM-DD');
  }
  return value;
}

ipcMain.handle('stats:daily', (_event, { from, to }) => {
  requireDate(from);
  requireDate(to);
  if (from > to) throw new Error('from must be before or equal to to');
  return storage.getDaily(from, to);
});

ipcMain.handle('stats:apps', (_event, { date }) => storage.getApps(requireDate(date)));

ipcMain.handle('sessions:list', (_event, { date }) => storage.getSessions(requireDate(date)));

ipcMain.handle('autostart:get', () => getAutostartState());

ipcMain.handle('autostart:set', (_event, { enabled }) => setAutostartEnabled(enabled));

ipcMain.handle('tracking:get', () => ({ tracking: isTracking() }));

ipcMain.handle('tracking:set', (_event, { enabled }) => {
  if (enabled) startAppTracking();
  else stopAppTracking();
  return { tracking: isTracking() };
});

ipcMain.handle('data:export', async () => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Export MindPC data',
    defaultPath: 'mindpc-export.json',
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (canceled || !filePath) return { exported: false };

  const sessions = storage.exportAll();
  fs.writeFileSync(
    filePath,
    JSON.stringify({ exportedAt: new Date().toISOString(), sessions }, null, 2),
    'utf8'
  );
  return { exported: true, count: sessions.length };
});

// The confirmation lives here, not in the page, so the page cannot skip it.
ipcMain.handle('data:deleteAll', async () => {
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    buttons: ['Cancel', 'Delete everything'],
    defaultId: 0,
    cancelId: 0,
    title: 'Delete all data',
    message: 'Delete all your tracked data?',
    detail: 'This permanently removes every recorded session from this computer. It cannot be undone.',
  });
  if (response !== 1) return { deleted: false };

  storage.deleteAll();
  // Drop the live session too, so tracking restarts from a clean slate.
  sessionManager.flush();
  return { deleted: true };
});

// ── App lifecycle ────────────────────────────────────────────────────
gotLock && app.whenReady().then(() => {
  storage = new Storage(path.join(app.getPath('userData'), 'mindpc.db'));
  recoverCrashedSession();
  storage.purgeOlderThan(RETENTION_DAYS);

  // The tray comes first: a window started hidden at login is only reachable
  // through it, so only hide when a tray icon exists.
  createTray();
  const startHidden = Boolean(tray) && autostart.wasStartedHidden(app);
  createWindow({ hidden: startHidden });
  startAppTracking();
  if (!startHidden) askAboutAutostartOnce();

  // Sleeping, locking or shutting down ends the session cleanly instead of
  // letting it run until the next tick notices the gap.
  for (const event of ['suspend', 'lock-screen', 'shutdown']) {
    powerMonitor.on(event, () => {
      if (isTracking()) flushSession();
    });
  }

  app.on('activate', () => showWindow());
});

app.on('before-quit', () => {
  isQuitting = true;
  stopTracking();
  if (storage) {
    flushSession();
    storage.close();
    storage = null;
  }
});

// The app lives in the tray, so closing the window must not quit it. With no
// tray there would be no way back to the window, so quit instead.
app.on('window-all-closed', () => {
  if (!tray) app.quit();
});
