'use strict';

// update notifier

const updateBanner = document.getElementById('update-banner');
const updateBannerText = document.getElementById('update-banner-text');
const updateBannerDownload = document.getElementById('update-banner-download');
const updateBannerDismiss = document.getElementById('update-banner-dismiss');

const updateToggle = document.getElementById('settings-update-toggle');
const updateCheckBtn = document.getElementById('settings-update-check');
const updateStatus = document.getElementById('settings-update-status');

let latestUpdate = null; // last available result from checkForUpdate(), used to drive the banner and download button

function showUpdateBanner(info) {
  latestUpdate = info;
  updateBannerText.textContent = `Dog Shrine v${info.version} is available.`;
  updateBannerDownload.disabled = false;
  updateBannerDownload.textContent = 'Update & restart';
  updateBanner.classList.remove('hidden');
}

window.toby.onDownloadProgress((percent) => {
  if (!updateBannerDownload.disabled) return;
  updateBannerDownload.textContent = `Downloading… ${percent}%`;
});

updateBannerDownload.onclick = async () => {
  if (!latestUpdate) return;
  updateBannerDownload.disabled = true;
  updateBannerDownload.textContent = 'Downloading…';
  updateBannerDismiss.disabled = true;
  const res = await window.toby.downloadUpdate();
  if (res.ok) {
    updateBannerText.textContent = `Restarting to install v${latestUpdate.version}…`;
    await window.toby.quitAndInstall();
    return;
  }
  updateBannerDownload.disabled = false;
  updateBannerDismiss.disabled = false;
  updateBannerDownload.textContent = 'Retry';
  updateBannerText.textContent = `Couldn't download v${latestUpdate.version} (${res.error || 'unknown error'}).`;
};
updateBannerDismiss.onclick = () => updateBanner.classList.add('hidden');

// persists the launch-check preference
updateToggle.onchange = () => window.toby.setCheckForUpdates(updateToggle.checked);

// always checks regardless of the toggle, reports inline (launch check stays silent)
updateCheckBtn.onclick = async () => {
  updateStatus.textContent = 'Checking…';
  const res = await window.toby.checkForUpdate();
  if (res.reason === 'dev') {
    updateStatus.textContent = 'Update checks run in packaged builds only.';
  } else if (res.available) {
    updateStatus.textContent = `v${res.version} is available.`;
    showUpdateBanner(res);
  } else {
    updateStatus.textContent = "You're up to date.";
  }
};

// reflects the saved preference
(async () => {
  const { checkForUpdates } = await window.toby.getSettings();
  updateToggle.checked = Boolean(checkForUpdates);
})();
