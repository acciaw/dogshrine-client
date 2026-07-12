'use strict';

// hidden capture window. grabs the game window via desktop getUserMedia and
// records with MediaRecorder. keeps a rolling replay buffer using two
// staggered recorders so a saved clip is always a self-contained, playable webm

let stream = null;
let opts = null;
let armPromise = null;

// replay buffer slots, each a self-contained recording that rotates every 2N
let slotA = null;
let slotB = null;
let timerA = null;
let timerB = null;
let startTimerB = null;

// explicit start/stop recording, separate from the replay buffer
let clip = null;

function report(msg) {
  if (window.rec && window.rec.reportFail) window.rec.reportFail(msg);
}

function mimeType() {
  // prefer real mp4 (h264), fall back to webm where mp4 recording is unavailable
  const prefs = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  for (const t of prefs) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(t)) return t;
  }
  return 'video/webm';
}

const REC_MIME = mimeType();
const REC_CONTAINER = REC_MIME.indexOf('video/mp4') === 0 ? 'video/mp4' : 'video/webm';
const REC_EXT = REC_MIME.indexOf('video/mp4') === 0 ? 'mp4' : 'webm';

function newRecorder() {
  const chunks = [];
  const rec = new MediaRecorder(stream, { mimeType: REC_MIME });
  rec.ondataavailable = (e) => {
    if (e.data && e.data.size) chunks.push(e.data);
  };
  rec.start(1000);
  return { rec, chunks, startedAt: performance.now() };
}

function stopAndCollect(slot) {
  return new Promise((resolve) => {
    slot.rec.onstop = () => resolve(new Blob(slot.chunks, { type: REC_CONTAINER }));
    try {
      slot.rec.stop();
    } catch {
      resolve(new Blob(slot.chunks, { type: REC_CONTAINER }));
    }
  });
}

async function sendBlob(blob, kind) {
  try {
    const buf = await blob.arrayBuffer();
    await window.rec.saveBlob(new Uint8Array(buf), kind, REC_EXT);
  } catch (err) {
    report('could not save clip: ' + err.message);
  }
}

function getStream(sourceId) {
  return navigator.mediaDevices.getUserMedia({
    audio: opts.captureAudio ? { mandatory: { chromeMediaSource: 'desktop' } } : false,
    video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId } },
  });
}

async function startCapture() {
  stopStream();
  try {
    stream = await getStream(opts.sourceId);
  } catch (err) {
    // some game windows can't be captured directly, fall back to the whole screen
    if (opts.fallbackId && opts.fallbackId !== opts.sourceId) {
      stream = await getStream(opts.fallbackId);
    } else {
      throw err;
    }
  }
}

function stopStream() {
  if (stream) {
    for (const track of stream.getTracks()) track.stop();
    stream = null;
  }
}

function startReplayBuffer() {
  stopReplayBuffer();
  if (!stream) return;
  const n = (Number(opts.replaySeconds) || 30) * 1000;
  slotA = newRecorder();
  timerA = setInterval(() => {
    restartSlot('A');
  }, 2 * n);
  startTimerB = setTimeout(() => {
    slotB = newRecorder();
    timerB = setInterval(() => {
      restartSlot('B');
    }, 2 * n);
  }, n);
}

function restartSlot(which) {
  const slot = which === 'A' ? slotA : slotB;
  if (slot) {
    try {
      slot.rec.stop();
    } catch {
      // ignore
    }
  }
  const fresh = newRecorder();
  if (which === 'A') slotA = fresh;
  else slotB = fresh;
}

function stopReplayBuffer() {
  clearInterval(timerA);
  clearInterval(timerB);
  clearTimeout(startTimerB);
  timerA = null;
  timerB = null;
  startTimerB = null;
  for (const slot of [slotA, slotB]) {
    if (slot) {
      try {
        slot.rec.stop();
      } catch {
        // ignore
      }
    }
  }
  slotA = null;
  slotB = null;
}

// dumps the longest-running slot, which always holds at least N seconds
async function saveReplay() {
  if (armPromise) await armPromise;
  const cands = [slotA, slotB].filter(Boolean);
  if (!cands.length) {
    report('no replay buffer ready yet');
    return;
  }
  cands.sort((a, b) => a.startedAt - b.startedAt);
  const chosen = cands[0];
  const blob = await stopAndCollect(chosen);
  await sendBlob(blob, 'replay');
  if (chosen === slotA) slotA = newRecorder();
  else slotB = newRecorder();
}

async function startClip() {
  if (armPromise) await armPromise;
  if (clip) return;
  if (!stream) {
    report('capture is not running, cannot record');
    return;
  }
  clip = newRecorder();
}

async function stopClip() {
  if (!clip) return;
  const c = clip;
  clip = null;
  const blob = await stopAndCollect(c);
  await sendBlob(blob, 'clip');
}

window.rec.onArm((o) => {
  opts = o;
  armPromise = (async () => {
    try {
      await startCapture();
      startReplayBuffer();
    } catch (err) {
      report('could not capture the game window: ' + err.message);
    }
  })();
});

window.rec.onDisarm(() => {
  stopReplayBuffer();
  if (clip) {
    try {
      clip.rec.stop();
    } catch {
      // ignore
    }
    clip = null;
  }
  stopStream();
  armPromise = null;
});

window.rec.onStartClip(() => startClip());
window.rec.onStopClip(() => stopClip());
window.rec.onSaveReplay(() => saveReplay());
