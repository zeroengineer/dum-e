import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { watchErrors } from './helpers';

// Each of these loads the hand model under software rendering, which is slow. They get longer
// than the default, and playwright.config.ts runs this file last and alone.
test.describe.configure({ mode: 'default', timeout: 120_000 });

const status = (page: Page) => page.evaluate(() => window.__DUME__?.state().tracking.status);
const videoLive = (page: Page) => page.evaluate(() => window.__DUME__?.scene().videoLive);

test('starting the experience turns the camera and tracker on, and off again', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?e2e=1');
  await page.getByRole('button', { name: 'Start experience' }).click();
  await expect(page.getByRole('heading', { name: 'Choose a world' })).toBeVisible();

  // Camera granted, model loaded, detection running on the fake stream.
  await expect.poll(() => status(page), { timeout: 30_000 }).toBe('active');
  expect(await videoLive(page)).toBe(true);
  // Detection is really running on the fake stream. The rate itself is not asserted: these
  // tests use software rendering, which says nothing about speed on a real GPU.
  await expect
    .poll(() => page.evaluate(() => window.__DUME__?.state().tracking.rate ?? 0), {
      timeout: 20_000,
    })
    .toBeGreaterThan(0);
  // The fake camera shows a test pattern, so no hands should be reported.
  expect(await page.evaluate(() => window.__DUME__?.state().tracking.hands)).toEqual([]);

  await page.getByRole('button', { name: /Particle Universe/ }).click();
  await page.getByRole('button', { name: 'Skip tutorial' }).click();
  await expect(page.locator('.preview')).not.toHaveClass(/preview--hidden/);
  await expect(page.locator('.pill--tracking')).toHaveText('Tracking');

  await page.getByRole('button', { name: 'Turn camera off' }).click();
  await expect.poll(() => status(page)).toBe('off');
  // Every track is stopped, so the camera light goes out.
  expect(await videoLive(page)).toBe(false);
  await expect(page.locator('.preview')).toHaveClass(/preview--hidden/);

  await page.getByRole('button', { name: 'Turn camera on' }).click();
  await expect.poll(() => status(page), { timeout: 20_000 }).toBe('active');
  expect(errors).toEqual([]);
});

test('the globe world fills the screen with the camera picture and says so when it is off', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => {
    localStorage.setItem('dum-e:settings:v1', JSON.stringify({ tutorialSeen: true }));
  });
  await page.goto('/?e2e=1&env=globe');
  const picture = () => page.evaluate(() => window.__DUME__?.scene().inspect.video);

  // Camera off: no picture, and the world explains what turning it on would do.
  await expect.poll(picture).toBe(false);
  await expect(page.locator('.hud .notice')).toContainText('Camera is off');

  await page.locator('.hud .notice').getByRole('button', { name: 'Turn camera on' }).click();
  await expect.poll(() => status(page), { timeout: 60_000 }).toBe('active');
  await expect.poll(picture).toBe(true);
  await expect(page.locator('.hud .notice')).toBeHidden();
  // The full-screen picture replaces the corner preview here, and only here.
  await expect(page.locator('.preview')).toHaveClass(/preview--hidden/);
  // The globe now belongs to hands in the picture: the mouse passing over does not carry it.
  const where = () => page.evaluate(() => window.__DUME__?.scene().inspect.x);
  const parked = (await where()) as number;
  const box = (await page.locator('#stage').boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.6);
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.8, { steps: 6 });
  await page.waitForTimeout(600);
  expect(await where()).toBeCloseTo(parked, 2);
  await page.screenshot({ path: 'test-results/globe-camera.png' });
  await page.keyboard.press('3');
  await expect(page.locator('.preview')).not.toHaveClass(/preview--hidden/);
  await page.keyboard.press('4');
  await expect.poll(picture).toBe(true);

  await page.getByRole('button', { name: 'Turn camera off' }).click();
  await expect.poll(picture).toBe(false);
  expect(errors).toEqual([]);
});

test('lists cameras once permission is granted', async ({ page }) => {
  await page.goto('/?e2e=1');
  await page.getByRole('button', { name: 'Start experience' }).click();
  await expect.poll(() => status(page), { timeout: 30_000 }).toBe('active');
  await expect
    .poll(() => page.evaluate(() => window.__DUME__?.state().devices.length ?? 0))
    .toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByLabel('Camera', { exact: true }).locator('option')).not.toHaveCount(1);
});

test('a blocked camera is explained, can be retried, and the mouse still works', async ({
  page,
}) => {
  // Make the first request fail the way a denied permission does.
  await page.addInitScript(() => {
    const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    let denied = true;
    (window as unknown as { allowCamera: () => void }).allowCamera = () => (denied = false);
    navigator.mediaDevices.getUserMedia = (constraints) =>
      denied
        ? Promise.reject(new DOMException('Permission denied', 'NotAllowedError'))
        : real(constraints);
  });
  await page.goto('/?e2e=1');
  await page.getByRole('button', { name: 'Start experience' }).click();

  await expect.poll(() => status(page)).toBe('denied');
  const notice = page.locator('.selector .notice');
  await expect(notice).toContainText('Camera blocked');
  await expect(notice).toContainText('Allow the camera for this site');
  expect(await videoLive(page)).toBe(false);

  // Still denied: retry reports the same thing rather than hanging.
  await notice.getByRole('button', { name: 'Retry camera' }).click();
  await expect.poll(() => status(page)).toBe('denied');

  await page.evaluate(() => (window as unknown as { allowCamera: () => void }).allowCamera());
  await notice.getByRole('button', { name: 'Retry camera' }).click();
  await expect.poll(() => status(page), { timeout: 30_000 }).toBe('active');
  await expect(notice).toBeHidden();
});

test('continuing with the mouse dismisses a camera failure', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException('No camera', 'NotFoundError'));
  });
  await page.goto('/?e2e=1');
  await page.getByRole('button', { name: 'Start experience' }).click();
  await expect.poll(() => status(page)).toBe('error');
  await expect(page.locator('.selector .notice')).toContainText('No camera was found');
  await page
    .locator('.selector .notice')
    .getByRole('button', { name: 'Continue with mouse' })
    .click();
  await expect.poll(() => status(page)).toBe('off');
});
