import type { App } from '../../app/App';
import { ENVIRONMENTS } from '../../environments';
import { store } from '../../state/store';
import { createCameraNotice } from '../components/CameraNotice';
import { h } from '../dom';
import { GESTURE_GUIDE, gestureLabel } from '../gestureInfo';

export function createSelector(app: App): { element: HTMLElement; dispose(): void } {
  const notice = createCameraNotice(app);

  const rows = ENVIRONMENTS.map((environment) =>
    h(
      'li',
      {},
      h(
        'button',
        {
          class: 'world',
          type: 'button',
          attrs: { 'data-env': environment.id },
          on: { click: () => app.openEnvironment(environment.id) },
        },
        h('span', { class: 'world__name' }, environment.name),
        h('span', { class: 'world__tagline' }, environment.tagline),
        h(
          'span',
          { class: 'world__gestures' },
          GESTURE_GUIDE[environment.id].map((g) => gestureLabel(g.gesture)).join(', '),
        ),
      ),
    ),
  );

  const element = h(
    'section',
    { class: 'screen selector', attrs: { 'aria-labelledby': 'selector-title' } },
    h(
      'header',
      { class: 'selector__header' },
      h('h1', { id: 'selector-title', class: 'selector__title' }, 'Choose a world'),
      h(
        'div',
        { class: 'selector__nav' },
        h(
          'button',
          {
            class: 'btn btn--quiet btn--small',
            type: 'button',
            on: { click: () => app.showLanding() },
          },
          'Back',
        ),
        h(
          'button',
          {
            class: 'btn btn--quiet btn--small',
            type: 'button',
            on: { click: () => store.setState({ settingsOpen: true }) },
          },
          'Settings',
        ),
      ),
    ),
    notice.element,
    h('ul', { class: 'selector__list' }, ...rows),
  );

  return { element, dispose: notice.dispose };
}
