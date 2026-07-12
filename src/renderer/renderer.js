'use strict';

const libraryEl = document.getElementById('library');
const editorEl = document.getElementById('editor');
const gamesEl = document.getElementById('games');
const statusEl = document.getElementById('status');
const refreshBtn = document.getElementById('refresh');

// editor screen elements
const editorView = document.getElementById('editor-view');
const editorTitle = document.getElementById('editor-title');
const editorSavePath = document.getElementById('editor-savepath');
const editorBanner = document.getElementById('editor-banner');
const backBtn = document.getElementById('editor-back');
const openFolderBtn = document.getElementById('editor-openfolder');
const copyPathBtn = document.getElementById('editor-copypath');
const reloadBtn = document.getElementById('editor-reload');

let currentSaveDir = null;

function setStatus(msg, kind) {
  statusEl.textContent = msg || '';
  statusEl.style.color = kind === 'bad' ? 'var(--bad)' : kind === 'ok' ? 'var(--ok)' : 'var(--muted)';
}

// icons (inline svg, themed via currentColor)

const ICON = {
  folder:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  steam:
    '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9.5" cy="14.5" r="3.3"/><circle cx="16" cy="8" r="2.6"/><path stroke="currentColor" stroke-width="1.6" d="M11.8 12.6 14 9.8"/></svg>',
  exe:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/></svg>',
  barrier:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M6 6l12 12"/></svg>',
  chevron:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
  plus:
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6V4Z"/></svg>',
  // from pixelarticons (mit, see src/img/icons/LICENSE-pixelarticons.txt)
  play:
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M15 11h-2V9h2zm0 4h-2v-2h2zm-2 2h-2v-2h2zm0-8h-2V7h2zm-2-2H9V5h2zM9 21H7V3h2zm6-8h2v-2h-2zm-6 4h2v2H9z"/></svg>',
  download:
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 15v4h-2v-4zm-2 4v2H5v-2zM5 15v4H3v-4zm8-12v14h-2V3z"/><path d="M7 11v2h10v-2zm2 2v2h2v-2zm4 0v2h2v-2z"/><path d="M15 11v2h2v-2z"/></svg>',
  save:
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 22H4V20H6V14H8V20H16V14H18V20H20V22ZM4 20H2V4H4V20ZM22 20H20V6H22V20ZM16 14H8V12H16V14ZM12 10H6V6H12V10ZM20 6H18V4H20V6ZM18 4H4V2H18V4Z"/></svg>',
  edit:
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 2h-2v2h-2v2h-2v2h-2v2H8v2H6v2H4v2H2v6h6v-2h2v-2h2v-2h2v-2h2v-2h2v-2h2V8h2V6h-2V4h-2V2zm0 8h-2v2h-2v2h-2v2h-2v2H8v-2H6v-2h2v-2h2v-2h2V8h2V6h2v2h2v2zM6 16H4v4h4v-2H6v-2z"/></svg>',
  slots:
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 2h16v2H4zm2 5h2v2H6zm4 0h8v2h-8zm-4 4h2v2H6zm4 0h8v2h-8zm-4 4h2v2H6zm4 0h8v2h-8zm-6 5h16v2H4zM2 4h2v16H2zm18 0h2v16h-2z"/></svg>',
};

function iconSpan(svg, className) {
  const span = el('span', `icon ${className || ''}`);
  span.innerHTML = svg;
  return span;
}

// dropdown menus

function closeAllMenus() {
  document.querySelectorAll('.menu').forEach((m) => m.classList.add('hidden'));
}
document.addEventListener('click', closeAllMenus);

function makeMenu(triggerEl, items) {
  const wrap = el('div', 'menu-wrap');
  const menu = el('div', 'menu hidden');
  for (const item of items) {
    if (!item) continue;
    const mi = el('button', 'menu-item');
    if (item.icon) mi.append(iconSpan(item.icon));
    mi.append(document.createTextNode(item.label));
    if (item.disabled) mi.disabled = true;
    mi.onclick = (e) => {
      e.stopPropagation();
      closeAllMenus();
      item.onClick();
    };
    menu.append(mi);
  }
  triggerEl.onclick = (e) => {
    e.stopPropagation();
    const wasOpen = !menu.classList.contains('hidden');
    closeAllMenus();
    if (!wasOpen) menu.classList.remove('hidden');
  };
  wrap.append(triggerEl, menu);
  return wrap;
}

// library

const CATEGORIES = [
  { id: 'official', label: 'Official' },
  { id: 'fangame', label: 'Fan Games' },
];
const collapsedCategories = new Set();

function sourceBadge(game) {
  if (!game.executable) return { svg: ICON.barrier, label: 'Not found', kind: 'missing' };
  if (game.needsSteamLaunch) return { svg: ICON.steam, label: 'Steam', kind: 'steam' };
  return { svg: ICON.exe, label: game.source === 'manual' ? 'Executable (manual)' : 'Executable', kind: 'exe' };
}

const LOGO = {
  undertale: '../img/official/ut.png',
  deltarune: '../img/official/dr.png',
  'undertale-yellow': '../img/fangames/uty.png',
};

function card(game) {
  const found = Boolean(game.executable);
  const root = el('section', 'card');

  // top: logo + text column
  const top = el('div', 'card-top');

  const logo = el('div', 'logo');
  logo.dataset.cat = game.category;
  const logoSrc = LOGO[game.id];
  if (logoSrc) {
    const img = document.createElement('img');
    img.src = logoSrc;
    img.alt = `${game.name} logo`;
    img.onerror = () => {
      logo.replaceChildren();
      logo.textContent = game.name.charAt(0);
    };
    logo.append(img);
  } else {
    logo.textContent = game.name.charAt(0);
  }

  const text = el('div', 'card-text');

  const titleRow = el('div', 'title-row');
  titleRow.append(el('h2', 'card-title', game.name), el('span', 'creator', `by ${game.creator}`));

  const badge = sourceBadge(game);
  const sourceRow = el('div', `source-row ${badge.kind}`);
  sourceRow.append(iconSpan(badge.svg), el('span', null, badge.label));
  if (game.version) sourceRow.append(el('span', 'version-text', `· ${game.version}`));
  if (game.chapters) sourceRow.append(el('span', 'version-text', `· ${game.chapters}`));

  const pathRow = el('div', 'path-row');
  if (found) {
    pathRow.classList.add('clickable');
    pathRow.append(iconSpan(ICON.folder), el('span', 'path-text', game.executable));
    pathRow.title = 'Show in file manager';
    pathRow.onclick = () => window.toby.showItem(game.executable);
  } else {
    pathRow.append(el('span', 'path-text', 'Not located — use ⋮ → Relocate to point at it.'));
  }

  text.append(titleRow, sourceRow, pathRow);
  top.append(logo, text);

  // actions: play/download | saves… (left) ........ ⋮ (right)
  const actions = el('div', 'actions');

  const actionBtn = found ? playButton(game) : getItButton(game);

  const savesTrigger = el('button', 'has-caret');
  savesTrigger.append(iconSpan(ICON.save), document.createTextNode('Saves'), iconSpan(ICON.chevron, 'caret'));
  const hasEditor = Boolean(game.nativeEditor || game.editorUrl);
  const savesMenu = makeMenu(savesTrigger, [
    {
      label: 'Save editor',
      icon: ICON.edit,
      disabled: !hasEditor,
      onClick: () => (game.nativeEditor === 'undertale' ? openUndertaleEditor(game) : openEditor(game)),
    },
    { label: 'Save slots', icon: ICON.slots, onClick: () => openSlots(game) },
  ]);

  const dotsTrigger = el('button', 'dots', '⋮');
  dotsTrigger.title = 'More';
  const dotsMenu = makeMenu(dotsTrigger, [
    {
      label: found ? 'Relocate…' : 'Locate…',
      icon: ICON.exe,
      onClick: async () => {
        const updated = await window.toby.locate(game.id);
        if (updated) render(updated);
      },
    },
    game.source === 'manual'
      ? { label: 'Clear manual path', icon: ICON.barrier, onClick: async () => render(await window.toby.clearOverride(game.id)) }
      : null,
    {
      // auto-detection guesses a fixed appdata/config folder name, which can be wrong
      // especially for fangames with no fixed install path to anchor on
      label: game.saveDir ? 'Relocate save folder…' : 'Locate save folder…',
      icon: ICON.folder,
      onClick: async () => {
        const updated = await window.toby.locateSaveDir(game.id);
        if (updated) render(updated);
      },
    },
    game.saveDirSource === 'manual'
      ? { label: 'Clear manual save folder', icon: ICON.barrier, onClick: async () => render(await window.toby.clearSaveDirOverride(game.id)) }
      : null,
    { label: 'Manage LiveSplit splits…', icon: ICON.slots, onClick: () => openSplits(game) },
    // per-game escape hatch: the in-game (injected) overlay is windows-only, so
    // only offer the fallback toggle there. enable it if the overlay isn't showing
    navigator.platform.startsWith('Win')
      ? {
          label: game.forceElectronOverlay ? '✓ Fallback overlay (enable if overlay isn’t working)' : 'Fallback overlay (enable if overlay isn’t working)',
          icon: ICON.exe,
          onClick: async () => render(await window.toby.setForceElectronOverlay(game.id, !game.forceElectronOverlay)),
        }
      : null,
  ]);

  actions.append(actionBtn, savesMenu, el('span', 'spacer'), dotsMenu);

  root.append(top, actions);
  return root;
}

// gameId -> { btn, label } for each rendered play button, so the running-state
// poll can update them without re-rendering the grid, rebuilt on each render()
const playButtons = new Map();

function playButton(game) {
  const btn = el('button', 'primary has-icon');
  const label = document.createTextNode('Play');
  btn.append(iconSpan(ICON.play), label);
  playButtons.set(game.id, { btn, label });
  btn.onclick = async () => {
    // a first proton launch can take a while, disable so it can't be clicked
    // twice, and mark busy so a running-state poll mid-launch doesn't stomp the label
    btn.disabled = true;
    btn.dataset.busy = '1';
    label.textContent = 'Launching…';
    setStatus(`Launching ${game.name}…`);
    try {
      const res = await window.toby.launch(game.id);
      const viaSuffix = res.via === 'steam' ? ' via Steam.' : res.via === 'proton' ? ' via Proton.' : '.';
      if (res.ok) setStatus(`Launched ${game.name}${viaSuffix}`, 'ok');
      else setStatus(`Couldn't launch ${game.name}: ${res.error}`, 'bad');
    } finally {
      delete btn.dataset.busy;
      // lets the next refresh decide play vs playing, avoids a flash back to "play"
      refreshRunningStates();
    }
  };
  return btn;
}

// steam launches only report running state via a periodic poll (pollSteamGames
// in main.js), this just reflects that onto whichever play buttons are on screen
async function refreshRunningStates() {
  if (playButtons.size === 0) return;
  let running;
  try {
    running = await window.toby.getRunningGames();
  } catch {
    return;
  }
  for (const [gameId, { btn, label }] of playButtons) {
    if (btn.dataset.busy) continue;
    const isRunning = running.includes(gameId);
    btn.disabled = isRunning;
    label.textContent = isRunning ? 'Playing' : 'Play';
  }
}

// shown instead of play when a game isn't installed, points at steam or gamejolt
function getItButton(game) {
  const isSteam = Boolean(game.steamAppId);
  const btn = el('button', 'get-it has-icon');
  btn.append(iconSpan(isSteam ? ICON.steam : ICON.download), document.createTextNode(isSteam ? 'Get on Steam' : 'Download'));
  btn.title = isSteam ? `Open ${game.name} on Steam` : `Open ${game.name}'s GameJolt page`;
  btn.onclick = async () => {
    const res = await window.toby.openStorePage(game.id);
    if (!res.ok) setStatus(res.error, 'bad');
  };
  return btn;
}

function addGameCard() {
  const btn = el('button', 'card add-game-card');
  btn.title = 'Browse the Tem Shop for more fan games';
  btn.append(iconSpan(ICON.plus, 'add-game-plus'));
  btn.onclick = () => goToStore();
  return btn;
}

function categorySection(cat, games) {
  const section = el('div', 'category');
  if (collapsedCategories.has(cat.id)) section.classList.add('collapsed');

  const header = el('button', 'category-header');
  header.append(iconSpan(ICON.chevron, 'cat-arrow'), el('span', 'cat-name', cat.label), el('span', 'cat-bar'));
  header.onclick = () => {
    const collapsed = section.classList.toggle('collapsed');
    if (collapsed) collapsedCategories.add(cat.id);
    else collapsedCategories.delete(cat.id);
  };

  const grid = el('div', 'category-grid');
  games.forEach((g) => grid.append(card(g)));
  // always the last card in fan games, a standing invite to browse the store
  if (cat.id === 'fangame') grid.append(addGameCard());

  section.append(header, grid);
  return section;
}

function render(games) {
  gamesEl.replaceChildren();
  playButtons.clear();
  for (const cat of CATEGORIES) {
    const inCat = games.filter((g) => g.category === cat.id);
    if (inCat.length) gamesEl.append(categorySection(cat, inCat));
  }
  const n = games.filter((g) => g.executable).length;
  setStatus(`${n} of ${games.length} games detected.`);
  refreshRunningStates();
}

async function scan() {
  setStatus('Scanning…');
  render(await window.toby.detect());
}

// editor

function showBanner(msg, kind) {
  editorBanner.textContent = msg;
  editorBanner.className = `banner ${kind || ''}`;
}

async function openEditor(game) {
  const res = await window.toby.openEditor(game.id);
  if (!res.ok) {
    setStatus(res.error, 'bad');
    return;
  }

  currentSaveDir = res.saveDir;
  editorTitle.textContent = `${game.name} — save editor`;

  if (res.saveDir) {
    editorSavePath.textContent = res.saveDir;
    editorSavePath.title = res.saveDir;
    openFolderBtn.disabled = false;
    copyPathBtn.disabled = false;
  } else {
    editorSavePath.textContent = 'save folder not detected';
    editorSavePath.title = '';
    openFolderBtn.disabled = true;
    copyPathBtn.disabled = true;
  }

  if (res.backupPath) {
    showBanner(`Backed up your current saves before opening. Load the file from the folder above, then export — the save dialog defaults back to it.`, 'ok');
  } else if (res.saveDir) {
    showBanner(`Save folder detected but empty — nothing to back up yet.`, '');
  } else {
    showBanner(`Couldn't auto-locate this game's save folder. You can still use the editor and browse to the file manually.`, 'warn');
  }

  editorView.src = res.editorUrl;
  libraryEl.classList.add('hidden');
  editorEl.classList.remove('hidden');
}

async function closeEditor() {
  await window.toby.closeEditor();
  editorView.src = 'about:blank';
  editorEl.classList.add('hidden');
  libraryEl.classList.remove('hidden');
  scan(); // refresh in case saves changed detection state
}

backBtn.onclick = closeEditor;
reloadBtn.onclick = () => editorView.reload();
openFolderBtn.onclick = () => window.toby.openSaveDir(currentSaveDir);
copyPathBtn.onclick = async () => {
  await window.toby.copyPath(currentSaveDir);
  showBanner('Save folder path copied — paste it into the editor’s file picker.', 'ok');
};

// sidebar navigation

const ALL_SCREEN_IDS = ['library', 'editor', 'ut-editor', 'slots-screen', 'settings-screen', 'store-screen'];

function setActiveNav(pageId) {
  document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.page === pageId));
}

// hides every top-level screen, callers unhide the one they want and call setActiveNav
function hideAllScreens() {
  for (const id of ALL_SCREEN_IDS) {
    document.getElementById(id).classList.add('hidden');
  }
}

function goToLibrary() {
  hideAllScreens();
  libraryEl.classList.remove('hidden');
  setActiveNav('library');
  scan();
}

document.querySelectorAll('.nav-item').forEach((btn) => {
  if (btn.dataset.page === 'library') {
    btn.onclick = goToLibrary;
  }
});

// static save buttons (ut-editor.js/slots.js load before ICON exists here)

for (const id of ['ut-save', 'slots-create-btn']) {
  const btn = document.getElementById(id);
  if (btn) {
    btn.classList.add('has-icon');
    btn.prepend(iconSpan(ICON.save));
  }
}

// boot

// 1 in 1000 on startup easter egg
if (Math.random() < 0.001) {
  const brandLogo = document.getElementById('brand-logo');
  if (brandLogo) brandLogo.src = '../img/easter_eggs/togore.webp';
}

refreshBtn.onclick = scan;
scan();
setInterval(refreshRunningStates, 3000);
