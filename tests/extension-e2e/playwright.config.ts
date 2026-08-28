import { defineConfig } from '@playwright/test';

// The extension is loaded via a persistent context in fixtures.ts; launch args
// on a non-persistent context do not activate MV3 extensions.
export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  webServer: {
    command: 'pnpm --filter @akarna/fixture-forms dev',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
