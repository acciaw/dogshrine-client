'use strict';

// save-slot manager screen: shares setStatus, scan, libraryEl, and el from renderer.js

const slotsScreen = document.getElementById('slots-screen');
const slotsTitle = document.getElementById('slots-title');
const slotsSavePath = document.getElementById('slots-savepath');
const slotsBanner = document.getElementById('slots-banner');
const slotsCloudWarning = document.getElementById('slots-cloud-warning');
const slotsList = document.getElementById('slots-list');
const slotsNewName = document.getElementById('slots-new-name');
const slotsCreateBtn = document.getElementById('slots-create-btn');
const slotsEmptyBtn = document.getElementById('slots-empty-btn');
const slotsBackBtn = document.getElementById('slots-back');

let slotsGameId = null;
let slotsGameName = null;

function slotsShowBanner(msg, kind) {
  slotsBanner.textContent = msg;
  slotsBanner.className = `banner ${kind || ''}`;
}

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function slotRow(slot, activeId, position, total) {
  const li = el('li', 'slot-item');
  const isActive = slot.id === activeId;

  const reorder = el('div', 'slot-reorder');
  const upBtn = el('button', 'ghost slot-reorder-btn', '▲');
  upBtn.title = 'Move up';
  upBtn.disabled = position === 0;
  upBtn.onclick = () => slotsMove(slot, -1);
  const downBtn = el('button', 'ghost slot-reorder-btn', '▼');
  downBtn.title = 'Move down';
  downBtn.disabled = position === total - 1;
  downBtn.onclick = () => slotsMove(slot, 1);
  reorder.append(upBtn, downBtn);

  const info = el('div', 'slot-info');
  const nameLine = el('div', 'slot-name');
  nameLine.append(el('span', null, slot.name));
  if (isActive) nameLine.append(el('span', 'slot-active-badge', 'loaded'));
  if (slot.empty) nameLine.append(el('span', 'slot-empty-badge', 'empty / fresh start'));
  info.append(nameLine);
  info.append(
    el('div', 'slot-meta', `created ${fmtDate(slot.created)}  ·  updated ${fmtDate(slot.updated)}`)
  );

  const actions = el('div', 'slot-actions');

  const loadBtn = el('button', 'primary', 'Load');
  loadBtn.onclick = () => slotsLoad(slot);

  const updateBtn = el('button', null, 'Overwrite with current');
  updateBtn.title = 'Re-snapshot your live save into this slot';
  updateBtn.onclick = () => slotsUpdate(slot);

  const renameBtn = el('button', 'ghost', 'Rename');
  renameBtn.onclick = () => slotsBeginRename(slot, nameLine);

  const deleteBtn = el('button', 'ghost', 'Delete');
  deleteBtn.onclick = () => slotsDelete(slot);

  actions.append(loadBtn, updateBtn, renameBtn, deleteBtn);
  li.append(reorder, info, actions);
  return li;
}

let slotsCurrentManifest = null;

function renderSlots(manifest) {
  slotsCurrentManifest = manifest;
  slotsList.replaceChildren();
  if (manifest.slots.length === 0) {
    slotsList.append(el('li', 'ut-hint', 'No slots yet. Save your current state above to make one.'));
    return;
  }
  const byId = new Map(manifest.slots.map((s) => [s.id, s]));
  const ordered = manifest.order.map((id) => byId.get(id)).filter(Boolean);
  ordered.forEach((slot, i) => {
    slotsList.append(slotRow(slot, manifest.activeSlotId, i, ordered.length));
  });
}

async function slotsMove(slot, delta) {
  const order = [...slotsCurrentManifest.order];
  const i = order.indexOf(slot.id);
  const j = i + delta;
  if (i === -1 || j < 0 || j >= order.length) return;
  [order[i], order[j]] = [order[j], order[i]];

  const res = await window.toby.slotsReorder(slotsGameId, order);
  if (!res.ok) {
    slotsShowBanner(`Reorder failed: ${res.error}`, 'bad');
    return;
  }
  renderSlots(res.manifest);
}

async function openSlots(game) {
  slotsGameId = game.id;
  slotsGameName = game.name;
  slotsTitle.textContent = `${game.name} — save slots`;
  slotsCloudWarning.classList.toggle('hidden', !game.steamAppId);

  const res = await window.toby.slotsOpen(game.id);
  if (!res.ok) {
    setStatus(res.error, 'bad');
    return;
  }
  slotsSavePath.textContent = res.saveDir;
  slotsSavePath.title = res.saveDir;
  slotsShowBanner('', '');
  renderSlots(res.manifest);

  libraryEl.classList.add('hidden');
  slotsScreen.classList.remove('hidden');
}

async function slotsCreate() {
  const name = slotsNewName.value.trim();
  if (!name) {
    slotsShowBanner('Give the slot a name first.', 'warn');
    slotsNewName.focus();
    return;
  }
  const res = await window.toby.slotsCreate(slotsGameId, name);
  if (!res.ok) {
    slotsShowBanner(res.error, 'bad');
    return;
  }
  slotsNewName.value = '';
  slotsShowBanner(`Saved current state as “${name}”.`, 'ok');
  renderSlots(res.manifest);
}

async function slotsCreateEmpty() {
  const name = slotsNewName.value.trim() || 'Empty slot';
  const res = await window.toby.slotsCreateEmpty(slotsGameId, name);
  if (!res.ok) {
    slotsShowBanner(res.error, 'bad');
    return;
  }
  slotsNewName.value = '';
  slotsShowBanner(`Created empty slot “${name}”. Load it to start ${slotsGameName} from scratch.`, 'ok');
  renderSlots(res.manifest);
}

async function slotsLoad(slot) {
  const { confirmed } = await window.toby.confirmDialog({
    message: `Load “${slot.name}” into ${slotsGameName}?`,
    detail:
      `This replaces your current live save with this slot. Your current ` +
      `save is backed up automatically first.\n\n` +
      `Make sure ${slotsGameName} is closed before continuing.`,
    confirmLabel: 'Load',
  });
  if (!confirmed) return;

  const res = await window.toby.slotsLoad(slotsGameId, slot.id);
  if (!res.ok) {
    slotsShowBanner(`Load failed: ${res.error}`, 'bad');
    return;
  }
  slotsShowBanner(`Loaded “${slot.name}”. Previous save backed up.`, 'ok');
  renderSlots(res.manifest);
}

async function slotsUpdate(slot) {
  const { confirmed } = await window.toby.confirmDialog({
    message: `Overwrite “${slot.name}” with your current live save?`,
    detail: `The slot's previous contents will be replaced.`,
    confirmLabel: 'Overwrite',
  });
  if (!confirmed) return;

  const res = await window.toby.slotsUpdate(slotsGameId, slot.id);
  if (!res.ok) {
    slotsShowBanner(`Update failed: ${res.error}`, 'bad');
    return;
  }
  slotsShowBanner(`Updated “${slot.name}” with current save.`, 'ok');
  renderSlots(res.manifest);
}

function slotsBeginRename(slot, nameLine) {
  const input = el('input', 'ut-input');
  input.type = 'text';
  input.value = slot.name;
  const commit = async () => {
    const newName = input.value.trim();
    if (!newName || newName === slot.name) {
      const res = await window.toby.slotsOpen(slotsGameId);
      if (res.ok) renderSlots(res.manifest);
      return;
    }
    const res = await window.toby.slotsRename(slotsGameId, slot.id, newName);
    if (!res.ok) {
      slotsShowBanner(`Rename failed: ${res.error}`, 'bad');
      return;
    }
    renderSlots(res.manifest);
  };
  input.onblur = commit;
  input.onkeydown = (e) => {
    if (e.key === 'Enter') input.blur();
    if (e.key === 'Escape') {
      input.value = slot.name;
      input.blur();
    }
  };
  nameLine.replaceChildren(input);
  input.focus();
  input.select();
}

async function slotsDelete(slot) {
  const { confirmed } = await window.toby.confirmDialog({
    message: `Delete the slot “${slot.name}”?`,
    detail: `This can't be undone.`,
    confirmLabel: 'Delete',
    danger: true,
  });
  if (!confirmed) return;
  const res = await window.toby.slotsDelete(slotsGameId, slot.id);
  if (!res.ok) {
    slotsShowBanner(`Delete failed: ${res.error}`, 'bad');
    return;
  }
  slotsShowBanner(`Deleted “${slot.name}”.`, '');
  renderSlots(res.manifest);
}

function slotsClose() {
  slotsScreen.classList.add('hidden');
  libraryEl.classList.remove('hidden');
  scan();
}

slotsBackBtn.onclick = slotsClose;
slotsCreateBtn.onclick = slotsCreate;
slotsEmptyBtn.onclick = slotsCreateEmpty;
slotsNewName.onkeydown = (e) => {
  if (e.key === 'Enter') slotsCreate();
};
