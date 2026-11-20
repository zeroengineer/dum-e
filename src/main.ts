// Composition root. Systems are created and wired together here and nowhere else.
import './styles/base.css';
import { Engine } from './core/engine/Engine';
import { isEnvironmentId, registerEnvironments } from './environments';
import { store } from './state/store';

const canvas = document.querySelector<HTMLCanvasElement>('#stage');
if (!canvas) throw new Error('Missing #stage canvas');

const engine = new Engine(canvas);
registerEnvironments(engine);
engine.setQualityPreference(store.getState().settings.quality);
engine.setParticleBudget(store.getState().settings.particleCount);
engine.events.on('fps', (fps) => store.setState({ fps }));
engine.events.on('quality', (resolvedQuality) => store.setState({ resolvedQuality }));
store.setState({ resolvedQuality: engine.currentQuality });
engine.start();

// Deep link straight into an environment: ?env=particles
const requested = new URLSearchParams(location.search).get('env');
if (isEnvironmentId(requested)) {
  engine.setEnvironment(requested);
  store.setState({ screen: 'experience', environment: requested });
}

window.addEventListener('pagehide', () => engine.dispose());
