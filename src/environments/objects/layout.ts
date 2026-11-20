import type { Vec3 } from '../../utils/math';

export const OBJECT_KINDS = ['cube', 'sphere', 'torus', 'pyramid', 'crystal', 'ring'] as const;
export type ObjectKind = (typeof OBJECT_KINDS)[number];

export const KIND_LABELS: Record<ObjectKind, string> = {
  cube: 'Cube',
  sphere: 'Sphere',
  torus: 'Torus',
  pyramid: 'Pyramid',
  crystal: 'Crystal',
  ring: 'Twisted ring',
};

export const OBJECT_COLORS = [
  '#3df5ff',
  '#ffb454',
  '#7a5cff',
  '#8dffb0',
  '#ff5d8f',
  '#fff1a8',
  '#1fa2ff',
  '#ff7bd5',
] as const;

/** Objects stay inside this box so nothing can be dragged out of reach. */
export const LAB_BOUNDS = { x: 5.2, yMin: -2.2, yMax: 2.8, z: 3.2 };

export const OBJECT_COUNT_MIN = 4;
export const OBJECT_COUNT_MAX = 16;

export interface Placement {
  kind: ObjectKind;
  position: Vec3;
  color: string;
}

/**
 * Deterministic starting arrangement: two staggered arcs facing the camera, cycling through
 * every kind so any count of six or more shows all of them.
 */
export function layoutObjects(count: number): Placement[] {
  const n = Math.max(1, Math.round(count));
  const back = Math.floor(n / 2);
  const front = n - back;
  const placements: Placement[] = [];
  const row = (size: number, y: number, z: number, width: number, offset: number): void => {
    for (let i = 0; i < size; i++) {
      const t = size === 1 ? 0 : i / (size - 1) - 0.5;
      const index = placements.length;
      placements.push({
        kind: OBJECT_KINDS[(index + offset) % OBJECT_KINDS.length],
        // A shallow arc: the ends of a row sit slightly closer to the camera.
        position: { x: t * width, y, z: z + Math.abs(t) * 1.2 },
        color: OBJECT_COLORS[index % OBJECT_COLORS.length],
      });
    }
  };
  row(front, -0.9, 1.0, Math.min(8.4, front * 1.9), 0);
  row(back, 1.25, -1.0, Math.min(7.6, back * 1.9), 3);
  return placements;
}

export function clampToBounds(p: Vec3): Vec3 {
  p.x = Math.min(LAB_BOUNDS.x, Math.max(-LAB_BOUNDS.x, p.x));
  p.y = Math.min(LAB_BOUNDS.yMax, Math.max(LAB_BOUNDS.yMin, p.y));
  p.z = Math.min(LAB_BOUNDS.z, Math.max(-LAB_BOUNDS.z, p.z));
  return p;
}
