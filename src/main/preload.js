'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('toby', {
  detect: () => ipcRenderer.invoke('games:detect'),
  locate: (gameId) => ipcRenderer.invoke('games:locate', gameId),
  clearOverride: (gameId) => ipcRenderer.invoke('games:clearOverride', gameId),
  locateSaveDir: (gameId) => ipcRenderer.invoke('games:locateSaveDir', gameId),
  clearSaveDirOverride: (gameId) => ipcRenderer.invoke('games:clearSaveDirOverride', gameId),
  launch: (gameId) => ipcRenderer.invoke('games:launch', gameId),
  openStorePage: (gameId) => ipcRenderer.invoke('games:openStorePage', gameId),
  getRunningGames: () => ipcRenderer.invoke('games:getRunning'),
  openSaveDir: (saveDir) => ipcRenderer.invoke('games:openSaveDir', saveDir),
  showItem: (fullPath) => ipcRenderer.invoke('shell:showItem', fullPath),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  confirmDialog: (opts) => ipcRenderer.invoke('dialog:confirm', opts),
  openEditor: (gameId) => ipcRenderer.invoke('editor:open', gameId),
  closeEditor: () => ipcRenderer.invoke('editor:close'),
  copyPath: (text) => ipcRenderer.invoke('clipboard:write', text),

  undertaleGetOptions: () => ipcRenderer.invoke('undertale:getOptions'),
  undertaleOpen: (gameId) => ipcRenderer.invoke('undertale:open', gameId),
  undertalePickSaveFile: (saveDir) => ipcRenderer.invoke('undertale:pickSaveFile', saveDir),
  undertaleReadSlot: (filePath) => ipcRenderer.invoke('undertale:readSlot', filePath),
  undertaleLoadPreset: (presetId, name) => ipcRenderer.invoke('undertale:loadPreset', presetId, name),
  undertaleWriteSlot: (filePath, rawLines, fields) =>
    ipcRenderer.invoke('undertale:writeSlot', filePath, rawLines, fields),
  undertaleReadIni: (saveDir) => ipcRenderer.invoke('undertale:readIni', saveDir),
  undertaleWriteIni: (saveDir, originalText, originalFields, editedFields) =>
    ipcRenderer.invoke('undertale:writeIni', saveDir, originalText, originalFields, editedFields),

  slotsOpen: (gameId) => ipcRenderer.invoke('slots:open', gameId),
  slotsCreate: (gameId, name) => ipcRenderer.invoke('slots:create', gameId, name),
  slotsCreateEmpty: (gameId, name) => ipcRenderer.invoke('slots:createEmpty', gameId, name),
  slotsUpdate: (gameId, slotId) => ipcRenderer.invoke('slots:update', gameId, slotId),
  slotsRename: (gameId, slotId, name) => ipcRenderer.invoke('slots:rename', gameId, slotId, name),
  slotsDelete: (gameId, slotId) => ipcRenderer.invoke('slots:delete', gameId, slotId),
  slotsLoad: (gameId, slotId) => ipcRenderer.invoke('slots:load', gameId, slotId),
  slotsReorder: (gameId, orderedIds) => ipcRenderer.invoke('slots:reorder', gameId, orderedIds),

  appGetInfo: () => ipcRenderer.invoke('app:getInfo'),
  appGetBackupStats: () => ipcRenderer.invoke('app:getBackupStats'),
  appClearBackups: (gameId) => ipcRenderer.invoke('app:clearBackups', gameId),

  getSettings: () => ipcRenderer.invoke('settings:get'),
  setTheme: (themeId) => ipcRenderer.invoke('settings:setTheme', themeId),
  setCheckForUpdates: (enabled) => ipcRenderer.invoke('settings:setCheckForUpdates', enabled),
  setSoundsEnabled: (enabled) => ipcRenderer.invoke('settings:setSoundsEnabled', enabled),
  getThemes: () => ipcRenderer.invoke('themes:list'),
  checkForUpdate: () => ipcRenderer.invoke('updates:check'),
  downloadUpdate: () => ipcRenderer.invoke('updates:download'),
  quitAndInstall: () => ipcRenderer.invoke('updates:quitAndInstall'),
  onDownloadProgress: (cb) => ipcRenderer.on('update:downloadProgress', (_event, percent) => cb(percent)),

  getSansFightConfig: () => ipcRenderer.invoke('sansFight:getConfig'),
});
