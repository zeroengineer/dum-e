import { expect, test } from '@playwright/test';
import { actionTypes, clearRecorded, control, feed, openWorld } from './helpers';

test.describe('mouse and keyboard fallback', () => {
  test('drag, right drag, held keys, wheel and arrows drive the particles', async ({ page }) => {
    await openWorld(page, 'particles');
    const canvas = page.locator('#stage');
    const box = (await canvas.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 120, cy + 20, { steps: 6 });
    await page.mouse.up();
    expect(await actionTypes(page)).toEqual(expect.arrayContaining(['hover', 'grab']));

    await clearRecorded(page);
    await page.mouse.down({ button: 'right' });
    await page.mouse.up({ button: 'right' });
    await page.keyboard.down('o');
    await page.keyboard.up('o');
    expect(await actionTypes(page)).toEqual(expect.arrayContaining(['attract', 'expand']));

    await clearRecorded(page);
    await page.mouse.wheel(0, -200);
    expect(await actionTypes(page)).toContain('scale');

    await page.keyboard.press('ArrowLeft');
    expect(await control(page, 'formation')).toBe('galaxy');
    await page.keyboard.press('ArrowRight');
    expect(await control(page, 'formation')).toBe('sphere');
  });

  test('the galaxy turns only while dragging and the wheel zooms', async ({ page }) => {
    await openWorld(page, 'galaxy');
    const box = (await page.locator('#stage').boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.move(cx + 150, cy, { steps: 5 });
    expect(await actionTypes(page)).not.toContain('rotate');
    expect(await actionTypes(page)).not.toContain('grab');
    await page.mouse.down();
    await page.mouse.move(cx, cy, { steps: 5 });
    await page.mouse.up();
    expect(await actionTypes(page)).toContain('grab');
    await page.mouse.wheel(0, -200);
    expect(await actionTypes(page)).toContain('zoom');
  });

  test('can be switched off in settings', async ({ page }) => {
    await openWorld(page, 'particles');
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByLabel('Mouse and keyboard control').uncheck();
    await page.getByRole('button', { name: 'Close' }).click();
    await clearRecorded(page);
    const box = (await page.locator('#stage').boundingBox())!;
    await page.mouse.move(box.x + 300, box.y + 300);
    await page.mouse.down();
    await page.mouse.move(box.x + 400, box.y + 320, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.press('ArrowLeft');
    expect(await page.evaluate(() => window.__DUME__?.actions.length)).toBe(0);
    expect(await control(page, 'formation')).toBe('sphere');
    await expect(page.locator('.readout__main')).toHaveText('No input');
  });
});

test('the globe follows the mouse, spins on drag and resizes with the wheel', async ({ page }) => {
  await openWorld(page, 'globe');
  const box = (await page.locator('#stage').boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const at = async () =>
    (await page.evaluate(() => window.__DUME__!.scene().inspect)) as {
      x: number;
      y: number;
      radius: number;
    };

  await page.mouse.move(cx, cy);
  await page.mouse.move(cx + box.width * 0.2, cy - box.height * 0.2, { steps: 5 });
  await expect.poll(async () => (await at()).x).toBeGreaterThan(0.35);
  expect((await at()).y).toBeGreaterThan(0.35);

  // Dragging spins it in place rather than carrying it.
  const parked = await at();
  await page.mouse.down();
  await page.mouse.move(cx - box.width * 0.1, cy, { steps: 6 });
  expect(await actionTypes(page)).toContain('grab');
  expect((await at()).x).toBeCloseTo(parked.x, 1);
  await page.mouse.up();

  await clearRecorded(page);
  const before = (await at()).radius;
  await page.mouse.wheel(0, -300);
  expect(await actionTypes(page)).toContain('span');
  await expect.poll(async () => (await at()).radius).toBeGreaterThan(before * 1.2);

  await page.keyboard.press('ArrowLeft');
  expect(await control(page, 'effect')).not.toBe('scan');
  await page.getByLabel('Look').selectOption('grid');
  expect(await control(page, 'look')).toBe('grid');
  await page.getByLabel('Effect').selectOption('none');
  expect(await control(page, 'effect')).toBe('none');
  await page.keyboard.press('r');
  expect(await control(page, 'look')).toBe('earth');
  expect(await control(page, 'effect')).toBe('scan');
  await expect.poll(async () => (await at()).radius).toBeCloseTo(0.14, 2);
});

test.describe('controls and settings', () => {
  test('the control panel drives the world and reset restores it', async ({ page }) => {
    await openWorld(page, 'galaxy');
    await page.getByLabel('Configuration').selectOption('pinwheel');
    expect(await control(page, 'arms')).toBe(6);
    await page.getByLabel('Spiral arms').fill('3');
    expect(await control(page, 'preset')).toBe('custom');
    await page.getByRole('button', { name: 'Next configuration' }).click();
    expect(await control(page, 'preset')).toBe('grand');
    await page.getByLabel('Rotation speed').fill('2.5');
    expect(await control(page, 'speed')).toBe(2.5);
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    expect(await control(page, 'speed')).toBe(1);
    await expect(page.getByLabel('Rotation speed')).toHaveValue('1');
  });

  test('the object lab controls work', async ({ page }) => {
    // Lit meshes render at about one frame a second under software WebGL, so every click waits.
    test.slow();
    await openWorld(page, 'objects');
    await page.getByLabel('Objects').fill('14');
    expect(await control(page, 'count')).toBe(14);
    await page.getByLabel('Wireframe').check();
    expect(await control(page, 'wireframe')).toBe(true);
    for (const name of ['Select next', 'Scatter', 'Regroup', 'Recolour']) {
      await page.getByRole('button', { name }).click();
    }
    await page.keyboard.press('r');
    expect(await control(page, 'count')).toBe(10);
  });

  test('settings apply immediately and survive a reload', async ({ page }) => {
    await openWorld(page, 'particles');
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByLabel('Gesture sensitivity').fill('0.8');
    await page.getByLabel('Tracking frequency (Hz)').fill('15');
    await page.getByLabel('Visual quality').selectOption('low');
    await page.getByLabel('Particle count').fill('6000');
    await page.getByLabel('Show camera preview').uncheck();
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.settings')).toBeHidden();

    expect(await control(page, 'count')).toBe(6000);
    expect(await page.evaluate(() => window.__DUME__?.state().resolvedQuality)).toBe('low');

    await page.reload();
    await page.waitForFunction(() => window.__DUME__?.scene().environment !== null);
    const settings = await page.evaluate(() => window.__DUME__?.state().settings);
    expect(settings).toMatchObject({
      sensitivity: 0.8,
      trackingHz: 15,
      quality: 'low',
      particleCount: 6000,
      showPreview: false,
    });
    expect(await control(page, 'count')).toBe(6000);
  });
});

test.describe('tutorial', () => {
  test('opens on the first visit, advances when a gesture is detected, and is remembered', async ({
    page,
  }) => {
    await page.goto('/?e2e=1&env=particles');
    const tutorial = page.locator('dialog.tutorial');
    await expect(tutorial).toBeVisible();
    await expect(tutorial).toContainText('Step 1 of 6');
    await expect(tutorial.getByRole('heading')).toHaveText('Open palm');

    // Making the gesture completes the step; nothing needs clicking.
    await feed(page, 12, [{ pose: 'open' }]);
    await expect(tutorial).toContainText('Detected');
    await expect(tutorial).toContainText('Step 2 of 6');
    await expect(tutorial.getByRole('heading')).toHaveText('Fist');

    // The wrong gesture does not advance it.
    await feed(page, 12, [{ pose: 'pinch' }]);
    await expect(tutorial).toContainText('Step 2 of 6');
    await feed(page, 12, [{ pose: 'fist' }]);
    await expect(tutorial).toContainText('Step 3 of 6');

    await tutorial.getByRole('button', { name: 'Back' }).click();
    await expect(tutorial).toContainText('Step 2 of 6');
    await tutorial.getByRole('button', { name: 'Skip tutorial' }).click();
    await expect(tutorial).toBeHidden();
    expect(await page.evaluate(() => window.__DUME__?.state().settings.tutorialSeen)).toBe(true);

    await page.reload();
    await page.waitForFunction(() => window.__DUME__?.scene().environment !== null);
    await expect(tutorial).toBeHidden();
    await page.getByRole('button', { name: 'Tutorial' }).click();
    await expect(tutorial).toContainText('Step 1 of 6');
  });

  test('can be finished with the mouse and keyboard alone', async ({ page }) => {
    await page.goto('/?e2e=1&env=objects');
    const tutorial = page.locator('dialog.tutorial');
    await expect(tutorial).toContainText('With the mouse and keyboard: Hold O.');
    const box = (await page.locator('#stage').boundingBox())!;
    // Keys act on the virtual hand only while the pointer is over the scene, not over a panel.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.4);
    await page.keyboard.down('o');
    await page.keyboard.up('o');
    await expect(tutorial).toContainText('Step 2 of 6');
    for (let i = 0; i < 5; i++) {
      await tutorial.getByRole('button', { name: /Next|Finish/ }).click();
    }
    await expect(tutorial).toBeHidden();
  });
});
