import type { Vec2, Vec3 } from '../../utils/math';

export type HandId = 'Left' | 'Right';

/** One hand exactly as a landmark detector reports it. */
export interface RawHand {
  /** 21 points in image space, x and y in 0..1 (origin top-left, not mirrored), z relative to the wrist. */
  landmarks: Vec3[];
  /** 21 points in metres relative to the hand centre, when the detector provides them. */
  worldLandmarks?: Vec3[];
  handedness: HandId;
  /** Detector confidence for the handedness/hand presence, 0..1. */
  score: number;
}

export interface RawHandFrame {
  /** Milliseconds, monotonically increasing. */
  timestamp: number;
  /** Width / height of the analysed image. */
  aspect: number;
  hands: RawHand[];
}

/** Anything that produces raw hand frames: MediaPipe, a recording, or a synthetic test feed. */
export interface LandmarkSource {
  subscribe(listener: (frame: RawHandFrame) => void): () => void;
}

/** A hand after mirroring, smoothing and normalisation. This is what gesture code consumes. */
export interface HandFrame {
  /** The user's actual hand (already corrected for the mirrored selfie view). */
  id: HandId;
  score: number;
  /** Smoothed, mirrored screen-space points: x right, y down, both 0..1. */
  landmarks: Vec3[];
  /** Wrist-centred 3D points scaled so wrist to middle-finger knuckle is 1. Scale and position invariant. */
  local: Vec3[];
  /** Centre of the palm in mirrored screen space. */
  palm: Vec2;
  /** Midpoint of thumb tip and index tip in mirrored screen space. */
  pinchPoint: Vec2;
  /** Index fingertip in mirrored screen space. */
  indexTip: Vec2;
  /** Apparent palm size as a fraction of image height; a rough proxy for distance to the camera. */
  size: number;
  /** In-plane rotation of the hand in radians. 0 means fingers pointing up; positive is clockwise on screen. */
  roll: number;
  /** Palm velocity in screen units per second (x corrected for aspect). */
  velocity: Vec2;
}

export interface TrackingFrame {
  timestamp: number;
  aspect: number;
  hands: HandFrame[];
}

export const LM = {
  WRIST: 0,
  THUMB_CMC: 1,
  THUMB_MCP: 2,
  THUMB_IP: 3,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_PIP: 6,
  INDEX_DIP: 7,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_PIP: 10,
  MIDDLE_DIP: 11,
  MIDDLE_TIP: 12,
  RING_MCP: 13,
  RING_PIP: 14,
  RING_DIP: 15,
  RING_TIP: 16,
  PINKY_MCP: 17,
  PINKY_PIP: 18,
  PINKY_DIP: 19,
  PINKY_TIP: 20,
} as const;

export const LANDMARK_COUNT = 21;

/** Bone pairs for drawing a hand skeleton. */
export const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
]; // prettier-ignore
