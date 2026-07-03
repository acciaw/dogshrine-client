'use strict';

// status display for the boot-time update window

const textEl = document.getElementById('update-text');
const trackEl = document.getElementById('update-progress-track');
const fillEl = document.getElementById('update-progress-fill');
const skipBtn = document.getElementById('update-skip');

skipBtn.onclick = () => {
  skipBtn.disabled = true;
  window.updateStatus.skip();
};

window.updateStatus.onStatus((status) => {
  switch (status.phase) {
    case 'checking':
      textEl.textContent = 'Checking for updates…';
      break;
    case 'downloading':
      textEl.textContent = `Downloading v${status.version}…`;
      trackEl.classList.remove('hidden');
      fillEl.style.width = `${status.percent || 0}%`;
      skipBtn.textContent = 'Skip and continue';
      break;
    case 'ready':
      textEl.textContent = `Installing v${status.version}, restarting…`;
      skipBtn.classList.add('hidden');
      break;
    case 'failed':
      textEl.textContent = "Update failed — continuing on this version.";
      break;
    case 'none':
      textEl.textContent = "You're up to date.";
      break;
  }
});
