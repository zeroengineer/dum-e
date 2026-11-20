// Composition root. Systems are created and wired together here and nowhere else.
import './styles/base.css';
import { Engine } from './core/engine/Engine';
import { store } from './state/store';

const canvas = document.querySelector<HTMLCanvasElement>('#stage');
if (!canvas) throw new Error('Missing #stage canvas');

const engine = new Engine(canvas);
engine.setQualityPreference(store.getState().settings.quality);
engine.events.on('fps', (fps) => store.setState({ fps }));
engine.events.on('quality', (resolvedQuality) => store.setState({ resolvedQuality }));
store.setState({ resolvedQuality: engine.currentQuality });
engine.start();

window.addEventListener('pagehide', () => engine.dispose());
