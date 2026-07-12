'use strict';

// livesplit splits manager screen: shares setStatus, libraryEl, and el from renderer.js

const splitsScreen = document.getElementById('splits-screen');
const splitsTitle = document.getElementById('splits-title');
const splitsBanner = document.getElementById('splits-banner');
const splitsList = document.getElementById('splits-list');
const splitsImportBtn = document.getElementById('splits-import-btn');
const splitsBackBtn = document.getElementById('splits-back');

let splitsGameId = null;
let splitsGameName = null;

function splitsShowBanner(msg, kind) {
  splitsBanner.textContent = msg;
  splitsBanner.className = `banner ${kind || ''}`;
}

function splitsRow(item, selectedId) {
  const li = el('li', 'slot-item');
  const isActive = item.id === selectedId;

  const info = el('div', 'slot-info');
  const nameLine = el('div', 'slot-name');
  nameLine.append(el('span', null, item.category ? `${item.title} — ${item.category}` : item.title));
  if (isActive) nameLine.append(el('span', 'slot-active-badge', 'current'));
  info.append(nameLine);

  const actions = el('div', 'slot-actions');

  if (!isActive) {
    const setBtn = el('button', null, 'Set as current');
    setBtn.onclick = () => splitsSelect(item);
    actions.append(setBtn);
  }

  const exportBtn = el('button', 'ghost', 'Export');
  exportBtn.onclick = () => splitsExport(item);

  const removeBtn = el('button', 'ghost', 'Remove');
  removeBtn.onclick = () => splitsRemove(item);

  actions.append(exportBtn, removeBtn);
  li.append(info, actions);
  return li;
}

let splitsCurrentInfo = null;

function renderSplitsList(info) {
  splitsCurrentInfo = info;
  splitsList.replaceChildren();
  if (!info.items || info.items.length === 0) {
    splitsList.append(el('li', 'ut-hint', 'No splits loaded yet. Import a .lss to get started.'));
    return;
  }
  for (const item of info.items) {
    splitsList.append(splitsRow(item, info.selectedId));
  }
}

async function openSplits(game) {
  splitsGameId = game.id;
  splitsGameName = game.name;
  splitsTitle.textContent = `${game.name} — LiveSplit splits`;
  splitsShowBanner('', '');

  const info = await window.toby.livesplitManageList(splitsGameId);
  renderSplitsList(info);

  libraryEl.classList.add('hidden');
  splitsScreen.classList.remove('hidden');
}

async function splitsImport() {
  const r = await window.toby.livesplitLoadFile();
  if (!r || !r.ok) return;
  let state;
  try {
    state = window.LSS.parse(r.text);
  } catch (err) {
    splitsShowBanner(`Could not read that .lss: ${err.message}`, 'bad');
    return;
  }
  const res = await window.toby.livesplitManageAdd(splitsGameId, state);
  if (!res.ok) {
    splitsShowBanner('Import failed.', 'bad');
    return;
  }
  splitsShowBanner(`Imported “${state.title}${state.category ? ` — ${state.category}` : ''}” and set it as current.`, 'ok');
  renderSplitsList({ items: res.items, selectedId: res.selectedId });
}

async function splitsSelect(item) {
  const res = await window.toby.livesplitManageSelect(splitsGameId, item.id);
  if (!res.ok) {
    splitsShowBanner('Could not switch splits.', 'bad');
    return;
  }
  splitsShowBanner(`“${item.title}” is now current for ${splitsGameName}.`, 'ok');
  renderSplitsList({ items: res.items, selectedId: res.selectedId });
}

async function splitsExport(item) {
  const state = await window.toby.livesplitManageGetState(splitsGameId, item.id);
  if (!state) {
    splitsShowBanner('Could not read that split.', 'bad');
    return;
  }
  const res = await window.toby.livesplitExport(state.title || 'splits', window.LSS.serialize(state));
  if (res && res.ok) splitsShowBanner(`Exported to ${res.path}.`, 'ok');
}

async function splitsRemove(item) {
  const { confirmed } = await window.toby.confirmDialog({
    message: `Remove “${item.title}${item.category ? ` — ${item.category}` : ''}”?`,
    detail: `This deletes its saved pb, best segments and attempt count. This can't be undone.`,
    confirmLabel: 'Remove',
    danger: true,
  });
  if (!confirmed) return;
  const res = await window.toby.livesplitManageRemove(splitsGameId, item.id);
  splitsShowBanner(`Removed “${item.title}”.`, '');
  renderSplitsList({ items: res.items, selectedId: res.selectedId });
}

function splitsClose() {
  splitsScreen.classList.add('hidden');
  libraryEl.classList.remove('hidden');
}

splitsBackBtn.onclick = splitsClose;
splitsImportBtn.onclick = splitsImport;
