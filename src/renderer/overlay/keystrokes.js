'use strict';

// keystroke display widget. a fixed undertale/deltarune layout: an arrow-style
// cross plus z / x / shift / enter below. each slot lights when its mapped key
// is pressed, and the mapped key is configurable

const KS_DEFAULT_KEYMAP = {
  up: 'ArrowUp', left: 'ArrowLeft', down: 'ArrowDown', right: 'ArrowRight',
  z: 'Z', x: 'X', shift: 'Shift', enter: 'Enter',
};

const KS_SLOTS = ['up', 'left', 'down', 'right', 'z', 'x', 'shift', 'enter'];

const KS_SYMBOLS = {
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Space: '␣', Enter: '⏎', Backspace: '⌫', Shift: '⇧', Escape: 'esc',
  Tab: '⇥', Ctrl: 'ctrl', Alt: 'alt', Meta: 'meta',
};

// left/right variants of a modifier light the same slot
function ksNormalize(label) {
  if (!label) return '';
  return label
    .replace(/^(Shift|Ctrl|Alt|Meta)Right$/, '$1')
    .replace(/^Numpad(Enter)$/, '$1');
}

function ksDisplay(label) {
  if (KS_SYMBOLS[label]) return KS_SYMBOLS[label];
  if (/^[A-Za-z0-9]$/.test(label)) return label.toUpperCase();
  return label || '?';
}

window.KS_DEFAULT_KEYMAP = KS_DEFAULT_KEYMAP;
window.KS_SLOTS = KS_SLOTS;
window.ksDisplay = ksDisplay;

window.KeystrokesWidget = function KeystrokesWidget(container, initialKeymap) {
  const root = document.createElement('div');
  root.className = 'ks-widget';
  root.innerHTML = `
    <div class="ks-cross">
      <span class="ks-key ks-up" data-slot="up"></span>
      <span class="ks-key ks-left" data-slot="left"></span>
      <span class="ks-key ks-down" data-slot="down"></span>
      <span class="ks-key ks-right" data-slot="right"></span>
    </div>
    <div class="ks-actions">
      <span class="ks-key" data-slot="z"></span>
      <span class="ks-key" data-slot="x"></span>
      <span class="ks-key ks-wide" data-slot="shift"></span>
      <span class="ks-key ks-wide" data-slot="enter"></span>
    </div>
    <div class="ks-bps hidden"><span class="ks-bps-rate">0.0</span><span class="ks-bps-unit"> boxes/s</span><span class="ks-bps-peak"></span></div>`;
  container.appendChild(root);

  const slotEls = {};
  for (const el of root.querySelectorAll('[data-slot]')) slotEls[el.dataset.slot] = el;
  const bpsEl = root.querySelector('.ks-bps');
  const bpsRateEl = root.querySelector('.ks-bps-rate');
  const bpsPeakEl = root.querySelector('.ks-bps-peak');

  let keymap = { ...KS_DEFAULT_KEYMAP, ...(initialKeymap || {}) };

  // text-boxes-per-second: timestamps of confirm-key presses in a rolling window
  let showBps = false;
  let hits = [];
  let peak = 0;
  let bpsTimer = null;
  // keys currently held, so os key-repeat counts as a single press
  const held = new Set();

  function redraw() {
    for (const slot of KS_SLOTS) {
      if (slotEls[slot]) slotEls[slot].textContent = ksDisplay(keymap[slot]);
    }
  }

  function tickBps() {
    const now = performance.now();
    hits = hits.filter((t) => now - t < 1000);
    const rate = hits.length;
    if (rate > peak) peak = rate;
    bpsRateEl.textContent = rate.toFixed(1);
    bpsPeakEl.textContent = peak ? `  peak ${peak}` : '';
  }

  function setBps(on) {
    showBps = Boolean(on);
    bpsEl.classList.toggle('hidden', !showBps);
    clearInterval(bpsTimer);
    if (showBps) {
      bpsTimer = setInterval(tickBps, 150);
    } else {
      hits = [];
      peak = 0;
    }
  }

  function input(evt) {
    const norm = ksNormalize(evt.label);
    // os key-repeat fires many keydowns while held, only the first is a real press
    const isRepeat = evt.type === 'down' && held.has(evt.keycode);
    if (evt.type === 'down') held.add(evt.keycode);
    else held.delete(evt.keycode);

    for (const slot of KS_SLOTS) {
      if (ksNormalize(keymap[slot]) === norm) {
        slotEls[slot].classList.toggle('ks-active', evt.type === 'down');
      }
    }
    // count box-advancing keys for the boxes/sec meter: z/enter skip a box,
    // x/shift fast-forward its text, all of them spam through dialogue
    if (showBps && evt.type === 'down' && !isRepeat) {
      const boxKeys = [keymap.z, keymap.x, keymap.shift, keymap.enter].map(ksNormalize);
      if (boxKeys.includes(norm)) hits.push(performance.now());
    }
  }

  function setKeymap(km) {
    keymap = { ...keymap, ...(km || {}) };
    redraw();
  }

  function destroy() {
    clearInterval(bpsTimer);
    root.remove();
  }

  redraw();
  return { input, setKeymap, setBps, destroy, el: root };
};
