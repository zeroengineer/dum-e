// A small parametric hand model for tests: it produces 21 landmarks in the same layout and
// coordinate conventions as MediaPipe, for a handful of poses at any position, size and rotation.
import { handModel } from '../../../src/utils/handModel';
import type { HandPoint, Pose } from '../../../src/utils/handModel';
import { LandmarkProcessor } from '../../../src/vision/landmarks/LandmarkProcessor';
import type { LandmarkProcessorOptions } from '../../../src/vision/landmarks/LandmarkProcessor';
import type {
  HandFrame,
  HandId,
  RawHand,
  RawHandFrame,
  TrackingFrame,
} from '../../../src/vision/landmarks/types';

export type { Pose };

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

type P3 = HandPoint;

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
