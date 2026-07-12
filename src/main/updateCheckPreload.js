'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('updateStatus', {
  onStatus: (cb) => ipcRenderer.on('update:status', (_event, status) => cb(status)),
  skip: () => ipcRenderer.invoke('updates:skipStartup'),
});
