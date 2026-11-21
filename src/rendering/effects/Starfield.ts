import { BufferAttribute, BufferGeometry, Color, Points, PointsMaterial } from 'three';
import { createRng } from '../../utils/rng';

/** A cheap distant star backdrop: one draw call, no per-frame CPU work beyond a slow rotation. */
export class Starfield {
  readonly points: Points<BufferGeometry, PointsMaterial>;

  constructor(count: number, radius = 70, seed = 7) {
    const rng = createRng(seed);
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const tint = new Color();
    for (let i = 0; i < count; i++) {
      // Uniform direction on a sphere, pushed out to a thick shell.
      const u = rng() * 2 - 1;
      const a = rng() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const r = radius * (0.6 + rng() * 0.4);
      positions[i * 3] = Math.cos(a) * s * r;
      positions[i * 3 + 1] = u * r;
      positions[i * 3 + 2] = Math.sin(a) * s * r;
      tint.setHSL(0.55 + rng() * 0.15, 0.4 * rng(), 0.35 + rng() * 0.5);
      colors[i * 3] = tint.r;
      colors[i * 3 + 1] = tint.g;
      colors[i * 3 + 2] = tint.b;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
    const material = new PointsMaterial({
      size: 1.6,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    this.points = new Points(geometry, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = -1;
  }

  /** Draws only the first `count` stars. They are in random order, so any prefix is even. */
  setDrawCount(count: number): void {
    this.points.geometry.setDrawRange(0, Math.max(0, Math.floor(count)));
  }

  update(dt: number): void {
    this.points.rotation.y += dt * 0.004;
    this.points.rotation.x += dt * 0.0015;
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.points.material.dispose();
    this.points.removeFromParent();
  }
}
