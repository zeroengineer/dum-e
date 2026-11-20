import type { QualityLevel } from '../scene/Environment';

export interface QualityProfile {
  /** Upper bound for the renderer pixel ratio. */
  maxPixelRatio: number;
  /** Default particle budget for the Particle Universe. */
  particles: number;
  /** Default star budget for the Galaxy Explorer. */
  stars: number;
  /** Background star count. */
  backdropStars: number;
}

export const QUALITY_PROFILES: Record<QualityLevel, QualityProfile> = {
  low: { maxPixelRatio: 1, particles: 9_000, stars: 18_000, backdropStars: 600 },
  medium: { maxPixelRatio: 1.5, particles: 24_000, stars: 45_000, backdropStars: 1_200 },
  high: { maxPixelRatio: 2, particles: 48_000, stars: 90_000, backdropStars: 2_000 },
};

export const QUALITY_ORDER: readonly QualityLevel[] = ['low', 'medium', 'high'];

export interface DeviceHints {
  /** Unmasked GPU renderer string, when the browser exposes it. */
  gpu: string;
  cores: number;
  /** Device memory in GB, when exposed. */
  memory?: number;
  mobile: boolean;
}

/**
 * First guess at a quality tier from static device hints. The engine lowers the tier later
 * if measured frame rate says the guess was optimistic.
 */
export function guessQuality(hints: DeviceHints): QualityLevel {
  const gpu = hints.gpu.toLowerCase();
  if (/swiftshader|llvmpipe|software|basic render/.test(gpu)) return 'low';
  if (hints.mobile) return hints.cores >= 8 ? 'medium' : 'low';
  if (hints.cores <= 2 || (hints.memory !== undefined && hints.memory <= 2)) return 'low';
  const discrete = /nvidia|geforce|rtx|gtx|radeon rx|radeon pro|apple m\d|apple gpu|arc\b/.test(
    gpu,
  );
  if (discrete && hints.cores >= 6) return 'high';
  return 'medium';
}

export function lowerQuality(level: QualityLevel): QualityLevel {
  const i = QUALITY_ORDER.indexOf(level);
  return QUALITY_ORDER[Math.max(0, i - 1)];
}
