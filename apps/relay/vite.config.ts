import { defineConfig } from 'vite';

/**
 * The playtest server as one file for Node: everything bundled, the workspace's TypeScript included,
 * so the container needs no node_modules.
 */
export default defineConfig({
  build: {
    ssr: 'src/main.ts',
    outDir: 'dist',
    target: 'node24',
    // `ws` reaches for these native speedups when installed, and runs without them.
    rollupOptions: { external: ['bufferutil', 'utf-8-validate'] },
  },
  ssr: { noExternal: true },
});
