import { defineConfig } from '@playwright/test';

const PORT = 5174;

/**
 * Smoke tests of flows in the dev build (`pnpm e2e`), in the Chrome installed on the machine, so
 * no browser is downloaded; CI's runners have one.
 */
export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: 'chrome',
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    command: `pnpm exec vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
});
