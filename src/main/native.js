'use strict';

// native overlay injection (windows only). picks the x86/x64 injector + dll by
// the game exe's bitness and loads the dll into the running game. the dll itself
// auto-detects dx9 vs dx11 at runtime, so the app only needs the bitness here.

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { app } = require('electron');

function binDir() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'native-bin');
  return path.join(__dirname, '..', '..', 'native-bin');
}

// read the PE machine field: 0x014c = 32-bit, 0x8664 = 64-bit
function bitnessOf(exePath) {
  let fd;
  try {
    fd = fs.openSync(exePath, 'r');
    const dos = Buffer.alloc(64);
    fs.readSync(fd, dos, 0, 64, 0);
    const peOff = dos.readUInt32LE(0x3c);
    const head = Buffer.alloc(6);
    fs.readSync(fd, head, 0, 6, peOff);
    if (head.readUInt32LE(0) !== 0x00004550) return null; // not "PE\0\0"
    const machine = head.readUInt16LE(4);
    if (machine === 0x8664) return 64;
    if (machine === 0x014c) return 32;
    return null;
  } catch {
    return null;
  } finally {
    if (fd != null) try { fs.closeSync(fd); } catch { /* ignore */ }
  }
}

// find the pid of a running image by name via tasklist csv
function findPid(exeName) {
  return new Promise((resolve) => {
    execFile('tasklist', ['/fi', `imagename eq ${exeName}`, '/fo', 'csv', '/nh'], { windowsHide: true }, (err, stdout) => {
      if (err || !stdout) return resolve(null);
      const line = stdout.split(/\r?\n/).find((l) => l.toLowerCase().includes(exeName.toLowerCase()));
      if (!line) return resolve(null);
      const cols = line.split('","').map((c) => c.replace(/^"|"$/g, ''));
      const pid = parseInt(cols[1], 10);
      resolve(Number.isFinite(pid) ? pid : null);
    });
  });
}

function available() {
  if (process.platform !== 'win32') return false;
  const dir = binDir();
  return fs.existsSync(path.join(dir, 'injector-x64.exe')) && fs.existsSync(path.join(dir, 'dogshrine-overlay-x64.dll'));
}

// injects the matching dll into the running game exe. resolves { ok, pid, arch }
function inject(exePath) {
  return new Promise(async (resolve) => {
    if (!available()) return resolve({ ok: false, reason: 'binaries missing' });
    const bits = bitnessOf(exePath);
    if (!bits) return resolve({ ok: false, reason: 'unknown bitness' });
    const pid = await findPid(path.basename(exePath));
    if (!pid) return resolve({ ok: false, reason: 'process not found' });

    const arch = bits === 64 ? 'x64' : 'x86';
    const dir = binDir();
    const injector = path.join(dir, `injector-${arch}.exe`);
    const dll = path.join(dir, `dogshrine-overlay-${arch}.dll`);
    if (!fs.existsSync(injector) || !fs.existsSync(dll)) {
      return resolve({ ok: false, reason: `missing ${arch} binaries` });
    }

    execFile(injector, [String(pid), dll], { windowsHide: true }, (err, stdout) => {
      const ok = !err && /injected ok/i.test(stdout || '');
      resolve({ ok, pid, arch, reason: ok ? '' : (err ? err.message : stdout) });
    });
  });
}

module.exports = { available, inject, bitnessOf, findPid };
