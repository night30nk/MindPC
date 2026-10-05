const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, powerMonitor } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { BACKEND_URL } = require('./config');
const SessionManager = require('./sessionManager');
const { startTracking, stopTracking, isTracking } = require('./tracker');
const LocalQueue = require('./localQueue');
const { startSync, stopSync, performSync, getSyncState } = require('./sync');

let mainWindow = null;
let tray = null;
let isQuitting = false;
let localQueue = null;

const sessionManager = new SessionManager();

// ── Local Queue Singleton in app.getPath('userData') ────────────────
function getLocalQueue() {
  if (!localQueue) {
    const qPath = path.join(app.getPath('userData'), 'sessions-queue.json');
    localQueue = new LocalQueue(qPath);
  }
  return localQueue;
}

// ── Auth storage helper in app.getPath('userData') ───────────────────
function getAuthFilePath() {
  return path.join(app.getPath('userData'), 'auth.json');
}

function loadAuthData() {
  try {
    const file = getAuthFilePath();
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.error('Error reading auth file:', err.message);
  }
  return null;
}

function saveAuthData(data) {
  try {
    const file = getAuthFilePath();
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving auth file:', err.message);
  }
}

function clearAuthData() {
  try {
    const file = getAuthFilePath();
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  } catch (err) {
    console.error('Error clearing auth file:', err.message);
  }
}

// ── Register device helper ───────────────────────────────────────────
async function registerDevice(token) {
  const deviceName = os.hostname() || 'Windows Device';
  const platform = process.platform;

  const res = await fetch(`${BACKEND_URL}/api/devices`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ deviceName, platform }),
  });

  const json = await res.json();
  if (json.success && json.data?.device) {
    return json.data.device.id;
  }
  throw new Error(json.message || 'Failed to register device');
}

// ── Broadcast UI Status ──────────────────────────────────────────────
function broadcastStatus() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('mindpc:syncUpdate', {
      syncState: getSyncState(),
      queueStats: getLocalQueue().getStats(),
    });
  }
}

// ── Tracking & Sync lifecycle helpers ────────────────────────────────
function startAppServices(deviceId) {
  if (deviceId) {
    sessionManager.setDeviceId(deviceId);
  }
  const q = getLocalQueue();

  if (!isTracking()) {
    startTracking(sessionManager, q, ({ currentApp, isIdle, queueStats }) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('mindpc:appChange', {
          currentApp,
          isIdle,
          tracking: true,
          queueStats: queueStats || q.getStats(),
          syncState: getSyncState(),
        });
      }
    });
  }

  startSync({
    localQueue: q,
    getAuth: loadAuthData,
    onStatusUpdate: () => broadcastStatus(),
  });
}

function stopAppServices() {
  stopTracking();
  stopSync();

  const flushed = sessionManager.flush();
  if (flushed.length > 0) {
    getLocalQueue().add(flushed);
    for (const s of flushed) console.log('[TRACKER] Flushed session on stop:', s);
  }

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('mindpc:appChange', {
      currentApp: null,
      isIdle: false,
      tracking: false,
      queueStats: getLocalQueue().getStats(),
      syncState: getSyncState(),
    });
  }
}

// ── Window Creation ──────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 440,
    height: 700,
    resizable: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

// ── Tray Setup ───────────────────────────────────────────────────────
function createTray() {
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAZElEQVQ4T2NkoBAwUqifYdQAUmzg/38Ghv9nGBj+n2Vg+P8fjwYGBob///4zMDCiG8D4n4GBgeE/QxO6Bv7/fxqLBlAUI8s2og1A1k14XUvQBmLSz8j0M+H4mFSAETVSEjQSZAMA+4M6n/i6xT0AAAAASUVORK5CYII='
  );

  tray = new Tray(icon);
  tray.setToolTip('MindPC');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open MindPC',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// ── IPC Handlers ─────────────────────────────────────────────────────
ipcMain.handle('mindpc:getStatus', async () => {
  const auth = loadAuthData();
  const q = getLocalQueue();
  if (auth && auth.token && auth.user) {
    return {
      success: true,
      loggedIn: true,
      user: auth.user,
      deviceId: auth.deviceId,
      tracking: isTracking(),
      currentApp: sessionManager.getCurrentApp(),
      syncState: getSyncState(),
      queueStats: q.getStats(),
    };
  }
  return { success: true, loggedIn: false };
});

ipcMain.handle('mindpc:login', async (_event, { email, password }) => {
  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const json = await res.json();
    if (!json.success) {
      return { success: false, message: json.message || 'Login failed' };
    }

    const { token, user } = json.data;
    const deviceId = await registerDevice(token);

    saveAuthData({ token, user, deviceId });
    startAppServices(deviceId);

    return {
      success: true,
      user,
      deviceId,
      tracking: true,
      syncState: getSyncState(),
      queueStats: getLocalQueue().getStats(),
    };
  } catch (err) {
    return { success: false, message: err.message || 'Unable to connect to server' };
  }
});

ipcMain.handle('mindpc:register', async (_event, { name, email, password }) => {
  try {
    const regRes = await fetch(`${BACKEND_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });

    const regJson = await regRes.json();
    if (!regJson.success) {
      return { success: false, message: regJson.message || 'Registration failed' };
    }

    const loginRes = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const loginJson = await loginRes.json();
    if (!loginJson.success) {
      return { success: false, message: loginJson.message || 'Auto-login failed' };
    }

    const { token, user } = loginJson.data;
    const deviceId = await registerDevice(token);

    saveAuthData({ token, user, deviceId });
    startAppServices(deviceId);

    return {
      success: true,
      user,
      deviceId,
      tracking: true,
      syncState: getSyncState(),
      queueStats: getLocalQueue().getStats(),
    };
  } catch (err) {
    return { success: false, message: err.message || 'Unable to connect to server' };
  }
});

ipcMain.handle('mindpc:logout', async () => {
  stopAppServices();
  clearAuthData();
  return { success: true };
});

// ── App Lifecycle ────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();
  createTray();

  const auth = loadAuthData();
  if (auth && auth.token && auth.deviceId) {
    startAppServices(auth.deviceId);
  }

  powerMonitor.on('suspend', () => {
    console.log('[POWER] Suspend detected — flushing active session');
    const flushed = sessionManager.flush();
    if (flushed.length > 0) {
      getLocalQueue().add(flushed);
      for (const s of flushed) console.log('[TRACKER] Flushed on suspend:', s);
    }
  });

  powerMonitor.on('shutdown', () => {
    console.log('[POWER] Shutdown detected — flushing active session');
    const flushed = sessionManager.flush();
    if (flushed.length > 0) {
      getLocalQueue().add(flushed);
      for (const s of flushed) console.log('[TRACKER] Flushed on shutdown:', s);
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
});

let quittingDone = false;
app.on('before-quit', async (event) => {
  if (quittingDone) return;
  event.preventDefault();
  quittingDone = true;
  isQuitting = true;

  console.log('[APP] Exiting — stopping tracking and performing final sync...');
  stopTracking();
  stopSync();

  const flushed = sessionManager.flush();
  if (flushed.length > 0) {
    getLocalQueue().add(flushed);
    for (const s of flushed) console.log('[TRACKER] Flushed on quit:', s);
  }

  try {
    await performSync({
      localQueue: getLocalQueue(),
      getAuth: loadAuthData,
    });
  } catch {
    // Ignore network error on exit
  } finally {
    app.quit();
  }
});
