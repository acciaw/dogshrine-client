'use strict';

const { spawn } = require('child_process');

// windows-only z-order helper. some games mark their window WS_EX_TOPMOST when
// they go fullscreen (undertale's F4), which puts them in the same topmost band
// as our overlay and, because they activate last, above it - hiding the overlay.
// clearing that one ex-style bit drops the game just below our topmost overlay.
//
// this is an EX-STYLE change only (no move, no resize), which is why it's safe:
// verified against the real UNDERTALE.exe the flag stays cleared, the game does
// not re-add it, and the window does NOT grow (unlike the earlier resize hack).
// one persistent loop re-clears it in case the game re-adds topmost, e.g. the
// user toggles fullscreen again. it only calls SetWindowPos when the flag is
// actually set, so it's a no-op the rest of the time.

let child = null;

function scriptFor(processName) {
  const safe = processName.replace(/'/g, "''");
  return `
$ErrorActionPreference = 'SilentlyContinue'
$name = '${safe}'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class GameZorder {
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int cx, int cy, uint f);
}
'@
while ($true) {
  $p = Get-Process -Name $name | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
  if ($p) {
    $h = $p.MainWindowHandle
    $ex = [GameZorder]::GetWindowLong($h, -20)
    if (($ex -band 0x8) -ne 0) {
      # HWND_NOTOPMOST = -2, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE = 0x13
      [void][GameZorder]::SetWindowPos($h, [IntPtr](-2), 0, 0, 0, 0, 0x13)
    }
  }
  Start-Sleep -Milliseconds 1000
}
`;
}

function start(processName) {
  if (process.platform !== 'win32' || child || !processName) return;
  const encoded = Buffer.from(scriptFor(processName), 'utf16le').toString('base64');
  try {
    child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
      windowsHide: true,
    });
    child.on('error', () => {
      child = null;
    });
    child.on('exit', () => {
      child = null;
    });
  } catch {
    child = null;
  }
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
