'use strict';

const { Tray, Menu } = require('electron');

// system tray icon, lets the app keep running (overlay, hotkeys, recording)
// while the main window is hidden. menu is rebuilt fresh each open so the
// game list reflects whatever is currently detected

let tray = null;

function buildMenu({ detectGames, onOpen, onLaunch, onExit }) {
  const games = detectGames().filter((g) => g.executable);
  const gameItems = games.length
    ? games.map((g) => ({ label: `Launch ${g.name}`, click: () => onLaunch(g.id) }))
    : [{ label: 'No games found', enabled: false }];

  return Menu.buildFromTemplate([
    { label: 'Open Dog Shrine', click: onOpen },
    { type: 'separator' },
    ...gameItems,
    { type: 'separator' },
    { label: 'Exit Dog Shrine', click: onExit },
  ]);
}

function create(iconPath, handlers) {
  if (tray) return tray;
  tray = new Tray(iconPath);
  tray.setToolTip('Dog Shrine');
  const popup = () => tray.popUpContextMenu(buildMenu(handlers));
  // left-click opens the menu (as requested), right-click matches the same for convenience
  tray.on('click', popup);
  tray.on('right-click', popup);
  tray.on('double-click', handlers.onOpen);
  return tray;
}

function destroy() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

module.exports = { create, destroy };
