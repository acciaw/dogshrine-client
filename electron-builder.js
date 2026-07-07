'use strict';

const { GITHUB_OWNER, GITHUB_REPO } = require('./src/main/updateConfig');

// electron-builder config: packages Dog Shrine for whichever platform it's run on (`npm run dist`) and publishes to the GitHub repo so src/main/updater.js has something to check against
module.exports = {
  appId: 'me.acciaw.dogshrine',
  productName: 'Dog Shrine',
  directories: {
    output: 'dist',
    buildResources: 'build',
  },
  files: ['src/**/*', 'package.json'],
  publish: [
    {
      provider: 'github',
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
    },
  ],
  win: {
    target: ['nsis'],
  },
  nsis: {
    oneClick: true,
    perMachine: false,
    allowToChangeInstallationDirectory: false,
    deleteAppDataOnUninstall: false,
  },
  linux: {
    target: ['AppImage', 'deb'],
    category: 'Game',
  },
  mac: {
    target: ['zip', 'dmg'],
    category: 'public.app-category.games',
  },
};
