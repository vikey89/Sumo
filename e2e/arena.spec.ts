import { expect, test, type Page } from '@playwright/test';

/**
 * Smoke test against the real engine, on the developer's real Mac.
 *
 * SAFETY: this test must never quit an app. It never clicks `#confirm-accept`, and every
 * request to `/api/quit` is aborted and fails the test, as a safety net.
 */

interface AppSummary {
  id: string;
  name: string;
  locked: boolean;
  system?: boolean;
}

const quitAttempts: string[] = [];

test.beforeEach(async ({ page }) => {
  quitAttempts.length = 0;
  await page.addInitScript(() => {
    // Skip the coach tour and the sound toast (both stored as JSON by src/storage.ts).
    localStorage.setItem('sumo:onboarded', 'true');
    localStorage.setItem('sumo:sound', 'false');
  });
  await page.route('**/api/quit', async (route) => {
    quitAttempts.push(route.request().url());
    await route.abort();
  });
});

test.afterEach(() => {
  expect(quitAttempts, 'the smoke test must never send a quit request').toEqual([]);
});

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  return errors;
}

async function openArena(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#connection-text')).toHaveText('Live from your Mac', { timeout: 15_000 });
  await expect(page.locator('#banzuke-list [data-id]').first()).toBeVisible({ timeout: 15_000 });
}

/** The apps the banzuke shows, with the engine's own `locked` flag. */
async function banzukeApps(page: Page): Promise<AppSummary[]> {
  const response = await page.request.get('/api/processes');
  expect(response.ok()).toBe(true);
  const snapshot = (await response.json()) as { processes: AppSummary[] };
  const shown = await page.locator('#banzuke-list [data-id]').evaluateAll((rows) =>
    rows.map((row) => (row as HTMLElement).dataset.id),
  );
  return snapshot.processes.filter((app) => shown.includes(app.id));
}

/** The banzuke re-renders on every snapshot, so click the row in one atomic step. */
async function select(page: Page, app: AppSummary): Promise<void> {
  await expect(async () => {
    const clicked = await page.evaluate((id) => {
      const row = [...document.querySelectorAll<HTMLElement>('#banzuke-list [data-id]')]
        .find((element) => element.dataset.id === id);
      row?.click();
      return !!row;
    }, app.id);
    expect(clicked).toBe(true);
    await expect(page.locator('#process-panel')).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 10_000 });
}

test('the arena loads live, without errors', async ({ page }) => {
  const errors = collectErrors(page);
  await openArena(page);
  expect(await page.locator('#banzuke-list [data-id]').count()).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('pushing out an app always asks first, and cancelling keeps it', async ({ page }) => {
  const errors = collectErrors(page);
  await openArena(page);
  const target = (await banzukeApps(page)).find((app) => !app.locked);
  test.skip(!target, 'no unprotected app in the banzuke');
  await select(page, target!);

  const dialog = page.locator('dialog#confirm-dialog');
  await expect(page.locator('#push-out')).toBeEnabled();
  await page.locator('#push-out').click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('data-mode', 'confirm');
  await expect(page.locator('#confirm-accept')).toBeVisible();
  await expect(page.locator('#confirm-title')).toContainText('out?');

  // Cancel, never accept.
  await page.locator('#confirm-cancel').click();
  await expect(dialog).toBeHidden();

  // Escape cancels too (cancelling hands the fighter back, which may clear the selection).
  await select(page, target!);
  await page.locator('#push-out').click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  expect(errors).toEqual([]);
});

test('a protected app explains itself instead of offering a push out', async ({ page }) => {
  const errors = collectErrors(page);
  await openArena(page);
  const apps = await banzukeApps(page);
  const target = apps.find((app) => app.system) ?? apps.find((app) => app.locked);
  test.skip(!target, 'no protected app in the banzuke');
  await select(page, target!);

  const pushOut = page.locator('#push-out');
  await expect(pushOut).toBeDisabled();
  await expect(page.locator('#push-out-hint')).toContainText('Protected');

  // Dragging a wrestler out is the other way in; reach the same dialog by re-enabling the
  // button. The engine refuses to quit locked apps anyway, and accept is never clicked.
  // The panel re-renders on every snapshot, so re-enable and click in one step.
  await pushOut.evaluate((button) => {
    (button as HTMLButtonElement).disabled = false;
    (button as HTMLButtonElement).click();
  });
  const dialog = page.locator('dialog#confirm-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('data-mode', 'locked');
  await expect(page.locator('#confirm-title')).toContainText('is protected');
  await expect(page.locator('#confirm-accept')).toBeHidden();
  await page.locator('#confirm-cancel').click();
  await expect(dialog).toBeHidden();

  expect(errors).toEqual([]);
});

test('the engine rejects foreign origins', async ({ request }) => {
  const foreign = await request.get('/api/processes', { headers: { Origin: 'https://evil.example' } });
  expect(foreign.status()).toBe(403);
  const local = await request.get('/api/processes');
  expect(local.status()).toBe(200);
});
