'use strict';

const fs = require('fs');
const path = require('path');
const { BrowserWindow, screen } = require('electron');
const settings = require('./settings');

const AUDIO_MIME = {
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
};

// reads a configured sound file into a data url the overlay renderer can play
function soundDataUrl(file) {
  if (!file) return '';
  try {
    const mime = AUDIO_MIME[path.extname(file).toLowerCase()] || 'audio/mpeg';
    return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
  } catch {
    return '';
  }
}

// the transparent click-through window that layers over a running game,
// plus any widgets the user popped out into their own windows

let overlayWin = null;
let focusMode = false;
let running = false;
let suppressed = false; // hidden because the game is minimized / not foreground
let topTimer = null; // periodically re-asserts z-order over fullscreen games
const popouts = new Map(); // widgetId -> BrowserWindow

const WIDGETS = ['livesplit', 'keystrokes'];

function overlayCfg() {
  return settings.get().overlay;
}

function shouldShow() {
  return overlayCfg().enabled && running;
}

function overlayHtml() {
  return path.join(__dirname, '..', 'renderer', 'overlay', 'overlay.html');
}

function widgetWindowHtml() {
  return path.join(__dirname, '..', 'renderer', 'overlay', 'widget-window.html');
}

function preload() {
  return path.join(__dirname, 'overlayPreload.js');
}

function createOverlayWindow() {
  // full monitor bounds (not workArea) so we also cover where a fullscreen
  // borderless game draws, including over the taskbar strip
  const { x, y, width, height } = screen.getPrimaryDisplay().bounds;
  const win = new BrowserWindow({
    x,
    y,
    width,
    height,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    focusable: false,
    alwaysOnTop: true,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: preload(),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  win.removeMenu();
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(overlayHtml());

  win.webContents.once('did-finish-load', () => {
    pushSettings();
    applyMode();
  });
  win.on('closed', () => {
    overlayWin = null;
  });

  // a borderless-fullscreen game (e.g. undertale's F4) can activate itself above
  // our always-on-top window, so re-assert the top z-order while we're passive
  clearInterval(topTimer);
  topTimer = setInterval(() => {
    if (!overlayWin || overlayWin.isDestroyed()) return;
    if (!overlayWin.isVisible() || focusMode) return;
    overlayWin.setAlwaysOnTop(true, 'screen-saver');
    overlayWin.moveTop();
  }, 1000);

  return win;
}

// passive mode is click-through and unfocusable, focus mode lets the user
// drag widgets and open the mini settings panel
function applyMode() {
  if (!overlayWin || overlayWin.isDestroyed()) return;
  if (focusMode) {
    overlayWin.setIgnoreMouseEvents(false);
    overlayWin.setFocusable(true);
    overlayWin.focus();
  } else {
    overlayWin.setIgnoreMouseEvents(true, { forward: true });
    overlayWin.setFocusable(false);
  }
  overlayWin.webContents.send('overlay:focusMode', focusMode);
}

function createPopout(widgetId) {
  const w = overlayCfg().widgets[widgetId] || {};
  const win = new BrowserWindow({
    width: 320,
    height: 200,
    x: (w.x || 40) + 40,
    y: (w.y || 40) + 40,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: false,
    alwaysOnTop: true,
    hasShadow: false,
    useContentSize: true,
    title: `Dog Shrine - ${widgetId}`,
    webPreferences: {
      preload: preload(),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      additionalArguments: [`--widget=${widgetId}`],
    },
  });
  win.removeMenu();
  win.setAlwaysOnTop(true, 'screen-saver');
  win.loadFile(widgetWindowHtml());
  win.webContents.once('did-finish-load', () => {
    win.webContents.send('overlay:settings', overlayCfg());
  });
  win.on('closed', () => popouts.delete(widgetId));
  return win;
}

function syncPopouts() {
  const cfg = overlayCfg();
  for (const id of WIDGETS) {
    const w = cfg.widgets[id];
    const wantPopout = cfg.enabled && running && w && w.enabled && w.poppedOut;
    let win = popouts.get(id);
    if (wantPopout && !win) {
      win = createPopout(id);
      popouts.set(id, win);
    } else if (!wantPopout && win) {
      if (!win.isDestroyed()) win.destroy();
      popouts.delete(id);
      win = null;
    }
    if (win && !win.isDestroyed()) {
      if (suppressed) win.hide();
      else win.showInactive();
    }
  }
}

function sync() {
  const active = shouldShow();
  if (active && !overlayWin) {
    overlayWin = createOverlayWindow();
  } else if (!active && overlayWin) {
    focusMode = false;
    clearInterval(topTimer);
    topTimer = null;
    overlayWin.destroy();
    overlayWin = null;
  }
  if (overlayWin && !overlayWin.isDestroyed()) {
    // suppression hides the window without tearing it down, so the run survives
    if (active && !suppressed) overlayWin.showInactive();
    else overlayWin.hide();
  }
  syncPopouts();
}

// sends current overlay settings to every overlay surface
function pushSettings() {
  const cfg = overlayCfg();
  broadcast('overlay:settings', cfg);
  // decode any configured sounds to data urls the renderer can play
  const sounds = cfg.sounds || {};
  broadcast('overlay:sounds', { gold: soundDataUrl(sounds.gold) });
}

// fans a message out to the overlay window and any popouts
function broadcast(channel, payload) {
  if (overlayWin && !overlayWin.isDestroyed()) overlayWin.webContents.send(channel, payload);
  for (const w of popouts.values()) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload);
  }
}

// public api

function setRunning(isRunning) {
  if (running === isRunning) return;
  running = isRunning;
  if (!isRunning) suppressed = false;
  sync();
}

// hides/shows the overlay without destroying it (game minimized / not foreground)
function setSuppressed(v) {
  if (suppressed === v) return;
  suppressed = v;
  sync();
}

// the screen-saver-level always-on-top overlay covers native file dialogs, so
// drop it while one is open and exit focus mode so the dialog is usable
function setDialogMode(on) {
  if (on) exitFocusMode();
  for (const w of [overlayWin, ...popouts.values()]) {
    if (w && !w.isDestroyed()) {
      if (on) w.setAlwaysOnTop(false);
      else w.setAlwaysOnTop(true, 'screen-saver');
    }
  }
}

// called after any settings change so visibility, popouts and widget config refresh
function refresh() {
  sync();
  pushSettings();
}

function toggleFocusMode() {
  if (!overlayWin) return;
  focusMode = !focusMode;
  applyMode();
}

function exitFocusMode() {
  if (!focusMode) return;
  focusMode = false;
  applyMode();
}

function isFocusMode() {
  return focusMode;
}

function hasOverlay() {
  return Boolean(overlayWin) || popouts.size > 0;
}

module.exports = {
  setRunning,
  setSuppressed,
  setDialogMode,
  refresh,
  toggleFocusMode,
  exitFocusMode,
  isFocusMode,
  broadcast,
  pushSettings,
  hasOverlay,
  soundDataUrl,
};
