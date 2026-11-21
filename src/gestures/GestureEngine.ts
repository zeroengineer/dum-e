import { wrapAngle } from '../utils/math';
import { LM } from '../vision/landmarks/types';
import type { HandFrame, HandId, TrackingFrame } from '../vision/landmarks/types';
import { GESTURES, createGestureEvent } from './events/types';
import type {
  GestureEvent,
  GestureHand,
  GestureName,
  GesturePhase,
  GestureSink,
  SwipeDirection,
} from './events/types';
import { GestureStateMachine, adjustTiming } from './GestureStateMachine';
import type { GestureRegistry } from './recognizers/GestureRegistry';
import type { GestureTiming, HandRecognizer, MotionSample } from './recognizers/types';

export interface GestureEngineOptions {
  /** 0 (strict) .. 1 (eager). */
  sensitivity: number;
  /** How long a vanished hand keeps its gestures alive before they are ended. */
  graceMs: number;
  /** Length of the palm-position history kept for motion gestures. */
  historyMs: number;
  /** Motion gestures are ignored this long after a hand appears, so entering the frame is not a swipe. */
  settleMs: number;
  /** An active pose keeps priority over a rival pose unless the rival is this much more confident. */
  stickiness: number;
  /** Two-hand distance changes smaller than this ratio are treated as jitter. */
  scaleDeadband: number;
}

export const DEFAULT_ENGINE_OPTIONS: GestureEngineOptions = {
  sensitivity: 0.5,
  graceMs: 300,
  historyMs: 450,
  settleMs: 350,
  stickiness: 0.15,
  scaleDeadband: 0.012,
};

interface Anchor {
  x: number;
  y: number;
  roll: number;
}

interface Tracked {
  machine: GestureStateMachine;
  /** The timing the machine was built from, to notice a re-registered recogniser. */
  timing: GestureTiming;
  anchor: Anchor | null;
}

interface HandTrack {
  present: boolean;
  since: number;
  lastSeen: number;
  last: HandFrame | null;
  history: MotionSample[];
  gestures: Map<GestureName, Tracked>;
  handAnchor: Anchor | null;
}

interface TwoHandTrack extends Tracked {
  startDistance: number;
  /** Distance at the last reported change; small wobbles around it are ignored. */
  reportedDistance: number;
  lastSeen: number;
  last: { x: number; y: number; scale: number; span: number } | null;
}

const HAND_IDS: readonly HandId[] = ['Left', 'Right'];
const FINGERTIPS = [LM.THUMB_TIP, LM.INDEX_TIP, LM.MIDDLE_TIP, LM.RING_TIP, LM.PINKY_TIP] as const;

/**
 * Watches processed hand frames and reports gestures as start / update / end events.
 *
 * Recognisers say how confident they are; this class owns everything about time: per-hand state
 * machines, exclusivity between poses, motion history, tracking-loss grace and two-hand scale.
 * It emits events to a sink and has no idea who is listening.
 */
export class GestureEngine {
  private readonly options: GestureEngineOptions;
  private readonly hands: Record<HandId, HandTrack> = {
    Left: createHandTrack(),
    Right: createHandTrack(),
  };
  private readonly twoHand = new Map<GestureName, TwoHandTrack>();
  private lastTimestamp = 0;

  constructor(
    private readonly registry: GestureRegistry,
    private readonly sink: GestureSink,
    options: Partial<GestureEngineOptions> = {},
  ) {
    this.options = { ...DEFAULT_ENGINE_OPTIONS, ...options };
  }

  setSensitivity(sensitivity: number): void {
    this.options.sensitivity = sensitivity;
    for (const id of HAND_IDS) {
      for (const tracked of this.hands[id].gestures.values()) {
        tracked.machine.setTiming(adjustTiming(tracked.timing, sensitivity));
      }
    }
    for (const tracked of this.twoHand.values()) {
      tracked.machine.setTiming(adjustTiming(tracked.timing, sensitivity));
    }
  }

  /** Names of the gestures currently active on a hand (or on both hands together). */
  activeGestures(hand: GestureHand): GestureName[] {
    const source = hand === 'Both' ? this.twoHand : this.hands[hand].gestures;
    const names: GestureName[] = [];
    for (const [name, tracked] of source) if (tracked.machine.active) names.push(name);
    return names;
  }

  process(frame: TrackingFrame): void {
    this.lastTimestamp = frame.timestamp;
    const seen: Partial<Record<HandId, HandFrame>> = {};
    for (const hand of frame.hands) seen[hand.id] = hand;

    for (const id of HAND_IDS) {
      const hand = seen[id];
      if (hand) this.updateHand(id, hand, frame);
      else this.updateMissingHand(id, frame.timestamp);
    }
    this.updateTwoHand(seen.Left, seen.Right, frame);
  }

  /** Ends everything in progress, for example when tracking is switched off. */
  reset(): void {
    const now = this.lastTimestamp;
    this.endTwoHand(now);
    for (const id of HAND_IDS) this.endHand(id, now);
    this.twoHand.clear();
  }

  // --- one hand ------------------------------------------------------------------------------

  private updateHand(id: HandId, hand: HandFrame, frame: TrackingFrame): void {
    const track = this.hands[id];
    const now = frame.timestamp;
    const events: GestureEvent[] = [];
    const endings = new Set<GestureEvent>();

    if (!track.present) {
      track.present = true;
      track.since = now;
      track.history = [];
      track.handAnchor = null;
    }
    const appeared = track.handAnchor === null;
    events.push(
      this.handEvent(
        GESTURES.HAND,
        appeared ? 'start' : 'update',
        id,
        hand,
        now,
        1,
        hand.palm.x,
        hand.palm.y,
        track.handAnchor,
      ),
    );
    track.handAnchor = { x: hand.palm.x, y: hand.palm.y, roll: hand.roll };
    track.last = hand;
    track.lastSeen = now;

    track.history.push({ t: now, x: hand.palm.x * frame.aspect, y: hand.palm.y });
    while (track.history.length > 0 && now - track.history[0].t > this.options.historyMs) {
      track.history.shift();
    }

    const recognizers = this.registry.handRecognizers;
    const results = recognizers.map((recognizer) => recognizer.evaluate(hand, track.history));
    const confidences = results.map((result) => result.confidence);
    this.applyExclusivity(recognizers, confidences, track);

    recognizers.forEach((recognizer, i) => {
      const tracked = this.trackedFor(
        track.gestures,
        recognizer.id,
        recognizer.timing,
        recognizer.kind,
      );
      let confidence = confidences[i];
      if (recognizer.kind === 'discrete' && now - track.since < this.options.settleMs) {
        confidence = 0;
      }
      if (
        !tracked.machine.active &&
        (recognizer.suppressedBy?.some((other) => track.gestures.get(other)?.machine.active) ||
          this.groupBusy(recognizers, recognizer, track))
      ) {
        confidence = 0;
      }

      const transition = tracked.machine.update(confidence, now);
      if (transition === null) return;
      const x = results[i].x ?? hand.palm.x;
      const y = results[i].y ?? hand.palm.y;
      const direction = results[i].direction;

      if (transition === 'fire') {
        events.push(
          this.handEvent(recognizer.id, 'start', id, hand, now, confidence, x, y, null, direction),
          this.handEvent(recognizer.id, 'end', id, hand, now, confidence, x, y, null, direction),
        );
        track.history = []; // the return stroke must not count as another swipe
        return;
      }
      const anchor = transition === 'start' ? null : tracked.anchor;
      const event = this.handEvent(
        recognizer.id,
        transition,
        id,
        hand,
        now,
        confidence,
        x,
        y,
        anchor,
      );
      events.push(event);
      if (transition === 'end') endings.add(event);
      tracked.anchor = transition === 'end' ? null : { x, y, roll: hand.roll };
    });

    // Endings of continuous gestures go out first, so a listener never sees a pose begin before
    // the previous one has finished. Everything else keeps the order it was produced in.
    for (const event of events) if (endings.has(event)) this.sink(event);
    for (const event of events) if (!endings.has(event)) this.sink(event);
  }

  /** Within a group only the most confident recogniser may be active; the current one is favoured. */
  private applyExclusivity(
    recognizers: readonly HandRecognizer[],
    confidences: number[],
    track: HandTrack,
  ): void {
    const winners = new Map<string, { index: number; score: number }>();
    recognizers.forEach((recognizer, i) => {
      if (!recognizer.group) return;
      const active = track.gestures.get(recognizer.id)?.machine.active ?? false;
      const score = confidences[i] + (active ? this.options.stickiness : 0);
      const best = winners.get(recognizer.group);
      if (!best || score > best.score) winners.set(recognizer.group, { index: i, score });
    });
    recognizers.forEach((recognizer, i) => {
      if (recognizer.group && winners.get(recognizer.group)?.index !== i) confidences[i] = 0;
    });
  }

  /** True while a different recogniser of the same group is still active on this hand. */
  private groupBusy(
    recognizers: readonly HandRecognizer[],
    recognizer: HandRecognizer,
    track: HandTrack,
  ): boolean {
    if (!recognizer.group) return false;
    return recognizers.some(
      (other) =>
        other !== recognizer &&
        other.group === recognizer.group &&
        (track.gestures.get(other.id)?.machine.active ?? false),
    );
  }

  private updateMissingHand(id: HandId, now: number): void {
    const track = this.hands[id];
    if (!track.present) return;
    // Hold everything through a brief dropout; the hand usually comes straight back.
    if (now - track.lastSeen <= this.options.graceMs) return;
    this.endHand(id, now);
  }

  private endHand(id: HandId, now: number): void {
    const track = this.hands[id];
    if (!track.present || !track.last) {
      track.present = false;
      return;
    }
    const hand = track.last;
    for (const [name, tracked] of track.gestures) {
      if (tracked.machine.forceEnd(now)) {
        const { x, y } = tracked.anchor ?? hand.palm;
        this.sink(this.handEvent(name, 'end', id, hand, now, 0, x, y, tracked.anchor));
      }
      tracked.anchor = null;
    }
    this.sink(
      this.handEvent(GESTURES.HAND, 'end', id, hand, now, 0, hand.palm.x, hand.palm.y, null),
    );
    track.present = false;
    track.last = null;
    track.handAnchor = null;
    track.history = [];
  }

  private handEvent(
    gesture: GestureName,
    phase: GesturePhase,
    hand: HandId,
    frame: HandFrame,
    timestamp: number,
    confidence: number,
    x: number,
    y: number,
    anchor: Anchor | null,
    direction?: SwipeDirection,
  ): GestureEvent {
    return createGestureEvent({
      gesture,
      phase,
      hand,
      confidence,
      timestamp,
      x,
      y,
      dx: anchor ? x - anchor.x : 0,
      dy: anchor ? y - anchor.y : 0,
      roll: frame.roll,
      dRoll: anchor ? wrapAngle(frame.roll - anchor.roll) : 0,
      size: frame.size,
      // Only the presence event carries fingertips; poses would repeat the same points.
      tips:
        gesture === GESTURES.HAND && phase !== 'end'
          ? FINGERTIPS.map((i) => ({ x: frame.landmarks[i].x, y: frame.landmarks[i].y }))
          : undefined,
      direction,
      source: 'camera',
    });
  }

  // --- both hands ----------------------------------------------------------------------------

  private updateTwoHand(
    left: HandFrame | undefined,
    right: HandFrame | undefined,
    frame: TrackingFrame,
  ): void {
    const now = frame.timestamp;
    if (!left || !right) {
      for (const [name, tracked] of this.twoHand) {
        if (now - tracked.lastSeen <= this.options.graceMs) continue;
        if (tracked.machine.active) this.finishTwoHand(name, tracked, now);
        else tracked.machine.forceEnd(now); // drop a half-recognised gesture
      }
      return;
    }

    for (const recognizer of this.registry.twoHandRecognizers) {
      const tracked = this.twoHandFor(recognizer.id, recognizer.timing);
      const result = recognizer.evaluate(left, right, frame.aspect);
      const x = result.x ?? (left.palm.x + right.palm.x) / 2;
      const y = result.y ?? (left.palm.y + right.palm.y) / 2;
      tracked.lastSeen = now;

      const transition = tracked.machine.update(result.confidence, now);
      if (transition === null || transition === 'fire') continue;
      if (transition === 'end') {
        this.finishTwoHand(recognizer.id, tracked, now);
        continue;
      }

      let dScale = 1;
      if (transition === 'start') {
        tracked.startDistance = result.distance;
        tracked.reportedDistance = result.distance;
      } else if (result.distance > 0 && tracked.reportedDistance > 0) {
        const ratio = result.distance / tracked.reportedDistance;
        if (Math.abs(Math.log(ratio)) > this.options.scaleDeadband) {
          dScale = ratio;
          tracked.reportedDistance = result.distance;
        }
      }
      const scale =
        tracked.startDistance > 0 ? tracked.reportedDistance / tracked.startDistance : 1;
      const anchor = transition === 'start' ? null : tracked.anchor;
      this.sink(
        createGestureEvent({
          gesture: recognizer.id,
          phase: transition,
          hand: 'Both',
          confidence: result.confidence,
          timestamp: now,
          x,
          y,
          dx: anchor ? x - anchor.x : 0,
          dy: anchor ? y - anchor.y : 0,
          scale,
          dScale,
          span: result.distance,
          size: (left.size + right.size) / 2,
          source: 'camera',
        }),
      );
      tracked.anchor = { x, y, roll: 0 };
      tracked.last = { x, y, scale, span: result.distance };
    }
  }

  private endTwoHand(now: number): void {
    for (const [name, tracked] of this.twoHand) {
      if (tracked.machine.active) this.finishTwoHand(name, tracked, now);
    }
  }

  private finishTwoHand(name: GestureName, tracked: TwoHandTrack, now: number): void {
    tracked.machine.forceEnd(now);
    const last = tracked.last ?? { x: 0.5, y: 0.5, scale: 1, span: 0 };
    this.sink(
      createGestureEvent({
        gesture: name,
        phase: 'end',
        hand: 'Both',
        confidence: 0,
        timestamp: now,
        x: last.x,
        y: last.y,
        scale: last.scale,
        span: last.span,
        source: 'camera',
      }),
    );
    tracked.anchor = null;
    tracked.last = null;
  }

  // --- bookkeeping ---------------------------------------------------------------------------

  private trackedFor(
    map: Map<GestureName, Tracked>,
    id: GestureName,
    timing: GestureTiming,
    kind: 'continuous' | 'discrete',
  ): Tracked {
    let tracked = map.get(id);
    if (!tracked || tracked.timing !== timing) {
      tracked = {
        machine: new GestureStateMachine(adjustTiming(timing, this.options.sensitivity), kind),
        timing,
        anchor: null,
      };
      map.set(id, tracked);
    }
    return tracked;
  }

  private twoHandFor(id: GestureName, timing: GestureTiming): TwoHandTrack {
    let tracked = this.twoHand.get(id);
    if (!tracked || tracked.timing !== timing) {
      tracked = {
        machine: new GestureStateMachine(adjustTiming(timing, this.options.sensitivity)),
        timing,
        anchor: null,
        startDistance: 0,
        reportedDistance: 0,
        lastSeen: 0,
        last: null,
      };
      this.twoHand.set(id, tracked);
    }
    return tracked;
  }
}

function createHandTrack(): HandTrack {
  return {
    present: false,
    since: 0,
    lastSeen: 0,
    last: null,
    history: [],
    gestures: new Map(),
    handAnchor: null,
  };
}
