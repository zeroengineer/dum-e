import { describe, expect, it, vi } from 'vitest';
import { GALAXY_PRESETS, generateGalaxy } from '../../src/environments/galaxy/generator';
import { createGenerator } from '../../src/environments/generation/generate';
import { runGeneration, transferables } from '../../src/environments/generation/protocol';
import type {
  GenerationReply,
  GenerationRequest,
} from '../../src/environments/generation/protocol';
import { generateFormation } from '../../src/environments/particles/formations';

const galaxyConfig = { stars: 3000, ...GALAXY_PRESETS.grand.shape };

/** A stand-in for a Worker that answers on the next tick, like a real one. */
class FakeWorker {
  onmessage: ((event: { data: GenerationReply }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  readonly received: Array<{ id: number; request: GenerationRequest }> = [];
  terminated = false;

  postMessage(message: { id: number; request: GenerationRequest }): void {
    this.received.push(message);
    queueMicrotask(() =>
      this.onmessage?.({ data: { id: message.id, result: runGeneration(message.request) } }),
    );
  }

  terminate(): void {
    this.terminated = true;
  }
}

describe('runGeneration', () => {
  it('produces the same buffers as calling the generators directly', () => {
    const formation = runGeneration({ kind: 'formation', name: 'heart', count: 2000 });
    expect(formation.kind).toBe('formation');
    expect(formation.kind === 'formation' && [...formation.positions]).toEqual([
      ...generateFormation('heart', 2000),
    ]);

    const galaxy = runGeneration({ kind: 'galaxy', config: galaxyConfig });
    const direct = generateGalaxy(galaxyConfig);
    expect(galaxy.kind === 'galaxy' && [...galaxy.polar]).toEqual([...direct.polar]);
    expect(galaxy.kind === 'galaxy' && [...galaxy.seed]).toEqual([...direct.seed]);
  });

  it('names every buffer for transfer, so results move between threads without a copy', () => {
    const formation = runGeneration({ kind: 'formation', name: 'sphere', count: 100 });
    expect(transferables(formation)).toHaveLength(1);
    const galaxy = runGeneration({ kind: 'galaxy', config: galaxyConfig });
    expect(transferables(galaxy)).toHaveLength(2);
    const dots = runGeneration({ kind: 'globeDots', count: 200 });
    expect(dots.kind === 'globeDots' && dots.positions.length).toBe(600);
    expect(transferables(dots)).toHaveLength(2);
    expect(transferables(galaxy).every((buffer) => buffer instanceof ArrayBuffer)).toBe(true);
  });
});

describe('createGenerator', () => {
  it('generates in the worker and hands back the result', async () => {
    const worker = new FakeWorker();
    const generator = createGenerator(() => worker);
    const result = await generator.generate({ kind: 'formation', name: 'spiral', count: 500 });
    expect(worker.received).toHaveLength(1);
    expect(result.kind === 'formation' && result.positions.length).toBe(1500);
  });

  it('keeps answers matched to their questions when several are in flight', async () => {
    const generator = createGenerator(() => new FakeWorker());
    const [small, large, galaxy] = await Promise.all([
      generator.generate({ kind: 'formation', name: 'sphere', count: 10 }),
      generator.generate({ kind: 'formation', name: 'sphere', count: 40 }),
      generator.generate({ kind: 'galaxy', config: galaxyConfig }),
    ]);
    expect(small.kind === 'formation' && small.positions.length).toBe(30);
    expect(large.kind === 'formation' && large.positions.length).toBe(120);
    expect(galaxy.kind).toBe('galaxy');
  });

  it('starts one worker and reuses it', async () => {
    const start = vi.fn(() => new FakeWorker());
    const generator = createGenerator(start);
    await generator.generate({ kind: 'formation', name: 'sphere', count: 10 });
    await generator.generate({ kind: 'formation', name: 'wave', count: 10 });
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('generates on the calling thread where workers are not available', async () => {
    const generator = createGenerator(() => {
      throw new Error('no workers here');
    });
    const result = await generator.generate({ kind: 'formation', name: 'dna', count: 300 });
    expect(result.kind === 'formation' && [...result.positions]).toEqual([
      ...generateFormation('dna', 300),
    ]);
  });

  it('finishes what was in flight on the calling thread if the worker dies, and stops using it', async () => {
    const worker = new FakeWorker();
    worker.postMessage = (message) => {
      worker.received.push(message);
      queueMicrotask(() => worker.onerror?.(new Error('crashed')));
    };
    const start = vi.fn(() => worker);
    const generator = createGenerator(start);
    const first = await generator.generate({ kind: 'formation', name: 'sphere', count: 20 });
    expect(first.kind === 'formation' && first.positions.length).toBe(60);
    expect(worker.terminated).toBe(true);
    const second = await generator.generate({ kind: 'formation', name: 'sphere', count: 30 });
    expect(second.kind === 'formation' && second.positions.length).toBe(90);
    expect(start).toHaveBeenCalledTimes(1);
  });
});
