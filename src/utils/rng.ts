export type Rng = () => number;

/** Small deterministic PRNG (mulberry32) so procedural content is reproducible and testable. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Approximately normal sample in roughly [-1, 1], centred on 0. */
export const gaussish = (rng: Rng): number => (rng() + rng() + rng() + rng() - 2) / 2;
