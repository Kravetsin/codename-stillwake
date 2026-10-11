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

export default defineConfig({
  plugins: [react(), tailwindcss(), relay()],
  // The game ships inside Electron and loads from disk, so one large bundle (mostly Pixi) costs
  // nothing worth splitting for.
  build: { chunkSizeWarningLimit: 2000 },
});
