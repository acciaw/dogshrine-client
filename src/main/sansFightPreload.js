'use strict';

// preload for the sans-fight <webview>. contextIsolation + nodeIntegration:false on the
// guest page itself, same as the save-editor webview — the fight's own page code never
// gets electron access. preload scripts get it regardless, which is what lets this
// bridge the boundary the guest page's CustomEvent can't cross on its own.
const { ipcRenderer } = require('electron');

window.addEventListener('sans-fight:result', (event) => {
  ipcRenderer.sendToHost('sans-fight:result', event.detail.result);
});
