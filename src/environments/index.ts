import type { Engine } from '../core/engine/Engine';
import type { Environment, EnvironmentId } from '../core/scene/Environment';

export interface EnvironmentInfo {
  id: EnvironmentId;
  name: string;
  tagline: string;
}

export const ENVIRONMENTS: readonly EnvironmentInfo[] = [
  {
    id: 'particles',
    name: 'Particle Universe',
    tagline: 'Push, pull and reshape a living cloud of particles.',
  },
  {
    id: 'objects',
    name: 'Object Manipulation Lab',
    tagline: 'Point, pinch and throw geometric objects around a bench.',
  },
  {
    id: 'galaxy',
    name: 'Galaxy Explorer',
    tagline: 'Turn, stretch and fly through a procedural spiral galaxy.',
  },
  {
    id: 'globe',
    name: 'Holo Globe',
    tagline: 'Hold a hologram of the Earth in your hand, on camera, and stretch it with both.',
  },
];

export function isEnvironmentId(value: unknown): value is EnvironmentId {
  return ENVIRONMENTS.some((e) => e.id === value);
}

/**
 * Each world is its own chunk, fetched the first time it is opened, so the landing page does
 * not pay for worlds nobody has visited yet.
 */
const LOADERS: Record<EnvironmentId, () => Promise<Environment>> = {
  particles: async () => new (await import('./particles/ParticleUniverse')).ParticleUniverse(),
  objects: async () => new (await import('./objects/ObjectLab')).ObjectLab(),
  galaxy: async () => new (await import('./galaxy/GalaxyExplorer')).GalaxyExplorer(),
  globe: async () => new (await import('./globe/HoloGlobe')).HoloGlobe(),
};

export function registerEnvironments(engine: Engine): void {
  for (const { id } of ENVIRONMENTS) engine.register(id, LOADERS[id]);
}

/**
 * Fetches every world's code in the background once the page is idle, so switching is instant
 * and keeps working if the connection drops. Failures are ignored: opening the world retries.
 */
export function preloadEnvironments(): void {
  const load = (): void => {
    void import('./particles/ParticleUniverse').catch(() => undefined);
    void import('./objects/ObjectLab').catch(() => undefined);
    void import('./galaxy/GalaxyExplorer').catch(() => undefined);
    void import('./globe/HoloGlobe').catch(() => undefined);
  };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(load, { timeout: 4000 });
  else setTimeout(load, 2000);
}
