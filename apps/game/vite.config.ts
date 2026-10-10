import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The game ships inside Electron and loads from disk, so one large bundle (mostly Pixi) costs
  // nothing worth splitting for.
  build: { chunkSizeWarningLimit: 2000 },
});
