// The game's way to the shell: saves, and nothing else. CommonJS, as a sandboxed preload must be.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('stillwakeDesktop', {
  saves: {
    read: (slot) => ipcRenderer.invoke('saves:read', slot),
    write: (slot, text) => ipcRenderer.invoke('saves:write', slot, text),
  },
});
