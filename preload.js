const { contextBridge, ipcRenderer } = require('electron');

// Expose a small, scoped API to the dashboard. All data stays on this machine.
contextBridge.exposeInMainWorld('mindpc', {
  getDaily: (from, to) => ipcRenderer.invoke('stats:daily', { from, to }),
  getApps: (date) => ipcRenderer.invoke('stats:apps', { date }),
  getSessions: (date) => ipcRenderer.invoke('sessions:list', { date }),
  getTracking: () => ipcRenderer.invoke('tracking:get'),
  setTracking: (enabled) => ipcRenderer.invoke('tracking:set', { enabled }),
  exportData: () => ipcRenderer.invoke('data:export'),
  deleteAllData: () => ipcRenderer.invoke('data:deleteAll'),
  onTrackingChange: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('tracking:changed', listener);
    return () => ipcRenderer.removeListener('tracking:changed', listener);
  },
});
