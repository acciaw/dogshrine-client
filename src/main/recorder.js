'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { app, BrowserWindow, desktopCapturer } = require('electron');
const settings = require('./settings');

// loaded lazily and degrades gracefully, a missing binary just skips the remux
let ffmpegPath = null;
try {
  ffmpegPath = require('ffmpeg-static');
} catch {
  ffmpegPath = null;
}

// game-window capture + instant replay. capture and MediaRecorder run in a
// hidden renderer, this side owns the window title match, the source lookup and
// writing finished clips to disk

// best-effort os window titles per game, falls back to the whole screen
const WINDOW_TITLES = {
  undertale: ['undertale'],
  deltarune: ['deltarune', 'survey_program'],
  uty: ['undertale yellow'],
};

let recWin = null;
let recWinReady = false;
let pending = [];
let recording = false;
let armed = false;
let stateCb = null;
let running = false;
let currentGameId = null;

function onState(cb) {
  stateCb = cb;
}

function emitState() {
  if (stateCb) stateCb({ recording, armed });
}

function recordingCfg() {
  return settings.get().overlay.recording || {};
}

function saveFolder() {
  const cfg = recordingCfg();
  if (cfg.folder) return cfg.folder;
  return path.join(app.getPath('videos'), 'Dog Shrine');
}

function ensureWindow() {
  if (recWin && !recWin.isDestroyed()) return recWin;
  recWinReady = false;
  recWin = new BrowserWindow({
    show: false,
    width: 320,
    height: 240,
    webPreferences: {
      preload: path.join(__dirname, 'recorderPreload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  recWin.removeMenu();
  recWin.loadFile(path.join(__dirname, '..', 'renderer', 'overlay', 'recorder.html'));
  // messages sent before the renderer loads would be lost, so queue until ready
  recWin.webContents.on('did-finish-load', () => {
    recWinReady = true;
    for (const [channel, payload] of pending) recWin.webContents.send(channel, payload);
    pending = [];
  });
  recWin.on('closed', () => {
    recWin = null;
    recWinReady = false;
  });
  return recWin;
}

function send(channel, payload) {
  ensureWindow();
  if (recWinReady && recWin && !recWin.isDestroyed()) recWin.webContents.send(channel, payload);
  else pending.push([channel, payload]);
}

// the running game's window (preferred) plus the primary screen (fallback)
async function pickSources() {
  const sources = await desktopCapturer.getSources({
    types: ['window', 'screen'],
    thumbnailSize: { width: 0, height: 0 },
  });
  const titles = WINDOW_TITLES[currentGameId] || [];
  const match = sources.find((s) => {
    const name = (s.name || '').toLowerCase();
    return titles.some((t) => name.includes(t));
  });
  const screenSrc = sources.find((s) => s.id.startsWith('screen'));
  const screenId = screenSrc ? screenSrc.id : null;
  return { sourceId: match ? match.id : screenId, fallbackId: screenId };
}

// keeps a rolling replay buffer ready whenever a game is up
async function arm() {
  if (!running) return;
  ensureWindow();
  const { sourceId, fallbackId } = await pickSources();
  if (!sourceId && !fallbackId) return;
  const cfg = recordingCfg();
  send('recorder:arm', {
    sourceId: sourceId || fallbackId,
    fallbackId,
    replaySeconds: Number(cfg.replaySeconds) || 30,
    captureAudio: Boolean(cfg.captureAudio),
  });
  armed = true;
  emitState();
}

function disarm() {
  send('recorder:disarm', null);
  armed = false;
  recording = false;
  emitState();
}

function setContext({ isRunning, gameId }) {
  const was = running;
  running = isRunning;
  currentGameId = gameId || null;
  if (running && !was) arm();
  if (!running && was) disarm();
}

// hotkey / overlay button: start or stop a full recording
async function toggle() {
  if (!running) return;
  if (!armed) await arm();
  recording = !recording;
  send(recording ? 'recorder:startClip' : 'recorder:stopClip', null);
  emitState();
}

// hotkey: dump the last N seconds from the rolling buffer
function saveReplay() {
  if (!armed) return;
  send('recorder:saveReplay', null);
}

// chromium's mp4 output is a streaming/fragmented file with a zero duration in
// its moov, which windows explorer reads as a bogus multi-thousand-minute
// length and can't thumbnail. remux (not re-encode video) through ffmpeg to
// get a normal finalized mp4 with a correct duration and moov up front
function remuxMp4(rawFile, outFile) {
  return new Promise((resolve) => {
    execFile(
      ffmpegPath,
      ['-y', '-i', rawFile, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', outFile],
      (err) => resolve(!err)
    );
  });
}

// the recorder renderer hands finished video bytes back here to write out
async function writeBlob({ bytes, kind, ext }) {
  const folder = saveFolder();
  try {
    fs.mkdirSync(folder, { recursive: true });
  } catch (err) {
    return { ok: false, error: err.message };
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const prefix = kind === 'replay' ? 'replay' : 'recording';
  const extension = ext === 'mp4' ? 'mp4' : 'webm';
  const file = path.join(folder, `${prefix}-${stamp}.${extension}`);

  if (extension !== 'mp4' || !ffmpegPath) {
    try {
      fs.writeFileSync(file, Buffer.from(bytes));
      return { ok: true, path: file };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  const rawFile = path.join(folder, `.${prefix}-${stamp}.raw.mp4`);
  try {
    fs.writeFileSync(rawFile, Buffer.from(bytes));
  } catch (err) {
    return { ok: false, error: err.message };
  }

  const remuxed = await remuxMp4(rawFile, file);
  if (!remuxed) {
    // ffmpeg failed, keep the raw capture rather than lose the clip
    try {
      fs.renameSync(rawFile, file);
      return { ok: true, path: file };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }
  fs.rmSync(rawFile, { force: true });
  return { ok: true, path: file };
}

function isRecording() {
  return recording;
}

function destroy() {
  if (recWin && !recWin.isDestroyed()) recWin.destroy();
  recWin = null;
  recWinReady = false;
  pending = [];
  armed = false;
  recording = false;
}

module.exports = { onState, setContext, toggle, saveReplay, writeBlob, isRecording, destroy, saveFolder };
