import type { App } from '../../app/App';
import { HandGlyph } from '../components/HandGlyph';
import { h } from '../dom';

export function createLanding(app: App): { element: HTMLElement; dispose(): void } {
  const glyph = new HandGlyph('open');
  glyph.cycle(['open', 'fist', 'open', 'pinch', 'point'], 1700);

  const element = h(
    'section',
    { class: 'screen landing', attrs: { 'aria-labelledby': 'landing-title' } },
    h(
      'div',
      { class: 'landing__copy' },
      h('h1', { id: 'landing-title', class: 'landing__title' }, 'DUM-E'),
      h(
        'p',
        { class: 'landing__lede' },
        'Four 3D worlds you move with your bare hands. Push a cloud of particles, pick up objects, turn a galaxy, hold a hologram of the Earth. Your webcam follows your fingers.',
      ),
      h(
        'div',
        { class: 'landing__actions' },
        h(
          'button',
          {
            class: 'btn btn--primary',
            type: 'button',
            on: {
              click: () => {
                app.showSelector();
                void app.enableTracking();
              },
            },
          },
          'Start experience',
        ),
        h(
          'button',
          { class: 'btn btn--quiet', type: 'button', on: { click: () => app.showSelector() } },
          'Continue with mouse only',
        ),
      ),
      h(
        'p',
        { class: 'landing__camera' },
        h('strong', {}, 'About the camera. '),
        'Start experience asks your browser for camera access. The video is analysed on this device to find your hands. It is never recorded or sent anywhere, and you can switch the camera off at any time.',
      ),
    ),
    h('div', { class: 'landing__figure' }, glyph.element as unknown as Node),
  );

  return { element, dispose: () => glyph.stop() };
}
