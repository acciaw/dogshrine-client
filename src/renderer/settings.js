'use strict';

// settings screen: shares libraryEl, scan, and el from renderer.js

const settingsScreen = document.getElementById('settings-screen');
const settingsThemeSelect = document.getElementById('settings-theme-select');
const settingsVersion = document.getElementById('settings-version');
const settingsUserdata = document.getElementById('settings-userdata');
const settingsOpenUserdataBtn = document.getElementById('settings-open-userdata');
const settingsCopyUserdataBtn = document.getElementById('settings-copy-userdata');
const settingsBackupsList = document.getElementById('settings-backups-list');
const creditsAuthorLink = document.getElementById('credits-author-link');
const creditsTennaLink = document.getElementById('credits-tenna-link');
const creditsUtyEditorLink = document.getElementById('credits-uty-editor-link');

let settingsUserDataPath = null;

function fmtBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function backupRow(entry) {
  const li = el('li', 'slot-item');

  const info = el('div', 'slot-info');
  info.append(el('div', 'slot-name', entry.gameName));
  info.append(el('div', 'slot-meta', `${entry.count} backup${entry.count === 1 ? '' : 's'} · ${fmtBytes(entry.bytes)}`));

  const actions = el('div', 'slot-actions');
  const clearBtn = el('button', 'ghost', 'Clear backups');
  clearBtn.onclick = async () => {
    const { confirmed } = await window.toby.confirmDialog({
      message: `Delete all backups for ${entry.gameName}?`,
      detail: `This removes the automatic safety snapshots only — your live save and slots are untouched.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    await window.toby.appClearBackups(entry.gameId);
    loadBackupStats();
  };
  actions.append(clearBtn);

  li.append(info, actions);
  return li;
}

async function loadBackupStats() {
  const stats = await window.toby.appGetBackupStats();
  settingsBackupsList.replaceChildren();
  if (stats.length === 0) {
    settingsBackupsList.append(el('li', 'ut-hint', 'No backups yet.'));
    return;
  }
  for (const entry of stats) {
    settingsBackupsList.append(backupRow(entry));
  }
}

async function loadThemeOptions() {
  const [themeList, { theme }] = await Promise.all([window.toby.getThemes(), window.toby.getSettings()]);
  settingsThemeSelect.replaceChildren();
  for (const t of themeList) {
    const opt = el('option', null, t.name);
    opt.value = t.id;
    settingsThemeSelect.append(opt);
  }
  settingsThemeSelect.value = theme;
}

settingsThemeSelect.onchange = async () => {
  const { theme } = await window.toby.setTheme(settingsThemeSelect.value);
  const themeList = await window.toby.getThemes();
  const active = themeList.find((t) => t.id === theme);
  if (active) applyThemeColors(active.colors);
};

async function openSettings() {
  const info = await window.toby.appGetInfo();
  settingsUserDataPath = info.userDataPath;
  settingsVersion.textContent = info.version;
  settingsUserdata.textContent = info.userDataPath;
  settingsUserdata.title = info.userDataPath;

  await Promise.all([loadBackupStats(), loadThemeOptions()]);

  hideAllScreens();
  settingsScreen.classList.remove('hidden');
  setActiveNav('settings');
}

settingsOpenUserdataBtn.onclick = () => window.toby.openSaveDir(settingsUserDataPath);
settingsCopyUserdataBtn.onclick = () => window.toby.copyPath(settingsUserDataPath);
creditsAuthorLink.onclick = () => window.toby.openExternal('https://acciaw.me');
creditsTennaLink.onclick = () => window.toby.openExternal('https://tennaproject.com/');
creditsUtyEditorLink.onclick = () => window.toby.openExternal('https://save.yellow.undertale.wiki/');

document.querySelectorAll('.nav-item').forEach((btn) => {
  if (btn.dataset.page === 'settings') {
    btn.onclick = openSettings;
  }
});
