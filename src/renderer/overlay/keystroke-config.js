'use strict';

// keystroke remap popup. shows a live preview fed by the real input hook, and
// lets each slot be rebound by pressing a key while armed

const bridge = window.overlay;
const preview = window.KeystrokesWidget(document.getElementById('kc-preview-mount'));
const rowsEl = document.getElementById('kc-rows');
const warnEl = document.getElementById('kc-warn');

const SLOT_LABELS = {
  up: 'Up', left: 'Left', down: 'Down', right: 'Right',
  z: 'Z (confirm)', x: 'X (cancel)', shift: 'Shift (run)', enter: 'Enter (menu)',
};

let keymap = { ...window.KS_DEFAULT_KEYMAP };
let arming = null;

function renderRows() {
  rowsEl.replaceChildren();
  for (const slot of window.KS_SLOTS) {
    const row = document.createElement('div');
    row.className = 'kc-row';

    const label = document.createElement('span');
    label.className = 'kc-row-label';
    label.textContent = SLOT_LABELS[slot] || slot;

    const key = document.createElement('span');
    key.className = 'kc-row-key';
    key.textContent = arming === slot ? 'press a key...' : `${window.ksDisplay(keymap[slot])}  (${keymap[slot]})`;

    const btn = document.createElement('button');
    btn.className = 'kc-btn' + (arming === slot ? ' arming' : '');
    btn.textContent = arming === slot ? 'cancel' : 'Rebind';
    btn.onclick = () => {
      arming = arming === slot ? null : slot;
      renderRows();
    };

    row.append(label, key, btn);
    rowsEl.appendChild(row);
  }
}

async function save(slot, label) {
  const s = await bridge.setOverlay({ widgets: { keystrokes: { keymap: { [slot]: label } } } });
  keymap = { ...window.KS_DEFAULT_KEYMAP, ...s.overlay.widgets.keystrokes.keymap };
  preview.setKeymap(keymap);
}

bridge.onInput((evt) => {
  preview.input(evt);
  if (arming && evt.type === 'down') {
    const slot = arming;
    arming = null;
    save(slot, evt.label).then(renderRows);
  }
});

document.getElementById('kc-reset').onclick = async () => {
  const s = await bridge.setOverlay({ widgets: { keystrokes: { keymap: { ...window.KS_DEFAULT_KEYMAP } } } });
  keymap = { ...window.KS_DEFAULT_KEYMAP, ...s.overlay.widgets.keystrokes.keymap };
  preview.setKeymap(keymap);
  arming = null;
  renderRows();
};

(async () => {
  const s = await bridge.getSettings();
  keymap = { ...window.KS_DEFAULT_KEYMAP, ...s.overlay.widgets.keystrokes.keymap };
  preview.setKeymap(keymap);
  const info = await bridge.getInfo();
  if (info && !info.keystrokesAvailable) {
    warnEl.textContent = 'Keystroke capture needs the uiohook-napi module, which is unavailable here. Rebinding by keypress will not work.';
  }
  renderRows();
})();
