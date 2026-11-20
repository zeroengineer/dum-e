import { smoothstep } from '../../utils/math';
import { measureHand } from '../classifiers/fingers';
import type { HandShape } from '../classifiers/fingers';
import { GESTURES } from '../events/types';
import type { GestureTiming, HandRecognizer } from './types';

/** Pose gestures are mutually exclusive on one hand. */
export const POSE_GROUP = 'pose';

const POSE_TIMING: GestureTiming = {
  enter: 0.72,
  exit: 0.45,
  holdMs: 90,
  releaseMs: 130,
  cooldownMs: 0,
};

/** Pinch is used for dragging, so it starts fast and tolerates a moment of doubt before letting go. */
const PINCH_TIMING: GestureTiming = {
  enter: 0.7,
  exit: 0.35,
  holdMs: 50,
  releaseMs: 110,
  cooldownMs: 0,
};

const mean = (values: readonly number[]): number =>
  values.reduce((sum, v) => sum + v, 0) / values.length;

/** Blend of the weakest and the average value: every finger must take part, none has to be perfect. */
const consensus = (values: readonly number[]): number =>
  Math.min(...values) * 0.6 + mean(values) * 0.4;

/** 1 when thumb and index tips touch, 0 when they are clearly apart. */
const pinchCloseness = (shape: HandShape): number => 1 - smoothstep(0.2, 0.45, shape.pinchDistance);

function fistConfidence(shape: HandShape): number {
  const folded = shape.extension.map((extension, i) => {
    const tucked = 1 - smoothstep(0.75, 1.25, shape.tipToPalm[i]);
    return (1 - extension) * tucked;
  });
  return consensus(folded);
}

export const openPalmRecognizer: HandRecognizer = {
  id: GESTURES.OPEN_PALM,
  scope: 'hand',
  kind: 'continuous',
  group: POSE_GROUP,
  timing: POSE_TIMING,
  evaluate(hand) {
    const shape = measureHand(hand);
    const fingers = consensus(shape.extension);
    // A flat hand with the thumb tucked still counts, just less confidently.
    const thumb = 0.72 + 0.28 * shape.thumbExtension;
    return { confidence: fingers * thumb * (1 - pinchCloseness(shape)) };
  },
};

export const fistRecognizer: HandRecognizer = {
  id: GESTURES.FIST,
  scope: 'hand',
  kind: 'continuous',
  group: POSE_GROUP,
  timing: POSE_TIMING,
  evaluate(hand) {
    return { confidence: fistConfidence(measureHand(hand)) };
  },
};

export const pinchRecognizer: HandRecognizer = {
  id: GESTURES.PINCH,
  scope: 'hand',
  kind: 'continuous',
  group: POSE_GROUP,
  timing: PINCH_TIMING,
  evaluate(hand) {
    const shape = measureHand(hand);
    // In a fist the thumb also rests near the index finger; a pinch needs the index finger out.
    const indexOut = smoothstep(0.08, 0.3, shape.extension[0]);
    const confidence = pinchCloseness(shape) * indexOut * (1 - fistConfidence(shape));
    return { confidence, x: hand.pinchPoint.x, y: hand.pinchPoint.y };
  },
};

export const pointRecognizer: HandRecognizer = {
  id: GESTURES.POINT,
  scope: 'hand',
  kind: 'continuous',
  group: POSE_GROUP,
  timing: POSE_TIMING,
  evaluate(hand) {
    const shape = measureHand(hand);
    const othersFolded = consensus(shape.extension.slice(1).map((e) => 1 - e));
    const confidence = shape.extension[0] * othersFolded * (1 - pinchCloseness(shape));
    return { confidence, x: hand.indexTip.x, y: hand.indexTip.y };
  },
};
