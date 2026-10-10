const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  platform: process.platform,
  search: (q) => ipcRenderer.invoke('search', q),
  icon: (p) => ipcRenderer.invoke('icon', p),
  open: (r, mode) => ipcRenderer.invoke('open', r, mode),
  state: () => ipcRenderer.invoke('state'),
  strings: () => ipcRenderer.invoke('strings'),
  resize: (h) => ipcRenderer.send('resize', h),
  hide: () => ipcRenderer.send('hide'),
  onShown: (cb) => ipcRenderer.on('shown', () => cb()),
  onScan: (cb) => ipcRenderer.on('scan', (_, d) => cb(d)),
  onLang: (cb) => ipcRenderer.on('lang', () => cb()),
});
