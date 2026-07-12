'use strict';

// overlay host. mounts the widgets, positions them from settings, and in focus
// mode lets the user drag widgets, toggle them and open the mini panel

const bridge = window.overlay;
const rootEl = document.getElementById('ov-root');
const recBadge = document.getElementById('ov-rec-badge');
const panel = document.getElementById('ov-panel');
const focusHint = document.getElementById('ov-focus-hint');
const recordBtn = document.getElementById('ov-record');
const toastEl = document.getElementById('ov-toast');
const splitsSelectEl = document.getElementById('ov-splits-select');
let toastTimer = null;
let soundGold = '';

let cfg = null;
let focusMode = false;
const mounts = {}; // id -> { host, mount, widget }
let liveSplit = null;
let keystrokes = null;

const WIDGET_FACTORIES = {
  livesplit: window.LiveSplitWidget,
  keystrokes: window.KeystrokesWidget,
};

function makeHost(id) {
  const host = document.createElement('div');
  host.className = 'ov-widget';
  host.dataset.id = id;
  const handle = document.createElement('div');
  handle.className = 'ov-handle';
  handle.textContent = id;
  const mount = document.createElement('div');
  mount.className = 'ov-mount';
  host.append(handle, mount);
  rootEl.appendChild(host);
  enableDrag(id, host, handle);
  return { host, mount };
}

function mountWidget(id) {
  if (mounts[id]) return;
  const factory = WIDGET_FACTORIES[id];
  if (!factory) return;
  const { host, mount } = makeHost(id);
  let widget;
  if (id === 'livesplit') {
    widget = factory(mount, { onPersist: (state) => bridge.splitsSaveState(state), onGold: playGold });
  } else {
    const keymap = cfg ? cfg.widgets.keystrokes.keymap : undefined;
    widget = factory(mount, keymap);
  }
  mounts[id] = { host, mount, widget };
  if (id === 'livesplit') {
    liveSplit = widget;
    reloadSplits();
  }
  if (id === 'keystrokes') keystrokes = widget;
}

function unmountWidget(id) {
  const m = mounts[id];
  if (!m) return;
  m.widget.destroy();
  m.host.remove();
  delete mounts[id];
  if (id === 'livesplit') liveSplit = null;
  if (id === 'keystrokes') keystrokes = null;
}

function applyWidget(id) {
  const w = cfg.widgets[id];
  // a widget shows here only when enabled and not popped out to its own window
  const shouldMount = w && w.enabled && !w.poppedOut;
  if (shouldMount) mountWidget(id);
  else unmountWidget(id);
  const m = mounts[id];
  if (m) {
    m.host.style.left = `${w.x || 24}px`;
    m.host.style.top = `${w.y || 24}px`;
    m.host.style.transform = `scale(${w.scale || 1})`;
  }
}

function applyConfig(next) {
  cfg = next;
  for (const id of Object.keys(WIDGET_FACTORIES)) applyWidget(id);
  if (keystrokes) {
    keystrokes.setKeymap(cfg.widgets.keystrokes.keymap);
    keystrokes.setBps(cfg.widgets.keystrokes.showBps);
  }
  syncPanel();
}

// dragging is only live in focus mode, persists on release
function enableDrag(id, host, handle) {
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let baseX = 0;
  let baseY = 0;
  handle.addEventListener('pointerdown', (e) => {
    if (!focusMode) return;
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    baseX = parseInt(host.style.left, 10) || 0;
    baseY = parseInt(host.style.top, 10) || 0;
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    host.style.left = `${baseX + (e.clientX - startX)}px`;
    host.style.top = `${baseY + (e.clientY - startY)}px`;
  });
  handle.addEventListener('pointerup', (e) => {
    if (!dragging) return;
    dragging = false;
    handle.releasePointerCapture(e.pointerId);
    const x = parseInt(host.style.left, 10) || 0;
    const y = parseInt(host.style.top, 10) || 0;
    bridge.updateWidget(id, { x, y });
  });
}

// mini settings panel shown in focus mode
function syncPanel() {
  if (!cfg) return;
  panel.querySelectorAll('[data-toggle]').forEach((cb) => {
    const [id, key] = cb.dataset.toggle.split('.');
    cb.checked = Boolean(cfg.widgets[id][key]);
  });
}

panel.querySelectorAll('[data-toggle]').forEach((cb) => {
  cb.addEventListener('change', () => {
    const [id, key] = cb.dataset.toggle.split('.');
    bridge.updateWidget(id, { [key]: cb.checked });
  });
});

document.getElementById('ov-record').onclick = () => bridge.toggleRecord();
document.getElementById('ov-replay').onclick = () => bridge.saveReplay();
document.getElementById('ov-exit').onclick = () => bridge.exitFocus();

function setFocusMode(on) {
  focusMode = on;
  document.body.classList.toggle('ov-focus', on);
  panel.classList.toggle('hidden', !on);
  focusHint.classList.toggle('hidden', !on);
}

window.addEventListener('keydown', (e) => {
  if (focusMode && e.key === 'Escape') bridge.exitFocus();
});

// plays the configured best-segment sound
function playGold() {
  if (!soundGold) return;
  try {
    const a = new Audio(soundGold);
    a.play().catch(() => {});
  } catch {
    // ignore playback errors
  }
}

// fills the splits dropdown from the current game's list
function populateSplits(info) {
  splitsSelectEl.replaceChildren();
  const list = (info && info.items) || [];
  if (!list.length) {
    const opt = document.createElement('option');
    opt.textContent = 'no splits loaded';
    opt.value = '';
    splitsSelectEl.append(opt);
    splitsSelectEl.disabled = true;
    return;
  }
  splitsSelectEl.disabled = false;
  for (const it of list) {
    const opt = document.createElement('option');
    opt.value = it.id;
    opt.textContent = it.category ? `${it.title} - ${it.category}` : it.title;
    splitsSelectEl.append(opt);
  }
  if (info.selectedId) splitsSelectEl.value = info.selectedId;
}

// loads the current game's selected splits into the widget
async function reloadSplits() {
  const info = await bridge.splitsGetSelected();
  populateSplits(info);
  if (liveSplit) liveSplit.setState(info.state);
}

splitsSelectEl.onchange = () => {
  if (splitsSelectEl.value) bridge.splitsSelect(splitsSelectEl.value);
};

document.getElementById('ov-splits-load').onclick = async () => {
  const r = await bridge.splitsLoadFile();
  if (!r || !r.ok) return;
  let state;
  try {
    state = window.LSS.parse(r.text);
  } catch (err) {
    showToast('Could not read that .lss: ' + err.message, true);
    return;
  }
  await bridge.splitsAdd(state);
  showToast('Splits loaded', false);
};

document.getElementById('ov-splits-export').onclick = async () => {
  if (!liveSplit) return;
  const state = liveSplit.getState();
  if (!state.segments.length) {
    showToast('No splits to export', true);
    return;
  }
  await bridge.splitsExport(state.title || 'splits', window.LSS.serialize(state));
};

// bridge wiring
bridge.onSettings(applyConfig);
bridge.onFocusMode(setFocusMode);
bridge.onLivesplitCmd((cmd) => {
  if (liveSplit) liveSplit.command(cmd);
});
bridge.onInput((evt) => {
  if (keystrokes) keystrokes.input(evt);
});
bridge.onActiveSplits((state) => {
  if (liveSplit) liveSplit.setState(state);
});
bridge.onSplitsList((info) => populateSplits(info));
bridge.onGame(() => reloadSplits());
bridge.onSounds((s) => {
  soundGold = (s && s.gold) || '';
});
let wasRecording = false;
bridge.onRecState((st) => {
  recBadge.classList.toggle('hidden', !st.recording);
  if (recordBtn) recordBtn.textContent = st.recording ? 'Stop recording' : 'Record';
  // confirm the toggle registered, since it is easy to miss over a hotkey
  if (st.recording && !wasRecording) showToast('Recording started — press again to stop & save', false);
  wasRecording = st.recording;
});

function showToast(msg, isError) {
  toastEl.textContent = msg;
  toastEl.classList.toggle('ov-toast-err', Boolean(isError));
  toastEl.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add('hidden'), 3200);
}

bridge.onRecSaved((info) => {
  if (info.ok) {
    const kind = info.kind === 'replay' ? 'Replay' : 'Recording';
    showToast(`${kind} saved`, false);
  } else {
    showToast(info.error || 'Recording failed', true);
  }
});

// initial pull in case the settings push already fired
bridge.getSettings().then((s) => applyConfig(s.overlay));
