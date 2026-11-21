import { runGeneration, transferables } from './protocol';
import type { GenerationMessage, GenerationReply } from './protocol';

// Generates particle formations and galaxies off the thread that draws frames.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<GenerationMessage>) => void) | null;
  postMessage(message: GenerationReply, transfer: Transferable[]): void;
};

scope.onmessage = (event) => {
  const result = runGeneration(event.data.request);
  scope.postMessage({ id: event.data.id, result }, transferables(result));
};
