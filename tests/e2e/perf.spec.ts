import { expect, test } from '@playwright/test';
import { openWorld, watchErrors } from './helpers';

test.describe('performance readout', () => {
  test('is absent unless asked for', async ({ page }) => {
    await openWorld(page, 'galaxy');
    await expect(page.locator('.perf')).toHaveCount(0);
  });

  test('?perf=1 shows frame timing, render counts and stalls', async ({ page }) => {
    const errors = watchErrors(page);
    await page.addInitScript(() => {
      localStorage.setItem('dum-e:settings:v1', JSON.stringify({ tutorialSeen: true }));
    });
    await page.goto('/?perf=1&env=galaxy');
    const overlay = page.locator('.perf');
    await expect(overlay).toBeVisible();
    await expect(overlay).toContainText(/\d+ fps/);
    await expect(overlay).toContainText(/median/);
    await expect(overlay).toContainText(/[\d,]+ points/);
    await expect(overlay).toContainText('Tracking');
    // Opening the world and installing its stars were both timed.
    await expect(overlay).toContainText(/galaxy:apply \d+\.\d ms/);
    await expect(overlay).toContainText(/activate:galaxy \d+\.\d ms/);
    expect(errors).toEqual([]);
  });

  test('the test hook reports the same numbers for scripted measurement', async ({ page }) => {
    await openWorld(page, 'particles');
    await page.waitForFunction(() => window.__DUME__?.perf() !== null);
    const sample = await page.evaluate(() => window.__DUME__!.perf()!);
    expect(sample.frameP50).toBeGreaterThan(0);
    expect(sample.frameP95).toBeGreaterThanOrEqual(sample.frameP50);
    expect(sample.drawCalls).toBeGreaterThanOrEqual(2);
    expect(sample.points).toBeGreaterThan(1000);
    expect(['low', 'medium', 'high']).toContain(sample.quality);
  });
});
