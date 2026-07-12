'use strict';

const { globalShortcut } = require('electron');
const settings = require('./settings');

// central owner of every configured global shortcut. re-registers whenever
// overlay settings change, reports which accelerators failed to bind

let handlers = {};
let failures = [];

function setHandlers(map) {
  handlers = map || {};
}

function unregister() {
  globalShortcut.unregisterAll();
}

function register() {
  unregister();
  failures = [];

  const overlay = settings.get().overlay;
  if (!overlay.enabled) return failures;

  const hk = overlay.hotkeys || {};
  const seen = new Set();
  for (const [action, accel] of Object.entries(hk)) {
    const fn = handlers[action];
    if (!accel || !fn) continue;
    // two actions on the same key would clash, keep the first
    if (seen.has(accel)) {
      failures.push({ action, accel, reason: 'duplicate' });
      continue;
    }
    seen.add(accel);
    try {
      const ok = globalShortcut.register(accel, fn);
      if (!ok) failures.push({ action, accel, reason: 'taken' });
    } catch {
      failures.push({ action, accel, reason: 'invalid' });
    }
  }
  return failures;
}

function getFailures() {
  return failures;
}

module.exports = { setHandlers, register, unregister, getFailures };
