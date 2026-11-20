import { dist3, smoothstep } from '../../utils/math';
import type { Vec3 } from '../../utils/math';
import { LM } from '../../vision/landmarks/types';
import type { HandFrame } from '../../vision/landmarks/types';

/** Geometric description of a hand pose, in units of palm length (wrist to middle knuckle). */
export interface HandShape {
  /** 0 (folded) .. 1 (straight) for index, middle, ring, pinky. */
  extension: [number, number, number, number];
  /** 0 (tucked across the palm) .. 1 (stuck out). */
  thumbExtension: number;
  /** Distance from each of the four fingertips to the palm centre. */
  tipToPalm: [number, number, number, number];
  /** Distance between thumb tip and index tip, with depth down-weighted because it is noisy. */
  pinchDistance: number;
}

const FINGERS = [
  [LM.INDEX_MCP, LM.INDEX_PIP, LM.INDEX_DIP, LM.INDEX_TIP],
  [LM.MIDDLE_MCP, LM.MIDDLE_PIP, LM.MIDDLE_DIP, LM.MIDDLE_TIP],
  [LM.RING_MCP, LM.RING_PIP, LM.RING_DIP, LM.RING_TIP],
  [LM.PINKY_MCP, LM.PINKY_PIP, LM.PINKY_DIP, LM.PINKY_TIP],
] as const;

const PALM = [LM.WRIST, LM.INDEX_MCP, LM.MIDDLE_MCP, LM.RING_MCP, LM.PINKY_MCP] as const;

/** Depth from a single camera is far less reliable than x and y; trust it half as much. */
const DEPTH_WEIGHT = 0.5;

const cache = new WeakMap<HandFrame, HandShape>();

/**
 * How straight a finger is: the knuckle-to-tip distance divided by the length of the finger's
 * three bones. 1 for a straight finger, about 0.4 for a fully folded one. Using a ratio of the
 * finger's own lengths makes it independent of hand size, rotation and finger proportions.
 */
function straightness(
  p: readonly Vec3[],
  joints: readonly [number, number, number, number],
): number {
  const [mcp, pip, dip, tip] = joints;
  const bones = dist3(p[mcp], p[pip]) + dist3(p[pip], p[dip]) + dist3(p[dip], p[tip]);
  return bones > 1e-6 ? dist3(p[mcp], p[tip]) / bones : 0;
}

/** Measures a hand once per frame; every recogniser shares the result. */
export function measureHand(hand: HandFrame): HandShape {
  const cached = cache.get(hand);
  if (cached) return cached;
  const p = hand.local;

  const palm: Vec3 = { x: 0, y: 0, z: 0 };
  for (const i of PALM) {
    palm.x += p[i].x / PALM.length;
    palm.y += p[i].y / PALM.length;
    palm.z += p[i].z / PALM.length;
  }

  const extension = FINGERS.map((joints) =>
    smoothstep(0.62, 0.9, straightness(p, joints)),
  ) as HandShape['extension'];
  const tipToPalm = FINGERS.map((joints) => dist3(p[joints[3]], palm)) as HandShape['tipToPalm'];

  const thumb = p[LM.THUMB_TIP];
  const index = p[LM.INDEX_TIP];
  const shape: HandShape = {
    extension,
    // An extended thumb ends far from the little-finger knuckle; a tucked one lies across the palm.
    thumbExtension: smoothstep(0.75, 1.15, dist3(thumb, p[LM.PINKY_MCP])),
    tipToPalm,
    pinchDistance: Math.hypot(
      thumb.x - index.x,
      thumb.y - index.y,
      (thumb.z - index.z) * DEPTH_WEIGHT,
    ),
  };
  cache.set(hand, shape);
  return shape;
}
