import { LANDMARK_SMOOTHING, OneEuroFilter } from '../../gestures/smoothing/OneEuroFilter';
import type { OneEuroOptions } from '../../gestures/smoothing/OneEuroFilter';
import type { Vec2, Vec3 } from '../../utils/math';
import { LANDMARK_COUNT, LM } from './types';
import type { HandFrame, HandId, RawHand, RawHandFrame, TrackingFrame } from './types';

export interface LandmarkProcessorOptions {
  smoothing: OneEuroOptions;
  /** Flip x so the result matches a mirrored (selfie) preview. */
  mirror: boolean;
  /**
   * Swap the detector's Left/Right labels. MediaPipe Tasks reports the subject's own hand for an
   * un-mirrored frame, which is what the tracker is given, so no swap is needed by default.
   */
  swapHandedness: boolean;
  /** A hand unseen for this long is treated as a new hand: its filters start afresh. */
  staleMs: number;
  /** A detection this close (in image-height units) to a tracked hand is assumed to be that hand. */
  continuityRadius: number;
}

export const DEFAULT_PROCESSOR_OPTIONS: LandmarkProcessorOptions = {
  smoothing: LANDMARK_SMOOTHING,
  mirror: true,
  swapHandedness: false,
  staleMs: 450,
  continuityRadius: 0.2,
};

interface Slot {
  filters: OneEuroFilter[];
  lastSeen: number;
  lastPalm: Vec2 | null;
  velocity: Vec2;
}

const PALM_POINTS = [LM.WRIST, LM.INDEX_MCP, LM.MIDDLE_MCP, LM.RING_MCP, LM.PINKY_MCP] as const;
const OTHER: Record<HandId, HandId> = { Left: 'Right', Right: 'Left' };
const HAND_ORDER: readonly HandId[] = ['Left', 'Right'];

/**
 * Turns raw detector output into stable, comparable hands:
 * mirrors to the selfie view, keeps each physical hand in the same slot from frame to frame,
 * smooths every landmark, and derives position- and scale-invariant coordinates for recognisers.
 */
export class LandmarkProcessor {
  private readonly options: LandmarkProcessorOptions;
  private readonly slots: Record<HandId, Slot>;

  constructor(options: Partial<LandmarkProcessorOptions> = {}) {
    this.options = { ...DEFAULT_PROCESSOR_OPTIONS, ...options };
    this.slots = { Left: this.createSlot(), Right: this.createSlot() };
  }

  reset(): void {
    for (const id of HAND_ORDER) this.clearSlot(this.slots[id]);
  }

  process(frame: RawHandFrame): TrackingFrame {
    const aspect = frame.aspect > 0 ? frame.aspect : 4 / 3;
    for (const id of HAND_ORDER) {
      const slot = this.slots[id];
      if (slot.lastPalm && frame.timestamp - slot.lastSeen > this.options.staleMs) {
        this.clearSlot(slot);
      }
    }

    const assigned = this.assign(frame.hands.slice(0, 2), aspect);
    const hands: HandFrame[] = [];
    for (const id of HAND_ORDER) {
      const raw = assigned.get(id);
      if (raw) hands.push(this.buildHand(id, raw, frame.timestamp, aspect));
    }
    return { timestamp: frame.timestamp, aspect, hands };
  }

  /**
   * Decides which slot each detection belongs to. Staying with the hand that was already being
   * tracked nearby beats the detector's label, because handedness can flicker for a frame or two
   * and a flicker would otherwise end every gesture in progress.
   */
  private assign(raws: RawHand[], aspect: number): Map<HandId, RawHand> {
    const result = new Map<HandId, RawHand>();
    const pending = new Set(raws);

    const candidates: { raw: RawHand; id: HandId; distance: number }[] = [];
    for (const raw of raws) {
      const palm = this.rawPalm(raw);
      for (const id of HAND_ORDER) {
        const last = this.slots[id].lastPalm;
        if (!last) continue;
        const distance = Math.hypot((palm.x - last.x) * aspect, palm.y - last.y);
        if (distance <= this.options.continuityRadius) candidates.push({ raw, id, distance });
      }
    }
    candidates.sort((a, b) => a.distance - b.distance);
    for (const { raw, id } of candidates) {
      if (!pending.has(raw) || result.has(id)) continue;
      result.set(id, raw);
      pending.delete(raw);
    }

    // New hands take the label the detector gave them; a duplicate label goes to the free slot.
    const rest = [...pending].sort((a, b) => b.score - a.score);
    for (const raw of rest) {
      const label = this.options.swapHandedness ? OTHER[raw.handedness] : raw.handedness;
      const id = result.has(label) ? OTHER[label] : label;
      if (!result.has(id)) result.set(id, raw);
    }
    return result;
  }

  private rawPalm(raw: RawHand): Vec2 {
    let x = 0;
    let y = 0;
    for (const i of PALM_POINTS) {
      x += raw.landmarks[i].x;
      y += raw.landmarks[i].y;
    }
    x /= PALM_POINTS.length;
    y /= PALM_POINTS.length;
    return { x: this.options.mirror ? 1 - x : x, y };
  }

  private buildHand(id: HandId, raw: RawHand, timestamp: number, aspect: number): HandFrame {
    const slot = this.slots[id];
    const seconds = timestamp / 1000;
    const landmarks: Vec3[] = new Array<Vec3>(LANDMARK_COUNT);
    for (let i = 0; i < LANDMARK_COUNT; i++) {
      const p = raw.landmarks[i];
      const x = this.options.mirror ? 1 - p.x : p.x;
      landmarks[i] = {
        x: slot.filters[i * 3].filter(x, seconds),
        y: slot.filters[i * 3 + 1].filter(p.y, seconds),
        z: slot.filters[i * 3 + 2].filter(p.z, seconds),
      };
    }

    const wrist = landmarks[LM.WRIST];
    const knuckle = landmarks[LM.MIDDLE_MCP];
    // Image x and z are fractions of the width; scale them so every axis is in image heights.
    const palmX = (knuckle.x - wrist.x) * aspect;
    const palmY = knuckle.y - wrist.y;
    const palmZ = (knuckle.z - wrist.z) * aspect;
    const scale = Math.max(1e-5, Math.hypot(palmX, palmY, palmZ));
    const local = landmarks.map((p) => ({
      x: ((p.x - wrist.x) * aspect) / scale,
      y: (p.y - wrist.y) / scale,
      z: ((p.z - wrist.z) * aspect) / scale,
    }));

    const palm: Vec2 = { x: 0, y: 0 };
    for (const i of PALM_POINTS) {
      palm.x += landmarks[i].x;
      palm.y += landmarks[i].y;
    }
    palm.x /= PALM_POINTS.length;
    palm.y /= PALM_POINTS.length;

    const dt = slot.lastPalm ? (timestamp - slot.lastSeen) / 1000 : 0;
    if (slot.lastPalm && dt > 0) {
      const vx = ((palm.x - slot.lastPalm.x) * aspect) / dt;
      const vy = (palm.y - slot.lastPalm.y) / dt;
      slot.velocity = {
        x: slot.velocity.x + (vx - slot.velocity.x) * 0.6,
        y: slot.velocity.y + (vy - slot.velocity.y) * 0.6,
      };
    } else if (!slot.lastPalm) {
      slot.velocity = { x: 0, y: 0 };
    }
    slot.lastPalm = { ...palm };
    slot.lastSeen = timestamp;

    const thumb = landmarks[LM.THUMB_TIP];
    const index = landmarks[LM.INDEX_TIP];
    return {
      id,
      score: raw.score,
      landmarks,
      local,
      palm,
      pinchPoint: { x: (thumb.x + index.x) / 2, y: (thumb.y + index.y) / 2 },
      indexTip: { x: index.x, y: index.y },
      size: Math.hypot(palmX, palmY),
      // Fingers pointing up is 0; screen y grows downward, hence the negation.
      roll: Math.atan2(palmX, -palmY),
      velocity: { ...slot.velocity },
    };
  }

  private createSlot(): Slot {
    return {
      filters: Array.from(
        { length: LANDMARK_COUNT * 3 },
        () => new OneEuroFilter(this.options.smoothing),
      ),
      lastSeen: 0,
      lastPalm: null,
      velocity: { x: 0, y: 0 },
    };
  }

  private clearSlot(slot: Slot): void {
    for (const filter of slot.filters) filter.reset();
    slot.lastPalm = null;
    slot.velocity = { x: 0, y: 0 };
  }
}
