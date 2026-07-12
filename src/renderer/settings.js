'use strict';

// settings screen: shares libraryEl, scan, and el from renderer.js

const settingsScreen = document.getElementById('settings-screen');
const settingsThemeSelect = document.getElementById('settings-theme-select');
const settingsVersion = document.getElementById('settings-version');
const settingsUserdata = document.getElementById('settings-userdata');
const settingsOpenUserdataBtn = document.getElementById('settings-open-userdata');
const settingsCopyUserdataBtn = document.getElementById('settings-copy-userdata');
const settingsBackupsList = document.getElementById('settings-backups-list');
const creditsAuthorLink = document.getElementById('credits-author-link');
const creditsTennaLink = document.getElementById('credits-tenna-link');
const creditsUtyEditorLink = document.getElementById('credits-uty-editor-link');

let settingsUserDataPath = null;

function fmtBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function backupRow(entry) {
  const li = el('li', 'slot-item');

  const info = el('div', 'slot-info');
  info.append(el('div', 'slot-name', entry.gameName));
  info.append(el('div', 'slot-meta', `${entry.count} backup${entry.count === 1 ? '' : 's'} · ${fmtBytes(entry.bytes)}`));

  const actions = el('div', 'slot-actions');
  const clearBtn = el('button', 'ghost', 'Clear backups');
  clearBtn.onclick = async () => {
    const { confirmed } = await window.toby.confirmDialog({
      message: `Delete all backups for ${entry.gameName}?`,
      detail: `This removes the automatic safety snapshots only — your live save and slots are untouched.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    await window.toby.appClearBackups(entry.gameId);
    loadBackupStats();
  };
  actions.append(clearBtn);

  li.append(info, actions);
  return li;
}

async function loadBackupStats() {
  const stats = await window.toby.appGetBackupStats();
  settingsBackupsList.replaceChildren();
  if (stats.length === 0) {
    settingsBackupsList.append(el('li', 'ut-hint', 'No backups yet.'));
    return;
  }
  for (const entry of stats) {
    settingsBackupsList.append(backupRow(entry));
  }
}

async function loadThemeOptions() {
  const [themeList, { theme }] = await Promise.all([window.toby.getThemes(), window.toby.getSettings()]);
  settingsThemeSelect.replaceChildren();
  for (const t of themeList) {
    const opt = el('option', null, t.name);
    opt.value = t.id;
    settingsThemeSelect.append(opt);
  }
  settingsThemeSelect.value = theme;
}

settingsThemeSelect.onchange = async () => {
  const { theme } = await window.toby.setTheme(settingsThemeSelect.value);
  const themeList = await window.toby.getThemes();
  const active = themeList.find((t) => t.id === theme);
  if (active) applyThemeColors(active.colors);
};

async function openSettings() {
  const info = await window.toby.appGetInfo();
  settingsUserDataPath = info.userDataPath;
  settingsVersion.textContent = info.version;
  settingsUserdata.textContent = info.userDataPath;
  settingsUserdata.title = info.userDataPath;

  await Promise.all([loadBackupStats(), loadThemeOptions(), loadOverlaySettings()]);

  hideAllScreens();
  settingsScreen.classList.remove('hidden');
  setActiveNav('settings');
}

settingsOpenUserdataBtn.onclick = () => window.toby.openSaveDir(settingsUserDataPath);
settingsCopyUserdataBtn.onclick = () => window.toby.copyPath(settingsUserDataPath);
creditsAuthorLink.onclick = () => window.toby.openExternal('https://acciaw.me');
creditsTennaLink.onclick = () => window.toby.openExternal('https://tennaproject.com/');
creditsUtyEditorLink.onclick = () => window.toby.openExternal('https://save.yellow.undertale.wiki/');

document.querySelectorAll('.nav-item').forEach((btn) => {
  if (btn.dataset.page === 'settings') {
    btn.onclick = openSettings;
  }
});

// overlay + speedrunner settings

const ovEnabledEl = document.getElementById('ov-enabled');
const ovChildren = document.getElementById('ov-children');
const ovKeystrokesNote = document.getElementById('ov-keystrokes-note');
const ovGoldSoundEl = document.getElementById('ov-gold-sound');
const ovRecFolderEl = document.getElementById('ov-rec-folder');
const ovRecReplayEl = document.getElementById('ov-rec-replay');
const ovRecAudioEl = document.getElementById('ov-rec-audio');
const ovHotkeyWarn = document.getElementById('ov-hotkey-warn');

let ovSettings = null;
let capturing = null;

// KeyboardEvent -> electron accelerator string, null for a lone modifier
function keyFromCode(code) {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return 'num' + code.slice(6);
  if (/^F\d{1,2}$/.test(code)) return code;
  const named = {
    NumpadAdd: 'numadd', NumpadSubtract: 'numsub', NumpadMultiply: 'nummult',
    NumpadDivide: 'numdiv', NumpadDecimal: 'numdec', NumpadEnter: 'Enter',
    Space: 'Space', Tab: 'Tab', Backspace: 'Backspace', Enter: 'Enter',
    Escape: 'Escape', Delete: 'Delete', Insert: 'Insert', Home: 'Home', End: 'End',
    PageUp: 'PageUp', PageDown: 'PageDown', ArrowUp: 'Up', ArrowDown: 'Down',
    ArrowLeft: 'Left', ArrowRight: 'Right', Minus: '-', Equal: '=',
    BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'",
    Backquote: '`', Backslash: '\\', Comma: ',', Period: '.', Slash: '/',
  };
  return named[code] || null;
}

function accelFromEvent(e) {
  const key = keyFromCode(e.code);
  if (!key) return null;
  const mods = [];
  if (e.ctrlKey) mods.push('Ctrl');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  if (e.metaKey) mods.push('Super');
  return [...mods, key].join('+');
}

function renderHotkeys() {
  document.querySelectorAll('.hotkey-btn').forEach((btn) => {
    const accel = ovSettings.hotkeys[btn.dataset.hotkey];
    btn.textContent = accel || 'unbound';
    btn.classList.toggle('unbound', !accel);
    btn.classList.toggle('capturing', btn === capturing);
  });
}

async function setHotkey(action, accel) {
  ovSettings = (await window.toby.setOverlay({ hotkeys: { [action]: accel } })).overlay;
  capturing = null;
  renderHotkeys();
  refreshHotkeyWarn();
}

async function refreshHotkeyWarn() {
  const fails = await window.toby.overlayGetHotkeyFailures();
  ovHotkeyWarn.textContent = fails && fails.length
    ? `Could not bind: ${fails.map((f) => f.accel).join(', ')} (in use or invalid).`
    : '';
}

// single global listener, only acts while a key box is armed
window.addEventListener(
  'keydown',
  (e) => {
    if (!capturing) return;
    e.preventDefault();
    e.stopPropagation();
    const action = capturing.dataset.hotkey;
    if (e.key === 'Escape') {
      setHotkey(action, '');
      return;
    }
    const accel = accelFromEvent(e);
    if (accel) setHotkey(action, accel);
  },
  true
);

function applyOverlayEnabled() {
  const on = ovEnabledEl.checked;
  ovChildren.classList.toggle('disabled', !on);
  ovChildren.querySelectorAll('input, button').forEach((elm) => {
    elm.disabled = !on;
  });
}

function soundLabel(p) {
  if (!p) return 'none';
  return p.split(/[\\/]/).pop();
}

async function loadOverlaySettings() {
  const [s, info] = await Promise.all([
    window.toby.getSettings(),
    window.toby.overlayGetInfo(),
  ]);
  ovSettings = s.overlay;

  ovEnabledEl.checked = ovSettings.enabled;
  document.querySelectorAll('#ov-children [data-widget]').forEach((cb) => {
    const [id, key] = cb.dataset.widget.split('.');
    cb.checked = Boolean(ovSettings.widgets[id][key]);
  });
  renderHotkeys();

  ovRecFolderEl.textContent = info.recordingFolder;
  ovRecFolderEl.title = info.recordingFolder;
  ovRecReplayEl.value = ovSettings.recording.replaySeconds;
  ovRecAudioEl.checked = ovSettings.recording.captureAudio;
  ovKeystrokesNote.textContent = info.keystrokesAvailable
    ? ''
    : 'Keystroke capture needs the uiohook-napi module, which is unavailable in this build.';
  const goldPath = (ovSettings.sounds || {}).gold || '';
  ovGoldSoundEl.textContent = soundLabel(goldPath);
  ovGoldSoundEl.title = goldPath;

  applyOverlayEnabled();
  refreshHotkeyWarn();
}

ovEnabledEl.onchange = async () => {
  ovSettings = (await window.toby.setOverlay({ enabled: ovEnabledEl.checked })).overlay;
  applyOverlayEnabled();
  refreshHotkeyWarn();
};

document.querySelectorAll('#ov-children [data-widget]').forEach((cb) => {
  cb.onchange = async () => {
    const [id, key] = cb.dataset.widget.split('.');
    ovSettings = (await window.toby.setOverlay({ widgets: { [id]: { [key]: cb.checked } } })).overlay;
  };
});

document.querySelectorAll('.hotkey-btn').forEach((btn) => {
  btn.onclick = () => {
    capturing = capturing === btn ? null : btn;
    renderHotkeys();
  };
});

document.getElementById('ov-keystrokes-config').onclick = () => window.toby.keystrokesOpenConfig();

document.getElementById('ov-rec-folder-btn').onclick = async () => {
  const r = await window.toby.overlayPickRecordingFolder();
  if (r.ok) {
    ovRecFolderEl.textContent = r.folder;
    ovRecFolderEl.title = r.folder;
  }
};

ovRecReplayEl.onchange = async () => {
  let v = parseInt(ovRecReplayEl.value, 10) || 30;
  v = Math.max(5, Math.min(300, v));
  ovRecReplayEl.value = v;
  ovSettings = (await window.toby.setOverlay({ recording: { replaySeconds: v } })).overlay;
};

ovRecAudioEl.onchange = async () => {
  ovSettings = (await window.toby.setOverlay({ recording: { captureAudio: ovRecAudioEl.checked } })).overlay;
};

document.getElementById('ov-gold-sound-btn').onclick = async () => {
  const r = await window.toby.overlayPickSound('gold');
  if (r.ok) {
    ovGoldSoundEl.textContent = soundLabel(r.path);
    ovGoldSoundEl.title = r.path;
  }
};

document.getElementById('ov-gold-sound-clear').onclick = async () => {
  await window.toby.overlayClearSound('gold');
  ovGoldSoundEl.textContent = 'none';
  ovGoldSoundEl.title = '';
};

document.getElementById('ov-gold-sound-test').onclick = async () => {
  const url = await window.toby.overlayGetSoundUrl('gold');
  if (!url) return;
  try {
    new Audio(url).play().catch(() => {});
  } catch {
    // ignore
  }
};
