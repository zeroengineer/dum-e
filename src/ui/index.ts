import '../styles/ui.css';
import type { App } from '../app/App';
import { ENVIRONMENTS } from '../environments';
import { store, watch } from '../state/store';
import type { Screen } from '../state/store';
import { createHud } from './screens/Hud';
import { createLanding } from './screens/Landing';
import { createSelector } from './screens/Selector';
import { createSettingsPanel } from './screens/SettingsPanel';
import { createTutorial } from './screens/Tutorial';

function isTyping(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('input, select, textarea') !== null;
}

/** Builds the interface inside `root` and keeps it in step with the store. */
export function mountUi(app: App, root: HTMLElement): () => void {
  const landing = createLanding(app);
  const selector = createSelector(app);
  const hud = createHud(app);
  const settings = createSettingsPanel(app);
  const tutorial = createTutorial(app);
  root.append(landing.element, selector.element, hud.element, settings.element, tutorial.element);

  const screens: Record<Screen, HTMLElement> = {
    landing: landing.element,
    selector: selector.element,
    experience: hud.element,
  };

  const showScreen = (screen: Screen): void => {
    for (const [name, element] of Object.entries(screens)) {
      // Screens are hidden with a class, not `display: none`: the HUD holds the camera
      // <video>, which must stay rendered for tracking to keep receiving frames.
      element.classList.toggle('screen--off', name !== screen);
      element.inert = name !== screen;
    }
    document.body.dataset.screen = screen;
    if (screen === 'experience' && !store.getState().settings.tutorialSeen) {
      store.setState({ tutorialOpen: true });
    }
    if (screen !== 'experience') store.setState({ tutorialOpen: false });
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
    const state = store.getState();
    if (state.screen !== 'experience' || state.settingsOpen) return;
    const index = Number(event.key) - 1;
    if (Number.isInteger(index) && ENVIRONMENTS[index]) {
      app.openEnvironment(ENVIRONMENTS[index].id);
    } else if (event.key.toLowerCase() === 'r') {
      app.resetEnvironment();
    } else if (event.key.toLowerCase() === 't') {
      if (state.tracking.status === 'off') void app.enableTracking();
      else app.disableTracking();
    }
  };
  window.addEventListener('keydown', onKeyDown);

  const offScreen = watch((s) => s.screen, showScreen);
  showScreen(store.getState().screen);

  return () => {
    window.removeEventListener('keydown', onKeyDown);
    offScreen();
    for (const part of [landing, selector, hud, settings, tutorial]) {
      part.dispose();
      part.element.remove();
    }
  };
}
