const { contextBridge, ipcRenderer } = require('electron');

// Expose a small, scoped API to the dashboard. All data stays on this machine.
contextBridge.exposeInMainWorld('mindpc', {
  getDaily: (from, to) => ipcRenderer.invoke('stats:daily', { from, to }),
  getApps: (date) => ipcRenderer.invoke('stats:apps', { date }),
  getSessions: (date) => ipcRenderer.invoke('sessions:list', { date }),
  setCategory: (appName, category) => ipcRenderer.invoke('category:set', { appName, category }),
  getGoal: () => ipcRenderer.invoke('goal:get'),
  setGoal: (minutes) => ipcRenderer.invoke('goal:set', { minutes }),
  getBrowserStatus: () => ipcRenderer.invoke('browser:status'),
  resetBrowserToken: () => ipcRenderer.invoke('browser:resetToken'),
  getHourly: (date) => ipcRenderer.invoke('stats:hourly', { date }),
  getWeek: (from, to) => ipcRenderer.invoke('stats:week', { from, to }),
  getAppsRange: (from, to) => ipcRenderer.invoke('stats:appsRange', { from, to }),
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  revealExtension: () => ipcRenderer.invoke('browser:revealExtension'),
  getTracking: () => ipcRenderer.invoke('tracking:get'),
  setTracking: (enabled) => ipcRenderer.invoke('tracking:set', { enabled }),
  getAutostart: () => ipcRenderer.invoke('autostart:get'),
  setAutostart: (enabled) => ipcRenderer.invoke('autostart:set', { enabled }),
  exportData: () => ipcRenderer.invoke('data:export'),
  deleteAllData: () => ipcRenderer.invoke('data:deleteAll'),
  onTrackingChange: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('tracking:changed', listener);
    return () => ipcRenderer.removeListener('tracking:changed', listener);
  },
});
