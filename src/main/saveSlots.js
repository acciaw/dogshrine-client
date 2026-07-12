'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');

// save-slot manager: named snapshots of a save folder, swapped in/out safely
// (stage, move-aside, swap, cleanup, with rollback on failure)

function slotsRoot() {
  return path.join(app.getPath('userData'), 'slots');
}

function gameSlotsDir(gameId) {
  return path.join(slotsRoot(), gameId);
}

function manifestPath(gameId) {
  return path.join(gameSlotsDir(gameId), 'slots.json');
}

// keeps manifest.order in sync with manifest.slots; new/missing-order slots
// are prepended, most-recently-updated first
function normalizeOrder(manifest) {
  if (!Array.isArray(manifest.order)) {
    manifest.order = [...manifest.slots]
      .sort((a, b) => (a.updated < b.updated ? 1 : -1))
      .map((s) => s.id);
    return manifest;
  }
  const slotIds = new Set(manifest.slots.map((s) => s.id));
  const seen = new Set();
  const order = manifest.order.filter((id) => slotIds.has(id) && !seen.has(id) && seen.add(id));
  for (const slot of manifest.slots) {
    if (!seen.has(slot.id)) order.unshift(slot.id);
  }
  manifest.order = order;
  return manifest;
}

function readManifest(gameId) {
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath(gameId), 'utf8'));
  } catch {
    manifest = { activeSlotId: null, slots: [] };
  }
  if (!Array.isArray(manifest.slots)) manifest.slots = [];
  return normalizeOrder(manifest);
}

function writeManifest(gameId, manifest) {
  fs.mkdirSync(gameSlotsDir(gameId), { recursive: true });
  fs.writeFileSync(manifestPath(gameId), JSON.stringify(manifest, null, 2), 'utf8');
}

// copies srcDir's contents into destDir; missing/empty srcDir leaves destDir empty
function copyDirContents(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return;
  for (const entry of fs.readdirSync(srcDir)) {
    fs.cpSync(path.join(srcDir, entry), path.join(destDir, entry), { recursive: true });
  }
}

function isEmptyOrMissing(dir) {
  try {
    return fs.readdirSync(dir).length === 0;
  } catch {
    return true;
  }
}

// backup safety net, independent of slots: timestamped copy into userData/backups/<gameId>
function backupsRoot() {
  return path.join(app.getPath('userData'), 'backups');
}

function backupSaveDir(gameId, saveDir) {
  if (!saveDir || isEmptyOrMissing(saveDir)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(backupsRoot(), gameId, stamp);
  fs.mkdirSync(dest, { recursive: true });
  copyDirContents(saveDir, dest);
  return dest;
}

function dirSizeBytes(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    total += entry.isDirectory() ? dirSizeBytes(full) : fs.statSync(full).size;
  }
  return total;
}

// one entry per game with backups: snapshot count + total size, for the settings cleanup list
function getBackupStats() {
  const root = backupsRoot();
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root).flatMap((gameId) => {
    const gameDir = path.join(root, gameId);
    if (!fs.statSync(gameDir).isDirectory()) return [];
    const snapshots = fs.readdirSync(gameDir);
    if (snapshots.length === 0) return [];
    return [{ gameId, count: snapshots.length, bytes: dirSizeBytes(gameDir) }];
  });
}

function clearBackups(gameId) {
  fs.rmSync(path.join(backupsRoot(), gameId), { recursive: true, force: true });
}

// replaces targetDir's contents with sourceSnapshotDir's, rolls back on failure
function replaceSaveDir(targetDir, sourceSnapshotDir) {
  const parent = path.dirname(targetDir);
  fs.mkdirSync(parent, { recursive: true });

  // stages in a dir on the same filesystem so the final move is an atomic rename
  const staging = fs.mkdtempSync(path.join(parent, '.tobyslot-staging-'));
  try {
    copyDirContents(sourceSnapshotDir, staging);
  } catch (err) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw err;
  }

  const aside = `${targetDir}.tobyold-${Date.now()}`;
  let movedAside = false;
  if (fs.existsSync(targetDir)) {
    fs.renameSync(targetDir, aside);
    movedAside = true;
  }

  try {
    fs.renameSync(staging, targetDir);
  } catch (err) {
    // rolls back to the original save folder
    if (movedAside) {
      fs.rmSync(targetDir, { recursive: true, force: true });
      fs.renameSync(aside, targetDir);
    }
    fs.rmSync(staging, { recursive: true, force: true });
    throw err;
  }

  // success, discard the moved-aside original
  if (movedAside) fs.rmSync(aside, { recursive: true, force: true });
}

// public api

function listSlots(gameId) {
  return readManifest(gameId);
}

function createSlot(gameId, name, saveDir) {
  const manifest = readManifest(gameId);
  const id = crypto.randomUUID();
  const slotDir = path.join(gameSlotsDir(gameId), id);
  fs.mkdirSync(slotDir, { recursive: true });
  copyDirContents(saveDir, slotDir);

  const now = new Date().toISOString();
  const slot = { id, name: name.trim() || 'Untitled', created: now, updated: now };
  manifest.slots.push(slot);
  manifest.order.unshift(id);
  manifest.activeSlotId = id; // creating from current state makes it active
  writeManifest(gameId, manifest);
  return { manifest, slot };
}

// empty slot for a clean start; not made active since it isn't the live state
function createEmptySlot(gameId, name) {
  const manifest = readManifest(gameId);
  const id = crypto.randomUUID();
  fs.mkdirSync(path.join(gameSlotsDir(gameId), id), { recursive: true });

  const now = new Date().toISOString();
  const slot = { id, name: name.trim() || 'Empty slot', created: now, updated: now, empty: true };
  manifest.slots.push(slot);
  manifest.order.unshift(id);
  writeManifest(gameId, manifest);
  return { manifest, slot };
}

// re-snapshots into an existing slot
function updateSlot(gameId, slotId, saveDir) {
  const manifest = readManifest(gameId);
  const slot = manifest.slots.find((s) => s.id === slotId);
  if (!slot) throw new Error('Slot not found.');

  const slotDir = path.join(gameSlotsDir(gameId), slotId);
  // rebuilds from scratch so removed files don't linger
  fs.rmSync(slotDir, { recursive: true, force: true });
  fs.mkdirSync(slotDir, { recursive: true });
  copyDirContents(saveDir, slotDir);

  slot.updated = new Date().toISOString();
  writeManifest(gameId, manifest);
  return manifest;
}

function renameSlot(gameId, slotId, name) {
  const manifest = readManifest(gameId);
  const slot = manifest.slots.find((s) => s.id === slotId);
  if (!slot) throw new Error('Slot not found.');
  slot.name = name.trim() || slot.name;
  writeManifest(gameId, manifest);
  return manifest;
}

function deleteSlot(gameId, slotId) {
  const manifest = readManifest(gameId);
  manifest.slots = manifest.slots.filter((s) => s.id !== slotId);
  manifest.order = manifest.order.filter((id) => id !== slotId);
  if (manifest.activeSlotId === slotId) manifest.activeSlotId = null;
  fs.rmSync(path.join(gameSlotsDir(gameId), slotId), { recursive: true, force: true });
  writeManifest(gameId, manifest);
  return manifest;
}

// persists a user-chosen order; missing ids get appended, unknown ids dropped
function reorderSlots(gameId, orderedIds) {
  const manifest = readManifest(gameId);
  const slotIds = new Set(manifest.slots.map((s) => s.id));
  const seen = new Set();
  const order = orderedIds.filter((id) => slotIds.has(id) && !seen.has(id) && seen.add(id));
  for (const slot of manifest.slots) {
    if (!seen.has(slot.id)) order.push(slot.id);
  }
  manifest.order = order;
  writeManifest(gameId, manifest);
  return manifest;
}

// backs up the current folder first, then atomically swaps in the slot
function loadSlot(gameId, slotId, saveDir) {
  const manifest = readManifest(gameId);
  const slot = manifest.slots.find((s) => s.id === slotId);
  if (!slot) throw new Error('Slot not found.');

  const backupPath = backupSaveDir(gameId, saveDir);
  const slotDir = path.join(gameSlotsDir(gameId), slotId);
  replaceSaveDir(saveDir, slotDir);

  manifest.activeSlotId = slotId;
  writeManifest(gameId, manifest);
  return { manifest, backupPath };
}

module.exports = {
  listSlots,
  createSlot,
  createEmptySlot,
  updateSlot,
  renameSlot,
  deleteSlot,
  reorderSlots,
  loadSlot,
  backupSaveDir,
  getBackupStats,
  clearBackups,
  // exported for isolated testing
  _replaceSaveDir: replaceSaveDir,
  _copyDirContents: copyDirContents,
};
