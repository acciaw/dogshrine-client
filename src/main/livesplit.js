'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app, dialog } = require('electron');

// per-game splits storage. each game gets one json holding all its loaded
// splits (keyed by id) plus which one is selected, so pb/golds/attempts stick
// across restarts and undertale's splits never show under deltarune

function dir() {
  return path.join(app.getPath('userData'), 'livesplit');
}

function gameFile(gameId) {
  return path.join(dir(), `${gameId}.json`);
}

function readGame(gameId) {
  try {
    const data = JSON.parse(fs.readFileSync(gameFile(gameId), 'utf8'));
    if (!data.splits) data.splits = {};
    return data;
  } catch {
    return { selectedId: null, splits: {} };
  }
}

function writeGame(gameId, data) {
  fs.mkdirSync(dir(), { recursive: true });
  fs.writeFileSync(gameFile(gameId), JSON.stringify(data), 'utf8');
}

// [{ id, title, category }] for the dropdown
function items(gameId) {
  const g = readGame(gameId);
  return Object.entries(g.splits).map(([id, s]) => ({ id, title: s.title, category: s.category }));
}

// current game's selected run plus the list, for the overlay to load on show
function getSelected(gameId) {
  if (!gameId) return { selectedId: null, state: null, items: [] };
  const g = readGame(gameId);
  return { selectedId: g.selectedId, state: g.selectedId ? g.splits[g.selectedId] : null, items: items(gameId) };
}

// overwrites the selected run's state (pb/golds/attempts) as it plays
function saveState(gameId, state) {
  if (!gameId || !state) return { ok: false };
  const g = readGame(gameId);
  if (!g.selectedId || !g.splits[g.selectedId]) return { ok: false };
  g.splits[g.selectedId] = state;
  writeGame(gameId, g);
  return { ok: true };
}

// adds a freshly parsed .lss and makes it the selected one
function addState(gameId, state) {
  if (!gameId || !state) return { ok: false };
  const g = readGame(gameId);
  const id = crypto.randomUUID();
  g.splits[id] = state;
  g.selectedId = id;
  writeGame(gameId, g);
  return { ok: true, selectedId: id, state, items: items(gameId) };
}

// raw state for one split entry, used to export it regardless of selection
function getState(gameId, splitId) {
  const g = readGame(gameId);
  return g.splits[splitId] || null;
}

function select(gameId, splitId) {
  const g = readGame(gameId);
  if (!g.splits[splitId]) return { ok: false };
  g.selectedId = splitId;
  writeGame(gameId, g);
  return { ok: true, selectedId: splitId, state: g.splits[splitId], items: items(gameId) };
}

function remove(gameId, splitId) {
  const g = readGame(gameId);
  delete g.splits[splitId];
  if (g.selectedId === splitId) g.selectedId = Object.keys(g.splits)[0] || null;
  writeGame(gameId, g);
  return { ok: true, ...getSelected(gameId) };
}

// opens a .lss and hands its raw xml back to the renderer to parse
async function loadFile() {
  const res = await dialog.showOpenDialog({
    title: 'Load splits',
    properties: ['openFile'],
    filters: [
      { name: 'LiveSplit splits', extensions: ['lss'] },
      { name: 'All files', extensions: ['*'] },
    ],
  });
  if (res.canceled || res.filePaths.length === 0) return { ok: false, canceled: true };
  try {
    return { ok: true, path: res.filePaths[0], text: fs.readFileSync(res.filePaths[0], 'utf8') };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// writes renderer-serialized .lss xml to a user-chosen path
async function saveFile(defaultName, text) {
  const res = await dialog.showSaveDialog({
    title: 'Export splits',
    defaultPath: `${defaultName || 'splits'}.lss`,
    filters: [{ name: 'LiveSplit splits', extensions: ['lss'] }],
  });
  if (res.canceled || !res.filePath) return { ok: false, canceled: true };
  try {
    fs.writeFileSync(res.filePath, text, 'utf8');
    return { ok: true, path: res.filePath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { getSelected, saveState, addState, getState, select, remove, items, loadFile, saveFile };
