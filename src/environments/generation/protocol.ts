import { generateGalaxy } from '../galaxy/generator';
import type { GalaxyConfig } from '../galaxy/generator';
import { generateGlobeDots } from '../globe/geometry';
import { generateFormation } from '../particles/formations';
import type { FormationName } from '../particles/formations';

/** Work that is heavy enough to drop frames if done on the thread that draws them. */
export type GenerationRequest =
  | { kind: 'formation'; name: FormationName; count: number }
  | { kind: 'galaxy'; config: GalaxyConfig }
  | { kind: 'globeDots'; count: number };

export type GenerationResult =
  | { kind: 'formation'; positions: Float32Array }
  | { kind: 'globeDots'; positions: Float32Array; seeds: Float32Array }
  | { kind: 'galaxy'; polar: Float32Array; seed: Float32Array };

export interface GenerationMessage {
  id: number;
  request: GenerationRequest;
}

export interface GenerationReply {
  id: number;
  result: GenerationResult;
}

/** Does the work. Runs in the worker, and on the calling thread where there is no worker. */
export function runGeneration(request: GenerationRequest): GenerationResult {
  if (request.kind === 'formation') {
    return { kind: 'formation', positions: generateFormation(request.name, request.count) };
  }
  if (request.kind === 'globeDots') {
    const { positions, seeds } = generateGlobeDots(request.count);
    return { kind: 'globeDots', positions, seeds };
  }
  const { polar, seed } = generateGalaxy(request.config);
  return { kind: 'galaxy', polar, seed };
}

/** The buffers behind a result, to hand between threads without copying. */
export function transferables(result: GenerationResult): ArrayBuffer[] {
  const arrays =
    result.kind === 'formation'
      ? [result.positions]
      : result.kind === 'globeDots'
        ? [result.positions, result.seeds]
        : [result.polar, result.seed];
  return arrays.map((array) => array.buffer as ArrayBuffer);
}
