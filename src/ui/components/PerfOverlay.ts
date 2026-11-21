import type { App } from '../../app/App';
import type { PerfSample } from '../../core/engine/Engine';
import { store } from '../../state/store';
import { recentMeasures } from '../../utils/perf';
import { h, replace } from '../dom';

/** True when the page was opened with ?perf=1. */
export const perfOverlayRequested = (search: string): boolean =>
  new URLSearchParams(search).get('perf') === '1';

const ms = (value: number): string => `${value.toFixed(1)} ms`;
const count = (value: number): string => value.toLocaleString('en-US');

/**
 * A readout of where frame time goes, for comparing before and after a change.
 * Shown only on request (?perf=1); profiling costs nothing when it is not.
 */
export function createPerfOverlay(app: App): { element: HTMLElement; dispose(): void } {
  const body = h('dl', { class: 'perf__rows' });
  const element = h(
    'aside',
    { class: 'perf', attrs: { 'aria-label': 'Performance readout' } },
    h('strong', { class: 'perf__title' }, 'Performance'),
    body,
  );

  let detectMs: number | null = null;

  const row = (label: string, value: string): Node[] => [
    h('dt', { class: 'perf__label' }, label),
    h('dd', { class: 'perf__value' }, value),
  ];

  const render = (sample: PerfSample): void => {
    const { fps, tracking } = store.getState();
    const tracked = tracking.status === 'active';
    const stalls = recentMeasures(3)
      .map((measure) => `${measure.name} ${ms(measure.duration)}`)
      .join(' · ');
    replace(
      body,
      ...row('Frame rate', `${Math.round(fps)} fps`),
      ...row(
        'Frame time',
        `${ms(sample.frameP50)} median · ${ms(sample.frameP95)} p95 · ${ms(sample.frameMax)} worst`,
      ),
      ...row('Main thread', `${ms(sample.workMean)} mean · ${ms(sample.workP95)} p95`),
      ...row(
        'Drawn',
        `${count(sample.drawCalls)} calls · ${count(sample.points)} points · ${count(sample.triangles)} triangles`,
      ),
      ...row('Quality', `${sample.quality} · pixel ratio ${sample.pixelRatio.toFixed(2)}`),
      ...row(
        'Tracking',
        tracked
          ? `${tracking.rate.toFixed(1)} Hz · ${detectMs === null ? 'timing…' : `${ms(detectMs)} per detection`} · ${app.session.delegate ?? 'unknown'}`
          : 'off',
      ),
      ...row('Recent stalls', stalls || 'none'),
    );
  };

  app.engine.setProfiling(true);
  const cleanups = [
    app.engine.events.on('perf', render),
    app.session.events.on('detectMs', (value) => (detectMs = value)),
  ];

  return {
    element,
    dispose: () => {
      for (const cleanup of cleanups) cleanup();
      app.engine.setProfiling(false);
    },
  };
}
