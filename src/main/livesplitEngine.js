'use strict';

// main-process livesplit run model, a port of renderer/overlay/livesplit.js so
// the timer/splits can drive the native (injected) overlay over the pipe. the
// electron overlay still has its own copy for the composited path, only one path
// is active per game. colors match the dsov color enum in the native overlay

const COLOR = {
  NONE: 0,
  AHEAD_GAIN: 1,
  AHEAD_LOSE: 2,
  BEHIND_GAIN: 3,
  BEHIND_LOSE: 4,
  GOLD: 5,
};

function createEngine(opts) {
  opts = opts || {};
  let state = { title: 'No splits', category: '', attempts: 0, segments: [] };
  let run = null;

  function persist() {
    if (opts.onPersist) opts.onPersist(state);
  }

  function elapsed() {
    if (!run) return 0;
    if (run.finished) return run.finalTime || 0;
    const now = run.paused ? run.pauseStart : Date.now();
    return now - run.startTime - run.pausedTotal;
  }

  function compareAt(i) {
    if (run && run.compare) return run.compare[i];
    return state.segments[i] ? state.segments[i].pbSplit : null;
  }

  function segTime(i) {
    const cur = run.splits[i];
    if (cur == null) return null;
    let prev = 0;
    for (let j = i - 1; j >= 0; j--) {
      if (run.splits[j] != null) {
        prev = run.splits[j];
        break;
      }
      if (j === 0) prev = 0;
    }
    return cur - prev;
  }

  function isGold(i) {
    const t = segTime(i);
    if (t == null) return false;
    const best = run && run.compareBest ? run.compareBest[i] : state.segments[i].bestSegment;
    return best == null || t < best;
  }

  function updateBests() {
    for (let i = 0; i < state.segments.length; i++) {
      const t = segTime(i);
      if (t == null) continue;
      const best = state.segments[i].bestSegment;
      if (best == null || t < best) state.segments[i].bestSegment = t;
    }
  }

  function startRun() {
    run = {
      startTime: Date.now(),
      splits: [],
      index: 0,
      paused: false,
      pauseStart: 0,
      pausedTotal: 0,
      finished: false,
      finalTime: 0,
      compare: state.segments.map((s) => s.pbSplit),
      compareBest: state.segments.map((s) => s.bestSegment),
    };
    state.attempts = (state.attempts || 0) + 1;
    persist();
  }

  function finishRun() {
    run.finished = true;
    const last = state.segments.length - 1;
    run.finalTime = run.splits[last] != null ? run.splits[last] : elapsed();
    updateBests();
    const finalTime = run.splits[last];
    const pbFinal = run.compare[last];
    if (finalTime != null && (pbFinal == null || finalTime < pbFinal)) {
      for (let i = 0; i < state.segments.length; i++) state.segments[i].pbSplit = run.splits[i];
    }
    persist();
  }

  function recordSplit() {
    run.splits[run.index] = elapsed();
    const justSplit = run.index;
    run.index++;
    if (isGold(justSplit) && opts.onGold) opts.onGold();
    if (run.index >= state.segments.length) finishRun();
  }

  function command(cmd) {
    if (cmd === 'split') {
      if (!run || run.finished) {
        run = null;
        startRun();
      } else if (state.segments.length === 0) {
        run.finalTime = elapsed();
        run.finished = true;
        persist();
      } else {
        recordSplit();
      }
    } else if (cmd === 'reset') {
      if (run) {
        updateBests();
        persist();
      }
      run = null;
    } else if (cmd === 'undo') {
      if (run && run.index > 0) {
        run.index--;
        run.splits[run.index] = undefined;
        run.finished = false;
      }
    } else if (cmd === 'skip') {
      if (run && !run.finished && run.index < state.segments.length - 1) {
        run.splits[run.index] = null;
        run.index++;
      }
    } else if (cmd === 'pause') {
      if (run && !run.finished) {
        if (run.paused) {
          run.pausedTotal += Date.now() - run.pauseStart;
          run.paused = false;
        } else {
          run.paused = true;
          run.pauseStart = Date.now();
        }
      }
    }
  }

  function deltaClass(i, delta) {
    if (isGold(i)) return COLOR.GOLD;
    let prevDelta = 0;
    for (let j = i - 1; j >= 0; j--) {
      if (run.splits[j] != null && compareAt(j) != null) {
        prevDelta = run.splits[j] - compareAt(j);
        break;
      }
    }
    const ahead = delta < 0;
    const gaining = delta < prevDelta;
    if (ahead) return gaining ? COLOR.AHEAD_GAIN : COLOR.AHEAD_LOSE;
    return gaining ? COLOR.BEHIND_GAIN : COLOR.BEHIND_LOSE;
  }

  function setSplits(next) {
    if (!next || !Array.isArray(next.segments)) {
      state = { title: 'No splits', category: '', attempts: 0, segments: [] };
    } else {
      state = {
        title: next.title || 'Untitled',
        category: next.category || '',
        attempts: next.attempts || 0,
        segments: next.segments.map((s) => ({
          name: s.name || '',
          pbSplit: s.pbSplit ?? null,
          bestSegment: s.bestSegment ?? null,
        })),
      };
    }
    run = null;
  }

  function getState() {
    return state;
  }

  // produces the livesplit fragment for the DsovState json the native overlay reads
  function snapshot() {
    const ms = elapsed();
    let sob = 0;
    let haveAll = state.segments.length > 0;
    for (const s of state.segments) {
      if (s.bestSegment == null) haveAll = false;
      else sob += s.bestSegment;
    }
    const pbFinal = state.segments.length ? state.segments[state.segments.length - 1].pbSplit : null;

    let timerColor = COLOR.NONE;
    if (run && state.segments.length) {
      const last = state.segments.length - 1;
      if (run.finished) {
        const cmpLast = run.compare ? run.compare[last] : null;
        const finalT = run.splits[last];
        const beatPb = cmpLast == null || (finalT != null && finalT <= cmpLast);
        timerColor = beatPb ? COLOR.AHEAD_GAIN : COLOR.BEHIND_LOSE;
      } else {
        const cmp = compareAt(run.index);
        if (cmp != null) timerColor = ms - cmp < 0 ? COLOR.AHEAD_LOSE : COLOR.BEHIND_LOSE;
      }
    }

    const segs = state.segments.map((seg, i) => {
      const passed = run && run.splits[i] != null;
      const cmp = compareAt(i);
      let hasSplit = false;
      let splitMs = 0;
      if (passed) {
        hasSplit = true;
        splitMs = run.splits[i];
      } else if (run ? cmp != null : seg.pbSplit != null) {
        hasSplit = true;
        splitMs = run ? cmp : seg.pbSplit;
      }
      let hasDelta = false;
      let deltaMs = 0;
      let color = COLOR.NONE;
      if (passed && cmp != null) {
        hasDelta = true;
        deltaMs = run.splits[i] - cmp;
        color = deltaClass(i, deltaMs);
      }
      return {
        n: seg.name || `Split ${i + 1}`,
        p: passed ? 1 : 0,
        c: run && i === run.index && !run.finished ? 1 : 0,
        hs: hasSplit ? 1 : 0,
        sp: splitMs,
        hd: hasDelta ? 1 : 0,
        d: deltaMs,
        col: color,
      };
    });

    return {
      title: state.title || '',
      cat: state.category || '',
      att: state.attempts || 0,
      t: ms,
      tc: timerColor,
      sob: haveAll ? sob : -1,
      pb: pbFinal != null ? pbFinal : -1,
      segs,
    };
  }

  return { command, setSplits, getState, snapshot };
}

module.exports = { createEngine, COLOR };
