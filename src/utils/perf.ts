export interface Measure {
  name: string;
  /** Milliseconds. */
  duration: number;
}

const PREFIX = 'dum-e:';

/**
 * Runs `fn` and records how long it took as a User Timing measure, so one-off stalls
 * (rebuilding buffers, switching worlds) show up in the browser's Performance panel
 * and in the `?perf=1` overlay.
 */
export function timed<T>(name: string, fn: () => T): T {
  const start = performance.now();
  try {
    return fn();
  } finally {
    try {
      performance.measure(PREFIX + name, { start, end: performance.now() });
    } catch {
      // Timing is a diagnostic; it must never break the work it measures.
    }
  }
}

/** The latest measures recorded by `timed`, newest first. */
export function recentMeasures(limit: number): Measure[] {
  const entries = performance.getEntriesByType('measure');
  const recent: Measure[] = [];
  for (let i = entries.length - 1; i >= 0 && recent.length < limit; i--) {
    const entry = entries[i];
    if (!entry.name.startsWith(PREFIX)) continue;
    recent.push({ name: entry.name.slice(PREFIX.length), duration: entry.duration });
  }
  return recent;
}
