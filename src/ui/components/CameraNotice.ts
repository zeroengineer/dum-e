import type { App } from '../../app/App';
import { store, watch } from '../../state/store';
import type { AppState } from '../../state/store';
import { h, replace } from '../dom';

type Tracking = AppState['tracking'];

const HEADLINE: Partial<Record<Tracking['status'], string>> = {
  requesting: 'Waiting for camera permission',
  loading: 'Loading hand tracking',
  denied: 'Camera blocked',
  error: 'Camera unavailable',
  off: 'Camera is off',
};

const DETAIL: Partial<Record<Tracking['status'], string>> = {
  requesting: 'Choose Allow in the prompt your browser is showing.',
  loading: 'The hand model is downloading. This takes a few seconds the first time.',
  off: 'Turn it on to use hand gestures. The mouse and keyboard work either way.',
};

/**
 * Says what the camera is doing whenever it is not simply working, and offers the way forward:
 * turn it on, retry, or carry on with the mouse.
 */
export function createCameraNotice(
  app: App,
  options: { showWhenOff: boolean | (() => boolean) } = { showWhenOff: true },
): { element: HTMLElement; dispose(): void; refresh(): void } {
  const element = h('div', { class: 'notice', attrs: { role: 'status', 'aria-live': 'polite' } });

  const render = (tracking: Tracking): void => {
    const { status } = tracking;
    const showWhenOff =
      typeof options.showWhenOff === 'function' ? options.showWhenOff() : options.showWhenOff;
    const headline = status === 'off' && !showWhenOff ? undefined : HEADLINE[status];
    element.hidden = !headline;
    element.dataset.status = status;
    if (!headline) return;

    const failed = status === 'denied' || status === 'error';
    const busy = status === 'requesting' || status === 'loading';
    replace(
      element,
      h('strong', { class: 'notice__title' }, headline),
      h('span', { class: 'notice__text' }, tracking.message ?? DETAIL[status] ?? ''),
      !busy &&
        h(
          'button',
          {
            class: 'btn btn--small',
            type: 'button',
            on: { click: () => void app.enableTracking() },
          },
          failed ? 'Retry camera' : 'Turn camera on',
        ),
      failed &&
        h(
          'button',
          {
            class: 'btn btn--small btn--quiet',
            type: 'button',
            on: { click: () => app.disableTracking() },
          },
          'Continue with mouse',
        ),
    );
  };

  render(store.getState().tracking);
  const dispose = watch(
    (s) => s.tracking,
    render,
    (a, b) => a.status === b.status && a.message === b.message,
  );
  return { element, dispose, refresh: () => render(store.getState().tracking) };
}
