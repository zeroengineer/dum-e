import type { Group, ShaderMaterial, Vector3 } from 'three';
import type { ResourceTracker } from '../../../core/resources/ResourceTracker';
import type { QualityLevel } from '../../../core/scene/Environment';
import type { GlobeState } from '../globeState';

/** What an effect may touch: the globe's own materials, and two groups to add its own parts to. */
export interface GlobeParts {
  /** Children here turn with the globe. One unit is one globe radius. */
  turning: Group;
  /** Children here move and scale with the globe but always face the screen. */
  fixed: Group;
  dots: ShaderMaterial;
  lines: ShaderMaterial;
  shell: ShaderMaterial;
  halo: ShaderMaterial;
  /** Geometries and materials tracked here are disposed with the world. */
  resources: ResourceTracker;
  quality: QualityLevel;
}

export interface GlobeFrame {
  dt: number;
  /** Seconds since the world opened. */
  time: number;
  /**
   * 0 when this effect is off, 1 when fully on, in between while it fades. An effect must leave
   * no trace at 0: it is updated while fading out and then left alone.
   */
  strength: number;
  state: Readonly<GlobeState>;
  /** The globe's radius in scene units. */
  radius: number;
  /**
   * Fingertips in scene units relative to the globe's centre: ten entries, thumb to little
   * finger for the left hand slot, then the same for the right.
   */
  tips: readonly Vector3[];
  /** Which of `tips` belong to a hand that is in view. The rest hold stale positions. */
  tipsPresent: readonly boolean[];
}

export interface GlobeEffect {
  update(frame: GlobeFrame): void;
  setColour?(main: string, accent: string): void;
  setQuality?(quality: QualityLevel): void;
  /** Facts for diagnostics and automated tests. */
  inspect?(): Record<string, number | string | boolean>;
}

export interface GlobeEffectInfo {
  label: string;
  create(parts: GlobeParts): GlobeEffect;
}
