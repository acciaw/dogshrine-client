'use strict';

// applies the theme's colors to the css vars, loaded first so the ipc
// round-trip starts early and the default-theme flash stays short

function applyThemeColors(colors) {
  const root = document.documentElement.style;
  root.setProperty('--bg', colors.bg);
  root.setProperty('--card', colors.card);
  root.setProperty('--card-border', colors.cardBorder);
  root.setProperty('--text', colors.text);
  root.setProperty('--muted', colors.muted);
  root.setProperty('--accent', colors.accent);
  root.setProperty('--accent-dim', colors.accentDim);
  root.setProperty('--ok', colors.ok);
  root.setProperty('--bad', colors.bad);
}

(async () => {
  const [{ theme }, themeList] = await Promise.all([window.toby.getSettings(), window.toby.getThemes()]);
  const active = themeList.find((t) => t.id === theme) || themeList[0];
  if (active) applyThemeColors(active.colors);
})();
