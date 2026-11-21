import { expect, test } from '@playwright/test';
import {
  actionTypes,
  clearRecorded,
  control,
  feed,
  inspect,
  openWorld,
  watchErrors,
} from './helpers';

// Synthetic landmark frames go in ahead of the landmark processor, so smoothing, gesture
// recognition, the event bus, the mapping tables and the environments are all the real thing.

test.describe('Particle Universe', () => {
  test('poses become forces and show in the HUD', async ({ page }) => {
    const errors = watchErrors(page);
    await openWorld(page, 'particles');

    await feed(page, 12, [{ pose: 'fist', x: 0.4 }]);
    expect(await actionTypes(page)).toEqual(expect.arrayContaining(['hover', 'attract']));
    await expect(page.locator('.readout__main')).toHaveText('Fist');
    await expect(page.locator('.readout__sub')).toHaveText('right hand');
    await expect(page.locator('.guide__row--active')).toContainText('Fist');

    await clearRecorded(page);
    await feed(page, 14, [{ pose: 'open', x: 0.4 }]);
    expect(await actionTypes(page)).toContain('expand');
    await expect(page.locator('.readout__main')).toHaveText('Open palm');

    await clearRecorded(page);
    await feed(page, 10, [{ pose: 'pinch', x: 0.4 }]);
    await feed(page, 10, (p) => [{ pose: 'pinch', x: 0.4 + p * 0.2 }]);
    expect(await actionTypes(page)).toContain('grab');

    // The hand leaves: every gesture ends and the readout goes idle.
    await feed(page, 14, []);
    expect(await page.evaluate(() => window.__DUME__?.state().gestures)).toEqual([]);
    await expect(page.locator('.readout')).toHaveAttribute('data-state', 'idle');
    expect(errors).toEqual([]);
  });

  test('a swipe changes formation and the control panel follows', async ({ page }) => {
    await openWorld(page, 'particles');
    expect(await control(page, 'formation')).toBe('sphere');
    await feed(page, 12, [{ pose: 'open', x: 0.7 }]);
    await feed(page, 7, (p) => [{ pose: 'open', x: 0.7 - p * 0.4 }]);
    // The readout names the swipe for about a second, so look straight away.
    await expect(page.locator('.readout__main')).toHaveText('Swipe left', { timeout: 900 });
    expect(await page.evaluate(() => window.__DUME__?.state().lastGesture?.detail)).toBe('left');
    await feed(page, 4, [{ pose: 'open', x: 0.3 }]);
    expect(await control(page, 'formation')).toBe('galaxy');
    await expect(page.getByLabel('Formation')).toHaveValue('galaxy');
  });

  test('two hands moving apart scale the formation', async ({ page }) => {
    await openWorld(page, 'particles');
    const pair = (gap: number) => [
      { pose: 'relaxed' as const, x: 0.5 - gap / 2, handedness: 'Left' as const },
      { pose: 'relaxed' as const, x: 0.5 + gap / 2, handedness: 'Right' as const },
    ];
    await feed(page, 10, pair(0.3));
    await feed(page, 12, (p) => pair(0.3 + p * 0.3));
    expect(await actionTypes(page)).toContain('scale');
    const factors = await page.evaluate(() =>
      window.__DUME__?.actions.flatMap((a) => (a.type === 'scale' ? [a.factor] : [])),
    );
    expect(factors?.reduce((a, b) => a * b, 1)).toBeGreaterThan(1.6);
    expect(await page.evaluate(() => window.__DUME__?.state().tracking.hands)).toEqual([
      'Left',
      'Right',
    ]);
  });
});

test.describe('Object Manipulation Lab', () => {
  test('point, pinch, carry, release and shockwave', async ({ page }) => {
    const errors = watchErrors(page);
    await openWorld(page, 'objects');

    await feed(page, 12, [{ pose: 'point', x: 0.5, y: 0.55 }]);
    expect(await actionTypes(page)).toContain('point');

    await clearRecorded(page);
    await feed(page, 10, [{ pose: 'pinch', x: 0.5, y: 0.5 }]);
    await feed(page, 12, (p) => [{ pose: 'pinch', x: 0.5 + p * 0.15, y: 0.5, roll: p * 0.5 }]);
    const grabs = await page.evaluate(() =>
      window.__DUME__?.actions.flatMap((a) => (a.type === 'grab' ? [a] : [])),
    );
    expect(grabs?.[0].phase).toBe('start');
    expect(grabs?.some((g) => g.phase === 'update' && g.dx > 0)).toBe(true);
    expect(grabs?.some((g) => g.dRoll > 0)).toBe(true);

    await clearRecorded(page);
    await feed(page, 12, [{ pose: 'open', x: 0.65, y: 0.5 }]);
    const afterOpen = await page.evaluate(() =>
      window.__DUME__?.actions.map((a) => `${a.type}:${a.phase}`),
    );
    expect(afterOpen).toContain('grab:end');
    expect(afterOpen).toContain('release:start');

    await clearRecorded(page);
    await feed(page, 12, [{ pose: 'fist', x: 0.5, y: 0.5 }]);
    expect(await actionTypes(page)).toContain('special');
    expect(errors).toEqual([]);
  });

  test('a swipe does nothing here', async ({ page }) => {
    await openWorld(page, 'objects');
    await feed(page, 12, [{ pose: 'open', x: 0.7 }]);
    await feed(page, 7, (p) => [{ pose: 'open', x: 0.7 - p * 0.4 }]);
    expect(
      await page.evaluate(() => window.__DUME__?.events.some((e) => e.gesture === 'swipe')),
    ).toBe(true);
    expect(await actionTypes(page)).not.toContain('next');
  });
});

test.describe('Galaxy Explorer', () => {
  test('hand movement turns, poses stretch, two hands zoom, swipe changes shape', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await openWorld(page, 'galaxy');

    await feed(page, 4, [{ pose: 'relaxed', x: 0.4 }]);
    await feed(page, 20, (p) => [{ pose: 'relaxed', x: 0.4 + p * 0.15 }]);
    expect(await actionTypes(page)).toContain('rotate');

    await clearRecorded(page);
    await feed(page, 12, [{ pose: 'open', x: 0.55 }]);
    await feed(page, 12, [{ pose: 'fist', x: 0.55 }]);
    expect(await actionTypes(page)).toEqual(expect.arrayContaining(['expand', 'attract']));

    await clearRecorded(page);
    const pair = (gap: number) => [
      { pose: 'relaxed' as const, x: 0.5 - gap / 2, handedness: 'Left' as const },
      { pose: 'relaxed' as const, x: 0.5 + gap / 2, handedness: 'Right' as const },
    ];
    await feed(page, 14, []);
    await feed(page, 10, pair(0.5));
    await feed(page, 12, (p) => pair(0.5 - p * 0.25));
    const zoom = await page.evaluate(() =>
      window.__DUME__?.actions.flatMap((a) => (a.type === 'zoom' ? [a.factor] : [])),
    );
    expect(zoom?.length).toBeGreaterThan(3);
    expect(zoom?.reduce((a, b) => a * b, 1)).toBeLessThan(0.7);

    await feed(page, 14, []);
    expect(await control(page, 'preset')).toBe('grand');
    await feed(page, 12, [{ pose: 'open', x: 0.7 }]);
    await feed(page, 7, (p) => [{ pose: 'open', x: 0.7 - p * 0.4 }]);
    expect(await control(page, 'preset')).toBe('barred');
    expect(errors).toEqual([]);
  });
});

test.describe('Holo Globe', () => {
  const pair = (gap: number, y = 0.5) => [
    { pose: 'relaxed' as const, x: 0.5 - gap / 2, y, handedness: 'Left' as const },
    { pose: 'relaxed' as const, x: 0.5 + gap / 2, y, handedness: 'Right' as const },
  ];

  test('rides on one hand and stays where it is left', async ({ page }) => {
    const errors = watchErrors(page);
    await openWorld(page, 'globe');
    expect(await inspect(page)).toMatchObject({ mode: 'free', x: 0, y: 0 });

    // A hand low and left of centre. With no camera picture the image fills the screen, so
    // image (0.3, 0.7) is device (-0.4, -0.4).
    await feed(page, 12, [{ pose: 'relaxed', x: 0.3, y: 0.7 }]);
    expect(await actionTypes(page)).toContain('anchor');
    await expect.poll(async () => (await inspect(page)).mode).toBe('held');
    await expect.poll(async () => (await inspect(page)).x as number).toBeLessThan(-0.35);
    const held = await inspect(page);
    expect(held.x as number).toBeGreaterThan(-0.47);
    expect(held.y as number).toBeGreaterThan(-0.4); // above the palm
    expect(held.y as number).toBeLessThan(0.3);

    await feed(page, 14, []);
    await expect.poll(async () => (await inspect(page)).mode).toBe('free');
    await page.waitForTimeout(400);
    const left = await inspect(page);
    expect(left.x as number).toBeCloseTo(held.x as number, 1);
    expect(left.y as number).toBeCloseTo(held.y as number, 1);
    expect(errors).toEqual([]);
  });

  test('sits between two hands, follows the gap, and keeps the size they made', async ({
    page,
  }) => {
    await openWorld(page, 'globe');
    const start = (await inspect(page)).radius as number;

    await feed(page, 12, pair(0.4, 0.4));
    await expect.poll(async () => (await inspect(page)).mode).toBe('stretched');
    await expect.poll(async () => (await inspect(page)).radius as number).toBeGreaterThan(start);
    const narrow = await inspect(page);
    expect(narrow.x as number).toBeCloseTo(0, 1);
    expect(narrow.y as number).toBeCloseTo(0.2, 1); // image y 0.4 is device y 0.2

    await feed(page, 14, (p) => pair(0.4 + p * 0.3, 0.4));
    await feed(page, 4, pair(0.7, 0.4));
    await expect
      .poll(async () => (await inspect(page)).radius as number)
      .toBeGreaterThan((narrow.radius as number) * 1.5);
    const wide = (await inspect(page)).radius as number;

    await feed(page, 14, []);
    await expect.poll(async () => (await inspect(page)).mode).toBe('free');
    await page.waitForTimeout(500);
    expect((await inspect(page)).radius as number).toBeCloseTo(wide, 2);
    expect(await control(page, 'size')).toBeCloseTo(wide, 2);
    await expect(page.getByLabel('Size')).toHaveValue(/0\.\d+/);
  });

  test('pinch holds it still, fist folds it, open palm pulses, swipe changes its look', async ({
    page,
  }) => {
    await openWorld(page, 'globe');
    await feed(page, 10, [{ pose: 'pinch', x: 0.5, y: 0.6 }]);
    await page.waitForTimeout(300);
    const before = await inspect(page);
    await feed(page, 10, (p) => [{ pose: 'pinch', x: 0.5 + p * 0.25, y: 0.6 }]);
    expect(await actionTypes(page)).toContain('grab');
    await page.waitForTimeout(200);
    expect((await inspect(page)).x as number).toBeCloseTo(before.x as number, 1);

    await feed(page, 12, [{ pose: 'fist', x: 0.5, y: 0.6 }]);
    await expect.poll(async () => (await inspect(page)).collapse as number).toBeGreaterThan(0.6);
    await feed(page, 12, [{ pose: 'open', x: 0.5, y: 0.6 }]);
    expect(await actionTypes(page)).toContain('expand');
    await expect.poll(async () => (await inspect(page)).collapse as number).toBeLessThan(0.3);

    await feed(page, 14, []);
    expect(await control(page, 'look')).toBe('earth');
    await feed(page, 12, [{ pose: 'open', x: 0.7 }]);
    await feed(page, 7, (p) => [{ pose: 'open', x: 0.7 - p * 0.4 }]);
    expect(await control(page, 'look')).toBe('grid');
    await expect(page.getByLabel('Look')).toHaveValue('grid');
  });

  test('draws fewer dots at lower quality without rebuilding', async ({ page }) => {
    await openWorld(page, 'globe');
    const dots = async () => (await inspect(page)).dots as number;
    const initial = await dots();
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByLabel('Quality').selectOption('high');
    await expect.poll(dots).toBe(24000);
    await page.getByLabel('Quality').selectOption('low');
    await expect.poll(dots).toBe(7000);
    expect(initial).toBeGreaterThan(0);
  });
});

test('gestures follow the world that is on screen', async ({ page }) => {
  await openWorld(page, 'particles');
  await feed(page, 12, [{ pose: 'fist' }]);
  expect(await actionTypes(page)).toContain('attract');
  await page.keyboard.press('2');
  await expect
    .poll(() => page.evaluate(() => window.__DUME__?.scene().environment))
    .toBe('objects');
  await feed(page, 14, []);
  await clearRecorded(page);
  await feed(page, 12, [{ pose: 'fist' }]);
  const types = await actionTypes(page);
  expect(types).toContain('special');
  expect(types).not.toContain('attract');
});

test('switching worlds repeatedly stays healthy', async ({ page }) => {
  const errors = watchErrors(page);
  await openWorld(page, 'particles');
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press(String((i % 4) + 1));
    await page.waitForTimeout(120);
  }
  await page.keyboard.press('3');
  await expect.poll(() => page.evaluate(() => window.__DUME__?.scene().environment)).toBe('galaxy');
  await expect
    .poll(() => page.evaluate(() => window.__DUME__?.state().fps ?? 0))
    .toBeGreaterThan(1);
  expect(errors).toEqual([]);
});
