'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// bridge for the hidden capture window. sends finished webm bytes back to main
contextBridge.exposeInMainWorld('rec', {
  onArm: (cb) => ipcRenderer.on('recorder:arm', (_e, opts) => cb(opts)),
  onDisarm: (cb) => ipcRenderer.on('recorder:disarm', () => cb()),
  onStartClip: (cb) => ipcRenderer.on('recorder:startClip', () => cb()),
  onStopClip: (cb) => ipcRenderer.on('recorder:stopClip', () => cb()),
  onSaveReplay: (cb) => ipcRenderer.on('recorder:saveReplay', () => cb()),
  saveBlob: (bytes, kind, ext) => ipcRenderer.invoke('recorder:blob', bytes, kind, ext),
  reportFail: (msg) => ipcRenderer.invoke('recorder:failed', msg),
});
