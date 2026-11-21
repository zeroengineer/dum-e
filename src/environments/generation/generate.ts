import { runGeneration } from './protocol';
import type {
  GenerationMessage,
  GenerationReply,
  GenerationRequest,
  GenerationResult,
} from './protocol';

/** As much of a Worker as this needs, so tests can stand one in. */
export interface GenerationWorker {
  onmessage: ((event: { data: GenerationReply }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  postMessage(message: GenerationMessage): void;
  terminate(): void;
}

export interface Generator {
  generate(request: GenerationRequest): Promise<GenerationResult>;
}

/**
 * Runs generation in a background worker so building tens of thousands of particles or stars
 * never holds up a frame. The worker is started on first use and kept. If it cannot be started,
 * or it fails, the work is done on the calling thread instead: slower, never wrong.
 */
export function createGenerator(startWorker: () => GenerationWorker): Generator {
  let worker: GenerationWorker | null = null;
  let broken = false;
  let nextId = 1;
  const waiting = new Map<
    number,
    { request: GenerationRequest; resolve: (result: GenerationResult) => void }
  >();

  const giveUp = (): void => {
    broken = true;
    worker?.terminate();
    worker = null;
    // Nothing that was asked for is lost: finish it here.
    for (const [, job] of waiting) job.resolve(runGeneration(job.request));
    waiting.clear();
  };

  const ensureWorker = (): GenerationWorker | null => {
    if (worker || broken) return worker;
    try {
      worker = startWorker();
    } catch {
      broken = true;
      return null;
    }
    worker.onmessage = ({ data }) => {
      const job = waiting.get(data.id);
      waiting.delete(data.id);
      job?.resolve(data.result);
    };
    worker.onerror = giveUp;
    return worker;
  };

  return {
    generate(request) {
      const active = ensureWorker();
      if (!active) return Promise.resolve(runGeneration(request));
      return new Promise((resolve) => {
        const id = nextId++;
        waiting.set(id, { request, resolve });
        try {
          active.postMessage({ id, request });
        } catch {
          giveUp();
        }
      });
    },
  };
}

let shared: Generator | null = null;

/** The app's one generator, shared by every world. */
export function generate(request: GenerationRequest): Promise<GenerationResult> {
  shared ??= createGenerator(
    () =>
      new Worker(new URL('./generation.worker.ts', import.meta.url), {
        type: 'module',
      }) as unknown as GenerationWorker,
  );
  return shared.generate(request);
}
