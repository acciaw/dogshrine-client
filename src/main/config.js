'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function getConfigPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function read() {
  try {
    return JSON.parse(fs.readFileSync(getConfigPath(), 'utf8'));
  } catch {
    return { overrides: {} };
  }
}

function write(config) {
  const configPath = getConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
}

function getOverrides() {
  return read().overrides || {};
}

function setOverride(gameId, executablePath) {
  const config = read();
  config.overrides = config.overrides || {};
  if (executablePath) {
    config.overrides[gameId] = executablePath;
  } else {
    delete config.overrides[gameId];
  }
  write(config);
  return config.overrides;
}

function getSaveDirOverrides() {
  return read().saveDirOverrides || {};
}

// manual save-folder override, separate from the executable override above
// needed for fangames whose auto-detected save path (for example a guessed appdata folder name)
// doesn't match where the game actually writes saves
function setSaveDirOverride(gameId, saveDirPath) {
  const config = read();
  config.saveDirOverrides = config.saveDirOverrides || {};
  if (saveDirPath) {
    config.saveDirOverrides[gameId] = saveDirPath;
  } else {
    delete config.saveDirOverrides[gameId];
  }
  write(config);
  return config.saveDirOverrides;
}

module.exports = { getOverrides, setOverride, getSaveDirOverrides, setSaveDirOverride };
