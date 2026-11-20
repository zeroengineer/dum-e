// Entry point. All wiring lives in the App composition root.
import './styles/base.css';
import { App } from './app/App';
import { installTestHook, testHookRequested } from './app/testHook';
import { mountUi } from './ui';

const canvas = document.querySelector<HTMLCanvasElement>('#stage');
if (!canvas) throw new Error('Missing #stage canvas');

const ui = document.querySelector<HTMLElement>('#ui');
if (!ui) throw new Error('Missing #ui container');

const app = new App(canvas);
mountUi(app, ui);
if (testHookRequested(location.search)) installTestHook(app);

// Deep link straight into an environment: ?env=particles
app.openFromUrl(location.search);
