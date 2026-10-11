# desktop

The Electron shell players run: one window with the built game, and the game's saves as files. It
holds no game code; the game finds it through `window.stillwakeDesktop` and uses it as its
`Platform` (`apps/game/src/platform`).

- `pnpm desktop` (from the root) builds the game and opens it; `pnpm --filter @stillwake/desktop dev`
  opens the Vite dev server instead, for work on the shell itself.
- **Files:** `src/main.ts` — the main process: the window, the IPC handlers, the page's console
  copied to the shell's; `src/saves.ts` — save slots as files; `src/preload.cjs` — the bridge the page
  sees, CommonJS as a sandboxed preload must be.

## Saves

- Each slot is `<slot>.json` in the user's data folder (`%APPDATA%/Stillwake/saves` on Windows).
- A slot name is plain (`a–z`, `0–9`, `-`), so it cannot climb out of the folder.
- A save is written beside its file and renamed over it: a crash mid-write leaves the last one whole.

## Deliberately not handled

- No installer and no Steam yet (electron-builder, steamworks.js): the shell runs from the repo.
- CI installs Electron's types but not its binary, and never starts the shell; it was checked live
  over the DevTools protocol when it was built.
