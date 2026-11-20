// Composition root. Systems are created and wired together here and nowhere else.
import { store } from './state/store';

console.info('[dum-e] booting', { quality: store.getState().settings.quality });
