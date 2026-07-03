'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const https = require('https');
const crypto = require('crypto');
const { spawn, execFileSync, execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, session } = require('electron');

const { detectAll, GAMES, isSteamInstalled, findLocalProton } = require('./gameDetection');
const config = require('./config');
const settings = require('./settings');
const themes = require('./themes');
const updater = require('./updater');
const undertaleSave = require('./saveFormats/undertale');
const saveSlots = require('./saveSlots');

// pins userData to a fixed path
app.setPath('userData', path.join(app.getPath('appData'), 'dogshrine'));

const APP_ICON = path.join(__dirname, '..', 'img', 'app', 'icon.png');

// easter egg: [[HYPERLINK BLOCKED]]
const SANS_FIGHT_URL = 'https://acciaw.github.io/dogshrine-sans-fight/';
const SANS_FIGHT_PRELOAD = path.join(__dirname, 'sansFightPreload.js');

// save folder of the open editor, used to default the download save-dialog
let activeSaveDir = null;

// "is this game running" tracking for the play button, exactRunning is tracked
// via own child handle, polledRunning fills the gap for steam launches
const exactRunning = new Set();
const polledRunning = new Set();

function markRunning(gameId, child) {
  exactRunning.add(gameId);
  child.on('exit', () => exactRunning.delete(gameId));
}

// wine/proton's own backing binary, used to gate the cmdline check
// below so something mentioning the exe's path can't be mistaken for the game actually running it
function isWineFamilyProcess(pid) {
  try {
    const base = path.basename(fs.readlinkSync(`/proc/${pid}/exe`)).toLowerCase();
    return base === 'wine' || base === 'wine64' || base === 'wineserver' || base.startsWith('wine64-preloader') || base.includes('proton') || base.includes('umu-run');
  } catch {
    return false;
  }
}

async function isProcessRunningForExecutable(executable) {
  if (!executable) return false;
  if (process.platform === 'linux') {
    // proton/wine show the full windows exe path in cmdline
    let installDir;
    try {
      installDir = fs.realpathSync(path.dirname(executable));
    } catch {
      installDir = path.dirname(executable);
    }
    try {
      for (const pid of fs.readdirSync('/proc')) {
        if (!/^\d+$/.test(pid)) continue;
        try {
          let exeDir;
          try {
            exeDir = fs.realpathSync(path.dirname(fs.readlinkSync(`/proc/${pid}/exe`)));
          } catch {
            exeDir = null; // kernel threads, permission denied, etc.
          }
          if (exeDir === installDir) return true;
          if (isWineFamilyProcess(pid) && fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes(executable)) return true;
        } catch {
          /* process exited mid-scan or unreadable, skip it */
        }
      }
    } catch {
      return false;
    }
    return false;
  }
  // windows/macos: unverified for now, matches by executable name only
  try {
    const name = path.basename(executable).toLowerCase();
    if (process.platform === 'win32') {
      // execFile to avoid stalling on a huge tasklist output
      const { stdout } = await execFileAsync('tasklist', ['/fo', 'csv', '/nh'], { windowsHide: true });
      return stdout.toLowerCase().includes(name);
    }
    if (process.platform === 'darwin') {
      return execFileSync('ps', ['-A', '-o', 'comm='], { encoding: 'utf8' }).toLowerCase().includes(name);
    }
  } catch {
    return false;
  }
  return false;
}

function detectGames() {
  return detectAll(config.getOverrides(), app.getPath('userData'), config.getSaveDirOverrides());
}

// only steam-capable games can launch without a process handle, so only they need polling
async function pollSteamGames() {
  const games = detectGames();
  for (const game of games) {
    if (!game.steamAppId || exactRunning.has(game.id)) continue;
    if (await isProcessRunningForExecutable(game.executable)) polledRunning.add(game.id);
    else polledRunning.delete(game.id);
  }
}

function createWindow() {
  // matches the saved theme's bg up front to avoid a flash before theme.js applies the rest
  const activeTheme = themes.find(settings.get().theme);
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 820,
    minHeight: 520,
    backgroundColor: activeTheme.colors.bg,
    title: 'Dog Shrine',
    icon: APP_ICON,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true, // embedded save editors live in <webview> elements
    },
  });

  win.removeMenu();
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  return win;
}

// small frameless window shown only for a packaged boot with update checks enabled
function createUpdateWindow() {
  const win = new BrowserWindow({
    width: 380,
    height: 190,
    resizable: false,
    frame: false,
    show: true,
    center: true,
    title: 'Dog Shrine',
    icon: APP_ICON,
    backgroundColor: '#0d0d0f',
    webPreferences: {
      preload: path.join(__dirname, 'updateCheckPreload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, '..', 'renderer', 'update-check.html'));
  return win;
}

// runs before main window opens: checks github for a newer release
async function runStartupUpdateCheck() {
  if (!app.isPackaged || !settings.get().checkForUpdates) {
    createWindow();
    return;
  }

  const updateWin = createUpdateWindow();
  const sendStatus = (status) => {
    if (!updateWin.isDestroyed()) updateWin.webContents.send('update:status', status);
  };

  const result = await updater.runStartupUpdate(sendStatus).catch(() => ({ proceed: true }));

  if (!updateWin.isDestroyed()) updateWin.close();
  if (result.proceed) createWindow();
}

// snapshots a save folder into userData/backups/<gameId>/<timestamp>
function backupSaveDir(gameId, saveDir) {
  if (!saveDir || !fs.existsSync(saveDir)) return null;
  if (fs.readdirSync(saveDir).length === 0) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(app.getPath('userData'), 'backups', gameId, stamp);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(saveDir, dest, { recursive: true });
  return dest;
}

// umu-launcher's self-contained zipapp build, for embedding without a
// pre-install. pinned to a known-good version + checksum, not latest.
// https://github.com/Open-Wine-Components/umu-launcher/releases
const UMU_LAUNCHER_VERSION = '1.4.0';
const UMU_LAUNCHER_URL = `https://github.com/Open-Wine-Components/umu-launcher/releases/download/${UMU_LAUNCHER_VERSION}/umu-launcher-${UMU_LAUNCHER_VERSION}-zipapp.tar`;
const UMU_LAUNCHER_SHA256 = '138ce4b8843608a257d4bee88191ca78a989778bcefd8abb3c1d1aaac3ac6fb8';

function commandExists(name) {
  const dirs = (process.env.PATH || '').split(path.delimiter);
  return dirs.some((dir) => {
    try {
      return fs.statSync(path.join(dir, name)).isFile();
    } catch {
      return false;
    }
  });
}

// downloads a url to a file, following redirects (node's https doesn't)
function downloadFile(url, destPath, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          if (redirectsLeft <= 0) return reject(new Error('Too many redirects.'));
          downloadFile(res.headers.location, destPath, redirectsLeft - 1).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const file = fs.createWriteStream(destPath);
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve()));
        file.on('error', reject);
      })
      .on('error', reject);
  });
}

// asks before fetching anything; never download/run third-party binaries silently
async function confirmUmuInstall() {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  const result = await dialog.showMessageBox(win, {
    type: 'question',
    buttons: ['Cancel', 'Install'],
    defaultId: 1,
    cancelId: 0,
    message: 'Install umu-launcher to run this game via Proton?',
    detail:
      "This game needs Proton to run on Linux. Dog Shrine can fetch umu-launcher — the same " +
      'tool Lutris, Heroic, and Bottles use for this — from its official GitHub release ' +
      "(about 400 KB, checksum-verified) and keep it in Dog Shrine's own data folder. " +
      "Nothing is installed system-wide, and nothing else gets downloaded without asking.\n\n" +
      "If you'd rather not, you can install umu-launcher yourself, or add the game to Steam " +
      'as a non-Steam game and force a Proton version on it.',
    noLink: true,
  });
  return result.response === 1;
}

// ensures umu-run exists: checks path, then our own fetched copy, then downloads + verifies after asking
async function ensureUmuRun() {
  if (commandExists('umu-run')) return 'umu-run';

  const binDir = path.join(app.getPath('userData'), 'bin');
  const managedPath = path.join(binDir, 'umu-run');
  if (fs.existsSync(managedPath)) return managedPath;

  if (!(await confirmUmuInstall())) {
    throw new Error('Proton support was not installed.');
  }

  fs.mkdirSync(binDir, { recursive: true });
  const tarPath = path.join(binDir, `umu-launcher-${UMU_LAUNCHER_VERSION}.tar`);
  try {
    await downloadFile(UMU_LAUNCHER_URL, tarPath);

    const hash = crypto.createHash('sha256').update(fs.readFileSync(tarPath)).digest('hex');
    if (hash !== UMU_LAUNCHER_SHA256) {
      throw new Error("umu-launcher download didn't match its expected checksum — discarded for safety.");
    }

    execFileSync('tar', ['-xf', tarPath, '-C', binDir, 'umu/umu-run']);
    fs.renameSync(path.join(binDir, 'umu', 'umu-run'), managedPath);
    fs.chmodSync(managedPath, 0o755);
    return managedPath;
  } catch (err) {
    throw new Error(
      `Couldn't set up Proton support automatically (${err.message}). You can install umu-launcher ` +
        `yourself instead, or add the game to Steam as a non-Steam game and force a Proton version on it.`
    );
  } finally {
    fs.rmSync(tarPath, { force: true });
    fs.rmSync(path.join(binDir, 'umu'), { recursive: true, force: true });
  }
}

// runs a manually-located .exe through proton via umu-run, each game gets its own persistent prefix
async function launchViaProton(gameId, executable) {
  let umuCommand;
  try {
    umuCommand = await ensureUmuRun();
  } catch (err) {
    return { ok: false, error: err.message };
  }

  return new Promise((resolve) => {
    const prefixDir = path.join(app.getPath('userData'), 'wine-prefixes', gameId);
    fs.mkdirSync(prefixDir, { recursive: true });

    const env = { ...process.env, WINEPREFIX: prefixDir };
    const protonPath = findLocalProton();
    if (protonPath) env.PROTONPATH = protonPath;

    const child = spawn(umuCommand, [executable], {
      detached: true,
      stdio: 'ignore',
      cwd: path.dirname(executable),
      env,
    });
    child.on('error', (err) => resolve({ ok: false, error: err.message }));
    child.once('spawn', () => {
      child.unref();
      markRunning(gameId, child);
      resolve({ ok: true });
    });
  });
}

function setupIpc() {
  ipcMain.handle('games:detect', () => {
    return detectGames();
  });

  ipcMain.handle('games:locate', async (_event, gameId) => {
    const result = await dialog.showOpenDialog({
      title: 'Locate game executable',
      properties: ['openFile'],
      // .app bundles are directories on macos, allow picking them too
      ...(process.platform === 'darwin' ? { properties: ['openFile', 'treatPackageAsDirectory'] } : {}),
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    config.setOverride(gameId, result.filePaths[0]);
    return detectGames();
  });

  ipcMain.handle('games:clearOverride', (_event, gameId) => {
    config.setOverride(gameId, null);
    return detectGames();
  });

  // manual save-folder override, for when auto-detection guesses the wrong appdata/config
  // folder name (common with fangames, which have no fixed install path to anchor on)
  ipcMain.handle('games:locateSaveDir', async (_event, gameId) => {
    const result = await dialog.showOpenDialog({
      title: 'Locate save folder',
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    config.setSaveDirOverride(gameId, result.filePaths[0]);
    return detectGames();
  });

  ipcMain.handle('games:clearSaveDirOverride', (_event, gameId) => {
    config.setSaveDirOverride(gameId, null);
    return detectGames();
  });

  ipcMain.handle('games:launch', async (_event, gameId) => {
    const game = detectGames().find((g) => g.id === gameId);
    if (!game || !game.executable) return { ok: false, error: 'No executable set.' };

    if (game.needsSteamLaunch) {
      // lets steam launch it: native builds need the runtime container, windows depots need the proton prefix
      await shell.openExternal(`steam://rungameid/${game.steamAppId}`);
      return { ok: true, via: 'steam' };
    }

    if (process.platform === 'linux' && game.executable.toLowerCase().endsWith('.exe')) {
      const result = await launchViaProton(game.id, game.executable);
      return result.ok ? { ok: true, via: 'proton' } : result;
    }

    try {
      const child = spawn(game.executable, [], {
        detached: true,
        stdio: 'ignore',
        cwd: path.dirname(game.executable),
      });
      child.on('error', () => {});
      child.unref();
      markRunning(game.id, child);
      return { ok: true, via: 'direct' };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('games:getRunning', () => [...new Set([...exactRunning, ...polledRunning])]);

  // preload path has to be resolved here: the renderer has no node/path access to build
  // an absolute file path itself, and <webview preload> needs one
  ipcMain.handle('sansFight:getConfig', () => ({
    url: SANS_FIGHT_URL,
    preload: pathToFileURL(SANS_FIGHT_PRELOAD).href,
  }));

  // points at steam (deep link or web store) for official games, gamejolt for uty
  ipcMain.handle('games:openStorePage', async (_event, gameId) => {
    const game = GAMES.find((g) => g.id === gameId);
    if (!game) return { ok: false, error: 'Unknown game.' };

    if (game.steamAppId) {
      const url = isSteamInstalled()
        ? `steam://store/${game.steamAppId}`
        : `https://store.steampowered.com/app/${game.steamAppId}`;
      await shell.openExternal(url);
      return { ok: true };
    }
    if (game.storeUrl) {
      await shell.openExternal(game.storeUrl);
      return { ok: true };
    }
    return { ok: false, error: 'No store page available for this game yet.' };
  });

  ipcMain.handle('games:openSaveDir', (_event, saveDir) => {
    if (!saveDir) return { ok: false, error: 'No save directory found.' };
    shell.openPath(saveDir);
    return { ok: true };
  });

  // native dialog avoids window.confirm(), which breaks gtk/ime focus on some linux setups
  ipcMain.handle('dialog:confirm', async (_event, { message, detail, confirmLabel, danger }) => {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const result = await dialog.showMessageBox(win, {
      type: danger ? 'warning' : 'question',
      buttons: ['Cancel', confirmLabel || 'OK'],
      defaultId: 1,
      cancelId: 0,
      message,
      detail,
      noLink: true,
    });
    return { confirmed: result.response === 1 };
  });

  // reveals a file in the os file manager
  ipcMain.handle('shell:showItem', (_event, fullPath) => {
    if (!fullPath) return { ok: false };
    shell.showItemInFolder(fullPath);
    return { ok: true };
  });

  // opens a link in the browser restricted to https so it can't open local files or other protocols
  ipcMain.handle('shell:openExternal', (_event, url) => {
    if (typeof url !== 'string' || !/^https:\/\//i.test(url)) return { ok: false, error: 'Blocked URL.' };
    shell.openExternal(url);
    return { ok: true };
  });

  // snapshots saves first, then arms the download dialog default for exports
  ipcMain.handle('editor:open', (_event, gameId) => {
    const game = detectGames().find((g) => g.id === gameId);
    if (!game) return { ok: false, error: 'Unknown game.' };
    if (!game.editorUrl) return { ok: false, error: 'No editor available for this game yet.' };

    activeSaveDir = game.saveDir || null;
    let backupPath = null;
    try {
      backupPath = backupSaveDir(gameId, game.saveDir);
    } catch (err) {
      return { ok: false, error: `Backup failed: ${err.message}` };
    }
    return { ok: true, editorUrl: game.editorUrl, saveDir: game.saveDir, backupPath };
  });

  ipcMain.handle('editor:close', () => {
    activeSaveDir = null;
    return { ok: true };
  });

  ipcMain.handle('clipboard:write', (_event, text) => {
    if (text) clipboard.writeText(text);
    return { ok: true };
  });

  // native undertale editor

  ipcMain.handle('undertale:getOptions', () => ({
    itemNames: undertaleSave.ITEM_NAMES,
    weaponOptions: undertaleSave.WEAPON_OPTIONS,
    armorOptions: undertaleSave.ARMOR_OPTIONS,
    roomOptions: undertaleSave.ROOM_OPTIONS,
    presets: undertaleSave.PRESETS.map((p) => ({ id: p.id, label: p.label })),
    iniSections: undertaleSave.INI_SECTIONS,
  }));

  ipcMain.handle('undertale:open', (_event, gameId) => {
    const game = detectGames().find((g) => g.id === gameId);
    if (!game) return { ok: false, error: 'Unknown game.' };
    if (!game.saveDir) return { ok: false, error: "Couldn't auto-locate the save folder. Use ⋮ → “Locate save folder…” on the game." };

    let backupPath = null;
    try {
      backupPath = backupSaveDir(gameId, game.saveDir);
    } catch (err) {
      return { ok: false, error: `Backup failed: ${err.message}` };
    }

    // the game's continue screen only shows these three slots, "open file…" covers the rest
    const files = ['file0', 'file1', 'file2']
      .map((name) => path.join(game.saveDir, name))
      .filter((p) => fs.existsSync(p));
    const hasIni = fs.existsSync(path.join(game.saveDir, 'undertale.ini'));

    return { ok: true, saveDir: game.saveDir, files, hasIni, backupPath };
  });

  ipcMain.handle('undertale:pickSaveFile', async (_event, saveDir) => {
    const result = await dialog.showOpenDialog({
      title: 'Open Undertale save file',
      defaultPath: saveDir,
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return { ok: false, canceled: true };
    return { ok: true, filePath: result.filePaths[0] };
  });

  ipcMain.handle('undertale:readSlot', (_event, filePath) => {
    try {
      const text = fs.readFileSync(filePath, 'utf8');
      return { ok: true, ...undertaleSave.parseFile0(text) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // loads a full preset, replacing the whole file0 line array. nothing written until save, never touches undertale.ini
  ipcMain.handle('undertale:loadPreset', (_event, presetId, name) => {
    const preset = undertaleSave.PRESETS.find((p) => p.id === presetId);
    if (!preset) return { ok: false, error: 'Unknown preset.' };
    const raw = undertaleSave.presetLinesWithName(preset.lines, name);
    return { ok: true, raw, fields: undertaleSave.linesToFields(raw) };
  });

  ipcMain.handle('undertale:writeSlot', (_event, filePath, rawLines, fields) => {
    try {
      const text = undertaleSave.serializeFile0(rawLines, fields);
      fs.writeFileSync(filePath, text, 'utf8');
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('undertale:readIni', (_event, saveDir) => {
    try {
      const text = fs.readFileSync(path.join(saveDir, 'undertale.ini'), 'utf8');
      return { ok: true, text, fields: undertaleSave.readIniFields(text) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('undertale:writeIni', (_event, saveDir, originalText, originalFields, editedFields) => {
    try {
      const text = undertaleSave.writeIniFields(originalText, originalFields, editedFields);
      fs.writeFileSync(path.join(saveDir, 'undertale.ini'), text, 'utf8');
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // save slots: save folder is always re-resolved from detection, never trusted from the renderer

  function resolveSaveDir(gameId) {
    const game = detectGames().find((g) => g.id === gameId);
    if (!game) return { error: 'Unknown game.' };
    if (!game.saveDir) {
      return { error: "Couldn't locate this game's save folder. Open it once in-game, or use ⋮ → “Locate save folder…”." };
    }
    return { saveDir: game.saveDir };
  }

  ipcMain.handle('slots:open', (_event, gameId) => {
    const { saveDir, error } = resolveSaveDir(gameId);
    return { ok: !error, error, saveDir, manifest: saveSlots.listSlots(gameId) };
  });

  ipcMain.handle('slots:create', (_event, gameId, name) => {
    const { saveDir, error } = resolveSaveDir(gameId);
    if (error) return { ok: false, error };
    try {
      const { manifest } = saveSlots.createSlot(gameId, name, saveDir);
      return { ok: true, manifest };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('slots:createEmpty', (_event, gameId, name) => {
    try {
      const { manifest } = saveSlots.createEmptySlot(gameId, name);
      return { ok: true, manifest };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('slots:update', (_event, gameId, slotId) => {
    const { saveDir, error } = resolveSaveDir(gameId);
    if (error) return { ok: false, error };
    try {
      return { ok: true, manifest: saveSlots.updateSlot(gameId, slotId, saveDir) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('slots:rename', (_event, gameId, slotId, name) => {
    try {
      return { ok: true, manifest: saveSlots.renameSlot(gameId, slotId, name) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('slots:delete', (_event, gameId, slotId) => {
    try {
      return { ok: true, manifest: saveSlots.deleteSlot(gameId, slotId) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('slots:reorder', (_event, gameId, orderedIds) => {
    try {
      return { ok: true, manifest: saveSlots.reorderSlots(gameId, orderedIds) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('slots:load', (_event, gameId, slotId) => {
    const { saveDir, error } = resolveSaveDir(gameId);
    if (error) return { ok: false, error };
    try {
      const { manifest, backupPath } = saveSlots.loadSlot(gameId, slotId, saveDir);
      return { ok: true, manifest, backupPath };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // settings

  ipcMain.handle('settings:get', () => settings.get());

  ipcMain.handle('settings:setTheme', (_event, themeId) => settings.setTheme(themeId));

  ipcMain.handle('settings:setCheckForUpdates', (_event, enabled) => settings.setCheckForUpdates(enabled));

  ipcMain.handle('settings:setSoundsEnabled', (_event, enabled) => settings.setSoundsEnabled(enabled));

  ipcMain.handle('themes:list', () => themes.list());

  ipcMain.handle('updates:check', () => updater.checkForUpdate());

  ipcMain.handle('updates:skipStartup', () => {
    updater.skipStartupUpdate();
    return { ok: true };
  });

  // manual download+install for the settings screen / update banner
  ipcMain.handle('updates:download', async (event) => {
    try {
      await updater.downloadUpdate((progress) => {
        if (!event.sender.isDestroyed()) event.sender.send('update:downloadProgress', Math.round(progress.percent));
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('updates:quitAndInstall', () => {
    updater.quitAndInstall();
  });

  ipcMain.handle('app:getInfo', () => ({
    version: app.getVersion(),
    userDataPath: app.getPath('userData'),
  }));

  ipcMain.handle('app:getBackupStats', () => {
    const nameById = Object.fromEntries(GAMES.map((g) => [g.id, g.name]));
    return saveSlots.getBackupStats().map((entry) => ({
      ...entry,
      gameName: nameById[entry.gameId] || entry.gameId,
    }));
  });

  ipcMain.handle('app:clearBackups', (_event, gameId) => {
    try {
      saveSlots.clearBackups(gameId);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
}

app.whenReady().then(() => {
  settings.ensureFile();
  setupIpc();
  setInterval(pollSteamGames, 3000);

  // the icon option doesn't reach the dock in dev mode on macos, set separately
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(APP_ICON);
  }

  // defaults the save dialog to the active game's save folder; never auto-overwrites
  session.defaultSession.on('will-download', (_event, item) => {
    if (activeSaveDir) {
      item.setSaveDialogOptions({
        title: 'Save edited file',
        defaultPath: path.join(activeSaveDir, item.getFilename()),
      });
    }
  });

  runStartupUpdateCheck();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
