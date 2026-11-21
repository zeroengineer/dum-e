import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { DumeTestHook } from '../../src/app/testHook';
import { makeRawFrame } from '../unit/helpers/hands';
import type { HandSpec } from '../unit/helpers/hands';

declare global {
  interface Window {
    __DUME__?: DumeTestHook;
  }
}

/** Collects page errors and console errors so a test can assert there were none. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    // Web fonts are optional and may be unreachable where the tests run.
    if (/fonts\.(googleapis|gstatic)\.com|Failed to load resource/.test(message.text())) return;
    errors.push(`console: ${message.text()}`);
  });
  return errors;
}

/** Opens a world directly with the test hook installed and the tutorial out of the way. */
export async function openWorld(
  page: Page,
  env: 'particles' | 'objects' | 'galaxy' | 'globe',
): Promise<void> {
  await page.addInitScript(() => {
    if (!localStorage.getItem('dum-e:settings:v1')) {
      localStorage.setItem('dum-e:settings:v1', JSON.stringify({ tutorialSeen: true }));
    }
  });
  await page.goto(`/?e2e=1&env=${env}`);
  await expect(page.locator('.hud')).not.toHaveClass(/screen--off/);
  await page.waitForFunction(() => window.__DUME__?.scene().environment !== null);
}

let clock = 1000;

/**
 * Feeds synthetic hands through the real pipeline at 25 Hz of pipeline time.
 * `hands` may be a function of progress (0..1) to animate movement.
 */
export async function feed(
  page: Page,
  frames: number,
  hands: HandSpec[] | ((progress: number) => HandSpec[]),
): Promise<void> {
  const batch = [];
  for (let i = 0; i < frames; i++) {
    const specs = typeof hands === 'function' ? hands(frames > 1 ? i / (frames - 1) : 1) : hands;
    batch.push(makeRawFrame(clock, specs));
    clock += 40;
  }
  await page.evaluate((list) => {
    for (const frame of list) window.__DUME__?.inject(frame);
  }, batch);
}

export const actionTypes = (page: Page): Promise<string[]> =>
  page.evaluate(() => [...new Set(window.__DUME__?.actions.map((a) => a.type))]);

export const control = (page: Page, id: string): Promise<unknown> =>
  page.evaluate((key) => window.__DUME__?.scene().controls[key], id);

/** What the active world reports about itself. */
export const inspect = (page: Page): Promise<Record<string, number | string | boolean>> =>
  page.evaluate(() => window.__DUME__?.scene().inspect ?? {});

export const clearRecorded = (page: Page): Promise<void> =>
  page.evaluate(() => window.__DUME__?.clear());
