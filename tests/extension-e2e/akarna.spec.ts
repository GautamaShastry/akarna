import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from './fixtures';

const FIXTURE = 'http://localhost:4173/flat.html';

async function openPanel(context: BrowserContext, fixturePage: Page): Promise<Page> {
  let serviceWorkerUrl = '';
  for (const worker of context.serviceWorkers()) {
    if (worker.url().includes('background.js')) serviceWorkerUrl = worker.url();
  }
  if (!serviceWorkerUrl) {
    const worker = await context.waitForEvent('serviceworker', { timeout: 15_000 });
    serviceWorkerUrl = worker.url();
  }
  const extensionId = new URL(serviceWorkerUrl).host;
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  return panel;
}

async function panelSays(panel: Page, text: string | RegExp): Promise<void> {
  await expect(panel.locator('.transcript')).toContainText(text, { timeout: 15_000 });
}

async function selectPrivacyMode(panel: Page): Promise<void> {
  // Wait for privacy onboarding screen — the radio uses value="local"
  const radio = panel.locator('input[type="radio"][value="local"]');
  try {
    await radio.waitFor({ state: 'visible', timeout: 5_000 });
  } catch {
    return; // Already past onboarding
  }
  // Click the label to trigger React onChange reliably
  await panel.locator('label').filter({ hasText: 'Local only' }).click();
  // Wait for the Continue button to become enabled then click
  const continueBtn = panel.getByRole('button', { name: /Continue with local/ });
  await continueBtn.waitFor({ state: 'visible', timeout: 3_000 });
  await continueBtn.click();
  // Wait for the command input to appear after privacy consent
  await panel.getByLabel('Command input').waitFor({ state: 'visible', timeout: 10_000 });
}

async function send(panel: Page, command: string): Promise<void> {
  const input = panel.getByLabel('Command input');
  await input.waitFor({ state: 'visible', timeout: 10_000 });
  await input.fill(command);
  await panel.getByRole('button', { name: 'Send' }).click();
}

test('milestone 0 acceptance flow', async ({ context, extensionId }) => {
  await expect.poll(() => context.serviceWorkers().some((worker) => worker.url().includes(extensionId)), { timeout: 15_000 }).toBe(true);
  const fixturePage = await context.newPage();
  await fixturePage.goto(FIXTURE);

  // Wait for the React fixture before asserting content-script UI. The
  // extension runs at document_idle and observes the form after hydration.
  await expect(fixturePage.locator('form[aria-label="Job application form"]')).toBeVisible();
  const chip = fixturePage.locator('#akarna-start-chip');
  await expect(chip).toBeVisible({ timeout: 15_000 });

  const panel = await openPanel(context, fixturePage);
  await selectPrivacyMode(panel);
  await send(panel, 'set full name to Ada Lovelace');
  await expect.poll(() => fixturePage.locator('#full-name').inputValue(), { timeout: 15_000 }).toBe('Ada Lovelace');
  await panelSays(panel, /Applied fill/i);

  await send(panel, 'set name to Grace');
  await panelSays(panel, /matches multiple fields/i);
  await expect(fixturePage.locator('#full-name')).toHaveValue('Ada Lovelace');

  await send(panel, 'set graduation date to Dec 2025');
  await panelSays(panel, /complete/i);
  await expect(fixturePage.locator('#graduation-date')).toHaveValue('');

  await send(panel, 'set government id to 123-45-6789');
  await panelSays(panel, /sensitive/i);
  await expect(fixturePage.locator('#private-id')).toHaveValue('');

  await send(panel, 'skip full name');
  await panelSays(panel, /required and cannot be skipped/i);

  await send(panel, 'set highest degree to master’s');
  await expect.poll(() => fixturePage.locator('#degree').inputValue()).toBe('masters');
  await send(panel, 'set graduation date to 2025-12-15');
  await expect.poll(() => fixturePage.locator('#graduation-date').inputValue()).toBe('2025-12-15');

  await send(panel, 'submit the form');
  await panelSays(panel, /Required fields are unresolved/i);

  await send(panel, 'check relocate');
  await expect.poll(async () => fixturePage.locator('input[name="relocate"]').isChecked()).toBe(true);

  await send(panel, 'continue');
  await expect(panel.getByRole('button', { name: 'Request submission' })).toBeVisible();
  await panel.getByRole('button', { name: 'Request submission' }).click();
  await panelSays(panel, /Yes, submit/i);
  await panel.getByLabel('Type yes submit to confirm').fill('yes, submit');
  await panel.getByRole('button', { name: 'Confirm submission' }).click();

  await expect(fixturePage.locator('.success')).toBeVisible();
});
