/**
 * Decides which ticks of a fast clock (video frames, a timer) should be acted on so that the
 * work happens at roughly `hz`. It schedules against an ideal timeline rather than "time since the
 * last run", so a 30 fps source asked for 24 Hz averages 24 instead of collapsing to 15.
 */
export class RateLimiter {
  private interval: number;
  private nextDue = -Infinity;

  constructor(hz: number) {
    this.interval = 1000 / sanitizeRate(hz);
  }

  get rate(): number {
    return 1000 / this.interval;
  }

  setRate(hz: number): void {
    this.interval = 1000 / sanitizeRate(hz);
  }

  reset(): void {
    this.nextDue = -Infinity;
  }

  /** True if work should run at time `now` (milliseconds). */
  shouldRun(now: number): boolean {
    if (now < this.nextDue) return false;
    // After a long pause, restart the timeline instead of bursting to catch up.
    this.nextDue =
      now - this.nextDue > this.interval * 2 ? now + this.interval : this.nextDue + this.interval;
    return true;
  }
}

function sanitizeRate(hz: number): number {
  return Number.isFinite(hz) ? Math.min(60, Math.max(1, hz)) : 24;
}

/** Counts events and reports a per-second rate once per window. */
export class RateMeter {
  private count = 0;
  private windowStart = -1;

  constructor(private readonly windowMs = 1000) {}

  /** Records one event; returns the measured rate when a window closes, otherwise null. */
  tick(now: number): number | null {
    if (this.windowStart < 0) {
      // The first event only opens the window; intervals are what get counted.
      this.windowStart = now;
      return null;
    }
    this.count++;
    const span = now - this.windowStart;
    if (span < this.windowMs) return null;
    const rate = (this.count * 1000) / span;
    this.count = 0;
    this.windowStart = now;
    return rate;
  }

  reset(): void {
    this.count = 0;
    this.windowStart = -1;
  }
}
