// A small parametric hand model for tests: it produces 21 landmarks in the same layout and
// coordinate conventions as MediaPipe, for a handful of poses at any position, size and rotation.
import { LandmarkProcessor } from '../../../src/vision/landmarks/LandmarkProcessor';
import type { LandmarkProcessorOptions } from '../../../src/vision/landmarks/LandmarkProcessor';
import type {
  HandFrame,
  HandId,
  RawHand,
  RawHandFrame,
  TrackingFrame,
} from '../../../src/vision/landmarks/types';

export type Pose = 'open' | 'fist' | 'pinch' | 'point' | 'relaxed';

export interface HandSpec {
  pose: Pose;
  /** Palm centre on the mirrored screen, 0..1. */
  x?: number;
  y?: number;
  /** Wrist to middle knuckle, as a fraction of image height. */
  size?: number;
  /** Radians, clockwise on screen; 0 is fingers up. */
  roll?: number;
  handedness?: HandId;
  score?: number;
}

type P3 = [number, number, number];

const DEG = Math.PI / 180;

// Hand space: wrist at the origin, fingers along +y, wrist to middle knuckle = 1, z < 0 toward the camera.
const FINGERS: { mcp: P3; lean: number; lengths: [number, number, number] }[] = [
  { mcp: [-0.25, 0.95, 0], lean: -8 * DEG, lengths: [0.45, 0.28, 0.22] },
  { mcp: [0, 1, 0], lean: 0, lengths: [0.5, 0.32, 0.24] },
  { mcp: [0.22, 0.93, 0], lean: 8 * DEG, lengths: [0.46, 0.3, 0.22] },
  { mcp: [0.42, 0.8, 0], lean: 18 * DEG, lengths: [0.36, 0.22, 0.19] },
];

const THUMB_OPEN: P3[] = [
  [-0.3, 0.25, 0],
  [-0.55, 0.5, 0],
  [-0.75, 0.75, 0],
  [-0.9, 0.98, 0],
];
const THUMB_FOLDED: P3[] = [
  [-0.3, 0.25, 0],
  [-0.45, 0.5, -0.08],
  [-0.25, 0.65, -0.16],
  [-0.05, 0.7, -0.2],
];

const CURLS: Record<Pose, { fingers: [number, number, number, number]; thumb: number }> = {
  open: { fingers: [0, 0, 0, 0], thumb: 0 },
  fist: { fingers: [1, 1, 1, 1], thumb: 1 },
  point: { fingers: [0, 1, 1, 1], thumb: 1 },
  pinch: { fingers: [0.45, 0.15, 0.1, 0.1], thumb: 0 },
  relaxed: { fingers: [0.6, 0.6, 0.6, 0.6], thumb: 0.35 },
};

/** Joint positions (pip, dip, tip) of one finger for a curl of 0 (straight) to 1 (fully folded). */
function fingerJoints(finger: (typeof FINGERS)[number], curl: number): P3[] {
  const bends = [80 * DEG * curl, 180 * DEG * curl, 250 * DEG * curl];
  const joints: P3[] = [];
  let [x, y, z] = finger.mcp;
  for (let k = 0; k < 3; k++) {
    const along = Math.cos(bends[k]) * finger.lengths[k];
    x += Math.sin(finger.lean) * along;
    y += Math.cos(finger.lean) * along;
    z -= Math.sin(bends[k]) * finger.lengths[k];
    joints.push([x, y, z]);
  }
  return joints;
}

/** The 21 landmarks in hand space for a pose. */
export function handModel(pose: Pose): P3[] {
  const { fingers, thumb } = CURLS[pose];
  const points: P3[] = [[0, 0, 0]];
  const thumbPoints = THUMB_OPEN.map((open, i): P3 => {
    const folded = THUMB_FOLDED[i];
    return [
      open[0] + (folded[0] - open[0]) * thumb,
      open[1] + (folded[1] - open[1]) * thumb,
      open[2] + (folded[2] - open[2]) * thumb,
    ];
  });
  const fingerPoints = FINGERS.map((finger, i) => [
    finger.mcp,
    ...fingerJoints(finger, fingers[i]),
  ]);
  if (pose === 'pinch') {
    // Bring the thumb tip onto the index tip.
    const indexTip = fingerPoints[0][3];
    thumbPoints[3] = [indexTip[0] - 0.02, indexTip[1] - 0.02, indexTip[2]];
    thumbPoints[2] = [
      (thumbPoints[1][0] + indexTip[0]) / 2,
      (thumbPoints[1][1] + indexTip[1]) / 2,
      indexTip[2] / 2,
    ];
  }
  points.push(...thumbPoints);
  for (const finger of fingerPoints) points.push(...finger);
  return points;
}

/** One hand as a detector would report it for an un-mirrored camera image. */
export function makeRawHand(spec: HandSpec, aspect = 4 / 3): RawHand {
  const { pose, x = 0.5, y = 0.5, size = 0.2, roll = 0, handedness = 'Right', score = 0.95 } = spec;
  const flip = handedness === 'Left' ? -1 : 1;
  const model = handModel(pose).map(([hx, hy, hz]): P3 => [hx * flip, hy, hz]);
  // Anchor the requested position at the palm centre (wrist and the four knuckles).
  const palm = [0, 5, 9, 13, 17].reduce(
    (sum, i) => [sum[0] + model[i][0] / 5, sum[1] + model[i][1] / 5],
    [0, 0],
  );
  const cos = Math.cos(roll);
  const sin = Math.sin(roll);
  const landmarks = model.map(([hx, hy, hz]) => {
    const sx = hx - palm[0];
    const sy = -(hy - palm[1]);
    const screenX = x + ((sx * cos - sy * sin) * size) / aspect;
    const screenY = y + (sx * sin + sy * cos) * size;
    return { x: 1 - screenX, y: screenY, z: (hz * size) / aspect };
  });
  return { landmarks, handedness, score };
}

export function makeRawFrame(timestamp: number, specs: HandSpec[], aspect = 4 / 3): RawHandFrame {
  return { timestamp, aspect, hands: specs.map((spec) => makeRawHand(spec, aspect)) };
}

/** Processes hands with smoothing effectively off, so one frame yields the exact pose. */
export function makeTrackingFrame(
  timestamp: number,
  specs: HandSpec[],
  options: Partial<LandmarkProcessorOptions> = {},
): TrackingFrame {
  const processor = new LandmarkProcessor(options);
  return processor.process(makeRawFrame(timestamp, specs));
}

export function makeHandFrame(spec: HandSpec): HandFrame {
  const frame = makeTrackingFrame(0, [spec]);
  return frame.hands[0];
}
