'use strict';

// livesplit timer widget. mounts into a container, owns its run model and
// responds to split/reset/undo/skip/pause commands. reports pb/gold/attempt
// changes through onPersist so the host can save them, and fires onGold when a
// segment beats its best

window.LiveSplitWidget = function LiveSplitWidget(container, opts) {
  opts = opts || {};
  const root = document.createElement('div');
  root.className = 'ls-widget';
  root.innerHTML = `
    <div class="ls-title"><span class="ls-game"></span><span class="ls-cat"></span></div>
    <div class="ls-segments"></div>
    <div class="ls-timer">0.00</div>
    <div class="ls-footer">
      <span class="ls-foot"><span class="ls-foot-k">sum of best</span><span class="ls-sob">-</span></span>
      <span class="ls-foot"><span class="ls-foot-k">pb</span><span class="ls-pb">-</span></span>
      <span class="ls-foot"><span class="ls-foot-k">attempts</span><span class="ls-att">0</span></span>
    </div>`;
  container.appendChild(root);

  const els = {
    game: root.querySelector('.ls-game'),
    cat: root.querySelector('.ls-cat'),
    segs: root.querySelector('.ls-segments'),
    timer: root.querySelector('.ls-timer'),
    sob: root.querySelector('.ls-sob'),
    pb: root.querySelector('.ls-pb'),
    att: root.querySelector('.ls-att'),
  };

  // persisted run model
  let state = { title: 'No splits', category: '', attempts: 0, segments: [] };
  // active run, null when idle
  let run = null;
  let rafId = null;

  function persist() {
    if (opts.onPersist) opts.onPersist(state);
  }

  function elapsed() {
    if (!run) return 0;
    // freeze at the final time once the run is done
    if (run.finished) return run.finalTime || 0;
    const now = run.paused ? run.pauseStart : performance.now();
    return now - run.startPerf - run.pausedTotal;
  }

  // the pb split we compare against, snapshotted at run start so finishing a
  // pb run (which overwrites the stored pb) doesn't turn every delta into +0.0
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

  // gold vs the best-at-run-start snapshot, so it stays gold after the run ends
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
      startPerf: performance.now(),
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
          run.pausedTotal += performance.now() - run.pauseStart;
          run.paused = false;
        } else {
          run.paused = true;
          run.pauseStart = performance.now();
        }
      }
    }
    render();
  }

  // picks the ahead/behind/gaining/losing/gold class for a passed split
  function deltaClass(i, delta) {
    if (isGold(i)) return 'gold';
    let prevDelta = 0;
    for (let j = i - 1; j >= 0; j--) {
      if (run.splits[j] != null && compareAt(j) != null) {
        prevDelta = run.splits[j] - compareAt(j);
        break;
      }
    }
    const ahead = delta < 0;
    const gaining = delta < prevDelta;
    if (ahead) return gaining ? 'ahead-gaining' : 'ahead-losing';
    return gaining ? 'behind-gaining' : 'behind-losing';
  }

  function render() {
    els.game.textContent = state.title || '';
    els.cat.textContent = state.category || '';
    els.att.textContent = state.attempts || 0;

    let sob = 0;
    let haveAll = state.segments.length > 0;
    for (const s of state.segments) {
      if (s.bestSegment == null) haveAll = false;
      else sob += s.bestSegment;
    }
    els.sob.textContent = haveAll ? window.LSS.toClock(sob) : '-';
    const pbFinal = state.segments.length ? state.segments[state.segments.length - 1].pbSplit : null;
    els.pb.textContent = pbFinal != null ? window.LSS.toClock(pbFinal) : '-';

    els.segs.replaceChildren();
    for (let i = 0; i < state.segments.length; i++) {
      const seg = state.segments[i];
      const rowEl = document.createElement('div');
      rowEl.className = 'ls-row';
      if (run && i === run.index && !run.finished) rowEl.classList.add('ls-current');

      const nameEl = document.createElement('span');
      nameEl.className = 'ls-name';
      nameEl.textContent = seg.name || `Split ${i + 1}`;

      const deltaEl = document.createElement('span');
      deltaEl.className = 'ls-delta';

      const timeEl = document.createElement('span');
      timeEl.className = 'ls-time';

      const cmp = compareAt(i);
      const passed = run && run.splits[i] != null;
      const skipped = run && run.splits[i] === null && i < run.index;
      if (passed) {
        timeEl.textContent = window.LSS.toClock(run.splits[i]);
        if (cmp != null) {
          const delta = run.splits[i] - cmp;
          deltaEl.textContent = window.LSS.toDelta(delta);
          deltaEl.classList.add(deltaClass(i, delta));
        }
      } else if (skipped) {
        timeEl.textContent = '-';
      } else {
        const proj = run ? cmp : seg.pbSplit;
        timeEl.textContent = proj != null ? window.LSS.toClock(proj) : '-';
        timeEl.classList.add('ls-dim');
      }

      rowEl.append(nameEl, deltaEl, timeEl);
      els.segs.appendChild(rowEl);
    }

    renderTimer();
  }

  function renderTimer() {
    const ms = elapsed();
    els.timer.textContent = window.LSS.toClock(ms, 2);
    els.timer.className = 'ls-timer';
    if (run && state.segments.length) {
      const last = state.segments.length - 1;
      if (run.finished) {
        const cmpLast = run.compare ? run.compare[last] : null;
        const finalT = run.splits[last];
        const beatPb = cmpLast == null || (finalT != null && finalT <= cmpLast);
        els.timer.classList.add(beatPb ? 'ahead-gaining' : 'behind-losing');
      } else {
        const cmp = compareAt(run.index);
        if (cmp != null) els.timer.classList.add(ms - cmp < 0 ? 'ahead-losing' : 'behind-losing');
      }
    }
    if (run && run.paused) els.timer.classList.add('ls-paused');
  }

  function loop() {
    renderTimer();
    rafId = requestAnimationFrame(loop);
  }

  function setState(next) {
    if (!next || !Array.isArray(next.segments)) {
      state = { title: 'No splits', category: '', attempts: 0, segments: [] };
    } else {
      state = {
        title: next.title || 'Untitled',
        category: next.category || '',
        attempts: next.attempts || 0,
        segments: next.segments.map((s) => ({ name: s.name || '', pbSplit: s.pbSplit ?? null, bestSegment: s.bestSegment ?? null })),
      };
    }
    run = null;
    render();
  }

  function getState() {
    return state;
  }

  function destroy() {
    if (rafId) cancelAnimationFrame(rafId);
    root.remove();
  }

  render();
  loop();

  return { command, setState, getState, destroy, el: root };
};
