'use strict';

// easter egg: [[HYPERLINK BLOCKED]]

const sansFightOverlay = document.getElementById('sans-fight-overlay');
const sansFightView = document.getElementById('sans-fight-view');
const settingsSoundsToggle = document.getElementById('settings-sounds-toggle');

let sansFightConfig = null;

// short stinger played here in dog shrine itself, the instant the trigger completes —
// separate from whatever the fight's own page plays once it's actually loaded
const ominousSound = new Audio('../sound/snd_ominous_music.wav');
ominousSound.volume = 0.1;

function isEditableElement(el) {
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
}

async function openSansFight() {
  const { soundsEnabled } = await window.toby.getSettings();

  if (!sansFightConfig) {
    sansFightConfig = await window.toby.getSansFightConfig();
  }

  if (soundsEnabled) {
    ominousSound.currentTime = 0;
    ominousSound.play().catch(() => {});
  }

  // the fight's own page can't see dog shrine's settings: pass the mute state along
  const url = new URL(sansFightConfig.url);
  url.searchParams.set('muted', soundsEnabled ? '0' : '1');

  sansFightView.setAttribute('preload', sansFightConfig.preload);
  sansFightView.src = url.toString();
  sansFightOverlay.classList.remove('hidden');

  // focus
  sansFightView.focus();
  sansFightView.addEventListener('dom-ready', () => sansFightView.focus(), { once: true });
}

function closeSansFight(result) {
  console.log(`[sans-fight] result: ${result}`);
  ominousSound.pause();
  sansFightOverlay.classList.add('hidden');
  sansFightView.src = 'about:blank';
}

sansFightView.addEventListener('ipc-message', (event) => {
  if (event.channel === 'sans-fight:result') closeSansFight(event.args[0]);
});

// rolling buffer of typed characters, reset on any non-matching key
const TRIGGER = 'badtime';
let typedBuffer = '';

window.addEventListener('keydown', (e) => {
  if (!sansFightOverlay.classList.contains('hidden')) return; // fight already open
  if (isEditableElement(document.activeElement)) {
    typedBuffer = '';
    return;
  }
  if (e.key.length !== 1) return; // ignore Shift/Enter/arrows/etc.

  typedBuffer = (typedBuffer + e.key.toLowerCase()).slice(-TRIGGER.length);
  if (typedBuffer === TRIGGER) {
    typedBuffer = '';
    openSansFight();
  }
});

settingsSoundsToggle.onchange = () => window.toby.setSoundsEnabled(settingsSoundsToggle.checked);

(async () => {
  const { soundsEnabled } = await window.toby.getSettings();
  settingsSoundsToggle.checked = Boolean(soundsEnabled);
})();
