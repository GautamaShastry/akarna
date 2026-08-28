import { test as base, chromium, expect, type BrowserContext } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const extensionPath = fileURLToPath(new URL('../../apps/extension/dist', import.meta.url));

type ExtensionFixtures = {
  context: BrowserContext;
  extensionId: string;
};

// MV3 extensions only load in a persistent, headed Chromium context.
export const test = base.extend<ExtensionFixtures>({
  context: async ({}, use) => {
    const profileDir = await mkdtemp(join(tmpdir(), 'akarna-e2e-'));
    const context = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [background] = context.serviceWorkers();
    if (!background) background = await context.waitForEvent('serviceworker');
    await use(new URL(background.url()).host);
  },
});

export { expect };
