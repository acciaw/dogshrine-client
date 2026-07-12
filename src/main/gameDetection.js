'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const PLATFORM = process.platform; // 'win32' | 'linux' | 'darwin'

// expands ~ and ${env}/%env% style vars in a path
function expand(p) {
  if (!p) return p;
  let out = p.replace(/^~(?=$|[/\\])/, os.homedir());
  out = out.replace(/\$\{([^}]+)\}/g, (_, name) => process.env[name] || '');
  out = out.replace(/%([^%]+)%/g, (_, name) => process.env[name] || '');
  return out;
}

function existsFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function existsDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

// case-insensitive fallback for a directory's last path segment: proton prefixes and
// linux config dirs live on a case-sensitive filesystem, but the folder name a windows
// game actually writes (baked into its own data file) doesn't always match guess casing
function existsDirCI(candidatePath) {
  if (existsDir(candidatePath)) return candidatePath;
  const parent = path.dirname(candidatePath);
  const wanted = path.basename(candidatePath).toLowerCase();
  let entries;
  try {
    entries = fs.readdirSync(parent);
  } catch {
    return null;
  }
  const match = entries.find((entry) => entry.toLowerCase() === wanted);
  return match ? path.join(parent, match) : null;
}

// reads steam's install path from the registry, for non-default installs. cached: this
// spawns reg.exe, and detectAll() (thus this) runs on a 3s setInterval poll (see
// pollSteamGames in main.js) — re-spawning it every cycle periodically blocks the main
// process's message pump for as long as the spawn takes, which was dropping/sticking
// keyboard input in the sans-fight <webview> during that stall. steam's install path
// can't change without a reinstall, so one lookup per app run is enough.
let cachedSteamRegistryPath; // undefined = not yet looked up, null = looked up, not found
function windowsSteamPathFromRegistry() {
  if (cachedSteamRegistryPath !== undefined) return cachedSteamRegistryPath;
  try {
    const output = execFileSync(
      'reg',
      ['query', 'HKCU\\SOFTWARE\\Valve\\Steam', '/v', 'SteamPath'],
      { encoding: 'utf8', windowsHide: true }
    );
    const match = output.match(/SteamPath\s+REG_SZ\s+(.+)/);
    cachedSteamRegistryPath = match ? match[1].trim().replace(/\//g, '\\') : null;
  } catch {
    cachedSteamRegistryPath = null; // reg unavailable, key missing, or steam not installed
  }
  return cachedSteamRegistryPath;
}

// finds every steam library's steamapps dir
function steamLibraries() {
  const candidates = [];
  if (PLATFORM === 'win32') {
    candidates.push('C:\\Program Files (x86)\\Steam\\steamapps');
    candidates.push('C:\\Program Files\\Steam\\steamapps');
    const registryPath = windowsSteamPathFromRegistry();
    if (registryPath) candidates.push(path.join(registryPath, 'steamapps'));
  } else if (PLATFORM === 'darwin') {
    candidates.push(expand('~/Library/Application Support/Steam/steamapps'));
  } else {
    candidates.push(expand('~/.local/share/Steam/steamapps'));
    candidates.push(expand('~/.steam/steam/steamapps'));
    candidates.push(expand('~/.var/app/com.valvesoftware.Steam/.local/share/Steam/steamapps')); // flatpak steam
  }

  const libraries = new Set();
  for (const steamapps of candidates) {
    if (existsDir(steamapps)) libraries.add(steamapps);
    const vdf = path.join(steamapps, 'libraryfolders.vdf');
    if (existsFile(vdf)) {
      try {
        const text = fs.readFileSync(vdf, 'utf8');
        // matches "path" entries in the vdf
        const re = /"path"\s*"([^"]+)"/g;
        let m;
        while ((m = re.exec(text)) !== null) {
          const lib = path.join(m[1].replace(/\\\\/g, path.sep), 'steamapps');
          if (existsDir(lib)) libraries.add(lib);
        }
      } catch {
        /* ignore malformed vdf */
      }
    }
  }
  return [...libraries];
}

// finds a local proton build for umu-run; prefers proton-ge over valve's proton
function findLocalProton() {
  for (const steamapps of steamLibraries()) {
    const steamRoot = path.dirname(steamapps);

    const compatToolsDir = path.join(steamRoot, 'compatibilitytools.d');
    if (existsDir(compatToolsDir)) {
      for (const name of fs.readdirSync(compatToolsDir).sort().reverse()) {
        const dir = path.join(compatToolsDir, name);
        if (existsFile(path.join(dir, 'proton'))) return dir;
      }
    }

    const commonDir = path.join(steamapps, 'common');
    if (existsDir(commonDir)) {
      const protonDirs = fs.readdirSync(commonDir).filter((n) => /^proton\b/i.test(n)).sort().reverse();
      for (const name of protonDirs) {
        const dir = path.join(commonDir, name);
        if (existsFile(path.join(dir, 'proton'))) return dir;
      }
    }
  }
  return null;
}

// game definitions; exe candidates tried in order, first match wins
const GAMES = [
  {
    id: 'undertale',
    name: 'Undertale',
    creator: 'Toby Fox',
    category: 'official',
    steamInstallDir: 'Undertale',
    steamAppId: '391540',
    // native editor, no embedded one
    editorUrl: null,
    nativeEditor: 'undertale',
    // folder name under appdata\local / proton prefix
    localAppDataDir: 'UNDERTALE',
    exeNames: {
      win32: ['UNDERTALE.exe'],
      // run.sh sets up LD_LIBRARY_PATH for runner; falls back to windows exe via proton
      linux: ['run.sh', 'runner', 'UNDERTALE', 'UNDERTALE.exe'],
      // casing unverified on real mac, checking both
      darwin: ['UNDERTALE.app', 'Undertale.app'],
    },
    extraDirs: {
      win32: [],
      linux: [],
      darwin: [],
    },
    saveDir: {
      win32: '%LOCALAPPDATA%\\UNDERTALE',
      // linux steam build saves to _linux_steamver, not plain UNDERTALE
      linux: ['~/.config/UNDERTALE_linux_steamver', '~/.config/UNDERTALE'],
      darwin: '~/Library/Application Support/com.tobyfox.undertale',
    },
  },
  {
    id: 'deltarune',
    name: 'Deltarune',
    creator: 'Toby Fox',
    category: 'official',
    steamInstallDir: 'DELTARUNE',
    steamAppId: '1671210',
    editorUrl: 'https://tennaproject.com/',
    localAppDataDir: 'DELTARUNE',
    exeNames: {
      win32: ['DELTARUNE.exe'],
      linux: ['run.sh', 'runner', 'DELTARUNE', 'DELTARUNE.exe'],
      darwin: ['DELTARUNE.app', 'Deltarune.app'],
    },
    extraDirs: {
      win32: [],
      linux: [],
      darwin: [],
    },
    saveDir: {
      win32: '%LOCALAPPDATA%\\DELTARUNE',
      linux: '~/.config/DELTARUNE',
      // guessed from undertale's com.tobyfox.* pattern, unverified
      darwin: '~/Library/Application Support/com.tobyfox.deltarune',
    },
  },
  {
    id: 'undertale-yellow',
    name: 'Undertale Yellow',
    creator: 'Team UTY',
    category: 'fangame',
    // gamejolt fangame, not on steam
    steamInstallDir: null,
    steamAppId: null,
    // gamejolt for now, swap to our own store page later
    storeUrl: 'https://gamejolt.com/games/UndertaleYellow/136925',
    editorUrl: 'https://save.yellow.undertale.wiki/',
    localAppDataDir: 'UNDERTALE_Yellow',
    exeNames: {
      win32: ['UNDERTALE_Yellow.exe', 'UNDERTALE Yellow.exe'],
      linux: ['run.sh', 'runner', 'UNDERTALE_Yellow', 'UNDERTALE_Yellow.exe', 'UNDERTALE Yellow.exe'],
      darwin: ['UNDERTALE_Yellow.app', 'UNDERTALE Yellow.app', 'Undertale Yellow.app'],
    },
    // no fixed install path (gamejolt/itch zip), manual locate is the real path
    extraDirs: {
      win32: [],
      linux: ['~/Games/UNDERTALE_Yellow', '~/.local/share/UNDERTALE_Yellow'],
      darwin: ['~/Applications/UNDERTALE_Yellow'],
    },
    saveDir: {
      win32: '%LOCALAPPDATA%\\UNDERTALE_Yellow',
      linux: '~/.config/UNDERTALE_Yellow',
      // bundle id is guesswork, manual open save folder is the fallback
      darwin: [
        '~/Library/Application Support/com.UNDERTALE_Yellow',
        '~/Library/Application Support/UNDERTALE_Yellow',
      ],
    },
  },
];

// looks for any of exeNames inside dir, non-recursive
function findExeInDir(dir, exeNames) {
  if (!existsDir(dir)) return null;
  for (const name of exeNames) {
    const full = path.join(dir, name);
    // .app bundles are directories on macos
    if (existsFile(full) || (name.endsWith('.app') && existsDir(full))) {
      return full;
    }
  }
  return null;
}

// auto-locates a game's exe; viaSteamLibrary flags a steam common/ hit, used for needsSteamLaunch later
function detectExecutable(game) {
  const exeNames = game.exeNames[PLATFORM] || [];

  // 1) steam libraries
  if (game.steamInstallDir) {
    for (const steamapps of steamLibraries()) {
      const commonDir = path.join(steamapps, 'common', game.steamInstallDir);
      const hit = findExeInDir(commonDir, exeNames);
      if (hit) return { executable: hit, viaSteamLibrary: true, steamapps };
    }
  }

  // 2) other known install locations
  for (const raw of game.extraDirs[PLATFORM] || []) {
    const hit = findExeInDir(expand(raw), exeNames);
    if (hit) return { executable: hit, viaSteamLibrary: false, steamapps: null };
  }

  return { executable: null, viaSteamLibrary: false, steamapps: null };
}

// steam's cached build id from appmanifest_<id>.acf; not a real version string, but changes every patch
function readSteamBuildId(steamapps, appId) {
  const acfPath = path.join(steamapps, `appmanifest_${appId}.acf`);
  if (!existsFile(acfPath)) return null;
  try {
    const text = fs.readFileSync(acfPath, 'utf8');
    const match = text.match(/"buildid"\s*"(\d+)"/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// reads fileversion from a pe exe's versioninfo resource, hand-parsed to skip a dependency
function readPeFileVersion(exePath) {
  let fd;
  try {
    fd = fs.openSync(exePath, 'r');
    const head = Buffer.alloc(4096);
    fs.readSync(fd, head, 0, head.length, 0);

    if (head.readUInt16LE(0) !== 0x5a4d) return null; // 'mz'
    const peOff = head.readUInt32LE(0x3c);
    if (peOff + 24 > head.length || head.readUInt32LE(peOff) !== 0x00004550) return null; // 'pe\0\0'

    const nSections = head.readUInt16LE(peOff + 6);
    const sizeOfOptionalHeader = head.readUInt16LE(peOff + 20);
    const optOff = peOff + 24;
    const magic = head.readUInt16LE(optOff);
    const isPE32Plus = magic === 0x20b;
    if (!isPE32Plus && magic !== 0x10b) return null;

    // data directory entry 2 is the resource table; offset differs between pe32 and pe32+
    const dataDirOff = optOff + (isPE32Plus ? 112 : 96);
    const resourceRva = head.readUInt32LE(dataDirOff + 2 * 8);
    if (!resourceRva) return null;

    const sectionsOff = optOff + sizeOfOptionalHeader;
    if (sectionsOff + nSections * 40 > head.length) return null; // unusually large header, bail instead of misreading

    const sections = [];
    for (let i = 0; i < nSections; i++) {
      const off = sectionsOff + i * 40;
      sections.push({
        virtualSize: head.readUInt32LE(off + 8),
        virtualAddr: head.readUInt32LE(off + 12),
        rawSize: head.readUInt32LE(off + 16),
        rawPtr: head.readUInt32LE(off + 20),
      });
    }
    const rvaToOffset = (rva) => {
      const s = sections.find((s) => rva >= s.virtualAddr && rva < s.virtualAddr + Math.max(s.virtualSize, s.rawSize));
      return s ? s.rawPtr + (rva - s.virtualAddr) : null;
    };

    const resSection = sections.find(
      (s) => resourceRva >= s.virtualAddr && resourceRva < s.virtualAddr + Math.max(s.virtualSize, s.rawSize)
    );
    if (!resSection) return null;

    const res = Buffer.alloc(resSection.rawSize);
    fs.readSync(fd, res, 0, res.length, resSection.rawPtr + (resourceRva - resSection.virtualAddr));

    // resource tree is type -> name -> language; high bit marks dir vs leaf entry
    const readDirEntries = (dirOff) => {
      if (dirOff + 16 > res.length) return [];
      const nNamed = res.readUInt16LE(dirOff + 12);
      const nId = res.readUInt16LE(dirOff + 14);
      const entries = [];
      for (let i = 0; i < nNamed + nId; i++) {
        const eOff = dirOff + 16 + i * 8;
        if (eOff + 8 > res.length) break;
        entries.push({ id: res.readUInt32LE(eOff), offset: res.readUInt32LE(eOff + 4) });
      }
      return entries;
    };

    const RT_VERSION = 16;
    const verEntry = readDirEntries(0).find((e) => e.id === RT_VERSION);
    if (!verEntry) return null;
    const nameEntries = readDirEntries(verEntry.offset & 0x7fffffff);
    if (!nameEntries.length) return null;
    const langEntries = readDirEntries(nameEntries[0].offset & 0x7fffffff);
    if (!langEntries.length) return null;

    const dataEntryOff = langEntries[0].offset; // leaf, high bit not set
    if (dataEntryOff + 8 > res.length) return null;
    const dataRva = res.readUInt32LE(dataEntryOff);
    const dataSize = res.readUInt32LE(dataEntryOff + 4);

    const viFileOff = rvaToOffset(dataRva);
    if (viFileOff == null) return null;
    const vi = Buffer.alloc(dataSize);
    fs.readSync(fd, vi, 0, vi.length, viFileOff);

    // vs_versioninfo header, then the padded key, then the fixedfileinfo struct we want
    const keyBytes = ('VS_VERSION_INFO'.length + 1) * 2;
    const fixedOff = (6 + keyBytes + 3) & ~3;
    if (fixedOff + 16 > vi.length || vi.readUInt32LE(fixedOff) !== 0xfeef04bd) return null;

    const fileVersionMS = vi.readUInt32LE(fixedOff + 8);
    const fileVersionLS = vi.readUInt32LE(fixedOff + 12);
    return [fileVersionMS >>> 16, fileVersionMS & 0xffff, fileVersionLS >>> 16, fileVersionLS & 0xffff].join('.');
  } catch {
    return null;
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        /* ignore */
      }
    }
  }
}

// data.win/game.unx md5 maps to exact version; pc platforms only, no consoles
const UNDERTALE_DATA_FILE_VERSIONS = {
  d0822e279464db858682ca99ec4cbbff: 'v1.00', // windows, steam
  b8937c236b4cd2ef6de3513f5be282d1: 'v1.00', // osx, steam
  cd48b89b6ac6b2d3977f2f82726e5f12: 'v1.001', // windows, steam
  ee6560271ac91ef9ce564e64102d449c: 'v1.001', // windows, gog
  dd9179255566e722f7a709c56ace912a: 'v1.001', // osx, steam
  '88ae093aa1ae0c90da0d3ff1e15aa724': 'v1.001', // linux, steam, first linux release
  '2a840c78198d5d0c14fe25dfd44f1b6c': 'v1.001', // osx, steam
  f9c72be740313c4dfa3af5e71760d12f: 'v1.001', // osx, steam
  a3aedacc024c96df05cf262a8f60770c: 'v1.001', // osx, steam
  '856219e69dd39e76deca0586a7f44307': 'v1.05', // windows, steam
  c138a67154b6185c710a3778cacb22d4: 'v1.05', // osx, steam
  '0bf582aa180983a9ffa721aa2be2f273': 'v1.05a', // windows, steam
  '35d423183188c70b5097827930dd7d7e': 'v1.05a', // linux, steam
  '4d40626978f93b5ddca71586ad670d46': 'v1.05a', // osx, steam
  '6a51aefc263305791b37eba33ed5707c': 'v1.05a', // osx, humble bundle
  '582795ad2037d06cdc8db0c72d9360d5': 'v1.06', // windows, steam
  ba93da4d380b188e7397c5db46b6e508: 'v1.06', // linux, steam
  ae5b21eaa89f162eed788390bccfe0ca: 'v1.06', // osx, steam
  '627da8a0368392204d2af4b5b15f4f7f': 'v1.06', // windows, gog
  '472303740be739acf4377e00263f9fec': 'v1.06', // linux, humble bundle
  '5903fc5cb042a728d4ad8ee9e949c6eb': 'v1.08', // windows, steam
  e996649a751e5dc5182b8416168042b5: 'v1.08', // linux, steam
  '5cdb1e4dba5847bf92d7bf8f867952aa': 'v1.08', // osx, steam
  ff4f10d0434b332f46e1f35a900ec862: 'v1.08', // win10 store/humble/gog/game pass (pc)
  a6036317aa1d668bdd9ec3669e6c266c: 'v1.08', // linux, humble bundle
  dc0f9737c6bbc22902792c3c7e6dcadd: 'v1.08', // osx, humble bundle
  b4abe58dddb699ab81717e8e21254a38: 'v1.08', // osx, steam
  fc049850856dea4ef1427bbf5653fc47: 'v1.08', // osx, steam
};

// finds data.win (windows) or assets/game.unx (linux) next to the exe; mac unhandled
function findUndertaleDataFile(executable) {
  const dir = path.dirname(executable);
  const candidates = [path.join(dir, 'data.win'), path.join(dir, 'assets', 'game.unx')];
  return candidates.find(existsFile) || null;
}

function md5File(filePath) {
  try {
    return crypto.createHash('md5').update(fs.readFileSync(filePath)).digest('hex');
  } catch {
    return null;
  }
}

// version label: undertale uses data file md5, others fall back to pe fileversion then steam build id
function detectVersion(game, executable, steamapps) {
  if (!executable) return null;

  if (game.id === 'undertale') {
    const dataFile = findUndertaleDataFile(executable);
    const hash = dataFile && md5File(dataFile);
    const known = hash && UNDERTALE_DATA_FILE_VERSIONS[hash];
    if (known) return known;
  }

  if (executable.toLowerCase().endsWith('.exe')) {
    const fileVersion = readPeFileVersion(executable);
    if (fileVersion) return `v${fileVersion}`;
  }

  if (steamapps && game.steamAppId) {
    const buildId = readSteamBuildId(steamapps, game.steamAppId);
    if (buildId) return `Build ${buildId}`;
  }

  return null;
}

// deltarune ships chapters as chapterN_* folders; highest one present = chapters included
function detectChapters(executable) {
  if (!executable) return null;
  let entries;
  try {
    entries = fs.readdirSync(path.dirname(executable), { withFileTypes: true });
  } catch {
    return null;
  }
  let maxChapter = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const match = entry.name.match(/^chapter(\d+)_/i);
    if (match) maxChapter = Math.max(maxChapter, Number(match[1]));
  }
  if (!maxChapter) return null;
  return maxChapter === 1 ? 'Chapter 1' : `Chapters 1-${maxChapter}`;
}

// finds a steam game's save folder inside its proton prefix
function detectProtonSaveDir(game) {
  if (!game.steamAppId || !game.localAppDataDir) return null;
  for (const steamapps of steamLibraries()) {
    const prefixBase = path.join(
      steamapps,
      'compatdata',
      game.steamAppId,
      'pfx',
      'drive_c',
      'users',
      'steamuser'
    );
    // newer proton uses local, some titles use roaming
    const candidates = [
      path.join(prefixBase, 'AppData', 'Local', game.localAppDataDir),
      path.join(prefixBase, 'AppData', 'Roaming', game.localAppDataDir),
    ];
    for (const dir of candidates) {
      const hit = existsDirCI(dir);
      if (hit) return hit;
    }
  }
  return null;
}

// save folder inside own managed proton prefix (non-steam fangames)
// no 'pfx' segment here unlike steam's compatdata layout above
// launchViaProton points WINEPREFIX straight at wine-prefixes/<gameId>, umu/proton don't nest
// a pfx dir under a prefix created by the program
function detectManagedProtonSaveDir(game, userDataPath) {
  if (!userDataPath || !game.localAppDataDir) return null;
  const prefixBase = path.join(userDataPath, 'wine-prefixes', game.id, 'drive_c', 'users', 'steamuser');
  const candidates = [
    path.join(prefixBase, 'AppData', 'Local', game.localAppDataDir),
    path.join(prefixBase, 'AppData', 'Roaming', game.localAppDataDir),
  ];
  for (const dir of candidates) {
    const hit = existsDirCI(dir);
    if (hit) return hit;
  }
  return null;
}

function detectSaveDir(game, userDataPath) {
  const raw = game.saveDir[PLATFORM];
  const candidates = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (const candidate of candidates) {
    const dir = expand(candidate);
    const hit = existsDirCI(dir);
    if (hit) return hit;
  }
  // falls back to the proton prefix when the native config path doesn't exist
  if (PLATFORM === 'linux') {
    const protonDir = detectProtonSaveDir(game) || detectManagedProtonSaveDir(game, userDataPath);
    if (protonDir) return protonDir;
  }
  return null;
}

// builds the status snapshot for every game, applying manual overrides
function detectAll(overrides = {}, userDataPath = null, saveDirOverrides = {}) {
  return GAMES.map((game) => {
    const override = overrides[game.id];
    let executable = null;
    let source = null;
    let viaSteamLibrary = false;
    let steamapps = null;

    if (override && (existsFile(override) || existsDir(override))) {
      executable = override;
      source = 'manual';
    } else {
      const result = detectExecutable(game);
      executable = result.executable;
      viaSteamLibrary = result.viaSteamLibrary;
      steamapps = result.steamapps;
      if (executable) source = 'auto';
    }

    // steam-known games launch via steam (for the runtime container/proton prefix); manual paths launch directly
    const needsSteamLaunch = Boolean(executable && game.steamAppId && source === 'auto' && viaSteamLibrary);

    // manual save-folder override wins over auto-detection
    // covers fangames whose guessed appdata/config folder name doesn't match the real one
    const saveDirOverride = saveDirOverrides[game.id];
    const hasSaveDirOverride = Boolean(saveDirOverride && existsDir(saveDirOverride));
    const saveDir = hasSaveDirOverride ? saveDirOverride : detectSaveDir(game, userDataPath);

    return {
      id: game.id,
      name: game.name,
      creator: game.creator,
      category: game.category,
      steamAppId: game.steamAppId,
      executable,
      source, // 'auto' | 'manual' | null
      needsSteamLaunch,
      version: executable ? detectVersion(game, executable, steamapps) : null,
      chapters: detectChapters(executable),
      saveDir,
      saveDirSource: hasSaveDirOverride ? 'manual' : saveDir ? 'auto' : null,
      editorUrl: game.editorUrl,
      nativeEditor: game.nativeEditor || null,
      storeUrl: game.storeUrl || null,
    };
  });
}

// whether steam appears installed, for choosing steam:// vs the web store page
function isSteamInstalled() {
  return steamLibraries().length > 0;
}

module.exports = { GAMES, detectAll, expand, isSteamInstalled, findLocalProton };
