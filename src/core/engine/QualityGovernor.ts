import type { QualityLevel } from '../scene/Environment';
import { QUALITY_ORDER, QUALITY_PROFILES } from './quality';

/** What the renderer is asked to draw: how much detail, at what resolution. */
export interface RenderQuality {
  tier: QualityLevel;
  pixelRatio: number;
}

export interface GovernorOptions {
  /** Below this for `lowSeconds`, quality goes down a step. */
  lowFps: number;
  lowSeconds: number;
  /** At or above this for `highSeconds`, quality may go back up a step. */
  highFps: number;
  highSeconds: number;
  /** How much pixel ratio one step gives up. */
  step: number;
  /** After a change, reports are ignored for this long while the frame rate settles. */
  settleSeconds: number;
  /** A step down that gains less than this fraction of frame rate did not help. */
  minGain: number;
  /** After a climb that had to be undone, wait this long before trying again; doubles each time. */
  retrySeconds: number;
  maxRetrySeconds: number;
}

export const DEFAULT_GOVERNOR_OPTIONS: GovernorOptions = {
  lowFps: 52,
  lowSeconds: 2.5,
  highFps: 57,
  highSeconds: 12,
  step: 0.25,
  settleSeconds: 1,
  minGain: 0.05,
  retrySeconds: 30,
  maxRetrySeconds: 480,
};

/** Lowest pixel ratio each tier will render at. Only the low tier goes below native-ish 1. */
const FLOOR: Record<QualityLevel, number> = { low: 0.75, medium: 1, high: 1 };
/** A climb that is undone within this long counts as having failed. */
const PROBE_SECONDS = 8;
/** How long after a step down its effect is judged over. */
const JUDGE_SECONDS = 2;

/** The quality a tier starts at on a display of the given pixel ratio. */
export function startingQuality(tier: QualityLevel, devicePixelRatio: number): RenderQuality {
  return {
    tier,
    pixelRatio: Math.min(devicePixelRatio || 1, QUALITY_PROFILES[tier].maxPixelRatio),
  };
}

/** The next step down, or null at the bottom. Resolution goes before detail. */
function lower(quality: RenderQuality, step: number): RenderQuality | null {
  if (quality.pixelRatio - step >= FLOOR[quality.tier] - 1e-6) {
    return { tier: quality.tier, pixelRatio: quality.pixelRatio - step };
  }
  const index = QUALITY_ORDER.indexOf(quality.tier);
  if (index <= 0) return null;
  return { tier: QUALITY_ORDER[index - 1], pixelRatio: quality.pixelRatio };
}

/**
 * Decides how much to draw from how fast frames are arriving.
 *
 * - Too slow for a few seconds: one step down. Resolution is given up in small steps first,
 *   detail (particle and star counts) only when resolution has no more to give.
 * - Comfortable for a while: one step back up, never past where it started. If the climb has to
 *   be undone, the next attempt waits longer, so a machine at its limit does not flicker
 *   between two levels.
 * - If stepping down does not make frames arrive faster, something else is setting the pace
 *   (a 30 Hz display, a throttled tab). The steps are undone and it waits for that to change.
 *
 * It only reads frame rates; it knows nothing about the renderer.
 */
export class QualityGovernor {
  private readonly options: GovernorOptions;
  private readonly start: RenderQuality;
  private level: RenderQuality;
  /** The levels above the current one, nearest last. Climbing pops this. */
  private readonly above: RenderQuality[] = [];

  private ignore = 0;
  private lowTime = 0;
  private lowSum = 0;
  private highTime = 0;
  private climbWait: number;
  private sinceClimb = Infinity;
  /** Judging whether the last step down helped. */
  private judging: { before: number; sum: number; time: number } | null = null;
  private futile = 0;
  /** The frame rate things were stuck at when it was decided something else sets the pace. */
  private cappedAt: number | null = null;
  private uncapTime = 0;

  constructor(start: RenderQuality, options: Partial<GovernorOptions> = {}) {
    this.options = { ...DEFAULT_GOVERNOR_OPTIONS, ...options };
    this.start = { ...start };
    this.level = { ...start };
    this.climbWait = this.options.highSeconds;
  }

  get current(): RenderQuality {
    return this.level;
  }

  /** Ignore the next `seconds` of reports: a known stall is not the scene being slow. */
  pause(seconds: number): void {
    this.ignore = Math.max(this.ignore, seconds);
    this.resetTimers();
  }

  /** The scene changed. Keep the level, but give the new scene a fresh hearing. */
  settle(): void {
    this.resetTimers();
    this.judging = null;
    this.futile = 0;
    this.cappedAt = null;
    this.climbWait = this.options.highSeconds;
    this.sinceClimb = Infinity;
  }

  /**
   * Resume from a level reached in an earlier session, if it is one this display could have
   * stepped down to. Anything else is ignored.
   */
  restore(remembered: RenderQuality): void {
    const path: RenderQuality[] = [];
    let cursor: RenderQuality | null = { ...this.start };
    while (cursor) {
      if (
        cursor.tier === remembered.tier &&
        Math.abs(cursor.pixelRatio - remembered.pixelRatio) < 1e-6
      ) {
        this.above.length = 0;
        this.above.push(...path);
        this.level = cursor;
        this.settle();
        return;
      }
      path.push(cursor);
      cursor = lower(cursor, this.options.step);
    }
  }

  /**
   * One frame-rate report: `fps` measured over `seconds`. Returns the new level when it changes.
   */
  sample(fps: number, seconds: number): RenderQuality | null {
    this.sinceClimb += seconds;
    if (this.ignore > 0) {
      this.ignore -= seconds;
      this.resetTimers();
      return null;
    }
    if (this.judging) return this.judge(fps, seconds);
    if (this.cappedAt !== null) {
      this.watchCap(fps, seconds);
      return null;
    }

    if (fps < this.options.lowFps) {
      this.highTime = 0;
      this.lowTime += seconds;
      this.lowSum += fps * seconds;
      if (this.lowTime >= this.options.lowSeconds) return this.stepDown();
    } else if (fps >= this.options.highFps) {
      this.lowTime = this.lowSum = 0;
      this.highTime += seconds;
      if (this.highTime >= this.climbWait && this.above.length > 0) return this.climb();
    } else {
      this.resetTimers();
    }
    return null;
  }

  private stepDown(): RenderQuality | null {
    const before = this.lowSum / this.lowTime;
    const next = lower(this.level, this.options.step);
    this.resetTimers();
    if (!next) return null;
    if (this.sinceClimb < PROBE_SECONDS) {
      // The climb did not hold: be slower to try it again.
      this.climbWait = Math.min(
        this.options.maxRetrySeconds,
        Math.max(this.options.retrySeconds, this.climbWait * 2),
      );
    }
    this.above.push(this.level);
    this.level = next;
    this.judging = { before, sum: 0, time: 0 };
    this.ignore = this.options.settleSeconds;
    return this.level;
  }

  private climb(): RenderQuality {
    this.level = this.above.pop() as RenderQuality;
    this.resetTimers();
    this.sinceClimb = 0;
    this.ignore = this.options.settleSeconds;
    return this.level;
  }

  /** Did the last step down make frames arrive faster? */
  private judge(fps: number, seconds: number): RenderQuality | null {
    const judging = this.judging;
    if (!judging) return null;
    judging.sum += fps * seconds;
    judging.time += seconds;
    if (judging.time < JUDGE_SECONDS) return null;
    const after = judging.sum / judging.time;
    this.judging = null;
    this.futile = after < judging.before * (1 + this.options.minGain) ? this.futile + 1 : 0;
    if (this.futile < 2) return null;

    // Two steps that changed nothing: drawing less is not what frames are waiting for.
    this.futile = 0;
    for (let i = 0; i < 2 && this.above.length > 0; i++) {
      this.level = this.above.pop() as RenderQuality;
    }
    this.cappedAt = after;
    this.uncapTime = 0;
    this.resetTimers();
    this.ignore = this.options.settleSeconds;
    return this.level;
  }

  /** While something else sets the pace, wait for the frame rate to move away from it. */
  private watchCap(fps: number, seconds: number): void {
    const capped = this.cappedAt as number;
    this.uncapTime = Math.abs(fps / capped - 1) > 0.2 ? this.uncapTime + seconds : 0;
    if (this.uncapTime >= 3) {
      this.cappedAt = null;
      this.resetTimers();
    }
  }

  private resetTimers(): void {
    this.lowTime = this.lowSum = this.highTime = 0;
  }
}
