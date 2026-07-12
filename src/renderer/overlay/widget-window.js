'use strict';

// standalone host for a single popped-out widget. mounts the same widget
// factory the overlay uses and forwards the same bridge events

const bridge = window.overlay;
const id = bridge.widgetId;
const mount = document.getElementById('mount');

let soundGold = '';
function playGold() {
  if (!soundGold) return;
  try {
    new Audio(soundGold).play().catch(() => {});
  } catch {
    // ignore
  }
}

let widget = null;
if (id === 'livesplit') widget = window.LiveSplitWidget(mount, { onPersist: (s) => bridge.splitsSaveState(s), onGold: playGold });
else if (id === 'keystrokes') widget = window.KeystrokesWidget(mount);

async function reloadSplits() {
  if (id !== 'livesplit' || !widget) return;
  const info = await bridge.splitsGetSelected();
  widget.setState(info.state);
}

bridge.onLivesplitCmd((cmd) => {
  if (id === 'livesplit' && widget) widget.command(cmd);
});
bridge.onInput((evt) => {
  if (id === 'keystrokes' && widget) widget.input(evt);
});
bridge.onActiveSplits((state) => {
  if (id === 'livesplit' && widget) widget.setState(state);
});
bridge.onSettings((cfg) => {
  if (id === 'keystrokes' && widget) {
    widget.setKeymap(cfg.widgets.keystrokes.keymap);
    widget.setBps(cfg.widgets.keystrokes.showBps);
  }
});
bridge.onSounds((s) => {
  soundGold = (s && s.gold) || '';
});
bridge.onGame(() => reloadSplits());

reloadSplits();
