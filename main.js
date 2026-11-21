const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, powerMonitor, dialog, Notification, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const SessionManager = require('./sessionManager');
const Storage = require('./storage');
const { startTracking, stopTracking, isTracking } = require('./tracker');
const autostart = require('./autostart');
const { runSelfTest } = require('./selftest');
const { BrowserLink, newToken } = require('./browserLink');
const { hourlyByCategory, dailyByCategory } = require('./stats');
const { installExtensionFolder } = require('./extensionFolder');
const { parseLegacyQueue, findLegacyQueues } = require('./legacyImport');
const { CATEGORIES, summarize, categorize } = require('./categories');
const { evaluateLimit, notificationText, localDateKey } = require('./limits');

const RETENTION_DAYS = 90;
const LIMIT_CHECK_MS = 30000;
const MAX_GOAL_MINUTES = 24 * 60;
const MAX_RANGE_DAYS = 366;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// `--self-test` checks that this build can start (used by CI), then exits.
// It runs on a throwaway data folder so it never touches real data.
const SELF_TEST = process.argv.includes('--self-test');
const SELF_TEST_OUT = (process.argv.find((a) => a.startsWith('--self-test-out=')) || '').split('=')[1];
if (SELF_TEST) {
  app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'mindpc-selftest-')));
}

// Set by `pnpm dev` so the window loads the Vite dev server with hot reload.
const DEV_URL = process.env.MINDPC_DEV_URL;

let mainWindow = null;
let tray = null;
let isQuitting = false;
let storage = null;
let browserLink = null;

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
  startTracking(sessionManager, storage, undefined, {
    getSite: () => (browserLink ? browserLink.getCurrentSite() : null),
  });
  broadcastTracking();
}

function stopAppTracking() {
  if (!isTracking()) return;
  stopTracking();
  flushSession();
  broadcastTracking();
}

// Pausing is remembered, so restarting the app does not silently resume
// tracking. The tray tooltip and the dashboard button show when it is paused.
function pauseTracking() {
  storage.setSetting('trackingPaused', true);
  stopAppTracking();
}

function resumeTracking() {
  storage.setSetting('trackingPaused', false);
  startAppTracking();
}

// If the app crashed or lost power, close whatever was open at the last tick.
function recoverCrashedSession() {
  const open = storage.getOpenSession();
  if (!open) return;
  storage.addSessions(sessionManager.recover(open));
  storage.saveOpenSession(null);
}

// ── Daily goal ───────────────────────────────────────────────────────
// Screen time so far today: saved sessions plus the one still in progress.
function todaySeconds(now = new Date()) {
  const today = localDateKey(now);
  let total = storage.getDaily(today, today)[0]?.duration ?? 0;

  const open = sessionManager.getOpenState();
  if (open) {
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const start = Math.max(open.startTime, midnight);
    total += Math.max(0, (open.lastSeenTime - start) / 1000);
  }
  return total;
}

function checkGoal() {
  if (!storage) return;
  const limitMinutes = storage.getSetting('dailyLimitMinutes', null);
  const previous = storage.getSetting('limitState', null);
  const { notify, state } = evaluateLimit({
    totalSeconds: todaySeconds(),
    limitMinutes,
    today: localDateKey(),
    state: previous,
  });

  if (JSON.stringify(state) !== JSON.stringify(previous)) {
    storage.setSetting('limitState', state);
  }
  if (notify === null) return;

  console.log(`[GOAL] ${notify}% of the daily goal reached`);
  if (!Notification.isSupported()) return;
  const notification = new Notification(notificationText(notify, limitMinutes));
  notification.on('click', () => showWindow());
  notification.show();
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

// History from the first, server-based version, imported once.
function importLegacyHistory() {
  if (storage.getSetting('legacyImported', false)) return;

  // The first version used the package name for its data folder; this one uses
  // the product name, which differs in case or spelling on some systems.
  const files = findLegacyQueues([
    app.getPath('userData'),
    path.join(app.getPath('appData'), 'mindpc'),
  ]);

  let imported = 0;
  let ownApp = 0;
  let skipped = 0;
  for (const file of files) {
    const result = parseLegacyQueue(fs.readFileSync(file, 'utf8'));
    if (result.error) {
      console.error(`[IMPORT] Ignoring ${file}: ${result.error}`);
      continue;
    }
    storage.addSessions(result.sessions);
    imported += result.sessions.length;
    ownApp += result.ownApp;
    skipped += result.skipped;
  }

  // Marked done only after a successful write, so a database error retries on
  // the next launch instead of losing the import.
  storage.setSetting('legacyImported', true);
  if (files.length > 0) {
    console.log(`[IMPORT] Imported ${imported} sessions (${ownApp} own-app and ${skipped} invalid rows skipped)`);
  }
}

// ── Browser companion extension ──────────────────────────────────────
// The extension reports which site is open to a server on this computer only.
async function startBrowserLink() {
  let token = storage.getSetting('browserLinkToken', null);
  if (!token) {
    token = newToken();
    storage.setSetting('browserLinkToken', token);
  }
  const link = new BrowserLink({ token });
  try {
    const port = await link.start();
    browserLink = link;
    console.log(`[BROWSER-LINK] listening on 127.0.0.1:${port}`);
  } catch (err) {
    // Tracking must work without it: sites just stay under the browser's name.
    console.error('[BROWSER-LINK] not started:', err.message);
  }
}

function browserStatus() {
  return {
    available: Boolean(browserLink),
    connected: browserLink ? browserLink.isConnected() : false,
    token: browserLink ? browserLink.token : null,
  };
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
  tray.setToolTip(isTracking() ? 'MindPC' : 'MindPC (paused)');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open MindPC', click: () => showWindow() },
      {
        label: isTracking() ? 'Pause tracking' : 'Resume tracking',
        click: () => (isTracking() ? pauseTracking() : resumeTracking()),
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

// Apps for a day, each with its category, plus seconds per category.
ipcMain.handle('stats:apps', (_event, { date }) =>
  summarize(storage.getApps(requireDate(date)), storage.getCategoryOverrides())
);

// A date range for the Week and Apps screens: validated and capped.
function requireRange(from, to) {
  requireDate(from);
  requireDate(to);
  if (from > to) throw new Error('from must be before or equal to to');
  const days = (new Date(to) - new Date(from)) / 86400000 + 1;
  if (days > MAX_RANGE_DAYS) throw new Error(`Range is limited to ${MAX_RANGE_DAYS} days`);
}

// Minutes per hour of one day, split by category (the Week screen's hourly chart).
ipcMain.handle('stats:hourly', (_event, { date }) =>
  hourlyByCategory(storage.getSessions(requireDate(date)), storage.getCategoryOverrides())
);

// Seconds per category for each day in a range.
ipcMain.handle('stats:week', (_event, { from, to }) => {
  requireRange(from, to);
  return dailyByCategory(storage.getDailyApps(from, to), storage.getCategoryOverrides(), from, to);
});

// Apps and sites across a range, each with its category, plus totals per category.
ipcMain.handle('stats:appsRange', (_event, { from, to }) => {
  requireRange(from, to);
  return summarize(storage.getAppsRange(from, to), storage.getCategoryOverrides());
});

ipcMain.handle('app:info', () => ({ version: app.getVersion(), platform: process.platform }));

ipcMain.handle('category:set', (_event, { appName, category }) => {
  if (typeof appName !== 'string' || appName.length === 0 || appName.length > 200) {
    throw new Error('Invalid app name');
  }
  if (category !== null && !CATEGORIES.includes(category)) {
    throw new Error('Invalid category');
  }
  storage.setCategoryOverride(appName, category);
  return { appName, category };
});

ipcMain.handle('goal:get', () => ({ minutes: storage.getSetting('dailyLimitMinutes', null) }));

ipcMain.handle('goal:set', (_event, { minutes }) => {
  if (minutes !== null && !(Number.isInteger(minutes) && minutes >= 1 && minutes <= MAX_GOAL_MINUTES)) {
    throw new Error('Goal must be between 1 minute and 24 hours');
  }
  storage.setSetting('dailyLimitMinutes', minutes);
  checkGoal();
  return { minutes };
});

// Sessions of one day, each with its category (so the day can be drawn in colour).
ipcMain.handle('sessions:list', (_event, { date }) => {
  const overrides = storage.getCategoryOverrides();
  return storage.getSessions(requireDate(date)).map((row) => ({
    ...row,
    category: categorize(row.app_name, row.app_identifier, overrides),
  }));
});

ipcMain.handle('autostart:get', () => getAutostartState());

ipcMain.handle('autostart:set', (_event, { enabled }) => setAutostartEnabled(enabled));

ipcMain.handle('browser:status', () => browserStatus());

// A new code voids every earlier pairing, so a leaked code can be revoked.
ipcMain.handle('browser:resetToken', () => {
  if (!browserLink) return browserStatus();
  const token = newToken();
  storage.setSetting('browserLinkToken', token);
  browserLink.setToken(token);
  return browserStatus();
});

// Copies the bundled extension to a permanent folder and opens it, so the user can
// load it in their browser ("Load unpacked"). Browsers do not let an app install
// an extension silently.
ipcMain.handle('browser:revealExtension', async () => {
  const dest = installExtensionFolder(
    path.join(__dirname, 'extension'),
    path.join(app.getPath('userData'), 'browser-extension')
  );
  const error = await shell.openPath(dest); // empty string on success
  return { path: dest, opened: error === '', error: error || null };
});

ipcMain.handle('tracking:get', () => ({ tracking: isTracking() }));

ipcMain.handle('tracking:set', (_event, { enabled }) => {
  if (enabled) resumeTracking();
  else pauseTracking();
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
  storage.setSetting('limitState', null);
  // Drop the live session too, so tracking restarts from a clean slate.
  sessionManager.flush();
  return { deleted: true };
});

// ── App lifecycle ────────────────────────────────────────────────────
gotLock && app.whenReady().then(async () => {
  if (SELF_TEST) {
    const ok = await runSelfTest({ nativeImage, outFile: SELF_TEST_OUT });
    app.exit(ok ? 0 : 1);
    return;
  }

  storage = new Storage(path.join(app.getPath('userData'), 'mindpc.db'));
  recoverCrashedSession();
  importLegacyHistory();
  storage.purgeOlderThan(RETENTION_DAYS);
  await startBrowserLink();

  // The tray comes first: a window started hidden at login is only reachable
  // through it, so only hide when a tray icon exists.
  createTray();
  const startHidden = Boolean(tray) && autostart.wasStartedHidden(app);
  createWindow({ hidden: startHidden });
  if (storage.getSetting('trackingPaused', false)) updateTrayMenu();
  else startAppTracking();
  if (!startHidden) askAboutAutostartOnce();
  checkGoal();
  setInterval(checkGoal, LIMIT_CHECK_MS);

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
  if (browserLink) browserLink.stop();
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
