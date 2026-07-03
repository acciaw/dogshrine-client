'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const themes = require('./themes');

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'themes.json');
}

// defaults for every global app setting
const DEFAULTS = {
  theme: 'title-screen',
  checkForUpdates: true,
  soundsEnabled: true,
};

function read() {
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(getSettingsPath(), 'utf8')) };
  } catch {
    return { ...DEFAULTS };
  }
}

function write(settings) {
  const settingsPath = getSettingsPath();
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
}

/* creates themes.json with defaults if it doesn't exist yet */
function ensureFile() {
  if (!fs.existsSync(getSettingsPath())) write(read());
}

function get() {
  return read();
}

function set(partial) {
  const settings = { ...read(), ...partial };
  write(settings);
  return settings;
}

function setTheme(themeId) {
  return set({ theme: themes.find(themeId).id });
}

function setCheckForUpdates(enabled) {
  return set({ checkForUpdates: Boolean(enabled) });
}

function setSoundsEnabled(enabled) {
  return set({ soundsEnabled: Boolean(enabled) });
}

module.exports = { get, set, setTheme, setCheckForUpdates, setSoundsEnabled, ensureFile };
