'use strict';

const { execFile } = require('child_process');

// NOTE: an earlier version of this module tried to force a game's window into
// borderless-fullscreen by stripping its frame and resizing it to the monitor.
// that was a mistake: tested against the real UNDERTALE.exe, a single external
// resize sends its GameMaker runner into a runaway grow loop (the window expands
// every frame forever). and it was unnecessary anyway - undertale's own F4
// fullscreen is already a plain borderless window (verified: 1720x1080, no
// frame, stable), not exclusive fullscreen. so the resize feature was removed.
//
// all that remains is a cleanup: the old version ran a persistent while-loop
// powershell, and if the app ever crashed those loops keep resizing the game
// window forever and survive a restart. this kills any that are still around.

function killOrphans() {
  if (process.platform !== 'win32') return;
  const cleanup = `
$ErrorActionPreference = 'SilentlyContinue'
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | ForEach-Object {
  if ($_.ProcessId -eq $PID) { return }
  if ($_.CommandLine -match '-[Ee]ncodedCommand\\s+([A-Za-z0-9+/=]+)') {
    try {
      $decoded = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String($matches[1]))
      if ($decoded -like '*WinBorderless*' -or $decoded -like '*GameZorder*') { Stop-Process -Id $_.ProcessId -Force }
    } catch {}
  }
}
`;
  const encoded = Buffer.from(cleanup, 'utf16le').toString('base64');
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { windowsHide: true }, () => {});
}

module.exports = { killOrphans };
