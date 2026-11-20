import type { App } from '../../app/App';
import type { EnvironmentId } from '../../core/scene/Environment';
import { ENVIRONMENTS } from '../../environments';
import { store, watch } from '../../state/store';
import type { ActiveGesture, AppState } from '../../state/store';
import { createCameraNotice } from '../components/CameraNotice';
import { WebcamPreview } from '../components/WebcamPreview';
import { ControlPanel } from '../controls/ControlPanel';
import { h, replace } from '../dom';
import { GESTURE_GUIDE, GESTURE_INFO, SWIPE_LABEL, gestureLabel } from '../gestureInfo';

const TRACKING_LABEL: Record<AppState['tracking']['status'], string> = {
  off: 'Camera off',
  requesting: 'Waiting for permission',
  loading: 'Loading tracker',
  active: 'Tracking',
  paused: 'Paused',
  denied: 'Camera blocked',
  error: 'Camera error',
};

const HAND_NAME = { Left: 'left hand', Right: 'right hand', Both: 'both hands' } as const;
const FLASH_MS = 1100;

function handsLabel(hands: readonly string[]): string {
  if (hands.length === 0) return 'No hands in view';
  if (hands.length === 2) return 'Both hands';
  return hands[0] === 'Left' ? 'Left hand' : 'Right hand';
}

/** The in-experience overlay: what the app sees, what it thinks you are doing, and every control. */
export function createHud(app: App): { element: HTMLElement; dispose(): void } {
  const cleanups: Array<() => void> = [];
  const preview = new WebcamPreview(app.session.video);
  const controls = new ControlPanel();
  // The top bar's camera button already covers the plain "off" case here.
  const notice = createCameraNotice(app, { showWhenOff: false });
  cleanups.push(notice.dispose);

  // --- top bar -------------------------------------------------------------------------------

  const tabs = ENVIRONMENTS.map((environment, i) =>
    h(
      'button',
      {
        class: 'tab',
        type: 'button',
        title: `${environment.name} (${i + 1})`,
        attrs: { 'data-env': environment.id },
        on: { click: () => app.openEnvironment(environment.id) },
      },
      environment.name,
    ),
  );

  const trackingPill = h('span', { class: 'pill pill--tracking' });
  const handsPill = h('span', { class: 'pill' });
  const fpsPill = h('span', { class: 'pill pill--number', title: 'Frames per second' });
  const cameraButton = h('button', { class: 'btn btn--small', type: 'button' });
  cameraButton.addEventListener('click', () => {
    if (store.getState().tracking.status === 'off') void app.enableTracking();
    else app.disableTracking();
  });

  const topBar = h(
    'header',
    { class: 'hud__top' },
    h(
      'button',
      {
        class: 'wordmark',
        type: 'button',
        title: 'Back to the world list',
        on: { click: () => app.showSelector() },
      },
      'DUM-E',
    ),
    h('nav', { class: 'tabs', attrs: { 'aria-label': 'Worlds' } }, ...tabs),
    h('div', { class: 'hud__status', attrs: { role: 'status' } }, trackingPill, handsPill, fpsPill),
    h(
      'div',
      { class: 'hud__actions' },
      cameraButton,
      h(
        'button',
        {
          class: 'btn btn--small btn--quiet',
          type: 'button',
          title: 'Reset this world (R)',
          on: { click: () => app.resetEnvironment() },
        },
        'Reset',
      ),
      h(
        'button',
        {
          class: 'btn btn--small btn--quiet',
          type: 'button',
          on: { click: () => store.setState({ tutorialOpen: true }) },
        },
        'Tutorial',
      ),
      h(
        'button',
        {
          class: 'btn btn--small btn--quiet',
          type: 'button',
          on: { click: () => store.setState({ settingsOpen: true }) },
        },
        'Settings',
      ),
    ),
  );

  // --- side panels ---------------------------------------------------------------------------

  const guideList = h('ul', { class: 'guide' });
  const guidePanel = h(
    'details',
    { class: 'panel hud__guide', open: true },
    h('summary', {}, 'Gestures'),
    guideList,
  );
  const controlsPanel = h(
    'details',
    { class: 'panel hud__controls', open: true },
    h('summary', {}, 'Controls'),
    controls.element,
  );
  // On a narrow screen both panels start closed so the scene stays visible.
  if (typeof matchMedia === 'function' && matchMedia('(max-width: 760px)').matches) {
    guidePanel.open = false;
    controlsPanel.open = false;
  }

  // --- gesture readout -----------------------------------------------------------------------

  const readoutMain = h('span', { class: 'readout__main' });
  const readoutSub = h('span', { class: 'readout__sub' });
  const readout = h(
    'div',
    { class: 'readout', attrs: { 'aria-live': 'polite' } },
    readoutMain,
    readoutSub,
  );

  const element = h(
    'section',
    { class: 'screen hud', attrs: { 'aria-label': 'Experience controls' } },
    topBar,
    notice.element,
    guidePanel,
    controlsPanel,
    preview.element,
    readout,
  );

  // --- rendering -----------------------------------------------------------------------------

  let flashUntil = 0;
  let flashTimer: ReturnType<typeof setTimeout> | null = null;

  const renderGuide = (environment: EnvironmentId | null, gestures: ActiveGesture[]): void => {
    if (!environment) return;
    const usingMouse = store.getState().tracking.status !== 'active';
    const active = new Set(gestures.map((g) => g.gesture));
    replace(
      guideList,
      ...GESTURE_GUIDE[environment].map(({ gesture, does }) =>
        h(
          'li',
          { class: active.has(gesture) ? 'guide__row guide__row--active' : 'guide__row' },
          h('span', { class: 'guide__gesture' }, gestureLabel(gesture)),
          h('span', { class: 'guide__does' }, does),
          usingMouse && h('span', { class: 'guide__key' }, GESTURE_INFO[gesture]?.fallback ?? ''),
        ),
      ),
    );
  };

  const renderReadout = (): void => {
    const state = store.getState();
    const now = performance.now();
    if (state.lastGesture && now < flashUntil) {
      const direction = state.lastGesture.detail as keyof typeof SWIPE_LABEL | undefined;
      readoutMain.textContent = direction
        ? SWIPE_LABEL[direction]
        : gestureLabel(state.lastGesture.gesture);
      readoutSub.textContent = '';
      readout.dataset.state = 'active';
      return;
    }
    if (state.gestures.length > 0) {
      readoutMain.textContent = state.gestures.map((g) => gestureLabel(g.gesture)).join(' + ');
      readoutSub.textContent = [...new Set(state.gestures.map((g) => HAND_NAME[g.hand]))].join(
        ', ',
      );
      readout.dataset.state = 'active';
      return;
    }
    readout.dataset.state = 'idle';
    readoutSub.textContent = '';
    if (state.tracking.status !== 'active') {
      readoutMain.textContent = state.settings.fallbackInput ? 'Mouse and keyboard' : 'No input';
    } else if (state.tracking.hands.length === 0) {
      readoutMain.textContent = 'Show a hand to the camera';
    } else {
      readoutMain.textContent = 'Hand tracked';
    }
  };

  const renderStatus = (tracking: AppState['tracking']): void => {
    trackingPill.textContent = TRACKING_LABEL[tracking.status];
    trackingPill.dataset.status = tracking.status;
    handsPill.textContent = handsLabel(tracking.hands);
    handsPill.hidden = tracking.status !== 'active';
    handsPill.dataset.on = String(tracking.hands.length > 0);
    cameraButton.textContent = tracking.status === 'off' ? 'Turn camera on' : 'Turn camera off';
    const live = tracking.status === 'active' || tracking.status === 'paused';
    preview.setVisible(live && store.getState().settings.showPreview);
    if (!live) preview.clear();
  };

  const renderEnvironment = (environment: EnvironmentId | null): void => {
    for (const tab of tabs) {
      tab.setAttribute('aria-pressed', String(tab.dataset.env === environment));
    }
    controls.setEnvironment(app.environment);
    renderGuide(environment, store.getState().gestures);
  };

  cleanups.push(
    app.session.events.on('frame', (frame) => preview.draw(frame)),
    app.engine.events.on('environment', () => renderEnvironment(store.getState().environment)),
    watch((s) => s.environment, renderEnvironment),
    watch(
      (s) => s.tracking,
      (tracking, previous) => {
        renderStatus(tracking);
        renderReadout();
        if ((tracking.status === 'active') !== (previous.status === 'active')) {
          renderGuide(store.getState().environment, store.getState().gestures);
        }
      },
    ),
    watch(
      (s) => s.gestures,
      (gestures) => {
        renderGuide(store.getState().environment, gestures);
        renderReadout();
      },
    ),
    watch(
      (s) => s.lastGesture,
      () => {
        flashUntil = performance.now() + FLASH_MS;
        if (flashTimer !== null) clearTimeout(flashTimer);
        flashTimer = setTimeout(renderReadout, FLASH_MS + 20);
        renderReadout();
      },
    ),
    watch(
      (s) => Math.round(s.fps),
      (fps) => (fpsPill.textContent = `${fps} fps`),
    ),
    watch(
      (s) => s.settings.showPreview,
      () => renderStatus(store.getState().tracking),
    ),
    watch((s) => s.settings.fallbackInput, renderReadout),
    () => {
      if (flashTimer !== null) clearTimeout(flashTimer);
    },
  );

  fpsPill.textContent = `${Math.round(store.getState().fps)} fps`;
  renderStatus(store.getState().tracking);
  renderEnvironment(store.getState().environment);
  renderReadout();

  return { element, dispose: () => cleanups.forEach((cleanup) => cleanup()) };
}
