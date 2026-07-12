'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const themes = require('./themes');

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'themes.json');
}

// overlay + speedrunner defaults, kept in one namespace
const OVERLAY_DEFAULTS = {
  enabled: true,
  widgets: {
    livesplit: { enabled: true, poppedOut: false, x: 24, y: 24, scale: 1 },
    keystrokes: {
      enabled: true,
      poppedOut: false,
      x: 24,
      y: 460,
      scale: 1,
      // text-boxes-per-second counter, driven by the confirm (z) key
      showBps: false,
      // which physical key lights each slot, using uiohook labels
      keymap: {
        up: 'ArrowUp',
        left: 'ArrowLeft',
        down: 'ArrowDown',
        right: 'ArrowRight',
        z: 'Z',
        x: 'X',
        shift: 'Shift',
        enter: 'Enter',
      },
    },
  },
  hotkeys: {
    // livesplit controls, default to numpad like real livesplit
    split: 'num1',
    reset: 'num3',
    undo: 'num8',
    skip: 'num2',
    pause: 'num5',
    // overlay + capture
    toggleFocus: 'F8',
    recordToggle: 'F9',
    saveReplay: 'F10',
  },
  recording: { folder: '', replaySeconds: 30, captureAudio: false },
  // custom sound file paths, played by the overlay
  sounds: { gold: '' },
};

// defaults for every global app setting
const DEFAULTS = {
  theme: 'title-screen',
  checkForUpdates: true,
  soundsEnabled: true,
  overlay: OVERLAY_DEFAULTS,
};

// merges plain objects deeply so stored settings keep new default sub-keys
function mergeDeep(base, override) {
  if (!isPlainObject(base) || !isPlainObject(override)) return override;
  const out = { ...base };
  for (const key of Object.keys(override)) {
    out[key] = mergeDeep(base[key], override[key]);
  }
  return out;
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function read() {
  let stored = {};
  try {
    stored = JSON.parse(fs.readFileSync(getSettingsPath(), 'utf8'));
  } catch {
    stored = {};
  }
  // deep-merge overlay so nested defaults survive, shallow for the rest
  return {
    ...DEFAULTS,
    ...stored,
    overlay: mergeDeep(OVERLAY_DEFAULTS, stored.overlay || {}),
  };
}

function write(settings) {
  const settingsPath = getSettingsPath();
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
}

/* creates themes.json with defaults if it doesn't exist yet */
function ensureFile() {
  if (!fs.existsSync(getSettingsPath())) write(read());
}

function get() {
  return read();
}

function set(partial) {
  const settings = { ...read(), ...partial };
  write(settings);
  return settings;
}

function setTheme(themeId) {
  return set({ theme: themes.find(themeId).id });
}

function setCheckForUpdates(enabled) {
  return set({ checkForUpdates: Boolean(enabled) });
}

function setSoundsEnabled(enabled) {
  return set({ soundsEnabled: Boolean(enabled) });
}

// deep-merges a partial overlay patch onto the current overlay
function setOverlay(partial) {
  const current = read();
  const settings = { ...current, overlay: mergeDeep(current.overlay, partial || {}) };
  write(settings);
  return settings;
}

module.exports = {
  get,
  set,
  setTheme,
  setCheckForUpdates,
  setSoundsEnabled,
  setOverlay,
  ensureFile,
  OVERLAY_DEFAULTS,
};
