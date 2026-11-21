import type { Engine } from '../core/engine/Engine';
import type { EnvironmentId } from '../core/scene/Environment';
import { GalaxyExplorer } from './galaxy/GalaxyExplorer';
import { HoloGlobe } from './globe/HoloGlobe';
import { ObjectLab } from './objects/ObjectLab';
import { ParticleUniverse } from './particles/ParticleUniverse';

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

export function registerEnvironments(engine: Engine): void {
  engine.register('particles', () => new ParticleUniverse());
  engine.register('objects', () => new ObjectLab());
  engine.register('galaxy', () => new GalaxyExplorer());
  engine.register('globe', () => new HoloGlobe());
}
