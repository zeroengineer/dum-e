import type { App } from '../../app/App';
import { store, updateSettings, watch } from '../../state/store';
import { createFigure } from '../components/HandGlyph';
import { h, replace } from '../dom';
import { GESTURE_INFO, TUTORIAL_GESTURES } from '../gestureInfo';

const ADVANCE_MS = 900;

/**
 * First-run walkthrough. Each step shows one gesture and waits until the app actually detects
 * it, so the user learns what the tracker needs to see rather than reading a list.
 */
export function createTutorial(app: App): { element: HTMLElement; dispose(): void } {
  const body = h('div', { class: 'tutorial__body' });
  const dialog = h(
    'dialog',
    { class: 'dialog tutorial', attrs: { 'aria-labelledby': 'tutorial-title' } },
    body,
  );

  let step = 0;
  let detected = false;
  let figure: { element: HTMLElement; dispose(): void } | null = null;
  let advanceTimer: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = (): void => {
    if (advanceTimer !== null) clearTimeout(advanceTimer);
    advanceTimer = null;
  };

  const finish = (): void => {
    clearTimer();
    updateSettings({ tutorialSeen: true });
    store.setState({ tutorialOpen: false });
  };

  const go = (next: number): void => {
    clearTimer();
    if (next >= TUTORIAL_GESTURES.length) {
      finish();
      return;
    }
    step = Math.max(0, next);
    detected = false;
    render();
  };

  const render = (): void => {
    figure?.dispose();
    const gesture = TUTORIAL_GESTURES[step];
    const info = GESTURE_INFO[gesture];
    const cameraOn = store.getState().tracking.status === 'active';
    const last = step === TUTORIAL_GESTURES.length - 1;
    figure = createFigure(info.figure);

    replace(
      body,
      h('p', { class: 'tutorial__progress' }, `Step ${step + 1} of ${TUTORIAL_GESTURES.length}`),
      figure.element,
      h('h2', { id: 'tutorial-title', class: 'tutorial__title' }, info.label),
      h(
        'p',
        { class: 'tutorial__how' },
        cameraOn ? info.how : `With the mouse and keyboard: ${info.fallback}`,
      ),
      h(
        'p',
        {
          class: detected ? 'tutorial__state tutorial__state--done' : 'tutorial__state',
          attrs: { role: 'status' },
        },
        detected ? 'Detected' : 'Try it now. This step completes when the gesture is detected.',
      ),
      h(
        'div',
        { class: 'tutorial__actions' },
        h(
          'button',
          { class: 'btn btn--quiet', type: 'button', on: { click: finish } },
          'Skip tutorial',
        ),
        step > 0 &&
          h(
            'button',
            { class: 'btn btn--quiet', type: 'button', on: { click: () => go(step - 1) } },
            'Back',
          ),
        h(
          'button',
          { class: 'btn btn--primary', type: 'button', on: { click: () => go(step + 1) } },
          last ? 'Finish' : 'Next',
        ),
      ),
    );
  };

  const offBus = app.bus.subscribe((event) => {
    if (!dialog.open || detected || event.phase !== 'start') return;
    if (event.gesture !== TUTORIAL_GESTURES[step]) return;
    detected = true;
    render();
    advanceTimer = setTimeout(() => go(step + 1), ADVANCE_MS);
  });

  dialog.addEventListener('close', () => {
    // Closing with Escape counts as skipping.
    if (store.getState().tutorialOpen) finish();
  });

  const sync = (open: boolean): void => {
    if (open && !dialog.open) {
      step = 0;
      detected = false;
      render();
      // Non-modal: the scene behind stays live so gestures can be tried against it.
      dialog.show();
    } else if (!open && dialog.open) {
      clearTimer();
      figure?.dispose();
      figure = null;
      dialog.close();
    }
  };

  const cleanups = [
    offBus,
    watch((s) => s.tutorialOpen, sync),
    watch(
      (s) => s.tracking.status === 'active',
      () => {
        if (dialog.open) render();
      },
    ),
    clearTimer,
  ];

  return { element: dialog, dispose: () => cleanups.forEach((cleanup) => cleanup()) };
}
