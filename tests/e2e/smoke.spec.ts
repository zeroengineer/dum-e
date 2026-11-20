import { expect, test } from '@playwright/test';
import { watchErrors } from './helpers';

// Camera-free checks that run in every browser engine.

test('landing explains the app and the camera', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'DUM-E' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start experience' })).toBeVisible();
  await expect(page.getByText('never recorded or sent anywhere')).toBeVisible();
  expect(errors).toEqual([]);
});

test('mouse-only path reaches every world and renders it', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?e2e=1');
  await page.getByRole('button', { name: 'Continue with mouse only' }).click();
  await expect(page.getByRole('heading', { name: 'Choose a world' })).toBeVisible();

  const worlds = [
    ['Particle Universe', 'particles'],
    ['Object Manipulation Lab', 'objects'],
    ['Galaxy Explorer', 'galaxy'],
  ] as const;
  await page.getByRole('button', { name: /Particle Universe/ }).click();
  // First visit: the tutorial opens. Skip it.
  await page.getByRole('button', { name: 'Skip tutorial' }).click();

  for (const [name, id] of worlds) {
    await page.getByRole('navigation', { name: 'Worlds' }).getByRole('button', { name }).click();
    await expect.poll(() => page.evaluate(() => window.__DUME__?.scene().environment)).toBe(id);
    // The render loop is alive: a frame rate is being measured.
    await expect
      .poll(() => page.evaluate(() => window.__DUME__?.state().fps ?? 0))
      .toBeGreaterThan(1);
    await expect(page.locator('.hud__controls .field').first()).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('a world can be opened from the URL', async ({ page }) => {
  await page.goto('/?e2e=1&env=galaxy');
  await expect.poll(() => page.evaluate(() => window.__DUME__?.scene().environment)).toBe('galaxy');
  await expect(page.getByRole('button', { name: 'Galaxy Explorer' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
