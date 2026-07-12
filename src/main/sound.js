'use strict';

// plays a user-picked sound file (the best-segment chime) from the main process.
// on the native overlay path the injected dll can't play audio, so main does it
// through a tiny hidden window. reads the file into a data url so it works
// regardless of the player page's origin.

const fs = require('fs');
const path = require('path');
const { BrowserWindow } = require('electron');

let win = null;
let cachedPath = '';
let cachedUrl = '';

function ensure() {
  if (win && !win.isDestroyed()) return win;
  win = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  win.loadURL('data:text/html,<!doctype html><meta charset="utf-8"><title>ds-sound</title>');
  return win;
}

function mimeFor(file) {
  const ext = path.extname(file).toLowerCase();
  return { '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.flac': 'audio/flac' }[ext] || 'audio/*';
}

function dataUrl(file) {
  if (file === cachedPath && cachedUrl) return cachedUrl;
  const buf = fs.readFileSync(file);
  cachedUrl = `data:${mimeFor(file)};base64,${buf.toString('base64')}`;
  cachedPath = file;
  return cachedUrl;
}

function play(filePath) {
  if (!filePath) return;
  let url;
  try {
    url = dataUrl(filePath);
  } catch {
    return; // file gone or unreadable, just skip the chime
  }
  const w = ensure();
  const js = `(function(){try{var a=new Audio(${JSON.stringify(url)});a.volume=1;a.play();}catch(e){}})()`;
  const run = () => w.webContents.executeJavaScript(js).catch(() => {});
  if (w.webContents.isLoading()) w.webContents.once('did-finish-load', run);
  else run();
}

function destroy() {
  if (win && !win.isDestroyed()) win.destroy();
  win = null;
}

module.exports = { play, destroy };
