import { execSync } from 'node:child_process';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin, type WebSocketClient } from 'vite';
import { createRelay, serve } from './src/dev/relay';

/** The dev relay on the dev server's WebSocket: `pnpm dev`, then `?host` in a tab, `?join=` in more. */
function relay(): Plugin {
  return {
    name: 'stillwake-relay',
    configureServer(server) {
      serve(createRelay(), (event, handler) =>
        server.ws.on(event, (data: unknown, client: WebSocketClient) =>
          handler(data as never, client),
        ),
      );
    },
  };
}

/** The commit this build is made from, with `+` when the tree has changes: peers must match it. */
function build(): string {
  try {
    const commit = execSync('git rev-parse --short HEAD').toString().trim();
    const dirty = execSync('git status --porcelain').toString().trim() !== '';
    return dirty ? `${commit}+` : commit;
  } catch {
    return 'unknown';
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), relay()],
  // Relative paths, so the built game opens from disk in the desktop shell.
  base: './',
  define: { __BUILD__: JSON.stringify(build()) },
  // The game ships inside Electron and loads from disk, so one large bundle (mostly Pixi) costs
  // nothing worth splitting for.
  build: { chunkSizeWarningLimit: 2000 },
});
