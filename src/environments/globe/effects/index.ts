import { createExplodeEffect } from './explode';
import { createScanEffect } from './scan';
import type { GlobeEffectInfo } from './types';

/** The effects the globe can wear, in the order swiping steps through them. */
export const GLOBE_EFFECTS = {
  scan: { label: 'Hologram scan', create: createScanEffect },
  explode: { label: 'Explode and reassemble', create: createExplodeEffect },
} as const satisfies Record<string, GlobeEffectInfo>;

export type GlobeEffectName = keyof typeof GLOBE_EFFECTS;

/** `none` first: the plain globe is a choice like any other. */
export const GLOBE_EFFECT_CHOICES: ReadonlyArray<GlobeEffectName | 'none'> = [
  'none',
  ...(Object.keys(GLOBE_EFFECTS) as GlobeEffectName[]),
];

export type { GlobeEffect, GlobeEffectInfo, GlobeFrame, GlobeParts } from './types';
