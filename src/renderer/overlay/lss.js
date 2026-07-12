'use strict';

// shared livesplit helpers. parses and writes .lss xml with the built-in
// DOMParser so no xml dependency is needed, plus time formatting

(function () {
  function pad(n, w = 2) {
    return String(n).padStart(w, '0');
  }

  // ".net timespan" style string -> milliseconds
  function parseTime(str) {
    if (!str) return null;
    const parts = str.trim().split(':');
    let h = 0;
    let m = 0;
    let s = 0;
    if (parts.length === 3) {
      h = Number(parts[0]);
      m = Number(parts[1]);
      s = parseFloat(parts[2]);
    } else if (parts.length === 2) {
      m = Number(parts[0]);
      s = parseFloat(parts[1]);
    } else {
      s = parseFloat(parts[0]);
    }
    if (Number.isNaN(h + m + s)) return null;
    return Math.round((h * 3600 + m * 60 + s) * 1000);
  }

  // milliseconds -> "HH:MM:SS.fffffff" for writing .lss
  function toLssTime(ms) {
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const frac = Math.round((ms % 1000) * 10000);
    return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(frac, 7)}`;
  }

  // milliseconds -> readable clock, drops the hour when zero
  function toClock(ms, decimals = 2) {
    const neg = ms < 0;
    ms = Math.abs(ms);
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    let out = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
    if (decimals > 0) {
      const frac = Math.floor((ms % 1000) / (decimals === 2 ? 10 : 100));
      out += '.' + pad(frac, decimals);
    }
    return (neg ? '-' : '') + out;
  }

  // signed short delta like "+1.2" / "-12.3"
  function toDelta(ms) {
    const sign = ms >= 0 ? '+' : '-';
    const abs = Math.abs(ms);
    if (abs < 60000) return sign + (abs / 1000).toFixed(1);
    return sign + toClock(abs, 0);
  }

  function textOf(node, tag) {
    const el = node.querySelector(tag);
    return el ? el.textContent : null;
  }

  // .lss xml -> internal run state
  function parse(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('not a valid .lss file');
    const run = doc.querySelector('Run');
    if (!run) throw new Error('no Run element');

    const segments = [];
    for (const seg of doc.querySelectorAll('Segments > Segment')) {
      const name = textOf(seg, 'Name') || '';
      let pbSplit = null;
      for (const st of seg.querySelectorAll('SplitTimes > SplitTime')) {
        if ((st.getAttribute('name') || '').toLowerCase() === 'personal best') {
          pbSplit = parseTime(textOf(st, 'RealTime'));
        }
      }
      const bestSegment = parseTime(textOf(seg, 'BestSegmentTime > RealTime'));
      segments.push({ name, pbSplit, bestSegment });
    }

    return {
      title: textOf(run, 'GameName') || 'Untitled',
      category: textOf(run, 'CategoryName') || '',
      attempts: Number(textOf(run, 'AttemptCount')) || 0,
      segments,
    };
  }

  function esc(s) {
    return String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  }

  // internal run state -> .lss xml
  function serialize(state) {
    const lines = [];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push('<Run version="1.7.0">');
    lines.push(`  <GameName>${esc(state.title || '')}</GameName>`);
    lines.push(`  <CategoryName>${esc(state.category || '')}</CategoryName>`);
    lines.push(`  <AttemptCount>${state.attempts || 0}</AttemptCount>`);
    lines.push('  <AttemptHistory />');
    lines.push('  <Segments>');
    for (const seg of state.segments || []) {
      lines.push('    <Segment>');
      lines.push(`      <Name>${esc(seg.name || '')}</Name>`);
      lines.push('      <SplitTimes>');
      if (seg.pbSplit != null) {
        lines.push(`        <SplitTime name="Personal Best"><RealTime>${toLssTime(seg.pbSplit)}</RealTime></SplitTime>`);
      } else {
        lines.push('        <SplitTime name="Personal Best" />');
      }
      lines.push('      </SplitTimes>');
      if (seg.bestSegment != null) {
        lines.push(`      <BestSegmentTime><RealTime>${toLssTime(seg.bestSegment)}</RealTime></BestSegmentTime>`);
      } else {
        lines.push('      <BestSegmentTime />');
      }
      lines.push('      <SegmentHistory />');
      lines.push('    </Segment>');
    }
    lines.push('  </Segments>');
    lines.push('</Run>');
    return lines.join('\n');
  }

  window.LSS = { parse, serialize, parseTime, toLssTime, toClock, toDelta };
})();
