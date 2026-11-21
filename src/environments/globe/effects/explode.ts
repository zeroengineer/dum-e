import { smoothstep } from '../../../utils/math';
import type { GlobeEffect, GlobeFrame, GlobeParts } from './types';

/** The globe starts to come apart at this radius (fraction of screen height) and is fully apart at the next. */
export const EXPLODE_START = 0.26;
export const EXPLODE_FULL = 0.4;

/** How far apart the globe should be, 0..1, for how big the hands have made it. */
export function explodeTarget(radius: number): number {
  return smoothstep(EXPLODE_START, EXPLODE_FULL, radius);
}

/**
 * A value on a spring: it chases its target, overshoots a little and settles. That overshoot is
 * what makes the globe snap back together instead of sliding.
 */
export class Spring {
  value = 0;
  velocity = 0;

  constructor(
    private readonly stiffness = 70,
    private readonly damping = 9,
  ) {}

  step(target: number, dt: number): number {
    // Small fixed steps keep the spring stable through a slow frame.
    let remaining = Math.min(dt, 0.1);
    while (remaining > 1e-6) {
      const h = Math.min(remaining, 1 / 120);
      const force = (target - this.value) * this.stiffness - this.velocity * this.damping;
      this.velocity += force * h;
      this.value += this.velocity * h;
      remaining -= h;
    }
    return this.value;
  }

  reset(): void {
    this.value = 0;
    this.velocity = 0;
  }
}

/**
 * Explode and reassemble: stretch the globe wide and it bursts into drifting shells of dots;
 * bring the hands together and it springs back into a sphere. The dots move in the vertex
 * shader; this effect only decides how far apart they are.
 */
export function createExplodeEffect(parts: GlobeParts): GlobeEffect {
  const spring = new Spring();
  const materials = [parts.dots, parts.lines, parts.shell];
  return {
    update(frame: GlobeFrame): void {
      const amount = spring.step(explodeTarget(frame.state.radius) * frame.strength, frame.dt);
      if (frame.strength === 0) spring.reset();
      // The spring may dip just below zero as it settles; the globe must not turn inside out.
      const explode = frame.strength === 0 ? 0 : Math.max(0, amount);
      for (const material of materials) material.uniforms.uExplode.value = explode;
    },
    inspect: () => ({ explode: Math.max(0, spring.value) }),
  };
}
