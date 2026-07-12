'use strict';

// aggregates the overlay state (livesplit engine + keystrokes + recording) and
// streams it as newline-delimited JSON over a named pipe to the injected native
// overlay dll. the field names match overlay_state.h / ipc.cpp on the c++ side.

const net = require('net');
const livesplitEngine = require('./livesplitEngine');

const PIPE = '\\\\.\\pipe\\dogshrine-overlay';
const SLOTS = ['up', 'left', 'down', 'right', 'z', 'x', 'shift', 'enter'];

// uiohook label -> short ASCII display (default imgui font has no arrow glyphs yet)
function displayLabel(label) {
  const map = {
    ArrowUp: '^', ArrowDown: 'v', ArrowLeft: '<', ArrowRight: '>',
    Shift: 'Sh', ShiftRight: 'Sh', Ctrl: 'Ct', Alt: 'Al', Enter: 'En',
    NumpadEnter: 'En', Space: 'Sp', Escape: 'Es', Tab: 'Tb', Backspace: 'Bk',
  };
  if (map[label]) return map[label];
  if (/^[A-Za-z0-9]$/.test(label)) return label.toUpperCase();
  return (label || '?').slice(0, 3);
}

function normalize(label) {
  if (!label) return '';
  return label.replace(/^(Shift|Ctrl|Alt|Meta)Right$/, '$1').replace(/^Numpad(Enter)$/, '$1');
}

// symbol code the dll draws as a shape instead of text: 0=text (use the label),
// 1=up 2=down 3=left 4=right 5=shift 6=enter
function symbolFor(label) {
  return { ArrowUp: 1, ArrowDown: 2, ArrowLeft: 3, ArrowRight: 4, Shift: 5, Enter: 6 }[normalize(label)] || 0;
}

function create() {
  let server = null;
  const clients = new Set();
  let tickTimer = null;

  const engine = livesplitEngine.createEngine({
    onPersist: (state) => {
      if (onPersistCb) onPersistCb(state);
    },
    onGold: () => {
      if (onGoldCb) onGoldCb();
    },
  });
  let onPersistCb = null;
  let onGoldCb = null;

  const cfg = {
    livesplitOn: true,
    keystrokesOn: true,
    showBps: false,
    keymap: { up: 'ArrowUp', left: 'ArrowLeft', down: 'ArrowDown', right: 'ArrowRight', z: 'Z', x: 'X', shift: 'Shift', enter: 'Enter' },
  };
  const keyDown = [false, false, false, false, false, false, false, false];
  const held = new Set();
  let bpsHits = [];
  let recording = false;

  // edit mode (F8) + launcher-owned widget positions. the dll re-asserts these
  // every frame (so alt-tab can't snap them away) and, while editing, streams the
  // dragged positions back to us here
  let editMode = false;
  const pos = { lsX: 24, lsY: 24, ksX: 24, ksY: 460 };
  let onPositionsCb = null;

  // loaded splits list for the edit-mode panel + commands it sends back
  let splitsItems = [];
  let splitsSelId = null;
  let onCommandCb = null;

  function slotForLabel(norm) {
    for (let i = 0; i < SLOTS.length; i++) {
      if (normalize(cfg.keymap[SLOTS[i]]) === norm) return i;
    }
    return -1;
  }

  function handleInput(evt) {
    const norm = normalize(evt.label);
    const isRepeat = evt.type === 'down' && held.has(evt.keycode);
    if (evt.type === 'down') held.add(evt.keycode);
    else held.delete(evt.keycode);

    const slot = slotForLabel(norm);
    if (slot >= 0) keyDown[slot] = evt.type === 'down';

    if (cfg.showBps && evt.type === 'down' && !isRepeat) {
      const boxKeys = [cfg.keymap.z, cfg.keymap.x, cfg.keymap.shift, cfg.keymap.enter].map(normalize);
      if (boxKeys.includes(norm)) bpsHits.push(Date.now());
    }
  }

  function currentBps() {
    const now = Date.now();
    bpsHits = bpsHits.filter((t) => now - t < 1000);
    return bpsHits.length;
  }

  function buildMessage() {
    const ls = engine.snapshot();
    const msg = {
      ls: cfg.livesplitOn ? 1 : 0,
      title: ls.title,
      cat: ls.cat,
      att: ls.att,
      t: ls.t,
      tc: ls.tc,
      sob: ls.sob,
      pb: ls.pb,
      segs: ls.segs,
      ks: cfg.keystrokesOn ? 1 : 0,
      kd: keyDown.map((b) => (b ? 1 : 0)),
      kl: SLOTS.map((s) => displayLabel(cfg.keymap[s])),
      ksym: SLOTS.map((s) => symbolFor(cfg.keymap[s])),
      sbps: cfg.showBps ? 1 : 0,
      bps: cfg.showBps ? currentBps() : 0,
      rec: recording ? 1 : 0,
      edit: editMode ? 1 : 0,
      lsx: pos.lsX,
      lsy: pos.lsY,
      ksx: pos.ksX,
      ksy: pos.ksY,
      spl: splitsItems.map((it) => it.title || 'Untitled'),
      spi: splitsItems.findIndex((it) => it.id === splitsSelId),
    };
    return JSON.stringify(msg) + '\n';
  }

  function broadcast() {
    if (clients.size === 0) return;
    const buf = buildMessage();
    for (const c of clients) {
      try {
        c.write(buf);
      } catch {
        // client gone, cleaned up on close
      }
    }
  }

  function start() {
    // clear any keys left down from a previous game so they don't render stuck
    keyDown.fill(false);
    held.clear();
    bpsHits = [];
    if (server) return;
    server = net.createServer((sock) => {
      clients.add(sock);
      // the dll streams dragged widget positions back as newline json while editing
      let rbuf = '';
      sock.on('data', (chunk) => {
        rbuf += chunk.toString('utf8');
        let nl;
        while ((nl = rbuf.indexOf('\n')) >= 0) {
          const line = rbuf.slice(0, nl);
          rbuf = rbuf.slice(nl + 1);
          if (!line) continue;
          try {
            const m = JSON.parse(line);
            if (m.cmd) {
              // a panel command (load / export / sel)
              if (onCommandCb) onCommandCb(m.cmd, m.i);
            } else {
              if (Number.isFinite(m.lsx)) pos.lsX = m.lsx;
              if (Number.isFinite(m.lsy)) pos.lsY = m.lsy;
              if (Number.isFinite(m.ksx)) pos.ksX = m.ksx;
              if (Number.isFinite(m.ksy)) pos.ksY = m.ksy;
            }
          } catch {
            // partial or malformed, ignore
          }
        }
      });
      sock.on('close', () => clients.delete(sock));
      sock.on('error', () => clients.delete(sock));
    });
    server.on('error', () => {});
    // remove a stale pipe name from a crashed run, then listen
    try {
      server.listen(PIPE);
    } catch {
      // ignore
    }
    clearInterval(tickTimer);
    tickTimer = setInterval(broadcast, 33);
  }

  function stop() {
    clearInterval(tickTimer);
    tickTimer = null;
    for (const c of clients) {
      try {
        c.destroy();
      } catch {
        // ignore
      }
    }
    clients.clear();
    if (server) {
      try {
        server.close();
      } catch {
        // ignore
      }
      server = null;
    }
  }

  function setConfig(overlay) {
    cfg.livesplitOn = overlay.widgets.livesplit.enabled;
    cfg.keystrokesOn = overlay.widgets.keystrokes.enabled;
    cfg.showBps = Boolean(overlay.widgets.keystrokes.showBps);
    cfg.keymap = { ...cfg.keymap, ...(overlay.widgets.keystrokes.keymap || {}) };
    // load saved widget positions, unless the user is mid-drag (edit mode owns them)
    if (!editMode) {
      const ls = overlay.widgets.livesplit;
      const ks = overlay.widgets.keystrokes;
      if (Number.isFinite(ls.x)) pos.lsX = ls.x;
      if (Number.isFinite(ls.y)) pos.lsY = ls.y;
      if (Number.isFinite(ks.x)) pos.ksX = ks.x;
      if (Number.isFinite(ks.y)) pos.ksY = ks.y;
    }
  }

  // f8 toggles edit mode, on exit we hand the final positions back to be saved
  function setEditMode(on) {
    const next = Boolean(on);
    if (next === editMode) return;
    editMode = next;
    if (!editMode && onPositionsCb) onPositionsCb({ ...pos });
  }

  return {
    start,
    stop,
    handleInput,
    setConfig,
    setRecording: (v) => {
      recording = Boolean(v);
    },
    setSplits: (state) => engine.setSplits(state),
    command: (cmd) => engine.command(cmd),
    getSplitsState: () => engine.getState(),
    setSplitsList: (items, selectedId) => {
      splitsItems = Array.isArray(items) ? items : [];
      splitsSelId = selectedId != null ? selectedId : null;
    },
    setEditMode,
    toggleEditMode: () => setEditMode(!editMode),
    isEditMode: () => editMode,
    onCommand: (cb) => {
      onCommandCb = cb;
    },
    onPersist: (cb) => {
      onPersistCb = cb;
    },
    onGold: (cb) => {
      onGoldCb = cb;
    },
    onPositions: (cb) => {
      onPositionsCb = cb;
    },
    hasClients: () => clients.size > 0,
  };
}

module.exports = { create, PIPE };
