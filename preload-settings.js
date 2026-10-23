const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  platform: process.platform,
  get: () => ipcRenderer.invoke('cfg:get'),
  set: (p) => ipcRenderer.invoke('cfg:set', p),
  probe: () => ipcRenderer.invoke('cfg:probe'),
  onLang: (cb) => ipcRenderer.on('lang', () => cb()),
});
