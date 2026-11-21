import type { GlobeEffect, GlobeFrame, GlobeParts } from './types';

export interface Glitch {
  /** 0 almost always; up to 1 for an instant. */
  amount: number;
  /** Where on the globe the slice is: -1 bottom to 1 top. */
  y: number;
}

const SLOT_SECONDS = 0.09;

/** A repeatable number in 0..1 for an integer. */
function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * A projector that is not quite stable: now and then, for under a tenth of a second, a slice of
 * the image jumps sideways. Purely a function of time, so it is the same on every run.
 */
export function glitchAt(time: number): Glitch {
  const slot = Math.floor(time / SLOT_SECONDS);
  // About one slot in eleven glitches.
  if (hash(slot) < 0.91) return { amount: 0, y: 0 };
  const within = time / SLOT_SECONDS - slot;
  return {
    amount: (0.4 + 0.6 * hash(slot + 0.5)) * Math.sin(within * Math.PI),
    y: hash(slot + 0.25) * 2 - 1,
  };
}

/** Brightness wobble of a projected image: always near 1, never above it. */
export function flickerAt(time: number): number {
  const fast = Math.sin(time * 61) * Math.sin(time * 23.7);
  const slow = Math.sin(time * 3.1);
  return 1 - 0.07 * (0.5 + 0.5 * fast) - 0.04 * (0.5 + 0.5 * slow);
}

/**
 * Hologram scan: fine bands of light drifting up the globe, a bright line sweeping through it,
 * a faint flicker and an occasional glitch. Drawn by the globe's own shaders; this only feeds them.
 */
export function createScanEffect(parts: GlobeParts): GlobeEffect {
  const materials = [parts.dots, parts.lines, parts.shell];
  return {
    update(frame: GlobeFrame): void {
      const glitch = glitchAt(frame.time);
      const flicker = 1 - (1 - flickerAt(frame.time)) * frame.strength;
      for (const material of materials) {
        const u = material.uniforms;
        u.uScan.value = frame.strength;
        u.uScanTime.value = frame.time;
        u.uGlitch.value = glitch.amount * frame.strength;
        u.uGlitchY.value = glitch.y;
        u.uFlicker.value = flicker;
      }
    },
  };
}
