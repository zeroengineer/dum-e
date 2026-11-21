import { describe, expect, it } from 'vitest';
import type { Environment, EnvironmentContext } from '../../src/core/scene/Environment';
import { SceneManager } from '../../src/core/scene/SceneManager';

const ctx: EnvironmentContext = {
  quality: 'medium',
  pixelRatio: 1,
  aspect: 1,
  maxPointSize: 64,
  video: null,
};

/** Just enough of a world to watch its lifecycle. */
function world(id: 'particles' | 'objects' | 'galaxy' | 'globe', log: string[]): Environment {
  return {
    id,
    init: () => log.push(`init ${id}`),
    dispose: () => log.push(`dispose ${id}`),
  } as unknown as Environment;
}

/** A promise that settles when told to. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe('SceneManager', () => {
  it('loads, builds and shows a world', async () => {
    const log: string[] = [];
    const scenes = new SceneManager();
    scenes.register('galaxy', async () => world('galaxy', log));
    const shown = await scenes.activate('galaxy', ctx);
    expect(shown?.id).toBe('galaxy');
    expect(scenes.current?.id).toBe('galaxy');
    expect(log).toEqual(['init galaxy']);
  });

  it('accepts a world that needs no loading', async () => {
    const scenes = new SceneManager();
    scenes.register('objects', () => world('objects', []));
    expect((await scenes.activate('objects', ctx))?.id).toBe('objects');
  });

  it('keeps the old world on screen until the new one is ready, then swaps', async () => {
    const log: string[] = [];
    const scenes = new SceneManager();
    const loading = deferred<Environment>();
    const preparing = deferred<void>();
    scenes.register('particles', () => world('particles', log));
    scenes.register('galaxy', () => loading.promise);
    await scenes.activate('particles', ctx);

    const switching = scenes.activate('galaxy', ctx, () => preparing.promise);
    expect(scenes.current?.id).toBe('particles'); // still loading
    loading.resolve(world('galaxy', log));
    await Promise.resolve();
    await Promise.resolve();
    expect(scenes.current?.id).toBe('particles'); // built, shaders still compiling
    expect(log).toEqual(['init particles', 'init galaxy']);
    preparing.resolve();
    await switching;
    expect(scenes.current?.id).toBe('galaxy');
    expect(log).toEqual(['init particles', 'init galaxy', 'dispose particles']);
  });

  it('only the latest request wins when worlds are asked for in quick succession', async () => {
    const log: string[] = [];
    const scenes = new SceneManager();
    const slow = deferred<Environment>();
    scenes.register('particles', () => slow.promise);
    scenes.register('globe', () => world('globe', log));

    const first = scenes.activate('particles', ctx);
    const second = scenes.activate('globe', ctx);
    expect((await second)?.id).toBe('globe');
    slow.resolve(world('particles', log));
    // The slow one arrives after it was superseded: it reports that, and is never shown.
    expect(await first).toBeUndefined();
    expect(scenes.current?.id).toBe('globe');
    expect(log).not.toContain('init particles');
  });

  it('throws away a world that was built but superseded while its shaders compiled', async () => {
    const log: string[] = [];
    const scenes = new SceneManager();
    const preparing = deferred<void>();
    scenes.register('particles', () => world('particles', log));
    scenes.register('globe', () => world('globe', log));

    const first = scenes.activate('particles', ctx, () => preparing.promise);
    await Promise.resolve();
    await Promise.resolve();
    const second = scenes.activate('globe', ctx);
    await second;
    preparing.resolve();
    expect(await first).toBeUndefined();
    expect(scenes.current?.id).toBe('globe');
    expect(log).toEqual(['init particles', 'init globe', 'dispose particles']);
  });

  it('showing nothing is immediate and cancels a load in progress', async () => {
    const log: string[] = [];
    const scenes = new SceneManager();
    const slow = deferred<Environment>();
    scenes.register('particles', () => world('particles', log));
    scenes.register('galaxy', () => slow.promise);
    await scenes.activate('particles', ctx);

    const loading = scenes.activate('galaxy', ctx);
    const cleared = scenes.activate(null, ctx);
    expect(scenes.current).toBeNull();
    expect(await cleared).toBeNull();
    slow.resolve(world('galaxy', log));
    expect(await loading).toBeUndefined();
    expect(scenes.current).toBeNull();
    expect(log).toEqual(['init particles', 'dispose particles']);
  });

  it('still shows the world if preparing it fails', async () => {
    const scenes = new SceneManager();
    scenes.register('galaxy', () => world('galaxy', []));
    const shown = await scenes.activate('galaxy', ctx, () => Promise.reject(new Error('compile')));
    expect(shown?.id).toBe('galaxy');
  });

  it('rejects, and keeps what is on screen, if a world cannot be loaded', async () => {
    const scenes = new SceneManager();
    scenes.register('particles', () => world('particles', []));
    scenes.register('galaxy', () => Promise.reject(new Error('offline')));
    await scenes.activate('particles', ctx);
    await expect(scenes.activate('galaxy', ctx)).rejects.toThrow('offline');
    expect(scenes.current?.id).toBe('particles');
  });

  it('refuses a world nobody registered', async () => {
    await expect(new SceneManager().activate('galaxy', ctx)).rejects.toThrow('Unknown environment');
  });
});
