'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// which widget a popout window should mount, read from the launch arg
function widgetArg() {
  const found = process.argv.find((a) => a.startsWith('--widget='));
  return found ? found.split('=')[1] : null;
}

contextBridge.exposeInMainWorld('overlay', {
  widgetId: widgetArg(),

  getSettings: () => ipcRenderer.invoke('settings:get'),
  getInfo: () => ipcRenderer.invoke('overlay:getInfo'),
  setOverlay: (patch) => ipcRenderer.invoke('settings:setOverlay', patch),
  updateWidget: (id, patch) => ipcRenderer.invoke('overlay:updateWidget', id, patch),
  exitFocus: () => ipcRenderer.invoke('overlay:exitFocus'),

  toggleRecord: () => ipcRenderer.invoke('recorder:toggle'),
  saveReplay: () => ipcRenderer.invoke('recorder:saveReplay'),

  splitsGetSelected: () => ipcRenderer.invoke('livesplit:getSelected'),
  splitsSaveState: (state) => ipcRenderer.invoke('livesplit:saveState', state),
  splitsAdd: (state) => ipcRenderer.invoke('livesplit:add', state),
  splitsSelect: (splitId) => ipcRenderer.invoke('livesplit:select', splitId),
  splitsRemove: (splitId) => ipcRenderer.invoke('livesplit:remove', splitId),
  splitsLoadFile: () => ipcRenderer.invoke('livesplit:loadFile'),
  splitsExport: (name, text) => ipcRenderer.invoke('livesplit:saveFile', name, text),

  onSettings: (cb) => ipcRenderer.on('overlay:settings', (_e, cfg) => cb(cfg)),
  onFocusMode: (cb) => ipcRenderer.on('overlay:focusMode', (_e, on) => cb(on)),
  onLivesplitCmd: (cb) => ipcRenderer.on('livesplit:cmd', (_e, cmd) => cb(cmd)),
  onActiveSplits: (cb) => ipcRenderer.on('livesplit:active', (_e, state) => cb(state)),
  onSplitsList: (cb) => ipcRenderer.on('overlay:splitsList', (_e, info) => cb(info)),
  onGame: (cb) => ipcRenderer.on('overlay:game', (_e, gameId) => cb(gameId)),
  onSounds: (cb) => ipcRenderer.on('overlay:sounds', (_e, s) => cb(s)),
  onInput: (cb) => ipcRenderer.on('overlay:input', (_e, evt) => cb(evt)),
  onRecState: (cb) => ipcRenderer.on('overlay:recState', (_e, st) => cb(st)),
  onRecSaved: (cb) => ipcRenderer.on('overlay:recSaved', (_e, info) => cb(info)),
});
