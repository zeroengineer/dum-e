import type { PerfSample } from '../core/engine/Engine';
import type { GestureEvent } from '../gestures/events/types';
import type { EnvironmentAction } from '../interaction/actions';
import { store } from '../state/store';
import type { AppState } from '../state/store';
import type { RawHandFrame } from '../vision/landmarks/types';
import type { App } from './App';

/** What automated browser tests can reach. Installed only on request, never in normal use. */
export interface DumeTestHook {
  /** Feed a detector frame into the pipeline as if MediaPipe had produced it. */
  inject(frame: RawHandFrame): void;
  state(): AppState;
  /** Gesture events and dispatched actions recorded since the last `clear()`. */
  events: GestureEvent[];
  actions: EnvironmentAction[];
  clear(): void;
  /** Read-only facts about the scene for assertions. */
  scene(): {
    environment: string | null;
    controls: Record<string, unknown>;
    videoLive: boolean;
    /** Whatever the active world reports about itself. */
    inspect: Record<string, number | string | boolean>;
  };
  /** The latest profiling readout, or null before the first one. */
  perf(): (PerfSample & { fps: number; detectMs: number | null }) | null;
}

declare global {
  interface Window {
    __DUME__?: DumeTestHook;
  }
}

const MAX_RECORDED = 5000;

/** True when the page was opened with ?e2e=1. */
export const testHookRequested = (search: string): boolean =>
  new URLSearchParams(search).get('e2e') === '1';

export function installTestHook(app: App): DumeTestHook {
  const events: GestureEvent[] = [];
  const actions: EnvironmentAction[] = [];
  const record = <T>(list: T[], item: T): void => {
    if (list.length < MAX_RECORDED) list.push(item);
  };
  app.bus.subscribe((event) => record(events, event));
  app.controller.onAction((action) => record(actions, action));

  let sample: PerfSample | null = null;
  let detectMs: number | null = null;
  app.engine.setProfiling(true);
  app.engine.events.on('perf', (next) => (sample = next));
  app.session.events.on('detectMs', (ms) => (detectMs = ms));

  const hook: DumeTestHook = {
    inject: (frame) => app.session.inject(frame),
    state: () => store.getState(),
    events,
    actions,
    clear: () => {
      events.length = 0;
      actions.length = 0;
    },
    perf: () => (sample ? { ...sample, fps: store.getState().fps, detectMs } : null),
    scene: () => {
      const environment = app.environment;
      const controls: Record<string, unknown> = {};
      for (const spec of environment?.getControls() ?? []) {
        if (spec.kind !== 'button') controls[spec.id] = spec.value;
      }
      const stream = app.session.video.srcObject as MediaStream | null;
      return {
        environment: environment?.id ?? null,
        controls,
        videoLive: Boolean(stream?.getVideoTracks().some((t) => t.readyState === 'live')),
        inspect: environment?.inspect?.() ?? {},
      };
    },
  };
  window.__DUME__ = hook;
  return hook;
}
