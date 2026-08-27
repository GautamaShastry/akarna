import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  use: {
    launchOptions: {
      args: [
        '--disable-extensions-except=../../apps/extension/dist',
        '--load-extension=../../apps/extension/dist',
      ],
    },
  },
  webServer: {
    command: 'pnpm --filter @akarna/fixture-forms dev',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
