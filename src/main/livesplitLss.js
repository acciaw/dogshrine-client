'use strict';

// main-process .lss parse/serialize, a port of renderer/overlay/lss.js. the
// renderer uses DOMParser, which the main process lacks, so this uses focused
// regex extraction instead. used by the native overlay's in-game load/export

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

function unesc(s) {
  return String(s == null ? '' : s)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}

function tagText(xml, tag) {
  const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(xml);
  return m ? unesc(m[1]) : null;
}

// .lss xml -> internal run state (same shape as the renderer parser)
function parse(xmlText) {
  if (!/<Run[\s>]/.test(xmlText)) throw new Error('not a valid .lss file');
  const title = tagText(xmlText, 'GameName') || 'Untitled';
  const category = tagText(xmlText, 'CategoryName') || '';
  const attempts = Number(tagText(xmlText, 'AttemptCount')) || 0;

  const segments = [];
  const segRe = /<Segment>([\s\S]*?)<\/Segment>/g;
  let sm;
  while ((sm = segRe.exec(xmlText))) {
    // drop the per-attempt history so its RealTimes can't be mistaken for the pb/gold
    const seg = sm[1].replace(/<SegmentHistory>[\s\S]*?<\/SegmentHistory>/g, '');
    const name = tagText(seg, 'Name') || '';
    let pbSplit = null;
    const pbRe = /<SplitTime name="Personal Best"[^>]*>([\s\S]*?)<\/SplitTime>/i.exec(seg);
    if (pbRe) pbSplit = parseTime(tagText(pbRe[1], 'RealTime'));
    let bestSegment = null;
    const bestRe = /<BestSegmentTime>([\s\S]*?)<\/BestSegmentTime>/i.exec(seg);
    if (bestRe) bestSegment = parseTime(tagText(bestRe[1], 'RealTime'));
    segments.push({ name, pbSplit, bestSegment });
  }
  return { title, category, attempts, segments };
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

module.exports = { parse, serialize, parseTime, toLssTime };
