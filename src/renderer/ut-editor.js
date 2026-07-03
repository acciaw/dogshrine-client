'use strict';

// native undertale save editor (file0/file1/file2 + undertale.ini)
// shares setStatus and scan from renderer.js

const utEditorEl = document.getElementById('ut-editor');
const utBody = document.getElementById('ut-body');
const utBanner = document.getElementById('ut-banner');
const utSavePath = document.getElementById('ut-savepath');
const utSlotTabs = document.getElementById('ut-slot-tabs');
const utBackBtn = document.getElementById('ut-back');
const utSaveBtn = document.getElementById('ut-save');

let utOptions = null; // cached static lookup tables from main
let utSaveDir = null;
let utFiles = [];
let utHasIni = false;
let utActiveTab = null; // absolute file path, or 'ini'

// state for whichever tab is currently loaded
let utSlotRaw = null; // raw line array for the active slot file
let utIniText = null; // original undertale.ini text
let utIniOriginal = null; // parsed ini fields snapshot at load time

function utShowBanner(msg, kind) {
  utBanner.textContent = msg;
  utBanner.className = `banner ${kind || ''}`;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function utRow(labelText, input) {
  const row = el('label', 'ut-row');
  row.append(el('span', 'ut-row-label', labelText), input);
  return row;
}

function utNumberInput(id, value, opts = {}) {
  const input = el('input', 'ut-input');
  input.type = 'number';
  input.id = id;
  input.value = value;
  if (opts.min !== undefined) input.min = opts.min;
  if (opts.max !== undefined) input.max = opts.max;
  return input;
}

function utTextInput(id, value) {
  const input = el('input', 'ut-input');
  input.type = 'text';
  input.id = id;
  input.value = value;
  return input;
}

function utSelect(id, options, value) {
  const select = el('select', 'ut-input');
  select.id = id;
  for (const opt of options) {
    const o = el('option', null, opt.label);
    o.value = opt.value;
    select.append(o);
  }
  select.value = String(value);
  return select;
}

function utItemSelect(id, value) {
  return utSelect(
    id,
    utOptions.itemNames.map((label, i) => ({ value: i, label: `${i} — ${label}` })),
    value
  );
}

function utGroup(title) {
  const fieldset = el('fieldset', 'ut-group');
  fieldset.append(el('legend', null, title));
  return fieldset;
}

function utFmtTime(frames) {
  const totalSeconds = Math.floor(frames / 30); // game runs at 30fps
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

// slot (file0/file1/file2) form

function utRenderSlotForm(fields) {
  utBody.replaceChildren();

  const presets = utGroup('Presets — load a verified save state');
  const presetSelect = utSelect(
    'ut-f-preset-select',
    [{ value: '', label: '— choose a preset —' }, ...utOptions.presets.map((p) => ({ value: p.id, label: p.label }))],
    ''
  );
  const loadPresetBtn = el('button', 'ghost', 'Load preset');
  loadPresetBtn.id = 'ut-f-preset-load-btn';
  loadPresetBtn.type = 'button';
  loadPresetBtn.onclick = async () => {
    if (!presetSelect.value) return;
    const opt = utOptions.presets.find((p) => p.id === presetSelect.value);
    const { confirmed } = await window.toby.confirmDialog({
      message: `Load "${opt.label}"?`,
      detail:
        'This replaces every field below — stats, equipment, inventory, room, plot, and kill ' +
        'counters — with a complete, verified save state for that point in the game (only Name ' +
        'is kept). Your current edits in this tab will be lost. undertale.ini is never touched by ' +
        'this; edit it manually via its own tab if needed.',
      confirmLabel: 'Load preset',
    });
    if (!confirmed) return;
    const currentName = document.getElementById('ut-f-name').value;
    const res = await window.toby.undertaleLoadPreset(presetSelect.value, currentName);
    if (!res.ok) {
      utShowBanner(`Couldn't load preset: ${res.error}`, 'bad');
      return;
    }
    utSlotRaw = res.raw;
    utRenderSlotForm(res.fields);
    utShowBanner(`Loaded preset "${opt.label}" — click Save to write it to ${utBaseName(utActiveTab)}.`, 'ok');
  };
  presets.append(presetSelect, loadPresetBtn);
  utBody.append(presets);

  const stats = utGroup('Stats');
  const lvInput = utNumberInput('ut-f-lv', fields.lv, { min: 1, max: 20 });
  const maxHpInput = utNumberInput('ut-f-maxHp', fields.maxHp, { min: 1 });
  stats.append(
    utRow('Name', utTextInput('ut-f-name', fields.name)),
    utRow('LV', lvInput),
    utRow('Max HP', maxHpInput),
    utRow('EXP', utNumberInput('ut-f-exp', fields.exp, { min: 0 })),
    utRow('Gold', utNumberInput('ut-f-gold', fields.gold, { min: 0 }))
  );
  utBody.append(stats);

  const equip = utGroup('Equipment');
  const atInput = utNumberInput('ut-f-at', fields.at, { min: 0 });
  const weaponSelect = utSelect('ut-f-weapon', utOptions.weaponOptions, fields.weapon);
  const weaponAt = utNumberInput('ut-f-weaponAt', fields.weaponAt, { min: 0 });
  weaponSelect.onchange = () => {
    const match = utOptions.weaponOptions.find((w) => String(w.value) === weaponSelect.value);
    if (match) weaponAt.value = match.at;
  };
  const dfInput = utNumberInput('ut-f-df', fields.df, { min: 0 });
  const armorSelect = utSelect('ut-f-armor', utOptions.armorOptions, fields.armor);
  const armorDf = utNumberInput('ut-f-armorDf', fields.armorDf, { min: 0 });
  armorSelect.onchange = () => {
    const match = utOptions.armorOptions.find((a) => String(a.value) === armorSelect.value);
    if (match) armorDf.value = match.df;
  };
  equip.append(
    utRow('Base AT', atInput),
    utRow('Weapon', weaponSelect),
    utRow('Weapon AT', weaponAt),
    utRow('Base DF', dfInput),
    utRow('Armor', armorSelect),
    utRow('Armor DF', armorDf)
  );
  utBody.append(equip);

  const inventory = utGroup('Inventory');
  const inventorySelects = fields.inventory.map((value, i) => utItemSelect(`ut-f-inv-${i}`, value));
  inventorySelects.forEach((select, i) => {
    inventory.append(utRow(`Slot ${i + 1}`, select));
  });
  utBody.append(inventory);

  const boxA = utGroup('Dimensional Box A');
  fields.boxA.forEach((value, i) => {
    boxA.append(utRow(`Slot ${i + 1}`, utItemSelect(`ut-f-boxA-${i}`, value)));
  });
  utBody.append(boxA);

  const boxB = utGroup('Dimensional Box B');
  fields.boxB.forEach((value, i) => {
    boxB.append(utRow(`Slot ${i + 1}`, utItemSelect(`ut-f-boxB-${i}`, value)));
  });
  utBody.append(boxB);

  const progress = utGroup('Progress');
  const roomNum = utNumberInput('ut-f-room', fields.room, { min: 0 });
  const roomSelect = utSelect(
    'ut-f-room-select',
    [{ value: '', label: '— jump to a room —' }, ...utOptions.roomOptions],
    ''
  );
  roomSelect.onchange = () => {
    if (roomSelect.value !== '') roomNum.value = roomSelect.value;
  };
  const plotNum = utNumberInput('ut-f-plot', fields.plot, { min: 0 });
  const timeNum = utNumberInput('ut-f-time', fields.timeFrames, { min: 0 });
  const timeDisplay = el('span', 'ut-hint', utFmtTime(fields.timeFrames));
  timeNum.oninput = () => {
    timeDisplay.textContent = utFmtTime(Number(timeNum.value) || 0);
  };

  progress.append(
    utRow('Room', roomNum),
    utRow('', roomSelect),
    utRow('Plot', plotNum),
    utRow(
      '',
      el(
        'span',
        'ut-hint',
        '"Plot" isn’t a clean story-progress index — it’s increased by varying, ' +
          'event-specific amounts, so there’s no reliable "jump to story beat N" mapping for ' +
          'it. Use the Presets group above for verified jumps.'
      )
    ),
    utRow('Play time (frames)', timeNum),
    utRow('≈ Play time', timeDisplay),
    utRow('"fun" seed', utNumberInput('ut-f-fun', fields.fun, { min: 1, max: 100 })),
    utRow('Kills (current room)', utNumberInput('ut-f-kills', fields.kills, { min: 0 })),
    utRow('Kills (total)', utNumberInput('ut-f-totalKills', fields.totalKills, { min: 0 }))
  );
  utBody.append(progress);
}

function utReadSlotFormValues() {
  const val = (id) => document.getElementById(id).value;
  const num = (id) => parseInt(val(id), 10) || 0;
  return {
    name: val('ut-f-name'),
    lv: num('ut-f-lv'),
    maxHp: num('ut-f-maxHp'),
    at: num('ut-f-at'),
    weaponAt: num('ut-f-weaponAt'),
    df: num('ut-f-df'),
    armorDf: num('ut-f-armorDf'),
    exp: num('ut-f-exp'),
    gold: num('ut-f-gold'),
    kills: num('ut-f-kills'),
    totalKills: num('ut-f-totalKills'),
    weapon: num('ut-f-weapon'),
    armor: num('ut-f-armor'),
    fun: num('ut-f-fun'),
    plot: num('ut-f-plot'),
    room: num('ut-f-room'),
    timeFrames: num('ut-f-time'),
    inventory: Array.from({ length: 8 }, (_, i) => num(`ut-f-inv-${i}`)),
    boxA: Array.from({ length: 10 }, (_, i) => num(`ut-f-boxA-${i}`)),
    boxB: Array.from({ length: 10 }, (_, i) => num(`ut-f-boxB-${i}`)),
  };
}

// undertale.ini form

function utRenderIniForm(fields) {
  utBody.replaceChildren();

  for (const { section, fields: defs } of utOptions.iniSections) {
    const group = utGroup(section);
    for (const def of defs) {
      const id = `ut-ini-${section}-${def.key}`;
      const current = fields[section][def.key];
      let input;
      if (def.type === 'bool') {
        input = el('input', 'ut-checkbox');
        input.type = 'checkbox';
        input.id = id;
        input.checked = Boolean(current);
      } else if (def.type === 'text') {
        input = utTextInput(id, current);
      } else {
        input = utNumberInput(id, current, { min: 0 });
      }
      input.dataset.section = section;
      input.dataset.key = def.key;
      input.dataset.type = def.type;
      group.append(utRow(def.label, input));
    }
    utBody.append(group);
  }
}

function utReadIniFormValues() {
  const result = {};
  for (const { section, fields: defs } of utOptions.iniSections) {
    result[section] = {};
    for (const def of defs) {
      const input = document.getElementById(`ut-ini-${section}-${def.key}`);
      if (def.type === 'bool') result[section][def.key] = input.checked;
      else if (def.type === 'text') result[section][def.key] = input.value;
      else result[section][def.key] = parseInt(input.value, 10) || 0;
    }
  }
  return result;
}

// tabs / loading

function utBaseName(filePath) {
  return filePath.split(/[\\/]/).pop();
}

async function utLoadSlot(filePath) {
  utActiveTab = filePath;
  const res = await window.toby.undertaleReadSlot(filePath);
  if (!res.ok) {
    utShowBanner(`Couldn't read ${utBaseName(filePath)}: ${res.error}`, 'bad');
    return;
  }
  utSlotRaw = res.raw;
  utRenderSlotForm(res.fields);
}

async function utLoadIni() {
  utActiveTab = 'ini';
  const res = await window.toby.undertaleReadIni(utSaveDir);
  if (!res.ok) {
    utShowBanner(`Couldn't read undertale.ini: ${res.error}`, 'bad');
    return;
  }
  utIniText = res.text;
  utIniOriginal = res.fields;
  utRenderIniForm(res.fields);
}

function utSyncActiveTabClass() {
  utSlotTabs.querySelectorAll('.tab-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.tabKey === utActiveTab);
  });
}

function utAddTab(label, key, onClick) {
  const btn = el('button', 'tab-btn', label);
  btn.dataset.tabKey = key;
  btn.onclick = async () => {
    await onClick();
    utSyncActiveTabClass();
  };
  utSlotTabs.append(btn);
  return btn;
}

function utRenderTabs() {
  utSlotTabs.replaceChildren();

  let first = null;
  for (const filePath of utFiles) {
    const btn = utAddTab(utBaseName(filePath), filePath, () => utLoadSlot(filePath));
    first = first || btn;
  }
  if (utHasIni) {
    const btn = utAddTab('undertale.ini', 'ini', utLoadIni);
    first = first || btn;
  }

  const pickBtn = utAddTab('Open file…', 'pick', async () => {
    const picked = await window.toby.undertalePickSaveFile(utSaveDir);
    if (!picked.ok) return; // cancelled, leave the active tab as it was
    pickBtn.textContent = utBaseName(picked.filePath);
    pickBtn.dataset.tabKey = picked.filePath;
    await utLoadSlot(picked.filePath);
  });
  first = first || pickBtn;

  if (first) {
    first.onclick();
  }
}

async function openUndertaleEditor(game) {
  if (!utOptions) {
    utOptions = await window.toby.undertaleGetOptions();
  }

  const res = await window.toby.undertaleOpen(game.id);
  if (!res.ok) {
    setStatus(res.error, 'bad');
    return;
  }

  utSaveDir = res.saveDir;
  utFiles = res.files;
  utHasIni = res.hasIni;
  utSavePath.textContent = utSaveDir;
  utSavePath.title = utSaveDir;

  if (res.backupPath) {
    utShowBanner('Backed up your current saves before opening.', 'ok');
  } else {
    utShowBanner('Save folder was empty — nothing to back up yet.', '');
  }

  utRenderTabs();

  libraryEl.classList.add('hidden');
  utEditorEl.classList.remove('hidden');
}

async function utSave() {
  if (utActiveTab === 'ini') {
    const edited = utReadIniFormValues();
    const res = await window.toby.undertaleWriteIni(utSaveDir, utIniText, utIniOriginal, edited);
    if (res.ok) {
      utIniOriginal = edited;
      utShowBanner('undertale.ini saved.', 'ok');
    } else {
      utShowBanner(`Save failed: ${res.error}`, 'bad');
    }
    return;
  }

  if (utActiveTab) {
    const fields = utReadSlotFormValues();
    const res = await window.toby.undertaleWriteSlot(utActiveTab, utSlotRaw, fields);
    if (res.ok) utShowBanner(`${utBaseName(utActiveTab)} saved.`, 'ok');
    else utShowBanner(`Save failed: ${res.error}`, 'bad');
  }
}

function utClose() {
  utEditorEl.classList.add('hidden');
  libraryEl.classList.remove('hidden');
  scan();
}

utBackBtn.onclick = utClose;
utSaveBtn.onclick = utSave;
