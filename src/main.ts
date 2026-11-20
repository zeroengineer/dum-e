// Entry point. All wiring lives in the App composition root.
import './styles/base.css';
import { App } from './app/App';

const canvas = document.querySelector<HTMLCanvasElement>('#stage');
if (!canvas) throw new Error('Missing #stage canvas');

const app = new App(canvas);

// Deep link straight into an environment: ?env=particles
app.openFromUrl(location.search);
