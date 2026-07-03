'use strict';

const { app } = require('electron');
const { GITHUB_OWNER, GITHUB_REPO } = require('./updateConfig');

let configuredUpdater = null;
function getAutoUpdater() {
  if (!configuredUpdater) {
    const { autoUpdater } = require('electron-updater');
    // drives download+install so user can control manually
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.setFeedURL({ provider: 'github', owner: GITHUB_OWNER, repo: GITHUB_REPO });
    configuredUpdater = autoUpdater;
  }
  return configuredUpdater;
}

// converts a version string like "v1.2.3" to an array of numbers [1, 2, 3]
function parseVersion(v) {
  const m = String(v).trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

// returns >0 when a is newer than b, <0 when older, 0 when equal
function compareVersions(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

/* checks github for a newer release (doesn't download anything) */
async function checkForUpdate() {
  // skipped in dev mode
  if (!app.isPackaged) return { available: false, reason: 'dev' };

  let result;
  try {
    result = await getAutoUpdater().checkForUpdates();
  } catch {
    return { available: false };
  }
  if (!result || !result.updateInfo) return { available: false };

  const current = parseVersion(app.getVersion());
  const latest = parseVersion(result.updateInfo.version);
  if (!current || !latest || compareVersions(latest, current) <= 0) return { available: false };

  return {
    available: true,
    version: result.updateInfo.version,
    notes: typeof result.updateInfo.releaseNotes === 'string' ? result.updateInfo.releaseNotes : '',
  };
}

// downloads the release checkForUpdate() already found, token lets a caller cancel mid-download
function downloadUpdate(onProgress, cancellationToken) {
  const autoUpdater = getAutoUpdater();
  return new Promise((resolve, reject) => {
    const onProgressHandler = (progress) => onProgress && onProgress(progress);
    const onDownloaded = () => {
      cleanup();
      resolve();
    };
    const onError = (err) => {
      cleanup();
      reject(err);
    };
    function cleanup() {
      autoUpdater.off('download-progress', onProgressHandler);
      autoUpdater.off('update-downloaded', onDownloaded);
      autoUpdater.off('error', onError);
    }
    autoUpdater.on('download-progress', onProgressHandler);
    autoUpdater.once('update-downloaded', onDownloaded);
    autoUpdater.once('error', onError);
    autoUpdater.downloadUpdate(cancellationToken).catch(onError);
  });
}

// quits and relaunches into the downloaded update; isSilent skips the NSIS UI on
// windows, isForceRunAfter makes sure the new version actually reopens after
function quitAndInstall() {
  getAutoUpdater().quitAndInstall(true, true);
}

// only set while runStartupUpdate() is in flight, so skipStartupUpdate() has
// something to cancel; a fresh token per run, never reused across boots
let startupToken = null;

function skipStartupUpdate() {
  if (startupToken) startupToken.cancel();
}

/*
 * startup flow: check, download + install, show the app.
 */
async function runStartupUpdate(onStatus) {
  if (!app.isPackaged) return { proceed: true };

  const { CancellationToken } = require('electron-updater');
  startupToken = new CancellationToken();
  try {
    onStatus({ phase: 'checking' });
    const info = await checkForUpdate();
    if (startupToken.cancelled || !info.available) {
      onStatus({ phase: 'none' });
      return { proceed: true };
    }

    onStatus({ phase: 'downloading', version: info.version, percent: 0 });
    try {
      await downloadUpdate(
        (progress) => onStatus({ phase: 'downloading', version: info.version, percent: Math.round(progress.percent) }),
        startupToken
      );
    } catch {
      if (!startupToken.cancelled) onStatus({ phase: 'failed' });
      return { proceed: true };
    }

    onStatus({ phase: 'ready', version: info.version });
    quitAndInstall();
    return { proceed: false };
  } finally {
    startupToken = null;
  }
}

module.exports = { checkForUpdate, downloadUpdate, quitAndInstall, runStartupUpdate, skipStartupUpdate };
