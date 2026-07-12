# Dog Shrine

A unified launcher and save manager for **Undertale**, **Deltarune**, and **Undertale Yellow** across Windows, Linux, and macOS.

## What it does

Dog Shrine is an Electron app that brings together tools for managing your Undertale-series games in one place:

- **Game detection** — automatically finds installed copies of Undertale, Deltarune, and Undertale Yellow on your system
- **One-click launching** — starts your games directly from the app
- **Native save editor** — edit Undertale saves without leaving the app (HP, EXP, items, etc.)
- **Save slots** — back up and swap between different save states (perfect for managing multiple playthroughs like Pacifist, Genocide, or Neutral)
- **Online editors** — access Deltarune's and Undertale Yellow's save editors via embedded browser views
- **Themes** — 9 visual themes inspired by Undertale and Deltarune locations
- **Speedrunner overlay** — an optional overlay on top of your game with a full LiveSplit-style timer (segments, PB/gold/sum-of-best, delta colors, `.lss` import/export) and a live keystroke display. Widgets can be moved, toggled, or popped out into their own windows, with configurable global hotkeys and an over-focus hotkey to rearrange things without alt-tabbing. Includes game-window recording and an instant-replay "save the last N seconds" clip. Works best over borderless/windowed games.
- **Cross-platform** — handles Windows games on Linux via Proton detection, native macOS support, and standard Windows installs
- **Auto-updater** — checks GitHub for new releases and notifies you when one's available

All saves stay on your computer—Dog Shrine only manages files already installed locally.

## What's coming

The app is built with future features in mind:

- **Hometown** — a dashboard for quick access to your games and saves
- **UnderNet** — a community feed for sharing moments and events
- **Tem Shop** — a directory of fangame downloads with creator attribution (never hosting the files, just linking to them)

## How to run

```bash
npm install
npm start
```

Runs the Electron app in dev mode.

## How detection works

- **Undertale / Deltarune** are probed across every Steam library found in `libraryfolders.vdf` (default install, extra libraries, and Flatpak Steam on Linux). On Windows, also checks the Steam registry key in case Steam itself was installed to a non-default drive.
- On Linux, if only a `.exe` is found (the Windows depot running under Proton — common for Deltarune), launching goes through `steam://rungameid/<appid>` instead of spawning the binary directly, and the save folder is located inside the Proton compatibility prefix.
- **Undertale Yellow** is a free GameJolt/itch fangame (not on Steam, no fixed install path), so it's checked in a few common spots and otherwise located manually.
- macOS paths are mostly unverified (no Mac available to test against) except Undertale's save path, which is confirmed. Several `.app` bundle name casings and bundle-ID guesses are tried defensively; please report mismatches.
- Anything not found can be pointed at via **Locate…**; manual paths are saved to `config.json` in Electron's `userData` dir and survive re-scans.

## Save editing

- **Deltarune / Undertale Yellow** — embedded community editors (tennaproject.com, save.yellow.undertale.wiki) loaded in a `<webview>`. Opening one backs up the save folder first and defaults the export/download dialog back to it.
- **Undertale** — native built-in editor (`src/main/saveFormats/undertale.js`) for `file0`/`file1`/`file2` and `undertale.ini`. Field offsets were confirmed against the Cofeiini/UndertaleSaveEditor project's source (GPLv3) — only the factual offsets were used; the parsing code and field labels here are original, to keep this project's license unencumbered. Untouched fields always round-trip byte-for-byte; `undertale.ini` writes only the keys actually edited, leaving the rest of the file as found.

## Save slots

Unlimited named save profiles per game, for games that otherwise allow only one save (Undertale especially). A slot is a full snapshot of the game's save folder, stored under `userData/slots/<gameId>/`. You can save the current state as a new slot, load a slot (swapping it into the live save folder), overwrite a slot with the current save, rename, and delete.

Loading is the only destructive operation in the app, so the swap is written defensively (`src/main/saveSlots.js`): it stages the new contents, moves the live folder aside, swaps atomically, and only deletes the old copy on success — rolling back to the original if anything fails. It also always takes an independent timestamped safety backup of the live save before swapping. Close the game before loading a slot, since a running game can overwrite the folder on exit. (Note: for Steam-Cloud-enabled games, Steam may re-sync over a swap; disable Cloud for that title if you rely on slots.)

## UI & Design

- Persistent sidebar (pun names, matching the game series' style): **Librarby** (Library), **Hometown** (Home), and **UnderNet** (Community) are placeholders, **Tem Shop** (Store) is a stub page. **Settings** is pinned at the bottom.
- Pixel font is **VT323** (SIL OFL 1.1, self-hosted) — not the game's actual "Determination" font, since that's a fan recreation with unclear redistribution rights.
- Sidebar/header icons are from **pixelarticons** (MIT), inlined as SVG so they theme with `currentColor`.

## Architecture

```
src/main/
  main.js               window + IPC handlers (detect, launch, locate, save editing)
  gameDetection.js      per-OS executable + save-dir detection
  config.js             persisted manual-path overrides
  preload.js            contextBridge API exposed to the renderer
  saveSlots.js          named save-profile snapshots + the safe folder-swap
  settings.js           persistent user settings (theme, sound, etc.)
  themes.js             theme definitions
  updater.js            GitHub release checker
  sansFightPreload.js   easter egg iframe sandbox
  overlay.js            speedrunner overlay window + focus mode + popouts
  hotkeys.js            global shortcut owner
  inputHook.js          uiohook-napi keystroke hook (optional native module)
  livesplit.js          split-run persistence + .lss dialogs
  recorder.js           hidden game-window capture + clip writing
  overlayPreload.js / recorderPreload.js   contextBridges for those windows
  saveFormats/
    undertale.js        file0 / undertale.ini parser + serializer
src/renderer/           UI (vanilla HTML/CSS/JS, no build step)
  renderer.js           library screen + embedded-webview editor + sidebar nav
  index.html            app layout and structure
  styles.css            theming and layout
  ut-editor.js          native Undertale editor screen
  slots.js              save-slots manager screen
  settings.js           settings screen (incl. Overlay category)
  store.js              Tem Shop placeholder screen
  theme.js              theme loading
  updater.js            update banner logic
  sans-fight.js         easter egg handler
  overlay/              overlay + widgets (LiveSplit, keystrokes, recorder, .lss)
  fonts/                VT323 (OFL) + license
src/img/
  app/                  window/taskbar icon + sidebar brand image
  icons/                pixelarticons SVGs (MIT) + license
  official/, fangames/  per-game logos
src/sound/
  snd_ominous_music.wav easter egg audio
```

## Future plans

- **Backend + web frontend** — community: guides, forums, and a fangame **catalog** that stores metadata + download links only. Games are fetched from the creator's own hosting; we never redistribute the files.
- **Hometown dashboard** — quick access to your library and save slots
- **UnderNet community** — share saves, discoveries, and moments with other players

## Licensing

Dog Shrine is MIT licensed. It's a fan project, not affiliated with Toby Fox or any fangame creators.

Icons by pixelarticons (MIT), font by VT323 (SIL Open Font License 1.1). External save editors (tennaproject.com, save.yellow.undertale.wiki) are separate projects.
