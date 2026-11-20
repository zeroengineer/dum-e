import type { App } from '../../app/App';
import type { ControlSpec, ControlValue } from '../../core/scene/Environment';
import { store, updateSettings, watch } from '../../state/store';
import type { Settings } from '../../state/store';
import { createControl } from '../controls/ControlPanel';
import { h, replace } from '../dom';

const DEFAULT_CAMERA = '';

/** App-wide settings, as a dialog. Every change applies immediately and is remembered. */
export function createSettingsPanel(app: App): { element: HTMLElement; dispose(): void } {
  const fields = h('div', { class: 'settings__fields' });
  const close = (): void => store.setState({ settingsOpen: false });

  const dialog = h(
    'dialog',
    { class: 'dialog settings', attrs: { 'aria-labelledby': 'settings-title' } },
    h(
      'header',
      { class: 'dialog__header' },
      h('h2', { id: 'settings-title' }, 'Settings'),
      h(
        'button',
        { class: 'btn btn--small btn--quiet', type: 'button', on: { click: close } },
        'Close',
      ),
    ),
    fields,
  );
  // Escape and backdrop clicks close a modal dialog natively; keep the store in step.
  dialog.addEventListener('close', close);
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) close();
  });

  const render = (): void => {
    const { settings, devices, tracking, resolvedQuality } = store.getState();
    const field = (spec: ControlSpec, apply: (value: ControlValue) => void): HTMLElement =>
      createControl(spec, apply).row;
    const set =
      <K extends keyof Settings>(key: K) =>
      (value: ControlValue): void =>
        updateSettings({ [key]: value } as Pick<Settings, K>);

    const trackingOn = tracking.status !== 'off';
    replace(
      fields,
      h(
        'section',
        { class: 'settings__group' },
        h('h3', {}, 'Camera'),
        h(
          'button',
          {
            class: 'btn',
            type: 'button',
            on: {
              click: () => (trackingOn ? app.disableTracking() : void app.enableTracking()),
            },
          },
          trackingOn ? 'Turn camera off' : 'Turn camera on',
        ),
        field(
          {
            kind: 'select',
            id: 'camera',
            label: 'Camera',
            value: settings.cameraId ?? DEFAULT_CAMERA,
            options: [
              { value: DEFAULT_CAMERA, label: 'Default camera' },
              ...devices.map((d) => ({ value: d.deviceId, label: d.label })),
            ],
          },
          (value) => void app.selectCamera(typeof value === 'string' && value ? value : null),
        ),
        devices.length === 0 &&
          h('p', { class: 'settings__hint' }, 'Other cameras appear here once the camera is on.'),
        field(
          {
            kind: 'toggle',
            id: 'preview',
            label: 'Show camera preview',
            value: settings.showPreview,
          },
          set('showPreview'),
        ),
      ),
      h(
        'section',
        { class: 'settings__group' },
        h('h3', {}, 'Gestures'),
        field(
          {
            kind: 'range',
            id: 'sensitivity',
            label: 'Gesture sensitivity',
            min: 0,
            max: 1,
            step: 0.05,
            value: settings.sensitivity,
          },
          set('sensitivity'),
        ),
        h(
          'p',
          { class: 'settings__hint' },
          'Higher recognises gestures sooner; lower needs a clearer pose and avoids accidents.',
        ),
        field(
          {
            kind: 'range',
            id: 'hz',
            label: 'Tracking frequency (Hz)',
            min: 10,
            max: 30,
            step: 1,
            value: settings.trackingHz,
          },
          set('trackingHz'),
        ),
        field(
          {
            kind: 'toggle',
            id: 'fallback',
            label: 'Mouse and keyboard control',
            value: settings.fallbackInput,
          },
          set('fallbackInput'),
        ),
      ),
      h(
        'section',
        { class: 'settings__group' },
        h('h3', {}, 'Graphics'),
        field(
          {
            kind: 'select',
            id: 'quality',
            label: 'Visual quality',
            value: settings.quality,
            options: [
              { value: 'auto', label: `Automatic (${resolvedQuality})` },
              { value: 'low', label: 'Low' },
              { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High' },
            ],
          },
          set('quality'),
        ),
        field(
          {
            kind: 'range',
            id: 'particles',
            label: 'Particle count',
            min: 0,
            max: 120_000,
            step: 2000,
            value: settings.particleCount,
          },
          set('particleCount'),
        ),
        h('p', { class: 'settings__hint' }, 'Set to 0 to let visual quality decide.'),
      ),
      h(
        'section',
        { class: 'settings__group' },
        h('h3', {}, 'Help'),
        h(
          'button',
          {
            class: 'btn btn--quiet',
            type: 'button',
            on: { click: () => store.setState({ settingsOpen: false, tutorialOpen: true }) },
          },
          'Replay tutorial',
        ),
      ),
    );
  };

  const sync = (open: boolean): void => {
    if (open && !dialog.open) {
      render();
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  };

  const cleanups = [
    watch((s) => s.settingsOpen, sync),
    // Device list, camera state and resolved quality can change while the dialog is open.
    watch(
      (s) => `${s.devices.length}|${s.tracking.status === 'off'}|${s.resolvedQuality}`,
      () => {
        if (dialog.open) render();
      },
    ),
  ];

  return { element: dialog, dispose: () => cleanups.forEach((cleanup) => cleanup()) };
}
