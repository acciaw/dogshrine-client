'use strict';

// tem shop screen: shares hideAllScreens, setActiveNav, and el from renderer.js

const storeScreen = document.getElementById('store-screen');

function goToStore() {
  hideAllScreens();
  storeScreen.classList.remove('hidden');
  setActiveNav('store');
}

document.querySelectorAll('.nav-item').forEach((btn) => {
  if (btn.dataset.page === 'store') {
    btn.onclick = goToStore;
  }
});
