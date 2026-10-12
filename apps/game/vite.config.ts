import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin, type WebSocketClient } from 'vite';
// The relay alone: the config loader runs packages as Node would, which cannot follow the main
// entry's imports without extensions; the relay imports nothing.
// eslint-disable-next-line no-restricted-imports
import { createRelay, serve } from '@stillwake/net/relay';

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

/**
 * The commit this build is made from and, for a tree with changes, a hash of them: peers must match
 * it, and two different sets of edits on one commit are two builds.
 */
function build(): string {
  // An image built without the repo's history is told its commit instead.
  if (process.env.STILLWAKE_BUILD) return process.env.STILLWAKE_BUILD;
  try {
    const git = (args: string) => execSync(`git ${args}`).toString();
    const commit = git('rev-parse --short HEAD').trim();
    const changes = git('diff HEAD') + git('ls-files --others --exclude-standard');
    if (changes === '') return commit;
    return `${commit}+${createHash('sha1').update(changes).digest('hex').slice(0, 7)}`;
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
