'use strict';

const { spawn } = require('child_process');

// windows-only best-effort foreground-window watcher. one persistent powershell
// loop emits the active window's process name so the overlay can hide itself
// when the game is minimized or another app is focused

let child = null;

const SCRIPT = `
$sig = @'
using System;
using System.Runtime.InteropServices;
public class FG {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr h, out int pid);
}
'@
Add-Type $sig
while ($true) {
  $h = [FG]::GetForegroundWindow()
  $p = 0
  [void][FG]::GetWindowThreadProcessId($h, [ref]$p)
  try { $n = (Get-Process -Id $p -ErrorAction Stop).ProcessName } catch { $n = '' }
  Write-Output $n
  Start-Sleep -Milliseconds 700
}
`;

function start(onChange) {
  if (process.platform !== 'win32' || child) return;
  const encoded = Buffer.from(SCRIPT, 'utf16le').toString('base64');
  try {
    child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
      windowsHide: true,
    });
  } catch {
    child = null;
    return;
  }
  let buf = '';
  child.stdout.on('data', (d) => {
    buf += d.toString();
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      onChange(line.toLowerCase());
    }
  });
  child.on('error', () => {
    child = null;
  });
  child.on('exit', () => {
    child = null;
  });
}

function stop() {
  if (child) {
    try {
      child.kill();
    } catch {
      // ignore
    }
    child = null;
  }
}

module.exports = { start, stop };
