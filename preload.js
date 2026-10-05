const { contextBridge, ipcRenderer } = require('electron');

// Expose safe, scoped API to the renderer process
contextBridge.exposeInMainWorld('mindpc', {
  login: (email, password) => ipcRenderer.invoke('mindpc:login', { email, password }),
  register: (name, email, password) => ipcRenderer.invoke('mindpc:register', { name, email, password }),
  logout: () => ipcRenderer.invoke('mindpc:logout'),
  getStatus: () => ipcRenderer.invoke('mindpc:getStatus'),
  onAppChange: (callback) => {
    ipcRenderer.on('mindpc:appChange', (_event, data) => callback(data));
  },
  onSyncUpdate: (callback) => {
    ipcRenderer.on('mindpc:syncUpdate', (_event, data) => callback(data));
  },
});
