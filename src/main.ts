// Entry point. All wiring lives in the App composition root.
import './styles/base.css';
import { App } from './app/App';
import { installTestHook, testHookRequested } from './app/testHook';
import { mountUi } from './ui';
import { perfOverlayRequested } from './ui/components/PerfOverlay';

const canvas = document.querySelector<HTMLCanvasElement>('#stage');
if (!canvas) throw new Error('Missing #stage canvas');

const ui = document.querySelector<HTMLElement>('#ui');
if (!ui) throw new Error('Missing #ui container');

// ?aa=0 or ?aa=1 forces multisampling off or on, for comparing its cost.
const aa = new URLSearchParams(location.search).get('aa');
const app = new App(canvas, { antialias: aa === '0' ? false : aa === '1' ? true : undefined });
mountUi(app, ui, { perfOverlay: perfOverlayRequested(location.search) });
if (testHookRequested(location.search)) installTestHook(app);

// Deep link straight into an environment: ?env=particles
app.openFromUrl(location.search);
