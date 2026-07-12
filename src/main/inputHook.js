'use strict';

// thin wrapper over uiohook-napi for the keystroke display. loaded lazily so a
// missing native build never crashes boot, it just disables the feature

let mod = null;
let loaded = false;
let active = false;
let sink = null;
let labels = null;

function load() {
  if (loaded) return mod;
  loaded = true;
  try {
    mod = require('uiohook-napi');
  } catch {
    mod = null;
  }
  return mod;
}

// builds a keycode -> readable label map from the exported key table
function labelFor(keycode) {
  const m = load();
  if (!m) return String(keycode);
  if (!labels) {
    labels = {};
    for (const [name, code] of Object.entries(m.UiohookKey || {})) {
      if (labels[code] === undefined) labels[code] = name;
    }
  }
  return labels[keycode] || String(keycode);
}

function isAvailable() {
  return Boolean(load());
}

function start(onEvent) {
  const m = load();
  if (!m || active) return;
  sink = onEvent;
  m.uIOhook.on('keydown', (e) => {
    if (sink) sink({ type: 'down', keycode: e.keycode, label: labelFor(e.keycode) });
  });
  m.uIOhook.on('keyup', (e) => {
    if (sink) sink({ type: 'up', keycode: e.keycode, label: labelFor(e.keycode) });
  });
  try {
    m.uIOhook.start();
    active = true;
  } catch {
    active = false;
  }
}

function stop() {
  const m = load();
  if (!m || !active) return;
  try {
    m.uIOhook.stop();
    m.uIOhook.removeAllListeners();
  } catch {
    // ignore
  }
  sink = null;
  active = false;
}

module.exports = { start, stop, isAvailable };
