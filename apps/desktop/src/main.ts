import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSaves } from './saves.js';

/**
 * The desktop shell: one window with the game, and its saves as files in the user's data folder.
 * `--dev` loads the Vite dev server instead of the built game, for working on the shell itself.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const DEV_SERVER = 'http://localhost:5173';

const saves = createSaves(path.join(app.getPath('userData'), 'saves'));

void app.whenReady().then(() => {
  ipcMain.handle('saves:read', (_event, slot: string) => saves.read(slot));
  ipcMain.handle('saves:write', (_event, slot: string, text: string) => saves.write(slot, text));

  const window = new BrowserWindow({
    width: 1600,
    height: 900,
    backgroundColor: '#0b0f17',
    // A hidden or minimised window keeps its timers: a host there still runs everyone's world.
    webPreferences: { preload: path.join(here, '../src/preload.cjs'), backgroundThrottling: false },
  });
  window.removeMenu();
  // The window shows the game and nothing else: a file dropped on it, or a link, opens nowhere.
  window.webContents.on('will-navigate', (event) => {
    // Reloading the game itself (the dev server does on a change) stays allowed.
    if (event.url !== window.webContents.getURL()) event.preventDefault();
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  // The page's console in the shell's own, so a problem in the game shows where it was started.
  window.webContents.on('console-message', (event) => {
    console.log(`[game] ${event.message}`);
  });
  if (process.argv.includes('--dev')) void window.loadURL(DEV_SERVER);
  else void window.loadFile(path.join(here, '../../game/dist/index.html'));
});

app.on('window-all-closed', () => app.quit());
